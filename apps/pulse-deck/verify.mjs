// Node is only the independent local HTTP/TLS test harness, not an app dependency.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute = promisify(execFile);
const app = path.resolve(import.meta.dirname);
const compiler = path.resolve(process.argv[2] || path.join(app,'../../bin/velac.exe'));
const exe = path.join(app, 'bin/pulse-deck.exe');
const base = await fs.mkdtemp(path.join(await fs.mkdir(path.join(app, 'work'), {recursive:true}).then(()=>path.join(app,'work')), 'gate-'));
const openssl = process.env.PULSE_OPENSSL || 'C:/Program Files/Git/usr/bin/openssl.exe';
const curl = path.join(process.env.SystemRoot, 'System32/curl.exe');
const checks = [];
const binary = Buffer.from([0,255,65,208,175]);
const hash = value => createHash('sha256').update(value).digest('hex');
let active = 0, peak = 0, received = [];
const sockets = new Set();
function serve(req,res) {
  received.push(req.url);
  if (req.url === '/delay' || req.url === '/hang') {
    active++; peak = Math.max(peak,active);
    res.once('close',()=>--active);
  }
  switch(req.url) {
    case '/ok': res.end('ready'); break;
    case '/unicode': res.end('Москва · ready'); break;
    case '/binary': res.end(binary); break;
    case '/empty': res.writeHead(204).end(); break;
    case '/missing': res.writeHead(404).end('missing'); break;
    case '/redirect': res.writeHead(302,{location:'/ok'}).end(); break;
    case '/large': res.writeHead(200,{'content-length':1025}).end(Buffer.alloc(1025,65)); break;
    case '/chunked': res.write(Buffer.alloc(100)); res.end(Buffer.alloc(100)); break;
    case '/short': res.writeHead(200,{'content-length':100,connection:'close'}).end('short'); break;
    case '/delay': { const timer = setTimeout(()=>res.end('delayed'),700); res.once('close',()=>clearTimeout(timer)); break; }
    case '/hang': res.writeHead(200,{'content-length':64});res.write('partial'); break;
    default: res.writeHead(500).end('unexpected');
  }
}
async function listen(server) {
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return server.address().port;
}
async function stop(server) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
function endpoint(target='/ok', extra={}) {
  return {name:target,scheme:'http',host:'127.0.0.1',port,target,expect:200,delay_ms:0,timeout_ms:3000,body_limit:1024,...extra};
}
function config(entries,extra={}) {return {demo:false,curl,ca_file:'',concurrency:3,endpoints:entries,...extra};}
async function run(name, settings, expectedCode, more=[]) {
  const input = path.join(base, `${checks.length}-${name.replace(/[^a-z0-9]+/gi,'-')}.json`);
  await fs.writeFile(input, JSON.stringify(settings));
  let outcome;
  const start=performance.now();
  try {outcome=await execute(exe,['--headless','--config',input,'--output',base,...more],{windowsHide:true,timeout:20000});outcome.code=0;}
  catch(error){outcome=error;}
  assert.equal(outcome.code,expectedCode,`${name}: ${outcome.stdout} ${outcome.stderr}`);
  if (expectedCode===2) {
    assert.ok(outcome.stderr.trim(),name+' diagnostic');
    checks.push({name,code:expectedCode});
    return outcome;
  }
  assert.equal(outcome.stderr,'',name+' stderr');
  const reportPath=outcome.stdout.match(/REPORT=(.+)/)?.[1]?.trim();
  assert.ok(reportPath,name+' report path');
  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  assert.deepEqual(await fs.readdir(path.dirname(reportPath)),['report.json'],name+' transport staging removed');
  checks.push({name,code:expectedCode,elapsed_ms:Math.round(performance.now()-start),peak:report.peak_in_flight});
  return report;
}
let secure;
const plain=http.createServer(serve);
const port=await listen(plain);
const cert=path.join(base,'fixture.pem'),key=path.join(base,'fixture.key');
try {
  await execute(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-addext','basicConstraints=critical,CA:TRUE'],{windowsHide:true,timeout:20000});
  secure=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},serve);
  const tlsPort=await listen(secure);
  if(process.argv.includes('--interactive')) {
    const folder=path.join(base,'интерактивная поставка');
    await fs.mkdir(path.join(folder,'assets'),{recursive:true});
    for(const file of ['pulse-deck.exe','vela-gui.dll','vela-http-server.dll']) await fs.copyFile(path.join(app,'bin',file),path.join(folder,file));
    const settings=config([
      endpoint('/unicode',{name:'Москва · Unicode'}),
      endpoint('/hang',{name:'Slow HTTPS A',scheme:'https',host:'localhost',port:tlsPort,timeout_ms:120000}),
      endpoint('/hang',{name:'Slow HTTPS B',scheme:'https',host:'localhost',port:tlsPort,timeout_ms:120000}),
      endpoint('/ok',{name:'Delayed service',delay_ms:10000}),
    ],{ca_file:cert});
    await fs.writeFile(path.join(folder,'assets/demo.json'),JSON.stringify(settings));
    console.log(JSON.stringify({exe:path.join(folder,'pulse-deck.exe'),base,port,tlsPort}));
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  } else {
    const r=await run('parallel independent results',config([endpoint('/delay',{name:'A'}),endpoint('/delay',{name:'B'}),endpoint('/delay',{name:'C'})]),0);
    assert.equal(peak,3,'three actual overlapping server requests');assert.equal(r.peak_in_flight,3);assert.equal(r.timer_cleanups,3);
    const b=await run('binary Unicode empty and expected status',config([endpoint('/binary'),endpoint('/unicode'),endpoint('/empty',{expect:204}),endpoint('/missing',{expect:404})]),0);
    assert.deepEqual(b.results.map(x=>x.sha256),[hash(binary),hash('Москва · ready'),hash(''),hash('missing')]);
    assert.deepEqual(b.results.map(x=>x.bytes),[5,Buffer.byteLength('Москва · ready'),0,7]);
    const h=await run('HTTP failure and redirect',config([endpoint('/missing'),endpoint('/redirect')]),1);
    assert.deepEqual(h.results.map(x=>x.status),[404,302]);assert.ok(h.results.every(x=>x.state==='http-error'));
    const limits=await run('declared and chunked body limits',config([endpoint('/large'),endpoint('/chunked',{body_limit:128})]),1);
    assert.ok(limits.results.every(x=>x.message==='response byte limit exceeded'));
    const short=await run('truncated body',config([endpoint('/short')]),1);assert.match(short.results[0].message,/transfer failed/);
    const deadline=await run('deadline with independent success',config([endpoint('/hang',{timeout_ms:400}),endpoint('/ok')]),1);
    assert.equal(deadline.results[0].message,'deadline exceeded');assert.equal(deadline.results[1].state,'healthy');
    const before=received.length;
    const cancel=await run('cancel active and queued',config([endpoint('/hang'),endpoint('/ok',{name:'queued',delay_ms:5000})],{concurrency:1}),3,['--cancel-after','300']);
    assert.ok(cancel.results.every(x=>x.state==='cancelled'));assert.equal(cancel.timer_cleanups,2);
    assert.deepEqual(received.slice(before),['/hang'],'queued request never launched');
    const mixed=await run('cancel keeps completed results',config([endpoint('/ok'),endpoint('/hang')]),3,['--cancel-after','400']);
    assert.equal(mixed.results[0].state,'healthy');assert.equal(mixed.results[1].state,'cancelled');
    const tls=endpoint('/unicode',{scheme:'https',host:'localhost',port:tlsPort});
    const trusted=await run('trusted HTTPS',config([tls],{ca_file:cert}),0);assert.equal(trusted.results[0].sha256,hash('Москва · ready'));
    const untrusted=await run('untrusted HTTPS',config([tls]),1);assert.match(untrusted.results[0].message,/TLS/);
    const mismatch=await run('TLS hostname mismatch',config([{...tls,host:'127.0.0.1'}],{ca_file:cert}),1);assert.match(mismatch.results[0].message,/TLS/);
    const unavailable=await run('missing curl executable',config([endpoint()],{curl:path.join(base,'missing.exe')}),1);assert.match(unavailable.results[0].message,/storage/);
    await run('invalid concurrency',config([endpoint()],{concurrency:5}),2);
    await run('duplicate names',config([endpoint(),endpoint()]),2);
    await run('invalid target',config([endpoint('/bad path')]),2);
    await run('invalid warmup',config([endpoint('/ok',{delay_ms:10001})]),2);
    await run('oversized endpoint list',config(Array.from({length:17},(_,i)=>endpoint('/ok',{name:String(i)}))),2);
    await run('invalid port zero',config([endpoint('/ok',{port:0})]),2);
    await run('invalid byte limit',config([endpoint('/ok',{body_limit:0})]),2);
    await run('invalid timeout',config([endpoint('/ok',{timeout_ms:0})]),2);
    await run('relative curl path',config([endpoint()],{curl:'curl.exe'}),2);
    const report={schema:1,application:'PulseDeck 1.0',vela:(await execute(compiler,['--version'])).stdout.trim(),platform:process.platform,checks,passed:checks.length,failed:0,real_server_peak:peak};
    await fs.writeFile(path.join(app,'network-validation.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  }
} finally {
  for(const socket of sockets) socket.destroy();
  await Promise.all([stop(plain),stop(secure)]);
  await fs.unlink(key).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
