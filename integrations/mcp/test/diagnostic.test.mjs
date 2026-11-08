import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
test('native diagnostic previews preserve revisions, typed explanations and files',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'vela-diagnostic-sdk-')),config=path.join(workspace,'config.json'),root=path.resolve(process.env.VELA_TEST_NATIVE_ROOT??'../..'),source=path.join(workspace,'main.vela');
 await fs.writeFile(config,JSON.stringify({schema_version:1,workspace,toolchain:root}));const code='// я😀\nfn main()->Unit { print("checked only"); }\n';await fs.writeFile(source,code);
 const client=new Client({name:'vela-diagnostic-sdk12',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js','--config',config],stderr:'pipe'});transport.stderr.resume();
 const call=async(name,input)=>{const reply=await client.callTool({name,arguments:input});assert.deepEqual(JSON.parse(reply.content[0].text),reply.structuredContent);return reply.structuredContent;};
 try{await client.connect(transport);const query=await call('vela_query',{path:'main.vela'});assert.equal(query.status,'rejected');assert.equal(query.data.native.diagnostics[0].code,'E209');
  const input={path:'main.vela',kind:'diagnose',snapshot_id:query.snapshot_id,revision:query.data.native.revision,document:0};const plan=await call('vela_plan',input);assert.equal(plan.status,'ok');assert.equal(plan.data.native.validated,true);assert.match(plan.data.native.changes[0].edits[0].new_text,/effects \{io\}/);assert.equal(plan.data.native.diagnostics[0].explanation.category,'effects');
  const native=spawnSync(path.join(root,'bin/velac.exe'),['plan',source,input.revision,'0','diagnose'],{encoding:'utf8',windowsHide:true});assert.equal(native.status,0,native.stderr);const direct=JSON.parse(native.stdout);assert.deepEqual(plan.data.native.changes,direct.changes);assert.deepEqual(plan.data.native.explanations,direct.explanations);assert.equal(await fs.readFile(source,'utf8'),code);
  const wrong=await client.callTool({name:'vela_plan',arguments:{...input,byte:0}}).catch(e=>e);assert.match(wrong instanceof Error?wrong.message:JSON.stringify(wrong),/Diagnose does not accept rename fields/);
  await fs.writeFile(source,code+'// new revision\n');assert.equal((await call('vela_plan',input)).status,'source_changed');
  await fs.writeFile(source,'fn main()->Int{return true;}\n');const typed=await call('vela_query',{path:'main.vela'});const explained=await call('vela_plan',{...input,snapshot_id:typed.snapshot_id,revision:typed.data.native.revision});assert.equal(explained.status,'ok');assert.equal(explained.data.native.validated,false);assert.deepEqual(explained.data.native.changes,[]);assert.equal(explained.data.native.explanations[0].expected,'Int');assert.equal(explained.data.native.explanations[0].actual,'Bool');
  const dependency='pub fn answer()->Int {let text="я😀"; return true;}\n',main='import "dependency.vela" as dep; fn main()->Int{return dep::answer();}\n';
  await fs.writeFile(path.join(workspace,'dependency.vela'),dependency);await fs.writeFile(source,main);
  const multi=await call('vela_query',{path:'main.vela'}),diagnostic=multi.data.native.diagnostics[0];assert.equal(diagnostic.code,'E201');assert.equal(diagnostic.range.document,1);assert.equal(diagnostic.range.start.byte,Buffer.byteLength(dependency.slice(0,dependency.indexOf('return'))));assert.equal(diagnostic.range.start.character,dependency.indexOf('return'));
  const directMulti=spawnSync(path.join(root,'bin/velac.exe'),['query',source,'--json'],{encoding:'utf8',windowsHide:true});assert.equal(directMulti.status,1);const nativeMulti=JSON.parse(directMulti.stdout);assert.deepEqual(diagnostic.range,nativeMulti.diagnostics[0].range);assert.deepEqual(diagnostic.explanation,nativeMulti.diagnostics[0].explanation);assert.equal(multi.data.native.revision,nativeMulti.revision);
  const multiPlan=await call('vela_plan',{path:'main.vela',kind:'diagnose',snapshot_id:multi.snapshot_id,revision:multi.data.native.revision,document:1});assert.equal(multiPlan.data.native.validated,false);assert.deepEqual(multiPlan.data.native.changes,[]);assert.equal(await fs.readFile(source,'utf8'),main);assert.equal(await fs.readFile(path.join(workspace,'dependency.vela'),'utf8'),dependency);
  await fs.writeFile(source,'fn main()->Int{return Int::answer();}\n');await fs.writeFile(path.join(workspace,'Int.vela'),'pub fn answer()->Int{return 42;}\n');const known=await call('vela_query',{path:'main.vela'});assert.equal(known.data.native.diagnostics[0].code,'E200');const knownPlan=await call('vela_plan',{path:'main.vela',kind:'diagnose',snapshot_id:known.snapshot_id,revision:known.data.native.revision,document:0});assert.equal(knownPlan.data.native.validated,false);assert.deepEqual(knownPlan.data.native.changes,[]);
 }finally{await client.close();await transport.close();await fs.rm(workspace,{recursive:true,force:true});}
});
