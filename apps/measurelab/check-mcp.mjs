// Optional integration test. The application and its native build do not use Node.
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const app=path.dirname(fileURLToPath(import.meta.url));
const pkg=path.resolve(process.argv[2]??path.join(app,'../../integrations/mcp'));
const require=createRequire(path.join(pkg,'package.json'));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')).href);
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')).href);
const client=new Client({name:'measurelab-acceptance',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(pkg,'dist/index.js'),'--config',path.join(app,'.codex/vela-mcp.json')],stderr:'pipe'});
let stderr='';transport.stderr.on('data',b=>stderr+=b);
const call=async(name,args)=>(await client.callTool({name,arguments:args},{timeout:150000})).structuredContent;
try{
  await client.connect(transport);
  const tools=(await client.listTools()).tools.map(t=>t.name);
  assert.equal(tools.length,11);
  assert.equal((await call('vela_get_context',{})).status,'ok');
  for(const topic of ['stdlib','numbers','testing','ffi'])assert.equal((await call('vela_get_help',{topic})).status,'ok');
  const check=await call('vela_check',{path:'vela.project'});assert.equal(check.status,'ok',JSON.stringify(check));
  const build=await call('vela_build',{path:'vela.project'});assert.equal(build.status,'ok',JSON.stringify(build));
  const test=await call('vela_test',{path:'vela.project'});assert.equal(test.status,'ok',JSON.stringify(test));assert.equal(test.data.native.passed,12);assert.equal(test.data.native.failed,0);
  const run=await call('vela_run',{artifact_id:build.data.artifact_id,args:['sample.json','isolated-report.html','--fail-on-budget']});
  assert.equal(run.status,'ok',JSON.stringify(run));assert.equal(run.data.exit_code,3);
  assert.ok(run.data.stdout.includes('scenarios=3 samples=60 over_budget=1'));
  assert.ok(run.data.stdout.includes('mean=13.68 p95=22.10 sigma=3.35'));
  assert.equal(run.data.stderr,'');assert.equal(stderr,'');
  assert.equal(await fs.stat(path.join(app,'isolated-report.html')).catch(()=>null),null);
  const exported=await call('vela_run',{artifact_id:build.data.artifact_id,args:['sample.json','../export/report.html'],outputs:['report.html']});
  assert.equal(exported.status,'ok',JSON.stringify(exported));assert.equal(exported.data.exit_code,0);
  const output=exported.data.outputs[0];
  assert.equal(output.mime,'text/html');
  const chunks=[];
  let offset=0;
  while(offset<output.size){
    const chunk=await call('vela_read_output',{output_id:output.output_id,offset});
    assert.equal(chunk.status,'ok',JSON.stringify(chunk));
    chunks.push(Buffer.from(chunk.data.bytes,'base64'));
    offset=chunk.data.next_offset;
  }
  const bytes=Buffer.concat(chunks);
  assert.equal(bytes.length,output.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),output.sha256);
  assert.ok(bytes.toString('utf8').includes('<!doctype html><html'));
  const save=process.argv[3];
  if(save){
    assert.ok(path.isAbsolute(save),'Pass an absolute save path.');
    await fs.writeFile(save,bytes,{flag:'wx'});
  }
  assert.equal(await fs.stat(path.join(app,'export','report.html')).catch(()=>null),null);
  await fs.writeFile(path.join(app,'mcp-tests.json'),JSON.stringify({passed:true,tools,transport:'official SDK / local stdio',native_tools_in_current_chat:false,compiler_id:build.compiler_id,execution_toolchain_id:build.data.execution_toolchain_id,named_tests:test.data.native.passed,exit_code:run.data.exit_code,stdout:run.data.stdout,native_dependencies:0,generated_html:{size:output.size,sha256:output.sha256,saved_explicitly:!!save}},null,2)+'\n');
  console.log('MCP: check/build/test/run passed; 12 tests, expected exit 3, HTML bytes verified'+(save?' and saved.':'.'));
}finally{await client.close();await transport.close();}
