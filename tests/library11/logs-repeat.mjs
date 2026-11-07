import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
const executable=path.resolve(process.argv[2]);
const work=await fs.mkdtemp(path.resolve('build/stage11/logs-repeat-'));
const input=path.join(work,'input.ndjson'),output=path.join(work,'output.json');
const data=(JSON.stringify({service:'x',level:2,value:1})+'\n').repeat(500);
await fs.writeFile(input,data);
const child=spawn(executable,[input,output,'--repeat','300'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,VELA_GC_REPORT:'1'}});
let stderr='';child.stderr.on('data',v=>stderr+=v);
const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});
const timeout=setTimeout(()=>child.kill(),30000);
try{
 await wait(80);assert.equal(child.exitCode,null,'workload must still be active at mutation');
 const file=await fs.open(input,'r+');try{await file.write(Buffer.from('2'),0,1,data.lastIndexOf('1}'));}finally{await file.close();}
 const result=await done;assert.deepEqual(result,{code:0,signal:null},stderr);
 assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')),{count:500,sum:501,services:[{name:'x',count:500,sum:501,min:1,max:2}]});
 console.log(JSON.stringify({passed:true,repeat:300,observed_changed_content:true,gc:stderr.trim(),work}));
}finally{clearTimeout(timeout);if(child.exitCode===null)child.kill();}
