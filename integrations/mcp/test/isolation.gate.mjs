import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {Sandbox,hash} from '../dist/sandbox.js';
const root=path.resolve('../..'),manifest=path.join(root,'build/mcp-execution/execution.json');
const s=new Sandbox(manifest,hash(await fs.readFile(manifest))),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS',name);};
const signal=()=>new AbortController().signal;
const dead=pid=>execFileSync('powershell.exe',['-NoProfile','-Command','if(Get-Process -Id '+pid+' -ErrorAction SilentlyContinue){exit 1}'],{stdio:'ignore'});
try{
 await s.init(hash(await fs.readFile(path.join(root,'bin/velac.exe'))));check('startup access, socket, build/run/test probes',s.ready);
 const probe=path.join(s.manifest.root,'probe.exe');
 for(const [mode,status,code]of [['--memory','ok',0],['--process-limit','ok',0],['--breakaway','ok',0],['--flood','limit',null],['--disk','limit',null],['--files','limit',null],['--tree','timeout',null]]){
  const work=await s.directory();
  try{
   const r=await s.run(work,probe,[mode],signal(),mode==='--tree'?1000:15000);
   console.log(mode,r.status,r.exit_code,mode==='--flood'?'captured bytes='+r.out.length:r.out.subarray(0,500).toString(),r.err.toString());
   check(mode,r.status===status&&(code===null||r.exit_code===code));
   check(mode+' bounded capture',r.out.length+r.err.length<=4*1024*1024);
   if(mode==='--tree'){const pid=/child=(\d+)/.exec(r.out.toString());assert.ok(pid);check('child preserves LPAC/job',r.out.toString().includes('child LPAC/job verified'));dead(Number(pid[1]));check('timeout kills descendant',true);}
  }finally{await s.remove(work);}
 }
 const work=await s.directory(),controller=new AbortController();
 const pending=s.run(work,probe,['--tree'],controller.signal,15000);setTimeout(()=>controller.abort(),1000);
 const cancelled=await pending;check('explicit cancellation',cancelled.status==='cancelled');
 const child=/child=(\d+)/.exec(cancelled.out.toString());assert.ok(child);dead(Number(child[1]));check('cancel kills descendant',true);await s.remove(work);
 // Native supervisor sees an EOF even if its Node host is abruptly disconnected.
 const disconnected=await s.directory(),profile='vela-mcp-exec-'+crypto.randomUUID();
 await fs.mkdir(path.join(disconnected,'Packages',profile,'AC','Temp'),{recursive:true});
 const helper=spawn(s.manifest.helper,[disconnected,s.manifest.root,profile,'15000',disconnected,probe,'--tree'],{env:{...process.env,...s.environment(disconnected)},windowsHide:true,stdio:['pipe','pipe','pipe']});
 let status='';helper.stdout.on('data',b=>status+=b);helper.stderr.resume();
 setTimeout(()=>helper.stdin.end(),1000);
 const code=await new Promise((resolve,reject)=>{helper.on('error',reject);helper.on('close',resolve);});
 check('disconnect cancels job',code===0&&JSON.parse(status).status==='cancelled');
 const pid=/child=(\d+)/.exec(await fs.readFile(path.join(disconnected,'__stdout'),'utf8'));assert.ok(pid);dead(Number(pid[1]));check('disconnect kills descendant',true);await s.remove(disconnected);
 const crashed=await s.directory(),failure=s.run(crashed,probe,['--tree'],signal(),15000).catch(e=>e);
 let childPid;
 for(let i=0;i<100;i++){
  const text=await fs.readFile(path.join(crashed,'__stdout'),'utf8').catch(()=>''),match=/child=(\d+)/.exec(text);
  if(match){childPid=Number(match[1]);break;}await new Promise(r=>setTimeout(r,50));
 }
 assert.ok(childPid);assert.ok(s.supervisorPid);process.kill(s.supervisorPid);
 const error=await failure;check('supervisor death fails closed and recovers profile',error.status==='incompatible'&&error.message.includes('recovered'));
 dead(childPid);check('supervisor death kills descendant',true);await s.remove(crashed);
 await s.verify();check('toolchain bytes unchanged',true);
 await s.close();
 // Model clients that kill their MCP Node process instead of closing stdio.
 const readyFile=path.join(root,'build/stage07/forced-host.json');await fs.rm(readyFile,{force:true});
 const childCode='import fs from "node:fs/promises";import path from "node:path";import {Sandbox,hash} from '+JSON.stringify(pathToFileURL(path.resolve('dist/sandbox.js')).href)+';'+
  'const [manifest,compiler,ready]=process.argv.slice(1);const s=new Sandbox(manifest,hash(await fs.readFile(manifest)));await s.init(hash(await fs.readFile(compiler)));const work=await s.directory();await fs.writeFile(ready,JSON.stringify({base:s.base,work}));await s.run(work,path.join(s.manifest.root,"probe.exe"),["--tree"],new AbortController().signal,30000);await s.close();';
 const owner=spawn(process.execPath,['--input-type=module','-e',childCode,manifest,path.join(root,'bin/velac.exe'),readyFile],{windowsHide:true,stdio:'ignore'});
 let state,descendant;
 try{
  for(let i=0;i<400;i++){
   state=await fs.readFile(readyFile,'utf8').then(JSON.parse).catch(()=>undefined);
   if(state){const output=await fs.readFile(path.join(state.work,'__stdout'),'utf8').catch(()=>'');const match=/child=(\d+)/.exec(output);
    if(match&&output.includes('child LPAC/job verified')){descendant=Number(match[1]);break;}}
   await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(descendant,'forced-host fixture started');const closed=new Promise(r=>owner.once('close',r));owner.kill();await closed;
  for(let i=0;i<300;i++){
   if(!(await fs.stat(manifest+'.lock').catch(()=>null))&&!(await fs.stat(state.base).catch(()=>null)))break;
   await new Promise(r=>setTimeout(r,50));
  }
  dead(descendant);check('forced Node death kills descendants',true);
  console.log('forced host paths',state);
  check('forced Node death removes snapshot and lease',!(await fs.stat(manifest+'.lock').catch(()=>null))&&!(await fs.stat(state.base).catch(()=>null)));
 }finally{owner.kill();await fs.rm(readyFile,{force:true});}
}finally{await s.close();await fs.writeFile(path.join(root,'build/stage07/078-isolation.json'),JSON.stringify({schema_version:1,checks},null,2));}
console.log('Isolation checks:',checks.length);
