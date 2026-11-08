import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
test('native API lookup, pages, stale metadata and complete response bounds',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'vela-api-sdk12-'));
 const config=path.join(workspace,'config.json');await fs.writeFile(config,JSON.stringify({schema_version:1,workspace,toolchain:path.resolve(process.env.VELA_TEST_NATIVE_ROOT??'../..')}));
 const client=new Client({name:'vela-api-sdk12',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js','--config',config],stderr:'pipe'});transport.stderr.resume();
 const call=async input=>{
  const reply=await client.callTool({name:'vela_get_help',arguments:{topic:'api',...input}});
  assert.deepEqual(JSON.parse(reply.content[0].text),reply.structuredContent);
  assert.ok(Buffer.byteLength(JSON.stringify(reply))<=(input.max_bytes??8192));
  return reply.structuredContent;
 };
 try{
  await client.connect(transport);
  for(const name of ['std/directory:walk','std/json_stream:skip_value','std/http:curl_transfer','std/cli_schema:create','std/result_ops:map','std/option:unwrap_or_else','std/algorithms:sort','std/algorithms:try_fold','std/algorithms:map','std/set:union','std/cell:get','std/json_decode:object','std/json_decode:required','std/io:copy_owned','std/stream_lines:reader','std/parallel:create','std/parallel:outcome']){
   const result=await call({name});assert.equal(result.status,'ok');const item=result.data.native.items[0];
   assert.equal(item.id,name);for(const key of ['signature','effects','ownership','limits','example','recipe'])assert.ok(key in item,key);
  }
  assert.equal((await call({})).data.native.state,'empty');
  assert.equal((await call({query:'does_not_exist_anywhere'})).data.native.state,'no_matches');
  assert.equal((await call({name:'does_not_exist_anywhere'})).data.native.state,'not_found');
  assert.equal((await call({name:'open'})).data.native.state,'ambiguous');
  assert.equal((await call({version:'0.0.0'})).status,'incompatible');
  assert.equal((await call({fingerprint:'0'.repeat(64)})).status,'incompatible');
  const narrow=await call({name:'std/directory:walk',max_bytes:1024});assert.equal(narrow.status,'limit');
  let offset=0,ids=[],expected=0,fingerprint;
  do{
   const page=await call({query:'directory metadata',offset,limit:2,max_bytes:4096,...(fingerprint?{fingerprint}:{})});
   assert.equal(page.status,'ok',JSON.stringify(page));const data=page.data.native;fingerprint=data.fingerprint;expected=data.total;
   ids.push(...data.items.map(item=>item.id));offset=data.next_offset;
  }while(offset!==null);
  assert.equal(ids.length,expected);assert.equal(new Set(ids).size,ids.length);
  const invalid=await client.callTool({name:'vela_get_help',arguments:{topic:'api',query:'x',name:'y'}}).catch(error=>error);
  assert.match(invalid instanceof Error?invalid.message:JSON.stringify(invalid),/query or name/);
  const nul=await client.callTool({name:'vela_get_help',arguments:{topic:'api',query:'\0'}}).catch(error=>error);
  assert.ok(nul instanceof Error||nul.isError===true);
 }finally{await client.close();await transport.close();await fs.rm(workspace,{recursive:true,force:true});}
});
