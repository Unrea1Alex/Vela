import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]??'../..');
const toolchain=path.resolve(process.argv[3]??root);
const adapter=path.resolve(process.argv[4]??'.');
const base=await fs.mkdtemp(path.join(os.tmpdir(),'vela-coldstart-'));
const logs=path.join(root,'build/stage06/cold-start');await fs.mkdir(logs,{recursive:true});
const outputSchema=path.join(base,'output.schema.json');
await fs.writeFile(outputSchema,JSON.stringify({type:'object',properties:{source:{type:'string'},notes:{type:'string'}},required:['source','notes'],additionalProperties:false}));
const codex=path.join(process.env.LOCALAPPDATA,'Programs/OpenAI/Codex/bin/codex.exe');
const tasks=[
 {name:'collections',prompt:'Create main.vela. Read every command-line argument as an integer (valid inputs only). Store integers in List<Int> and count occurrences using Dict<Int,Int>. Print sum of all numbers on one line and number of distinct values on the next. No arguments means both zero.',cases:[{args:['3','-2','7','3'],out:'11\n3\n'},{args:['0','0'],out:'0\n1\n'},{args:[],out:'0\n0\n'}]},
 {name:'result',prompt:'Create main.vela. Accept one string argument. Implement a helper returning Result<Int,String> to parse it, another helper that propagates errors with ? and doubles the number. main prints the doubled integer, or the literal error on failure. Use explicit effects.',cases:[{args:['21'],out:'42\n'},{args:['-4'],out:'-8\n'},{args:['bad'],out:'error\n'}]},
 {name:'unicode_file',prompt:'Create main.vela. Arguments are input file path and output file path. Read and copy the file bytes exactly using Vela file APIs; print its byte count. On I/O errors return a nonzero exit code. Contents and paths can contain Unicode.',cases:[{file:'Привет 😀\n',out:'18\n'},{file:'abc\n',out:'4\n'}]},
 {name:'dependency',prompt:'Complete main.vela in the existing vela.project. Use the configured math dependency public score function on the first integer argument and print its result. Inspect the library interface, keep the dependency files and lock unchanged. Use an aliased import.',project:true,cases:[{args:['5'],out:'16\n'},{args:['-2'],out:'-5\n'}]},
 {name:'repair',prompt:'Fix main.vela. It must accept a nonnegative integer argument and print the sum of every integer from zero through that integer inclusive. Keep a separate sum function. Fix type/effect errors and the off-by-one error; check the final code.',initial:'fn sum(n:Int)->Int {var total=0;for i in 0..n {total=total+i;}return total;} fn main()->Unit {print(sum("5"));}',cases:[{args:['5'],out:'15\n'},{args:['0'],out:'0\n'},{args:['10'],out:'55\n'}]}
];
const report={schema_version:1,client:execFileSync(codex,['--version'],{encoding:'utf8'}).trim(),model:'client default; captured per task',mode:'read-only agent produces checked source; independent harness saves/builds/runs',initial_attempts:'cold-start-initial-policy-evidence.json',base,toolchain,adapter,tasks:[]};
const run=(exe,args,cwd,log,prompt)=>new Promise(resolve=>{
 const child=spawn(exe,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
 child.stdin.end(prompt??'');
 const timer=setTimeout(()=>child.kill(),240000);
 child.on('close',async code=>{clearTimeout(timer);await fs.writeFile(log,out);await fs.writeFile(log+'.stderr',err);resolve({code,out,err});});
});
for(const task of tasks){
 const dir=path.join(base,task.name);await fs.mkdir(dir);
 await fs.copyFile(path.join(root,'integrations/agent/AGENTS.template.md'),path.join(dir,'AGENTS.md'));
 await fs.mkdir(path.join(dir,'.agents/skills/vela-app'),{recursive:true});
 await fs.copyFile(path.join(root,'integrations/agent/vela-app/SKILL.md'),path.join(dir,'.agents/skills/vela-app/SKILL.md'));
 if(task.initial)await fs.writeFile(path.join(dir,'main.vela'),task.initial);
 if(task.project){
  await fs.mkdir(path.join(dir,'lib'));
  await fs.writeFile(path.join(dir,'lib/math.vela'),'pub fn score(n:Int)->Int{return n*3+1;}');
  await fs.writeFile(path.join(dir,'vela.project'),'vela-project|1\nname|dep_app\nentry|main.vela\ndep|math|lib/math.vela\n');
  await fs.writeFile(path.join(dir,'main.vela'),'fn main()->Unit{}');
  execFileSync(path.join(toolchain,'bin/velac.exe'),['lock',path.join(dir,'vela.project')]);
 }
 const configPath=path.join(base,task.name+'.json');
 await fs.writeFile(configPath,JSON.stringify({schema_version:1,toolchain,workspace:dir}));
 const mcp='mcp_servers.vela={command='+JSON.stringify(process.execPath.replaceAll('\\','/'))+',args='+JSON.stringify([path.join(adapter,'dist/index.js'), '--config',configPath].map(p=>p.replaceAll('\\','/')))+',required=true}';
 const prompt='This is a fresh Vela 0.6 application acceptance task. You have no prior Vela development context. This agent session is read-only: do not call shell/file editing tools or read local skill files. The packaged skill workflow is: call vela_get_context first, retrieve relevant help, then check each draft with vela_check(path="main.vela", text=YOUR_SOURCE). An independent harness will save the source from your final JSON and build/run it. Do not inspect compiler implementation, external memories or other tasks. '+task.prompt+(task.initial?' Original source:\n'+task.initial:'')+(task.project?' The supplied dependency interface is pub fn score(n: Int) -> Int; the existing manifest declares dep|math|lib/math.vela. Use import "@math" as math; and verify the draft with vela_check(path="vela.project", overlay_path="main.vela", text=YOUR_SOURCE). This preserves native dependency resolution and lock validation.':'')+' Return JSON with source (the exact complete main.vela that passed MCP check) and notes (failed attempts). No file writes, build, run or questions.';
 const finalPath=path.join(logs,task.name+'.final.json');
 const execution=await run(codex,['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','-s','read-only','-c','approval_policy="never"','-c',mcp,'--output-schema',outputSchema,'--output-last-message',finalPath,'-'],dir,path.join(logs,task.name+'.log'),prompt);
 const record={name:task.name,agent_exit:execution.code,cases:[],check_calls:0,help_calls:0,failed_checks:0,unknown_api_diagnostics:0};
 const lines=execution.out.split('\n').filter(Boolean);
 for(const line of lines){
  let event;try{event=JSON.parse(line);}catch{continue;}
  if(event.type==='item.completed'&&event.item?.type==='mcp_tool_call'){
   const item=event.item;
   if(item.tool==='vela_check'){record.check_calls++;const txt=JSON.stringify(item.result);if(txt.includes('"rejected"'))record.failed_checks++;if(txt.includes('E203'))record.unknown_api_diagnostics++;}
   if(item.tool==='vela_get_help'||item.tool==='vela_get_context')record.help_calls++;
  }
 }
 const combined=execution.out+'\n'+execution.err;
 record.model=combined.match(/^model:\s*(.+)$/m)?.[1]??'unreported';
 record.check_calls=(combined.match(/^mcp: vela\/vela_check \(completed\)/gm)??[]).length;
 record.help_calls=(combined.match(/^mcp: vela\/vela_get_(?:context|help) \(completed\)/gm)??[]).length;
 record.failed_checks=(combined.match(/"status":\s*"rejected"/g)??[]).length;
 let generated;try{generated=JSON.parse(await fs.readFile(finalPath,'utf8'));}catch{}
 if(generated&&typeof generated.source==='string')await fs.writeFile(path.join(dir,'main.vela'),generated.source);
 record.notes=generated?.notes??'No source artifact returned.';
 const input=path.join(dir,task.project?'vela.project':'main.vela');
 const exe=path.join(logs,task.name+'.exe');
 // Direct argv runner under existing MSVC environment; no model-supplied commands.
 const built=await run(path.join(toolchain,'bin/velac.exe'),['build',input,'-o',exe],dir,path.join(logs,task.name+'.build.log'));
 record.build_exit=built.code;
 if(built.code===0){
  for(let i=0;i<task.cases.length;i++){
   const c=task.cases[i];let args=c.args??[];
   if(c.file!==undefined){const src=path.join(dir,'вход '+i+'.txt'),dst=path.join(dir,'выход '+i+'.txt');await fs.writeFile(src,c.file);args=[src,dst];}
   const actual=await run(exe,args,dir,path.join(logs,task.name+'.case'+i+'.log'));
   let ok=actual.code===0&&actual.out.replaceAll('\r\n','\n')===c.out&&actual.err==='';
   if(c.file!==undefined)ok=ok&&await fs.readFile(args[1],'utf8')===c.file;
   record.cases.push({index:i,passed:ok,exit:actual.code,stdout:actual.out,stderr:actual.err});
  }
 }
 record.passed=execution.code===0&&record.help_calls>0&&record.check_calls>0&&record.build_exit===0&&record.cases.length===task.cases.length&&record.cases.every(c=>c.passed);
 report.tasks.push(record);
 await fs.writeFile(path.join(root,'docs/cold-start-evidence.json'),JSON.stringify(report,null,2)+'\n');
 console.log(task.name+': '+(record.passed?'PASS':'FAIL')+' checks='+record.check_calls+' failures='+record.failed_checks);
}
if(report.tasks.some(t=>!t.passed))process.exitCode=1;
