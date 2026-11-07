import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runExecutable} from './oracle/validate.mjs';
const execute=promisify(execFile);
const [probe,collector,hung]=process.argv.slice(2).map(value=>path.resolve(value));
const curl=path.join(process.env.SystemRoot,'System32/curl.exe');
const root=await fs.mkdtemp(path.resolve('build/stage11/http-deadlines-'));
let active=0,peak=0;const received=[];const sockets=new Set();const timers=new Set();
const later=(fn,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);};
const server=http.createServer((req,res)=>{
 received.push(req.url);
 if(req.url.startsWith('/queue/')){++active;peak=Math.max(peak,active);res.once('close',()=>--active);later(()=>res.end('ok'),25);return;}
 if(req.url.startsWith('/headers')){later(()=>res.end('late'),500);return;}
 if(req.url.startsWith('/body')){res.writeHead(200,{'content-length':9});res.write('partial');later(()=>res.end('ok'),500);return;}
 if(req.url==='/stall')return;
 res.end('ok');
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const checks=[];
try{
 for(const mode of ['legacy','transfer','cleanup','headers','body','cancel','hang']){
  const work=path.join(root,mode);await fs.mkdir(work);
  const route=mode==='headers'||mode==='body'?'/'+mode:mode==='cancel'?'/stall':'/fast';
  const result=await runExecutable(probe,[mode,mode==='hang'?hung:curl,base+route,work],{timeoutMs:6000});
  assert.equal(result.exitCode,0,mode+': '+result.stderr);assert.equal(result.timedOut,false,mode);
  const expected=['transfer','cleanup'].includes(mode)?'response':mode==='cancel'?'cancelled':'timeout';
  assert.equal(result.stdout.trim(),mode+'='+expected);assert.deepEqual(await fs.readdir(work),[],'no files after '+mode);
  if(mode==='hang')assert.ok(result.elapsed_ms<2200,'bounded hung helper');
  checks.push({name:mode,passed:true,elapsed_ms:result.elapsed_ms});
 }
 assert.ok(received.includes('/stall'),'cancelled request reached server');
 const tasks=await execute('tasklist.exe',['/FI','IMAGENAME eq vela11-http-hung.exe','/FO','CSV','/NH'],{windowsHide:true});
 assert.ok(!tasks.stdout.toLowerCase().includes('vela11-http-hung.exe'),'no hung helper process');
 async function collection(name,urls,concurrency,timeout){
  const work=path.join(root,name);await fs.mkdir(work);const input=path.join(work,'config.json'),output=path.join(work,'output.json');
  const data=JSON.stringify({urls,concurrency,timeout_ms:timeout});await fs.writeFile(input,data.slice(0,-1)+',"ignored":1e9999}');
  const run=await runExecutable(collector,[input,output],{timeoutMs:15000});assert.equal(run.exitCode,0,name+': '+run.stderr);assert.equal(run.timedOut,false);
  assert.deepEqual((await fs.readdir(work)).sort(),['config.json','output.json'],'collector released all files');
  return {report:JSON.parse(await fs.readFile(output,'utf8')),run};
 }
 const urls=Array.from({length:128},(_,i)=>base+'/queue/'+i);
 const queued=await collection('queue128',urls,8,50);
 assert.deepEqual(queued.report,{results:urls.map(url=>({url,status:200,bytes:2,error:null}))});
 assert.ok(peak<=8&&peak>1,'parallel bound');assert.equal(received.filter(v=>v.startsWith('/queue/')).length,128);assert.ok(queued.run.elapsed_ms>50,'queued work survives beyond one transfer deadline');
 checks.push({name:'128 URLs /concurrency 8 /50 ms',passed:true,peak,elapsed_ms:queued.run.elapsed_ms});
 for(const route of ['/headers-app','/body-app']){
  const url=base+route;const result=await collection(route.slice(1),[url],1,50);
  assert.deepEqual(result.report,{results:[{url,status:0,bytes:0,error:'timeout'}]});
  assert.ok(result.run.elapsed_ms<600,'50 ms transfer is not extended by 1000 ms');
  checks.push({name:route+'50ms',passed:true,elapsed_ms:result.run.elapsed_ms});
 }
 console.log(JSON.stringify({passed:checks.length,failed:0,checks,root,curl_version:(await execute(curl,['--version'],{windowsHide:true})).stdout.split(/\r?\n/)[0]}));
}finally{for(const timer of timers)clearTimeout(timer);for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
