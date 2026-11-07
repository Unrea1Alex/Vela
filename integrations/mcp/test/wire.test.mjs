import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const root=path.resolve('../..'),pkg=path.resolve('.');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'vela-wire-test-'));
const workspace=path.join(work,'workspace');await fs.mkdir(workspace);
const configPath=path.join(work,'config.json');
await fs.writeFile(configPath,JSON.stringify({schema_version:1,workspace,toolchain:root}));
const main=path.join(workspace,'main.vela');
await fs.writeFile(main,'fn main()->Unit{}\n'+Array.from({length:5000},(_,i)=>'fn f'+i+'()->Int{return '+i+';}').join('\n'));
const params={command:process.execPath,args:[path.join(pkg,'dist/index.js'),'--config',configPath],stderr:'pipe'};
const evidence={schema_version:1,checks:[],wire:[]};
const ok=name=>evidence.checks.push(name);
test('modern protocol, cancellation, reconnect and malformed wire', {timeout:60000},async()=>{
 for(const modern of [false,true]){
  const client=new Client({name:'vela-wire',version:'1'},modern?{versionNegotiation:{mode:{pin:'2026-07-28'}}}:{});
  const transport=new StdioClientTransport(params);transport.stderr.on('data',()=>{});
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length,7);
  assert.equal((await client.callTool({name:'vela_get_context',arguments:{}})).structuredContent.status,'ok');
  evidence.wire.push(modern?'2026-07-28':'2025-11-25');
  for(let i=0;i<3;i++){
   const controller=new AbortController();
   const request=client.callTool({name:'vela_check',arguments:{path:'main.vela'}},{signal:controller.signal});
   setTimeout(()=>controller.abort(),20);
   await assert.rejects(request);
  }
  await new Promise(r=>setTimeout(r,70));
  assert.equal((await client.callTool({name:'vela_get_context',arguments:{}})).structuredContent.status,'ok');
  // Close while an analysis is in flight: SDK abort must release owned child.
  const pending=client.callTool({name:'vela_check',arguments:{path:'main.vela'}}).catch(()=>{});
  await new Promise(r=>setTimeout(r,20));await client.close();await pending;
  ok((modern?'modern':'legacy')+' cancellation/reconnect/disconnect');
 }
 const raw=async(payload)=>{
  const child=spawn(process.execPath,params.args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  const closed=new Promise(r=>child.on('close',r));
  child.stdin.on('error',()=>{});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'raw',version:'1'}}})+'\n');
  const deadline=Date.now()+5000;
  while(!out.includes('"id":1')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert.ok(out.includes('"id":1'),'raw client initialized');
  out='';err='';child.stdin.write(payload);
  await new Promise(r=>setTimeout(r,300));child.stdin.end();
  const timer=setTimeout(()=>child.kill(),5000);await closed;clearTimeout(timer);
  return {out,err};
 };
 const invalid=await raw('{\n');
 assert.ok(invalid.err);assert.equal(JSON.parse(invalid.out).error.code,-32700);ok('malformed JSON parse error');
 const utf8=await raw(Buffer.from([255,10]));assert.match(utf8.err,/UTF-8/);ok('invalid wire UTF8 closed');
 const huge=await raw('x'.repeat(1024*1024+1));assert.match(huge.err,/limit/);ok('oversized wire closed');
 await fs.writeFile(path.join(root,'docs/mcp-wire-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
});
