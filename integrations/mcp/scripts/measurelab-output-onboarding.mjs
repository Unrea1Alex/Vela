// Fresh Codex session for the release gate. The HTML is saved only in a new
// fixture workspace, then compared with the native MeasureLab sample.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const pkg=path.resolve('.'), repo=path.resolve('../..');
const native=path.resolve(process.env.VELA_TEST_NATIVE_ROOT??repo);
const evidence=path.join(repo,'build/stage09/output-onboarding');
await fs.mkdir(evidence,{recursive:true});
await fs.mkdir(path.join(repo,'work'),{recursive:true});
const workspace=await fs.mkdtemp(path.join(repo,'work/measurelab-09-agent-'));
const app=path.join(native,'apps/measurelab');
for(const file of ['main.vela','model.vela','statistics.vela','report.vela','tests.vela',
  'vela.project','vela.project.lock','sample.json','check-mcp.mjs']){
  await fs.copyFile(path.join(app,file),path.join(workspace,file));
}
execFileSync(process.execPath,[path.join(pkg,'scripts/setup.mjs'),'--workspace',workspace,'--toolchain',native,
  '--execution-manifest',path.join(native,'build/mcp-execution/execution.json')],{encoding:'utf8',timeout:180000});
const expected=createHash('sha256').update(await fs.readFile(path.join(app,'report.html'))).digest('hex');
const decisionPath=path.join(workspace,'build','save-decision.json');
await fs.mkdir(path.dirname(decisionPath));
const schema=path.join(evidence,'save-decision.schema.json');
await fs.writeFile(schema,JSON.stringify({type:'object',properties:{
  output_id:{type:'string'},sha256:{type:'string'},size:{type:'integer'},save_as:{type:'string'}
},required:['output_id','sha256','size','save_as'],additionalProperties:false}));
const argv=[path.join(workspace,'vela-codex.mjs'),'exec','--ignore-user-config','--ephemeral',
  '--skip-git-repo-check','--sandbox','read-only','--json','--output-schema',schema,
  '--output-last-message',decisionPath,'-'];
const child=spawn(process.execPath,argv,{cwd:workspace,windowsHide:true,stdio:['pipe','pipe','pipe']});
let stdout='',stderr='';
child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
child.stdin.end(`Use the installed $vela-app skill and the Vela MCP tools in this new session.
You have a complete MeasureLab project in this workspace. Get context and use vela_check and vela_build
with path vela.project. Use the built executable ID with vela_run, args ["sample.json","../export/report.html"]
and outputs ["report.html"]. Retrieve the bytes through the native vela_read_output tool, asking for
the entire file if it fits. After reading the output, explicitly request the host to save the file by
returning output_id, sha256, size, and save_as "downloaded-report.html" in the required response JSON.
The host will verify the exact bytes and save them in this fixture workspace. Do not run the compiler
or app through the shell, call a separate MCP client, edit sources, or change configuration.`);
const timer=setTimeout(()=>child.kill(),360000);
const exit=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
clearTimeout(timer);
await fs.writeFile(path.join(evidence,'events.jsonl'),stdout);
await fs.writeFile(path.join(evidence,'stderr.log'),stderr);
const calls=stdout.split('\n').flatMap(line=>{try{
  const e=JSON.parse(line);
  return e.type==='item.completed'&&e.item?.type==='mcp_tool_call'?[e.item]:[];
}catch{return [];}});
const result=c=>c.result?.structuredContent??JSON.parse(c.result?.content?.find(x=>x.type==='text')?.text??'null');
const tool_calls=calls.map(c=>({name:c.tool,status:result(c)?.status??c.status}));
const decision=JSON.parse(await fs.readFile(decisionPath,'utf8'));
assert.equal(decision.save_as,'downloaded-report.html');
const chunks=calls.filter(c=>c.tool==='vela_read_output').map(c=>result(c)?.data)
  .filter(d=>d?.output_id===decision.output_id).sort((a,b)=>a.offset-b.offset);
let next=0;
const buffers=[];
for(const chunk of chunks){
  assert.equal(chunk.offset,next);
  assert.equal(chunk.sha256,decision.sha256);
  assert.equal(chunk.size,decision.size);
  assert.equal(chunk.encoding,'base64');
  const bytes=Buffer.from(chunk.bytes,'base64');
  next+=bytes.length;
  assert.equal(chunk.next_offset,next);
  buffers.push(bytes);
}
const bytes=Buffer.concat(buffers);
assert.equal(bytes.length,decision.size);
assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
assert.equal(decision.sha256,expected);
await fs.writeFile(path.join(workspace,decision.save_as),bytes,{flag:'wx'});
const saved=await fs.readFile(path.join(workspace,'downloaded-report.html')).catch(()=>null);
const saved_hash=saved?createHash('sha256').update(saved).digest('hex'):null;
const report={schema_version:1,exit,workspace,expected,saved_hash,saved_bytes:saved?.length??0,tool_calls,
  save_method:'Explicit request from read-only fresh client; host verifies and writes fixture file.',
  passed:exit===0&&expected===saved_hash&&['vela_get_context','vela_check','vela_build','vela_run','vela_read_output']
    .every(name=>tool_calls.some(call=>call.name===name&&call.status==='ok'))};
await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
assert.ok(report.passed,'Fresh session did not verify and save the exact HTML bytes.');
