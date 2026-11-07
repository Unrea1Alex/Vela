import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import {promisify} from 'node:util';

const run = promisify(execFile);
const [client, curl, openssl] = process.argv.slice(2).map(value => path.resolve(value));
assert.ok(client && curl && openssl, 'pass client, curl and openssl paths');
const base = await fs.mkdtemp(path.join(path.dirname(client), 'http-fixture-'));
const key = path.join(base, 'fixture.key');
const cert = path.join(base, 'fixture.pem');
const binary = Buffer.from([65, 0, 255, 208, 175]);
const exact = Buffer.alloc(128, 90);
let stalled = 0;
const methodSockets=new Set();
function handler(req, res) {
  if(req.url==='/echo') {
    assert.ok(['POST','PUT','DELETE'].includes(req.method));
    assert.equal(req.headers['x-fixture'],'unchanged');
    assert.equal(req.headers['x-empty'],'');
    assert.equal(req.headers['content-type'],'application/x-vela');
    methodSockets.add(req.socket.remotePort);
    const parts=[];req.on('data',chunk=>parts.push(chunk));req.on('end',()=>{
      const body=Buffer.concat(parts);assert.deepEqual(body,binary);res.end(body);
    });return;
  }
  if(req.url==='/head') { assert.equal(req.method,'HEAD');res.writeHead(200,{'content-length':2097152}).end();return; }
  switch (req.url) {
    case '/binary': res.end(binary); break;
    case '/empty': res.writeHead(204).end(); break;
    case '/missing': res.writeHead(404).end('missing'); break;
    case '/redirect': res.writeHead(302, {location:'/binary'}).end('redirect'); break;
    case '/exact': res.writeHead(200, {'content-length':exact.length}).end(exact); break;
    case '/limited': res.writeHead(200, {'content-length':129}).end(Buffer.alloc(129)); break;
    case '/chunked': res.writeHead(200); res.write(Buffer.alloc(100)); res.end(Buffer.alloc(100)); break;
    case '/short': res.writeHead(200, {'content-length':32, connection:'close'}).end('short'); break;
    case '/stall':
      ++stalled;
      res.writeHead(200, {'content-length':32});
      res.write('partial');
      break;
    default: res.writeHead(500).end('unexpected');
  }
}
async function start(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}
function shutdown(server) {
  if (!server?.listening) return Promise.resolve();
  server.closeAllConnections();
  return new Promise(resolve => server.close(resolve));
}
const plain = http.createServer(handler);
let secure;
const checks = [];
const digest = data => createHash('sha256').update(data).digest('hex');
try {
  const version = (await run(curl, ['--version'], {windowsHide:true})).stdout.split(/\r?\n/)[0];
  await run(openssl, ['req','-x509','-newkey','rsa:2048','-nodes','-days','2',
    '-keyout',key,'-out',cert,'-subj','/CN=localhost',
    '-addext','subjectAltName=DNS:localhost','-addext','basicConstraints=critical,CA:TRUE'],
    {windowsHide:true, timeout:20000});
  const port = await start(plain);
  secure = https.createServer({key:await fs.readFile(key), cert:await fs.readFile(cert)}, handler);
  const tlsPort = await start(secure);
  async function check(name, route, expected, options = {}) {
    const {stdout, stderr} = await run(client, [curl, base, options.tls?'https':'http',
      options.ca?cert:'', options.host??'127.0.0.1', String(options.tls?tlsPort:port),
      route, String(options.timeout??5000), String(options.cancel??0),...(options.method?[options.method]:[])],
      {windowsHide:true, timeout:20000});
    assert.equal(stderr, '', name);
    assert.equal(stdout.trim(), expected, name);
    assert.deepEqual((await fs.readdir(base)).sort(), ['fixture.key','fixture.pem'], 'owned outputs released');
    checks.push(name);
  }
  await check('binary body', '/binary', 'status=200 '+digest(binary));
  await check('empty body', '/empty', 'status=204 '+digest(''));
  await check('HTTP 404', '/missing', 'status=404 '+digest('missing'));
  await check('redirect not followed', '/redirect', 'status=302 '+digest('redirect'));
  await check('body at limit', '/exact', 'status=200 '+digest(exact));
  await check('declared body over limit', '/limited', 'error=limit');
  await check('unknown-length body over limit', '/chunked', 'error=limit');
  await check('truncated transfer', '/short', 'error=transfer');
  await check('stalled response deadline', '/stall', 'error=timeout', {timeout:450});
  const before = stalled;
  await check('cancel during transfer', '/stall', 'error=cancelled', {cancel:300});
  assert.equal(stalled, before+1, 'the cancelled request reached the server');
  await check('TLS with fixture trust', '/binary', 'status=200 '+digest(binary), {tls:true, ca:true, host:'localhost'});
  await check('untrusted TLS certificate', '/binary', 'error=tls', {tls:true, host:'localhost'});
  await check('TLS hostname mismatch', '/binary', 'error=tls', {tls:true, ca:true});
  for(const method of ['post','put','delete']) await check(method+' binary body and immutable headers','/echo','status=200 '+digest(binary),{method});
  assert.equal(methodSockets.size,3,'three exchanges use separate connections');
  await check('HEAD omits body despite large representation length','/head','status=200 '+digest(''),{method:'head'});
  await check('POST cancel releases upload staging','/stall','error=cancelled',{method:'post',cancel:300});
  await check('failed scheduling removes upload staging','/echo','error=schedule',{method:'closed'});
  console.log(JSON.stringify({schema_version:1, version, passed:checks.length, checks}));
} finally {
  await Promise.all([shutdown(plain), shutdown(secure)]);
  await fs.unlink(key).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await fs.unlink(cert).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
