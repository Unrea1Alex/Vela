import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runExecutable} from './oracle/validate.mjs';
const linux=process.argv[3]==='linux';
const executable=linux?process.argv[2]:path.resolve(process.argv[2]);
const root=await fs.mkdtemp(path.resolve('build/stage11/json-app-'));
const input=path.join(root,'input.ndjson'),output=path.join(root,'output.json');
const sentinel=Buffer.from('previous output\0');
const expected={count:1,sum:7,services:[{name:'x',count:1,sum:7,min:7,max:7}]};
const prefix='{"service":"x","level":2,"value":7,"ignored":';
const cases=[
 ['huge exponent',prefix+'1e9999}',true],
 ['huge integer',prefix+'9'.repeat(3500)+'}',true],
 ['deep ignored',prefix+'['.repeat(1900)+'null'+']'.repeat(1900)+'}',true],
 ['malformed ignored escape',prefix+'"\\x"}',false],
 ['malformed ignored nesting',prefix+'[0,]}',false],
 ['malformed ignored number',prefix+'01}',false],
 ['trailing garbage',prefix+'null} false',false],
 ['required decimal','{"service":"x","level":2.0,"value":7}',false],
 ['required exponent','{"service":"x","level":2,"value":7e0}',false],
 ['UTF-8',Buffer.from([123,34,115,101,114,118,105,99,101,34,58,34,255,34,125]),false],
 ['line limit',prefix+'"'+'x'.repeat(4096)+'"}',false]
];
const checks=[];
for(const [name,data,valid] of cases){
 await fs.writeFile(input,data);await fs.writeFile(output,sentinel);
 const linuxPath=value=>value.replace(/^([A-Za-z]):[\\/]/,(_,drive)=>'/mnt/'+drive.toLowerCase()+'/').replaceAll('\\','/');
 const run=linux?await runExecutable(path.join(process.env.SystemRoot,'System32/wsl.exe'),['-d','VelaRelease100','--exec',executable,linuxPath(input),linuxPath(output)]):await runExecutable(executable,[input,output]);
 assert.equal(run.timedOut,false,name);assert.equal(run.spawnError,null,name);
 if(valid){assert.equal(run.exitCode,0,name+': '+run.stderr);assert.deepEqual(JSON.parse(await fs.readFile(output,'utf8')),expected,name);}
 else {assert.notEqual(run.exitCode,0,name);assert.deepEqual(await fs.readFile(output),sentinel,name);}
 checks.push({name,passed:true});
}
console.log(JSON.stringify({platform:linux?'Linux ELF':'Windows',passed:checks.length,failed:0,checks,root}));
