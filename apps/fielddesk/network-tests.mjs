// Optional loopback fixture only. Neither the application nor its build needs Node.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const app=path.dirname(fileURLToPath(import.meta.url));
const out=path.resolve(app,'../../build/fielddesk-validation/network');
await fs.mkdir(out,{recursive:true});
const demo=await fs.readFile(path.join(app,'demo.ndjson'));
let requests=0;
const server=http.createServer((req,res)=>{
  requests++;
  if(req.url==='/missing'){res.writeHead(404);res.end('missing');return;}
  if(req.url==='/large'){res.end(' '.repeat(4097));return;}
  if(req.url==='/slow')return;
  if(req.url==='/invalid'){res.end(Buffer.from([255,10]));return;}
  res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');res.end(demo);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const checks=[];
async function run(name,endpoint,expected,pattern,extra=[],targetPort=port){
  const file=path.join(out,`${name}.html`);
  await fs.writeFile(file,'sentinel');
  const args=['--demo',file,'--local-port',String(targetPort),'--http-path',endpoint,...extra];
  const child=spawn(path.join(app,'bin/fielddesk.exe'),args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',bytes=>stdout+=bytes);child.stderr.on('data',bytes=>stderr+=bytes);
  const timer=setTimeout(()=>child.kill(),10000);
  const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});clearTimeout(timer);
  assert.equal(code,expected,`${name}: ${stdout} ${stderr}`);
  assert.match(stdout+stderr,pattern,name);
  if(expected!==0)assert.equal(await fs.readFile(file,'utf8'),'sentinel',`${name}: prior output preserved`);
  checks.push({name,status:'passed',exit_code:code});
}
try{
  const before=requests;
  await run('200-replay','/measurements',0,/Replay verified/ ,['--replay-check']);
  assert.equal(requests-before,1,'replay must not fetch twice');
  await run('404','/missing',2,/HTTP status 404/);
  await run('body-limit','/large',2,/exceeds the byte limit/);
  await run('timeout','/slow',2,/deadline expired/);
  await run('invalid-utf8','/invalid',2,/Invalid UTF-8/);
  await run('invalid-path','relative',2,/Invalid HTTP endpoint/);
  await run('invalid-port','/measurements',2,/Invalid HTTP endpoint/,[],0);
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
await run('refused','/measurements',2,/HTTP connection failed/);
await fs.writeFile(path.join(app,'network-validation.json'),JSON.stringify({schema_version:1,transport:'Vela http with supervised curl',checks,public_network:false,tls:false,replay_http_fetches:1},null,2)+'\n');
console.log(`${checks.length} loopback HTTP scenarios passed`);
