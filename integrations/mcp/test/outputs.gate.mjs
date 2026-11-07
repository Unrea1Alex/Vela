import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {hash} from '../dist/sandbox.js';
import {Execution, outputLimits} from '../dist/execution.js';

const toolchain=path.resolve(process.env.VELA_TEST_NATIVE_ROOT??'../..');
const manifest=path.join(toolchain,'build/mcp-execution/execution.json');
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'vela-output-gate-'));
const config=path.join(workspace,'config.json'), source=path.join(workspace,'main.vela');
await fs.writeFile(config,JSON.stringify({schema_version:1,workspace,toolchain,execution:{
  manifest,sha256:hash(await fs.readFile(manifest)),native_allowlist:[]
}}));
const text=String.raw`fn main() -> Int effects { args, io, state } {
    let mode = match arg(0) { StringResult::Ok(value) => value, StringResult::Err(_) => "" };
    if mode == "missing" { return 0; }
    if mode == "directory" {
        let done = make_dir("../export/result.html");
        return 0;
    }
    let parts = strings_new();
    if mode == "large" {
        for i in 0 .. 80000 { strings_push(parts, "12345678"); }
    } else {
        strings_push(parts, "<!doctype html><p>Отчёт 🧭</p>\n");
        if mode == "chunked" {
            for i in 0 .. 15000 { strings_push(parts, "12345678"); }
        }
    }
    match write_file("../export/result.html", strings_join(parts, "")) {
        WriteResult::Ok => {}
        WriteResult::Err(_) => { return 2; }
    }
    if mode == "extra" {
        let done = write_file("../export/private.txt", "not exported");
    }
    if mode == "timeout" {
        while true {}
    }
    if mode == "failed" { return 3; }
    return 0;
}`;
await fs.writeFile(source,text);
const client=new Client({name:'new-vela-output-client',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js'),'--config',config],stderr:'pipe'});
transport.stderr.resume();
const call=async(name,args={})=>(await client.callTool({name,arguments:args},{timeout:150000})).structuredContent;
const checks=[];
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);};
try{
  await client.connect(transport);
  check('fresh SDK session discovers output tool',(await client.listTools()).tools.some(t=>t.name==='vela_read_output'));
  const built=await call('vela_build',{path:'main.vela'});
  assert.equal(built.status,'ok',JSON.stringify(built));
  const id=built.data.artifact_id;
  const run=(mode,outputs=['result.html'],timeout_ms=10000)=>call('vela_run',{artifact_id:id,args:[mode],outputs,timeout_ms});
  const outcome=await run('chunked');
  assert.equal(outcome.status,'ok',JSON.stringify(outcome));
  const out=outcome.data.outputs[0];
  check('provenance',out.mime==='text/html'&&out.artifact_id===id&&out.snapshot_id===outcome.snapshot_id&&
    out.run_id===outcome.data.run_id&&out.output_id!==id);
  let offset=0, chunks=[];
  while(offset<out.size){
    const chunk=await call('vela_read_output',{output_id:out.output_id,offset,length:65536});
    assert.equal(chunk.status,'ok');
    assert.equal(chunk.data.offset,offset);
    chunks.push(Buffer.from(chunk.data.bytes,'base64'));
    offset=chunk.data.next_offset;
  }
  const bytes=Buffer.concat(chunks),expected=Buffer.from('<!doctype html><p>Отчёт 🧭</p>\n'+'12345678'.repeat(15000));
  check('chunked bytes and SHA-256',bytes.equals(expected)&&bytes.length===out.size&&hash(bytes)===out.sha256&&chunks.length===2);
  check('no implicit write',!(await fs.stat(path.join(workspace,'result.html')).catch(()=>null))&&await fs.readFile(source,'utf8')===text);
  check('executable ID cannot read a generated file',(await call('vela_read_output',{output_id:id})).status==='invalid_input');
  check('forged output ID',(await call('vela_read_output',{output_id:'0'.repeat(64)})).status==='invalid_input');
  check('output ID cannot execute',(await call('vela_run',{artifact_id:out.output_id})).status==='invalid_input');
  check('out of range',(await call('vela_read_output',{output_id:out.output_id,offset:out.size+1})).status==='invalid_input');
  for(const name of ['../result.html','a.html:stream','NUL.html','a.exe']){
    check('unsafe name '+name,(await run('ok',[name])).status==='invalid_input');
  }
  for(const mode of ['missing','extra','directory']){
    const response=await run(mode);
    check('reject '+mode,response.status==='invalid_input'&&!response.data.outputs);
  }
  const large=await run('large');
  check('byte bound',large.status==='limit'&&!large.data.outputs);
  const failed=await run('failed');
  check('nonzero does not export',failed.status==='ok'&&failed.data.exit_code===3&&!failed.data.outputs);
  const timed=await run('timeout',['result.html'],300);
  check('timeout does not export',timed.status==='timeout'&&!timed.data.outputs);
  const controller=new AbortController();
  const pending=client.callTool({name:'vela_run',arguments:{artifact_id:id,args:['timeout'],outputs:['result.html']}},
    {signal:controller.signal,timeout:10000});
  const timer=setTimeout(()=>controller.abort(),300);
  try{await assert.rejects(pending);}finally{clearTimeout(timer);}
  let next;
  for(let i=0;i<30;i++){
    next=await run('ok');
    if(next.status!=='limit')break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  check('cancelled run releases job and export slot',next.status==='ok'&&next.data.outputs.length===1);

  const capture=new Execution({config:{execution:{manifest,sha256:'',native_allowlist:[]}},compilerId:'fixture'});
  const fixture=path.join(workspace,'capture');await fs.mkdir(fixture);
  try{
    const origin=path.join(workspace,'origin.txt');await fs.writeFile(origin,'private');
    const link=path.join(fixture,'result.html');await fs.link(origin,link);
    await assert.rejects(capture.captureOutputs(fixture,['result.html'],new AbortController().signal),/unlinked regular file/);
    checks.push('hardlink rejection');
    const linked=path.join(workspace,'linked');await fs.symlink(fixture,linked,'junction');
    await assert.rejects(capture.captureOutputs(linked,['result.html'],new AbortController().signal),/Unsafe output directory/);
    checks.push('junction rejection');
    capture.outputs.set(out.output_id,{meta:{...out,expires_at:Date.now()-outputLimits.age_ms},bytes});
    check('expiry removes bytes',capture.readOutput(out.output_id,0,1).status==='invalid_input'&&capture.outputs.size===0);
  }finally{await capture.close();}
  console.log(JSON.stringify({schema_version:1,checks}));
}finally{await client.close();await fs.rm(workspace,{recursive:true,force:true});}
