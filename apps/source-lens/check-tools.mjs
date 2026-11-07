// Optional 0.9 tooling acceptance. --apply-rename applies one reviewed native plan.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const app=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(app,'../..');
const compiler=path.join(repo,'bin/velac.exe'),root=path.join(app,'vela.project'),file=path.join(app,'report.vela');
const hash=b=>createHash('sha256').update(b).digest('hex');
const native=(...args)=>{
 const r=spawnSync(compiler,args,{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,timeout:60000});
 assert.equal(r.status,0,r.stderr||r.stdout);return JSON.parse(r.stdout);
};
const apply=process.argv.includes('--apply-rename'),before=await fs.readFile(file,'utf8');
const index=native('query',root);
const oldName=apply?'target_link':'call_target_link',newName=apply?'call_target_link':'preview_target_link';
const definition=index.definitions.find(d=>d.kind==='function'&&d.name===oldName);assert.ok(definition);
const plan=native('plan',root,index.revision,String(definition.range.document),String(definition.range.start.byte),newName);
assert.ok(plan.ok);assert.equal(plan.changes.length,1);assert.equal(plan.changes[0].edits.length,3);
assert.equal(await fs.readFile(file,'utf8'),before);
const child=spawn(path.join(repo,'bin/vela-lsp.exe'),[compiler,app,root],{stdio:['pipe','pipe','pipe'],windowsHide:true});
let buffer=Buffer.alloc(0),next=0,stderr='';const pending=new Map();
child.stderr.on('data',b=>stderr+=b);
child.stdout.on('data',b=>{
 buffer=Buffer.concat([buffer,b]);
 for(;;){
  const marker=buffer.indexOf('\r\n\r\n');if(marker<0)return;
  const length=Number(buffer.subarray(0,marker).toString().split(': ')[1]),end=marker+4+length;if(buffer.length<end)return;
  const value=JSON.parse(buffer.subarray(marker+4,end));buffer=buffer.subarray(end);
  if(value.id!==undefined){pending.get(value.id)?.(value);pending.delete(value.id)}
 }
});
const send=v=>{const s=JSON.stringify({jsonrpc:'2.0',...v});child.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`)};
const ask=(method,params)=>new Promise((resolve,reject)=>{
 const id=++next,timer=setTimeout(()=>reject(Error('LSP timeout '+method)),40000);
 pending.set(id,v=>{clearTimeout(timer);resolve(v)});send({id,method,params});
});
const uri=pathToFileURL(file).href,position={line:definition.range.start.line,character:definition.range.start.character};
let lsp;
try{
 assert.equal((await ask('initialize',{capabilities:{}})).result.capabilities.positionEncoding,'utf-16');
 send({method:'initialized',params:{}});
 send({method:'textDocument/didOpen',params:{textDocument:{uri,text:before,version:1,languageId:'vela'}}});
 const at={textDocument:{uri},position};
 const hover=await ask('textDocument/hover',at);assert.ok(hover.result,JSON.stringify(hover));
 assert.ok(hover.result.contents.value.includes(oldName));
 const references=await ask('textDocument/references',{...at,context:{includeDeclaration:true}});
 assert.equal(references.result.length,3);
 const edit=(await ask('textDocument/rename',{...at,newName})).result;
 assert.equal(edit.documentChanges.length,1);assert.equal(edit.documentChanges[0].textDocument.version,1);
 assert.equal(edit.documentChanges[0].edits.length,3);
 assert.deepEqual(edit.documentChanges[0].edits.map(e=>({start:e.range.start,end:e.range.end,newText:e.newText})),
  plan.changes[0].edits.map(e=>({start:{line:e.range.start.line,character:e.range.start.character},end:{line:e.range.end.line,character:e.range.end.character},newText:e.new_text})));
 if(apply){
  assert.equal(await fs.readFile(file,'utf8'),before);
  let bytes=Buffer.from(before.replaceAll('\r\n','\n'));
  assert.equal(hash(bytes),plan.changes[0].revision);
  for(const e of [...plan.changes[0].edits].reverse()){
   assert.equal(bytes.subarray(e.range.start.byte,e.range.end.byte).toString(),oldName);
   bytes=Buffer.concat([bytes.subarray(0,e.range.start.byte),Buffer.from(e.new_text),bytes.subarray(e.range.end.byte)]);
  }
  await fs.writeFile(file,bytes);assert.ok(native('check',root,'--json').ok);
  const stale=spawnSync(compiler,['plan',root,index.revision,String(definition.range.document),String(definition.range.start.byte),newName],{encoding:'utf8',windowsHide:true});
  assert.notEqual(stale.status,0);assert.equal(JSON.parse(stale.stdout).diagnostics[0].code,'E231');
 }
 lsp={hover:true,references:3,versioned_edits:3,native_plan_parity:true,rename_applied:apply};
 assert.equal((await ask('shutdown')).result,null);send({method:'exit'});child.stdin.end();
}finally{child.kill()}
assert.equal(stderr,'');
if(apply){
 await fs.writeFile(path.join(app,'refactor-evidence.json'),JSON.stringify({schema_version:1,from:oldName,to:newName,
  revision:index.revision,lsp,changed_files:['report.vela'],stale_rejected:true},null,2)+'\n');
 console.log(JSON.stringify(lsp));process.exit(0);
}

const pkg=path.join(repo,'integrations/mcp'),require=createRequire(path.join(pkg,'package.json'));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')).href);
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')).href);
const manifest=path.join(repo,'build/mcp-execution/execution.json');
await fs.mkdir(path.join(app,'.codex'),{recursive:true});
const config=path.join(app,'.codex/source-lens-test.json');
await fs.writeFile(config,JSON.stringify({schema_version:1,workspace:app,toolchain:repo,aliases:{},execution:{manifest,sha256:hash(await fs.readFile(manifest)),native_allowlist:[]}}));
const client=new Client({name:'source-lens-acceptance',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(pkg,'dist/index.js'),'--config',config],stderr:'pipe'});
transport.stderr.resume();
const calls=[];
const call=async(name,args={})=>{
 const response=(await client.callTool({name,arguments:args},{timeout:150000})).structuredContent;
 assert.equal(response.status,'ok',JSON.stringify(response));calls.push(name);return response;
};
try{
 await client.connect(transport);
 const context=await call('vela_get_context');assert.ok(context.data.execution);
 assert.ok(context.data.quickstart.includes('count distinct sites'));
 const projects=await call('vela_get_help',{topic:'projects'});assert.ok(projects.data.text.includes('Проекты Vela 0.9.0'));
 await call('vela_get_help',{topic:'stdlib'});
 await call('vela_check',{path:'vela.project'});
 const queried=await call('vela_query',{path:'demo/main.vela'}),q=queried.data.native;
 const target=q.definitions.find(d=>d.kind==='function'&&d.name==='grade');
 const preview=await call('vela_plan',{path:'demo/main.vela',snapshot_id:queried.snapshot_id,revision:q.revision,kind:'rename',
  document:target.range.document,byte:target.range.start.byte,new_name:'classify'});
 assert.equal(preview.data.native.changes.length,3);
 const tests=await call('vela_test',{path:'vela.project'});assert.equal(tests.data.native.passed,7);
 const build=await call('vela_build',{path:'vela.project'});
 const run=await call('vela_run',{artifact_id:build.data.artifact_id,args:['demo-query.json','../export/source-lens.html'],outputs:['source-lens.html']});
 assert.equal(run.data.exit_code,0);assert.equal(run.data.stdout.trim(),'modules=3 functions=12 calls=25 imports=3');
 const output=run.data.outputs[0];assert.equal(output.mime,'text/html');
 let offset=0;const chunks=[];
 while(offset<output.size){
  const read=await call('vela_read_output',{output_id:output.output_id,offset});
  assert.equal(read.data.offset,offset);assert.equal(read.data.sha256,output.sha256);
  const chunk=Buffer.from(read.data.bytes,'base64');chunks.push(chunk);offset+=chunk.length;assert.equal(offset,read.data.next_offset);
 }
 const html=Buffer.concat(chunks);assert.equal(html.length,output.size);assert.equal(hash(html),output.sha256);
 assert.ok(html.equals(await fs.readFile(path.join(app,'report.html'))));
 await fs.writeFile(path.join(app,'report-mcp.html'),html);
 assert.equal(await fs.readFile(file,'utf8'),before);
 await fs.writeFile(path.join(app,'tooling-validation.json'),JSON.stringify({schema_version:1,passed:true,lsp,
  mcp:{transport:'official SDK / local stdio',native_tools_in_this_chat:false,calls,rename_preview_files:3,named_tests:7,
   output:{bytes:output.size,sha256:output.sha256,saved_explicitly:'report-mcp.html',identical_to_native:true}}},null,2)+'\n');
 console.log('LSP/CLI parity and MCP query/plan/check/test/build/run/read_output passed.');
}finally{await client.close();await transport.close()}
