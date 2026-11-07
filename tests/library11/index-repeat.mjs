import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
const executable=path.resolve(process.argv[2]);
const work=await fs.mkdtemp(path.resolve('build/stage11/index-repeat-'));
const root=path.join(work,'input');await fs.mkdir(root);
await fs.writeFile(path.join(root,'large.bin'),Buffer.alloc(1048576,65));
const output=path.join(work,'output.json');
const child=spawn(executable,[root,output,'--repeat','1000'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',v=>stderr+=v);
const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});
const timeout=setTimeout(()=>child.kill(),30000);
try {
 await wait(80);assert.equal(child.exitCode,null,'workload must still be active at mutation');
 await fs.writeFile(path.join(root,'late.txt'),'first\n');
 await wait(80);assert.equal(child.exitCode,null,'workload must still be active at second mutation');
 await fs.writeFile(path.join(root,'late.txt'),'final state\n');
 const result=await done;assert.deepEqual(result,{code:0,signal:null},stderr);
 const report=JSON.parse(await fs.readFile(output,'utf8'));
 assert.deepEqual(report.files,[{path:'large.bin',bytes:1048576,lines:1},{path:'late.txt',bytes:12,lines:1}]);
 assert.equal(report.total_bytes,1048588);assert.equal(report.total_lines,2);
 console.log(JSON.stringify({passed:true,repeat:1000,observed_new_entry:true,observed_changed_content:true,work}));
}finally{clearTimeout(timeout);if(child.exitCode===null)child.kill();}
