import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {hash} from '../dist/sandbox.js';
const root=path.resolve(process.env.VELA_TEST_NATIVE_ROOT ?? '../..'),manifest=path.join(root,'build/mcp-execution/execution.json');
const evidence=path.resolve(process.env.VELA_TEST_EVIDENCE_DIR ?? path.join(root,'build/stage08'));
await fs.mkdir(evidence,{recursive:true});
const work=await fs.mkdtemp(path.join(os.tmpdir(),'vela-execution-gate-')),workspace=path.join(work,'app');await fs.mkdir(workspace);
assert.equal(path.dirname(path.resolve(work)),path.resolve(os.tmpdir()));
const config={schema_version:1,workspace,toolchain:root,aliases:{},execution:{manifest,sha256:hash(await fs.readFile(manifest)),native_allowlist:[]}};
const cfg=path.join(work,'config.json');await fs.writeFile(cfg,JSON.stringify(config));
const client=new Client({name:'vela-execution-gate',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js'),'--config',cfg],stderr:'pipe',env:{...process.env,VELA_GATE_SECRET:'must-not-leak'}});
let stderr='';transport.stderr.on('data',b=>stderr+=b);
const report={schema_version:1,platform:process.platform,release:os.release(),checks:[]};
const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name);console.log('PASS',name);};
const call=async(name,args={})=>(await client.callTool({name,arguments:args},{timeout:150000})).structuredContent;
const source='fn main()->Unit effects{io,process}{print("Привет 😀");print(env("VELA_GATE_SECRET"));}';
await fs.writeFile(path.join(workspace,'main.vela'),source);
try{
 await client.connect(transport);
 check('eleven native MCP tools',(await client.listTools()).tools.length===11);
 const context=await call('vela_get_context');check('execution enabled after OS startup probe',context.data.execution===true);
 if(/^0\.10\.0(?:-dev\.(?:[3-9]|\d{2,}))?$/.test(context.data.version)||/^(?:0\.11\.|1\.)/.test(context.data.version)){
  const text='opaque struct Counter { value: Int }\nimpl Counter { fn answer(self: Counter) -> Int { return self.value; } }\nfn main() -> Int effects { io } { print(Counter(value: 42).answer()); return 0; }\n';
  const built=await call('vela_build',{path:'method.vela',text});
  check('isolated compiler accepts opaque structs and methods',built.status==='ok');
  const executed=await call('vela_run',{artifact_id:built.data.artifact_id});
  check('isolated method call prints the expected value',executed.status==='ok'&&executed.data.exit_code===0&&executed.data.stdout.trim()==='42');
 }
 const checkRoot='cache-main.vela',checkLeaf='cache-leaf.vela';
 const diskLeaf='pub fn answer() -> Int { return 7; }\n';
 const overlayLeaf='// я😀\npub fn answer() -> Int { return true; }\n';
 await fs.writeFile(path.join(workspace,checkRoot),'import "cache-leaf.vela" as leaf;\nfn main() -> Int { return leaf::answer(); }\n');
 await fs.writeFile(path.join(workspace,checkLeaf),diskLeaf);
 try {
  const original=await call('vela_check',{path:checkRoot});
  check('disk check accepts the current import graph',original.status==='ok'&&original.data.native?.ok===true);
  const edited=await call('vela_check',{path:checkRoot,overlay_path:checkLeaf,text:overlayLeaf});
  const diagnostic=edited.data.native?.diagnostics?.[0];
  const prefix=overlayLeaf.slice(0,overlayLeaf.indexOf('return'));
  assert.deepEqual({status:edited.status,code:diagnostic?.code,source:diagnostic?.source,
   start:diagnostic?.span.start,byte:diagnostic?.range.start.byte,line:diagnostic?.span.line,
   actualType:diagnostic?.details?.actual_type},
  {status:'rejected',code:'E201',source:path.join(workspace,checkLeaf),start:[...prefix].length,
   byte:Buffer.byteLength(prefix),line:2,actualType:'Bool'});
  check('unsaved dependency check reports current type and span',edited.snapshot_id!==original.snapshot_id);
  const again=await call('vela_check',{path:checkRoot});
  check('unsaved dependency leaves disk and its snapshot unchanged',again.status==='ok'&&again.snapshot_id===original.snapshot_id
   &&await fs.readFile(path.join(workspace,checkLeaf),'utf8')===diskLeaf);
 } finally {
  await fs.rm(path.join(workspace,checkRoot),{force:true});
  await fs.rm(path.join(workspace,checkLeaf),{force:true});
 }
 const build=await call('vela_build',{path:'main.vela'});console.log('build',JSON.stringify(build));
 check('isolated MSVC build issues artifact',build.status==='ok'&&build.data.artifact_id?.length===64);
 for(const mode of ['pgo-instrument','pgo-use','lto','pgo-lto']){
  const rejected=await call('vela_build',{path:'main.vela',native_optimization:mode});
  check('local optimization mode rejected '+mode,rejected.status==='invalid_input'&&rejected.message.includes('local Vela CLI')&&!rejected.data.artifact_id);
 }
 const id=build.data.artifact_id;
 const run=await call('vela_run',{artifact_id:id});console.log('run',JSON.stringify(run));
 check('Unicode output and no inherited secret',run.status==='ok'&&run.data.exit_code===0&&run.data.stdout.replaceAll('\r','')==='Привет 😀\n\n');
 check('source unchanged',await fs.readFile(path.join(workspace,'main.vela'),'utf8')===source);
 check('forged artifact rejected',(await call('vela_run',{artifact_id:'0'.repeat(64)})).status==='invalid_input');
 for(const args of [['a\0b'],['\ud800'],['a'.repeat(16385)]])check('invalid argv '+report.checks.length,(await call('vela_run',{artifact_id:id,args})).status==='invalid_input');
 const invalid=await call('vela_build',{path:'main.vela',text:'fn main()->Int{return true;}'});
 check('invalid code rejected with native diagnostic',invalid.status==='rejected'&&JSON.stringify(invalid).includes('E201')&&!invalid.data.artifact_id);
 check('path escape rejected',(await call('vela_build',{path:'../outside.vela'})).status==='invalid_input');
 const tests=await call('vela_test',{path:'tests.vela',text:'test "first"{assert_true(false,"expected");} test "second"{assert_true(true,"second");}'});
 console.log('tests',JSON.stringify(tests));
 check('native tests continue after failure',tests.status==='rejected'&&tests.data.native?.schema_version===2&&tests.data.native?.failed===1&&tests.data.native?.passed===1);
 const overlay=await call('vela_build',{path:'draft.vela',text:'fn main()->Int effects{io}{print(6*7);return 17;}'});
 check('unsaved source build',overlay.status==='ok');
 const nonzero=await call('vela_run',{artifact_id:overlay.data.artifact_id});
 check('application nonzero exit is run result',nonzero.status==='ok'&&nonzero.data.exit_code===17&&nonzero.data.stdout.trim()==='42');
 check('overlay is private',!(await fs.readdir(workspace)).includes('draft.vela'));
 await fs.writeFile(path.join(workspace,'main.vela'),source+'\n');
 check('stale snapshot rejected',(await call('vela_run',{artifact_id:id})).status==='source_changed');
 await fs.writeFile(path.join(workspace,'main.vela'),source);
 await fs.writeFile(path.join(workspace,'bad.vproj'),'vela-project|1\nname|bad\nentry|main.vela\nnative|evil.dll|evil.bin\n');
 await fs.writeFile(path.join(workspace,'evil.bin'),'untrusted');
 check('native bytes require host allowlist',(await call('vela_build',{path:'bad.vproj'})).status==='invalid_input');
 await fs.rm(path.join(workspace,'bad.vproj'));await fs.rm(path.join(workspace,'evil.bin'));
 // Exercise the new OS handle primitive in the actual LPAC runtime, including
 // denial outside the snapshot. Checking source alone would miss access drift.
 const libraryFiles=['directory','path','text','json_stream','json_tokens'];
 const privateDirectory=path.join(work,'host-private');await fs.mkdir(privateDirectory);
 await fs.writeFile(path.join(privateDirectory,'secret.txt'),'outside snapshot');
 try {
  for(const name of libraryFiles)await fs.copyFile(path.join(root,'std',name+'.vela'),path.join(workspace,name+'.vela'));
  const text=String.raw`import "directory.vela" as d; import "path.vela" as p; import "json_stream.vela" as j;
fn main()->Int effects{args,io,state}{
 match j::create("{\"ignored\":1e9999}",j::Limits(bytes:128,depth:16,nodes:16)){
  Result::Err(_)=>{return 2;}
  Result::Ok(reader)=>{
   match j::skip_value(reader){Result::Ok(v)=>{assert_true(v,"value");} Result::Err(_)=>{return 3;}}
   match j::finish(reader){Result::Ok(_)=>{} Result::Err(_)=>{return 4;}}
  }
 }
 match d::entries_bounded(p::Path(value:"."),64){Result::Ok(entries)=>{assert_true(list_len(entries)>0,"snapshot enumerated");} Result::Err(_)=>{return 5;}}
 let denied=match arg(0){StringResult::Ok(v)=>v,StringResult::Err(_)=>""};
 match d::open(p::Path(value:denied)){Result::Err(_)=>{} Result::Ok(scan)=>{let closed=d::close(scan);return 7;}}
 print("library 1.1 isolated");return 0;
}`;
  const library=await call('vela_build',{path:'library11.vela',text});
  console.log('library11 build',JSON.stringify(library));
  check('isolated directory and JSON build',library.status==='ok');
  const executed=await call('vela_run',{artifact_id:library.data.artifact_id,args:[privateDirectory]});
  check('new directory handles preserve LPAC boundary and JSON skip',executed.status==='ok'&&executed.data.exit_code===0&&executed.data.stdout.trim()==='library 1.1 isolated');
  check('outside directory bytes unchanged',await fs.readFile(path.join(privateDirectory,'secret.txt'),'utf8')==='outside snapshot');
 } finally {for(const name of libraryFiles)await fs.rm(path.join(workspace,name+'.vela'),{force:true});}
 await fs.link(path.join(workspace,'main.vela'),path.join(workspace,'alias.vela'));
 check('hardlinked snapshot rejected',(await call('vela_build',{path:'main.vela'})).status==='invalid_input');await fs.rm(path.join(workspace,'alias.vela'));
 const loop=await call('vela_build',{path:'loop.vela',text:'fn main()->Unit{while true{}}'});
 check('loop build',loop.status==='ok');
 const pending=call('vela_run',{artifact_id:loop.data.artifact_id,timeout_ms:600});
 await new Promise(r=>setTimeout(r,100));
 check('execution concurrency limit',(await call('vela_run',{artifact_id:id})).status==='limit');
 check('wall time limit',(await pending).status==='timeout');
 const abort=new AbortController();
 const cancelled=client.callTool({name:'vela_run',arguments:{artifact_id:loop.data.artifact_id,timeout_ms:15000}},{signal:abort.signal,timeout:20000});
 setTimeout(()=>abort.abort(),300);await assert.rejects(cancelled,/abort/i);
 const recoveryDeadline=Date.now()+4000;
 let recovered;
 do{
  recovered=await call('vela_run',{artifact_id:id});
  if(recovered.status!=='limit')break;
  await new Promise(r=>setTimeout(r,100));
 }while(Date.now()<recoveryDeadline);
 assert.equal(recovered.status,'ok',JSON.stringify(recovered));
 check('server recovers after cancellation',true);
 check('transport stdout contains only MCP',stderr==='');
 const interrupted=client.callTool({name:'vela_run',arguments:{artifact_id:loop.data.artifact_id,timeout_ms:30000}},{timeout:35000}).catch(e=>e);
 await new Promise(r=>setTimeout(r,600));await client.close();await interrupted;
 for(let i=0;i<60;i++){if(!(await fs.stat(manifest+'.lock').catch(()=>null)))break;await new Promise(r=>setTimeout(r,100));}
 check('MCP disconnect releases execution cache',!(await fs.stat(manifest+'.lock').catch(()=>null)));
}finally{
 await client.close();await transport.close();
 await fs.writeFile(path.join(evidence,'execution-sdk.json'),JSON.stringify(report,null,2));
 await fs.rm(work,{recursive:true,force:true,maxRetries:10});
}
console.log('Execution SDK checks:',report.checks.length);
