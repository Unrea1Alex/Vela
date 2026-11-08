import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile),root=path.resolve(process.argv[2]??'.'),exe=path.join(root,'build/stage12/parallel-http127.exe');
const work=await fs.mkdtemp(path.join(root,'build/stage12/parallel-http-')),observations=[];let active=0,peak=0,requests=[],timeline=[],firstRequest;
const timers=new Set(),sockets=new Set();
const server=http.createServer((req,res)=>{requests.push(req.url);timeline.push({kind:"start",path:req.url,at:performance.now()});active++;peak=Math.max(peak,active);res.once('close',()=>{active--;timeline.push({kind:'finish',path:req.url,at:performance.now()});});firstRequest?.();firstRequest=undefined;const id=Number(req.url.slice(1));const timer=setTimeout(()=>{timers.delete(timer);res.writeHead(200+id).end('body');},id%2?350:650);timers.add(timer);res.once('close',()=>{clearTimeout(timer);timers.delete(timer);});});
server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
try{for(const mode of ['normal','cancel','deadline','error']){
 active=0;peak=0;requests=[];timeline=[];const directory=path.join(work,mode);await fs.mkdir(directory);
 let gui;
 const incoming=new Promise(r=>{firstRequest=r;});
 const app=execute(exe,[mode,base,directory],{encoding:'utf8',timeout:20000,windowsHide:true});
 if(mode==='normal'){await Promise.race([incoming,app.then(()=>{throw Error('app ended before request');})]);gui=JSON.parse((await execute(path.join(root,'build/stage12/parallel-gui127.exe'),[],{encoding:'utf8',timeout:5000,windowsHide:true})).stdout);assert.equal(gui.messages,5);assert.ok(gui.max_response_ms<500);}
 const result=await app;assert.equal(result.stderr,'');const data=JSON.parse(result.stdout);await new Promise(r=>setTimeout(r,30));
 assert.equal(active,0,'all HTTP siblings drained');assert.ok(peak<=2);assert.equal(await fs.stat(directory).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e;}),false,'adapter staging gone before program exit');
 if(mode==='normal'){assert.deepEqual([...requests].sort(),['/0','/1','/2','/3','/4','/5']);assert.equal(peak,2);assert.ok(data.turns>100);assert.equal(data.clicks,5);assert.ok(timeline.find(x=>x.kind==='start'&&x.path==='/2').at<timeline.find(x=>x.kind==='finish'&&x.path==='/0').at,'a free slot admits item 2 before the slower item 0 finishes');}else{assert.ok(requests.length<=2,'queue stopped');assert.equal(new Set(requests).size,requests.length,'no retries');}
 observations.push({...data,server_peak:peak,requests:[...requests],timeline:[...timeline],...(gui?{gui}:{})});
 }
 console.log(JSON.stringify({schema_version:1,status:'passed',observations}));
}finally{for(const timer of timers)clearTimeout(timer);for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));await fs.rm(work,{recursive:true,force:true});}
