// Optional acceptance infrastructure; the delivered Vela application needs no Node.
import http from 'node:http';
import {spawn} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const exe=path.resolve('build/stage07/prototypes/network.exe');
const sockets=new Set();
const server=http.createServer((req,res)=>{
  if(req.url==='/stall') return;
  if(req.url==='/json') res.end('{"message":"Привет 😀","value":1.25}');
  else if(req.url==='/nul') res.end(Buffer.from([65,0,66]));
  else if(req.url==='/cap') res.end(Buffer.alloc(4096,65));
  else if(req.url==='/large') res.end(Buffer.alloc(4097,65));
  else if(req.url==='/redirect') { res.writeHead(302,{location:'/json'}); res.end(); }
  else {res.writeHead(404);res.end('missing');}
});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
async function run(p,url){
  const child=spawn(exe,[String(p),url],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const out=[],err=[];const timer=setTimeout(()=>child.kill(),5000);
  child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  clearTimeout(timer);assert.equal(code,0,Buffer.concat(err).toString());
  return Buffer.concat(out).toString('utf8').replaceAll('\r\n','\n');
}
try{
  const json='{"message":"Привет 😀","value":1.25}';
  assert.equal(await run(port,'/json'),`error=0 status=200 bytes=${Buffer.byteLength(json)}\n${json}`);
  assert.equal(await run(port,'/404'),'error=0 status=404 bytes=7\nmissing');
  assert.equal(await run(port,'/nul'),'error=0 status=200 bytes=3\nA\0B');
  assert.equal(await run(port,'/cap'),'error=0 status=200 bytes=4096\n');
  assert.match(await run(port,'/large'),/^error=4 status=200 bytes=\d+\n/);
  assert.match(await run(port,'/stall'),/^error=3 status=0 bytes=0\n/);
  assert.equal(await run(port,'/redirect'),'error=0 status=302 bytes=0\n');
  assert.equal(await run(0,'/json'),'error=1 status=0 bytes=0\n');
  assert.equal(await run(port,'bad path'),'error=1 status=0 bytes=0\n');
  for(const s of sockets)s.destroy();
  await new Promise(resolve=>server.close(resolve));
  assert.equal(await run(port,'/json'),'error=2 status=0 bytes=0\n');
  console.log('Network prototype: 10/10 passed (local HTTP only)');
} finally {for(const s of sockets)s.destroy();server.close();}
