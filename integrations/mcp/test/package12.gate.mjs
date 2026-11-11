import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]),pkg=path.resolve('.');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'Vela installed 🌿 ')),checks=[];
const manifest=process.argv[4]?path.resolve(process.argv[4]):path.join(root,'build/mcp-execution/execution.json');
const expectedVersion=process.argv[5]??'1.2.0';
const setup=[path.join(pkg,'scripts/setup.mjs'),'--workspace',work,'--toolchain',root,'--execution-manifest',manifest];
const source='import "vela-stdlib/algorithms.vela" as a; fn total()->Int effects{state}{let values=list_new<Int>();list_push(values,3);list_push(values,1);list_push(values,2);let sorted=a::sort(values,fn [](left:Int,right:Int)->Int{if left<right{return -1;}if left>right{return 1;}return 0;});return a::fold(sorted,0,fn [](sum:Int,n:Int)->Int{return sum+n;});} fn main()->Unit effects{state,io}{print("installed total="+to_string(total()));} test "installed sort/fold" effects{state}{assert_true(total()==6,"installed result");}';
let client,transport;
try{
 execFileSync(process.execPath,setup,{encoding:'utf8'});checks.push('new Unicode/space installation with execution manifest');
 const config=path.join(work,'.codex/vela-mcp.json'),before=await fs.readFile(config);execFileSync(process.execPath,setup,{encoding:'utf8'});assert.deepEqual(await fs.readFile(config),before);checks.push('setup is idempotent');
 client=new Client({name:'vela-packaged-new-client12',version:'1'});transport=new StdioClientTransport({command:process.execPath,args:[path.join(pkg,'dist/index.js'),'--config',config],stderr:'pipe'});let stderr='';transport.stderr.on('data',b=>stderr+=b);await client.connect(transport);
 const call=async(name,args={})=>{const answer=await client.callTool({name,arguments:args},{timeout:180000});assert.deepEqual(JSON.parse(answer.content[0].text),answer.structuredContent);assert.equal(answer.structuredContent.status,'ok',JSON.stringify(answer.structuredContent));return answer.structuredContent;};
 const context=await call('vela_get_context');assert.equal(context.data.version,expectedVersion);assert.equal(context.data.execution,true);checks.push('matching version/capabilities and isolated execution available');
 const api=await call('vela_get_help',{topic:'api',name:'std/algorithms:sort'});assert.equal(api.data.native.items[0].id,'std/algorithms:sort');checks.push('installed native API discovery');
 await call('vela_check',{path:'main.vela',text:source});checks.push('check installed sort/fold overlay');
 const built=await call('vela_build',{path:'main.vela',text:source});assert.match(built.data.artifact_id,/^[a-f0-9]{64}$/);checks.push('build issues isolated artifact');
 const tested=await call('vela_test',{path:'main.vela',text:source});assert.ok(JSON.stringify(tested.data).includes('installed sort/fold'));assert.ok(/"passed":1/.test(JSON.stringify(tested.data)));checks.push('named test through allowed execution path');
 const ran=await call('vela_run',{artifact_id:built.data.artifact_id});assert.equal(ran.data.exit_code,0);assert.equal(ran.data.stdout.trim(),'installed total=6');checks.push('run issued artifact produces independent literal output');
 assert.equal(await fs.stat(path.join(work,'main.vela')).then(()=>true,()=>false),false);checks.push('overlay did not write source');assert.equal(stderr,'');
 await fs.writeFile(output,JSON.stringify({schema_version:1,status:'passed',version:expectedVersion,checks,scope:'fresh packaged setup and real stdio SDK client, isolated native check/build/test/run; desktop IDE discovery not exercised'},null,2));console.log(JSON.stringify({status:'passed',checks:checks.length}));
}finally{await client?.close();await transport?.close();assert.equal(path.dirname(work),os.tmpdir());await fs.rm(work,{recursive:true,force:true});}
