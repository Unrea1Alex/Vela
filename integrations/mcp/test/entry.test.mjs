import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
test('compact entry preserves reference topics, response forms and plan validation',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'vela-entry12-'));
 const config=path.join(workspace,'config.json');
 await fs.writeFile(config,JSON.stringify({schema_version:1,workspace,toolchain:path.resolve(process.env.VELA_TEST_NATIVE_ROOT??'../..')}));
 const client=new Client({name:'vela-entry12',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js','--config',config],stderr:'pipe'});
 transport.stderr.resume();
 try{
  await client.connect(transport);
  const context=await client.callTool({name:'vela_get_context',arguments:{}});
  assert.deepEqual(JSON.parse(context.content[0].text),context.structuredContent);
  assert.equal(context.structuredContent.data.execution,false);
  assert.ok(context.structuredContent.data.quickstart.length<400);
  assert.match(context.structuredContent.data.quickstart,/native CLI/);
  for(const topic of ['start','capabilities','recipes','migration','quickstart','language','projects','modules','memory','builtins','idioms','numbers','stdlib','testing','ffi']){
   const result=await client.callTool({name:'vela_get_help',arguments:{topic}});
   assert.equal(result.structuredContent.status,'ok');assert.ok(result.structuredContent.data.text.length>0);
  }
  const recipe=await client.callTool({name:'vela_get_help',arguments:{topic:'recipes'}});
  assert.match(recipe.structuredContent.data.text,/std\/directory:entries_bounded/);
  const common={path:'main.vela',snapshot_id:'0'.repeat(64),revision:'0'.repeat(64),document:0};
  const invalid=await client.callTool({name:'vela_plan',arguments:{...common,kind:'format',byte:0}}).catch(error=>error);
  assert.match(invalid instanceof Error?invalid.message:JSON.stringify(invalid),/Format does not accept rename fields/);
  const missing=await client.callTool({name:'vela_plan',arguments:{...common,kind:'rename'}}).catch(error=>error);
  assert.match(missing instanceof Error?missing.message:JSON.stringify(missing),/Rename requires byte and new_name/);
 }finally{await client.close();await transport.close();await fs.rm(workspace,{recursive:true,force:true});}
});
