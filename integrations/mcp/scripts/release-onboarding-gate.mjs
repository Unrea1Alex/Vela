// Fresh-client integration test: a separate ephemeral Codex process, no prior Vela history.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]),pkg=path.resolve('.'),abstractions=false;
const logDir=path.join(root,'build/stage1040/agent');await fs.mkdir(logDir,{recursive:true});
const parent=abstractions?os.tmpdir():path.join(root,'work');
await fs.mkdir(parent,{recursive:true});const workspace=await fs.mkdtemp(path.join(parent,'vela-execution-onboarding-'));
execFileSync(process.execPath,[path.join(pkg,'scripts/setup.mjs'),'--workspace',workspace,'--toolchain',root,'--execution-manifest',path.join(root,'build/mcp-execution/execution.json')],{encoding:'utf8'});
const schema=path.join(logDir,'response.schema.json'),final=path.join(logDir,'final.json');
await fs.writeFile(schema,JSON.stringify({type:'object',properties:{source:{type:'string'},artifact_id:{type:'string'},skill_path:{type:'string'},notes:{type:'string'}},required:['source','artifact_id','skill_path','notes'],additionalProperties:false}));
const task=abstractions
  ? 'The application chooses between two implementations of one interface at runtime. The shared client reads a number (20 or 40), then adds an offset of 2 through a closure returned by a factory. Pass that closure to a generic helper that propagates its effects. Print exactly two lines, 22 and 42, without headings. Include two named tests covering the two choices. Get the syntax and signatures from the installed help. For the deliberate rejection, leave a required local capture out of a closure.'
  : 'The application takes no arguments, parses a JSON array [2.5,3.5,4.5], validates that every item is numeric, and prints exactly count=3 total=10.5 mean=3.5 on one line. Include named tests for the calculation and rejection of malformed input. Use the matching installed standard library.';
const prompt='Use $vela-app and the native Vela MCP tools in this session to implement and verify a small application. Read the installed skill; do not inspect compiler implementation. '+task+' Work with an unsaved main.vela overlay, without writing workspace files. First exercise a compiler rejection with a deliberately invalid tiny draft, then correct it and complete help → check → build → test → run through the native tools. These isolated execution tools are explicitly authorized for this acceptance test. Do not substitute shell MCP clients or the host compiler for them. Return JSON containing exact final source, its issued artifact_id, the skill_path actually read and brief corrections/results. If skill-file reading is denied, report that fact separately and use the automatically supplied skill instructions. Do not change connection/trust settings or hashes.';
const args=[path.join(workspace,'vela-codex.mjs'),'exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--output-schema',schema,'--output-last-message',final,'-'];
const child=spawn(process.execPath,args,{cwd:workspace,windowsHide:true,stdio:['pipe','pipe','pipe']});
let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.stdin.end(prompt);
const timer=setTimeout(()=>child.kill(),360000);const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});clearTimeout(timer);
await fs.writeFile(path.join(logDir,'events.jsonl'),output);await fs.writeFile(path.join(logDir,'stderr.log'),error);
const events=output.split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
const calls=events.filter(e=>e.type==='item.completed'&&e.item?.type==='mcp_tool_call').map(e=>e.item);
const commands=events.filter(e=>e.type==='item.completed'&&e.item?.type==='command_execution').map(e=>e.item);
const generated=await fs.readFile(final,'utf8').then(JSON.parse).catch(()=>null);
if(generated)await fs.writeFile(path.join(logDir,'main.vela'),generated.source);
const result=c=>c.result?.structuredContent??JSON.parse(c.result?.content?.find(x=>x.type==='text')?.text??'null');
const successful=tool=>calls.some(c=>c.tool===tool&&result(c)?.status==='ok');
const expected=abstractions?'22\n42':'count=3 total=10.5 mean=3.5';
const ran=generated&&calls.find(c=>c.tool==='vela_run'&&c.arguments.artifact_id===generated.artifact_id&&result(c)?.data?.stdout?.replaceAll('\r\n','\n').trim()===expected);
const tests=calls.find(c=>c.tool==='vela_test'&&result(c)?.status==='ok'&&result(c)?.data?.native?.passed>=2);
const report={schema_version:1,workspace,exit:code,native_mcp_calls:calls.map(c=>({server:c.server,tool:c.tool,status:c.status,result_status:result(c)?.status})),
 skill_path:generated?.skill_path??'',skill_disk_read:commands.some(c=>c.exit_code===0&&c.command?.includes('SKILL.md')&&c.aggregated_output?.includes('vela-app')),
 skill_activation:'Client automatically supplies activated skill instructions; disk reading is recorded separately.',notes:generated?.notes??'Client produced no final source.',
 stdout:ran?expected:'',
 passed:code===0&&['vela_get_context','vela_get_help','vela_check','vela_build','vela_test','vela_run'].every(successful)&&!!ran&&!!tests&&
 calls.some(c=>c.tool==='vela_check'&&result(c)?.status==='rejected'&&(!abstractions||result(c)?.data?.native?.diagnostics?.some(d=>d.code==='E238')))&&
 (!abstractions||[/\binterface\s+/,/\bdyn\s+/,/\beffect\s+/,/\bfn\s*\[/].every(feature=>feature.test(generated.source)))};
await fs.writeFile(path.join(root,'docs/stage1040-agent-evidence.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
