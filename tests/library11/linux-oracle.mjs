// Optional host integration harness. The application is a native Linux ELF.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createFixtureSuite,createMaintenanceSuite,SENTINEL} from './oracle/fixtures.mjs';
import {runExecutable,compareOutput} from './oracle/validate.mjs';
const [task,executable,workDir]=process.argv.slice(2);
if(!['index','logs'].includes(task)||!executable?.startsWith('/')||!workDir)throw Error('Pass index/logs, absolute Linux ELF, Windows work directory');
const linuxPath=value=>value.replace(/^([A-Za-z]):[\\/]/,(_,drive)=>'/mnt/'+drive.toLowerCase()+'/').replaceAll('\\','/');
const checks=[];
for(const [phase,factory] of [['baseline',createFixtureSuite],['maintenance',createMaintenanceSuite]]){
 const root=await fs.mkdtemp(path.resolve(workDir+'-'+phase+'-'));
 const suite=await factory(task,root);
 try{
  for(const test of suite.cases){
   await fs.writeFile(test.output,SENTINEL);
   const args=['-d','VelaRelease100','--exec',executable,...test.args.map((value,i)=>i<2?linuxPath(value):value)];
   const run=await runExecutable(path.join(process.env.SystemRoot,'System32/wsl.exe'),args,{timeoutMs:10000});
   let detail=null;
   if(run.timedOut||run.spawnError||run.signal)detail='launch/timeout: '+JSON.stringify(run);
   else if(test.expectSuccess){
    if(run.exitCode!==(test.expectedExit??0))detail='exit '+run.exitCode+': '+run.stderr;
    else try{detail=compareOutput(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(test.output))),test.expected);}catch(error){detail=String(error);}
   }else{
    if(run.exitCode===0||run.exitCode===null)detail='invalid input accepted';
    if(!(await fs.readFile(test.output)).equals(SENTINEL))detail='existing output changed';
   }
   checks.push({name:phase+'-'+test.name,passed:detail===null,detail:detail??'ok',elapsed_ms:run.elapsed_ms});
  }
 }finally{await suite.stop();}
}
const passed=checks.filter(value=>value.passed).length;
console.log(JSON.stringify({platform:'Linux ELF in VelaRelease100; fixtures on /mnt/g',task,passed,failed:checks.length-passed,total:checks.length,checks},null,2));
process.exitCode=passed===checks.length?0:1;
