import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import dgram from 'node:dgram';
import * as fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exe = path.resolve(process.argv[2] ?? path.join(root, 'build/stage13/transport-probe/Release/vela-http-probe.exe'));
const faultsExe = path.join(path.dirname(exe), 'vela-http-fault-probe.exe');
const bench = path.resolve(process.argv[3] ?? 'G:/VelaBench');
const output = path.resolve(process.argv[4] ?? path.join(root, 'build/stage13/132-probe.json'));
const velaExe = process.env.VELA_HTTP_TEST_EXE ? path.resolve(process.env.VELA_HTTP_TEST_EXE) : null;
const work = await fs.mkdtemp(path.join(root, 'build/stage13/http-stand-'));
const { measure } = await import(pathToFileURL(path.join(bench, 'src/meter.mjs')));
const openssl = process.env.VELA_TEST_OPENSSL ?? 'C:/Program Files/Git/usr/bin/openssl.exe';
const payload = Buffer.alloc(64, 120);
const requests = [], sockets = new Set();
const socketIDs = new WeakMap();
const connections = { first: 0, other: 0, tls: 0, stall: 0 };
const active = { first: 0, other: 0 }, peak = { first: 0, other: 0, total: 0 };
let nextSocket = 0;

function runSync(program, args) {
    const p = spawnSync(program, args, { cwd: work, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(p.status, 0, `${program}: ${p.error ?? ''}\n${p.stdout}\n${p.stderr}`);
    return p.stdout.trim();
}
function run(program, args, env = process.env, withStderr = false) {
    return new Promise((resolve, reject) => {
        const child = spawn(program, args, { cwd: work, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, env });
        let out = '', err = '';
        child.stdout.setEncoding('utf8').on('data', data => { out += data; });
        child.stderr.setEncoding('utf8').on('data', data => { err += data; });
        child.once('error', reject);
        child.once('close', (code, signal) => code === 0 ? resolve(withStderr ? { out, err } : out) : reject(new Error(`probe: ${code ?? signal}\n${out}\n${err}`)));
    });
}
function certificates() {
    for (const name of ['good', 'bad']) {
        runSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-sha256', '-subj', `/CN=Vela Test ${name} CA`,
            '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', `${name}.key`, '-out', `${name}.pem`]);
    }
    runSync(openssl, ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=127.0.0.1', '-keyout', 'server.key', '-out', 'server.csr']);
    runSync(openssl, ['x509', '-req', '-in', 'server.csr', '-CA', 'good.pem', '-CAkey', 'good.key', '-CAcreateserial', '-days', '2', '-sha256', '-extfile', 'server.ext', '-out', 'server.pem']);
}
await fs.writeFile(path.join(work, 'server.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1\n');
certificates();

function id(socket) {
    if (!socketIDs.has(socket)) socketIDs.set(socket, ++nextSocket);
    return socketIDs.get(socket);
}
function handler(origin) {
    return (req, res) => {
        const row = { origin, route: req.url, socket: id(req.socket), authorization: req.headers.authorization ?? null };
        requests.push(row);
        if (req.url === '/close-active' || req.url === '/close' || req.url === '/timeout-header') return;
        if (req.url === '/phase-download') {
            res.setHeader('Content-Length', payload.length);
            res.write(payload.subarray(0, 1));
            return;
        }
        if (req.url === '/server-close') res.setHeader('Connection', 'close');
        if (req.url === '/delete' || req.url === '/no-replay') {
            const parts = [];
            req.on('data', data => parts.push(data));
            req.on('end', () => {
                const bytes = Buffer.concat(parts);
                row.method = req.method;
                row.body = bytes.toString('hex');
                if (req.url === '/no-replay') { req.socket.destroy(); return; }
                res.setHeader('Content-Length', bytes.length);
                res.end(bytes);
            });
            return;
        }
        if (req.url === '/redirect') {
            res.statusCode = 302;
            res.setHeader('Location', '/redirect-must-not-start');
        }
        const finish = () => { if (!res.destroyed) res.end(payload); };
        res.setHeader('Content-Length', payload.length);
        if (req.url === '/bound') {
            active[origin]++;
            peak[origin] = Math.max(peak[origin], active[origin]);
            peak.total = Math.max(peak.total, active.first + active.other);
            setTimeout(() => { active[origin]--; finish(); }, 120);
        } else if (req.url === '/cancel' || req.url === '/hold') {
            setTimeout(finish, 900).unref();
        } else if (req.url === '/peer') {
            setTimeout(finish, 260).unref();
        } else if (req.url === '/deadline-beats-response') {
            setTimeout(finish, 60).unref();
        } else {
            finish();
        }
    };
}
function track(server, origin) {
    server.on('connection', socket => {
        connections[origin]++;
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
    });
    return server;
}
const first = track(http.createServer(handler('first')), 'first');
const other = track(http.createServer(handler('other')), 'other');
const tls = track(https.createServer({ cert: await fs.readFile(path.join(work, 'server.pem')), key: await fs.readFile(path.join(work, 'server.key')), minVersion: 'TLSv1.2' }, handler('tls')), 'tls');
const stall = track(net.createServer(socket => socket.resume()), 'stall');
let uploadReceived = 0;
let uploadHeader = '';
const upload = net.createServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    let headers = Buffer.alloc(0);
    socket.on('data', chunk => {
        if (uploadHeader) { uploadReceived += chunk.length; return; }
        headers = Buffer.concat([headers, chunk]);
        const end = headers.indexOf('\r\n\r\n');
        if (end < 0) return;
        uploadHeader = headers.subarray(0, end).toString('ascii');
        uploadReceived = headers.length - end - 4;
        socket.pause();
        setTimeout(() => socket.resume(), 260).unref();
    });
});
const dns = dgram.createSocket('udp4');
const queries = [];
dns.on('message', query => {
    // Read the first uncompressed question name. Withhold all answers.
    const labels = [];
    for (let pos = 12; pos < query.length && query[pos];) {
        const size = query[pos++];
        labels.push(query.subarray(pos, pos += size).toString('ascii'));
    }
    queries.push(labels.join('.'));
});
let handshakes = 0;
tls.on('secureConnection', () => handshakes++);
const reserve = net.createServer();
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });
const close = server => new Promise(resolve => server.close(resolve));
const tcp = port => `http://127.0.0.1:${port}`;
const probe = { schema_version: 1, stage: velaExe ? '1.3.3' : '1.3.2',
    version: runSync(exe, ['--version']), checks: [], prototype_only: !velaExe };
function check(condition, title) { assert.ok(condition, title); probe.checks.push(title); }
check(/libcurl\/8\.23\.0.*OpenSSL\/3\.5\.9.*c-ares\/1\.34\.8/.test(probe.version), 'pinned libcurl, OpenSSL and c-ares');
try {
    const [a, b, c, refused, blocked] = await Promise.all([listen(first), listen(other), listen(tls), listen(reserve), listen(stall)]);
    await close(reserve);
    const result = await run(exe, [tcp(a), tcp(b), tcp(refused), `https://127.0.0.1:${c}`, path.join(work, 'good.pem'), path.join(work, 'bad.pem'), `https://127.0.0.1:${blocked}`]);
    check(result.includes('http multi prototype passed'), 'native response/cancel/deadline/cleanup assertions');
    probe.queue_deadline_ms = Number(/queued_deadline_ms=(\d+)/.exec(result)[1]);
    const rows = route => requests.filter(r => r.route === route);
    check(rows('/reuse').length === 10 && new Set(rows('/reuse').map(r => r.socket)).size === 1, 'ten GETs on one TCP connection');
    check(rows('/after-idle').length === 1 && rows('/after-idle')[0].socket !== rows('/reuse')[0].socket, 'idle cache expired');
    check(rows('/auth').map(r => r.authorization).join(',') === 'Basic alpha,Basic beta' && new Set(rows('/auth').map(r => r.socket)).size === 2, 'credential header connection isolation');
    check(rows('/redirect').length === 1 && rows('/redirect-must-not-start').length === 0, 'redirect remains a response');
    check(rows('/bound').length === 5 && peak.first === 1 && peak.other === 1 && peak.total === 2, 'server observed global and per-origin active limits');
    check(rows('/cancel').length === 1 && rows('/peer').length === 1 && rows('/after-cancel').length === 1, 'single cancel preserved peer and subsequent request');
    check(rows('/queue-must-not-start').length === 0 && rows('/race-must-not-start').length === 0
        && rows('/reserve-must-not-start').length === 0, 'expired, cancelled or over-budget work never sent');
    check(rows('/deadline-beats-response').length === 1, 'deadline priority on an already-sent request');
    check(rows('/close-active').length === 1, 'owner closed while server was holding an active response');
    check(rows('/tls').length === 2 && new Set(rows('/tls').map(r => r.socket)).size === 1 && rows('/untrusted').length === 0, 'TLS reuse and CA change isolation');
    check(connections.tls === 2 && handshakes >= 1 && handshakes <= 2, 'server observed distinct TCP attempts for trust policies');
    check(connections.stall === 1, 'connect budget expired inside TLS handshake');
    check(rows('/timeout-header').length === 8, 'slow headers exhaust the total budget after connection');
    const injected = await run(faultsExe, ['--faults', tcp(a)]);
    check(injected.includes('injected storage and driver cleanup passed') && rows('/injected-storage').length === 1
        && rows('/after-storage').length === 1 && rows('/driver-must-not-start').length === 0, 'injected storage and driver faults release request ownership');
    for (let retry = 0; retry < 50 && sockets.size; retry++) await delay(10);
    check(sockets.size === 0, 'all sockets closed after owner close');
    probe.server = { connections: { ...connections }, handshakes, peak, requests: [...requests] };
    probe.samples = [];
    for (let round = 0; round <= 5; round++) {
        const oldCount = connections.first;
        const before = requests.length;
        const p = await measure({ exe, args: ['--serial', tcp(a)], cwd: work, logDir: path.join(work, 'logs'), timeoutMs: 30000 });
        assert.equal(p.exit_code, 0);
        assert.equal(p.timed_out, false);
        assert.equal((await fs.readFile(p.stdout_path, 'utf8')).trim(), 'ten responses passed');
        assert.equal(connections.first - oldCount, 1);
        assert.equal(requests.length - before, 10);
        if (round) probe.samples.push({ wall_ms: p.wall_ms, cpu_ms: p.cpu_ms, peak_job_commit_bytes: p.peak_job_commit_bytes, connections: 1 });
    }
    if (velaExe) {
        const [uploadPort] = await Promise.all([
            listen(upload),
            new Promise((resolve, reject) => { dns.once('error', reject); dns.bind(0, '127.0.0.1', resolve); }),
        ]);
        const phases = await run(faultsExe, ['--phases', `127.0.0.1:${dns.address().port}`,
            `https://127.0.0.1:${blocked}`, tcp(uploadPort) + '/phase-upload', tcp(a)]);
        assert.equal(phases.trim(), 'DNS, TLS, upload and download cancellation passed');
        assert.ok(queries.includes('cancel.fixture.invalid') && queries.includes('deadline.fixture.invalid'));
        assert.equal(connections.stall, 2, 'TLS handshake cancellation reached TCP server');
        assert.match(uploadHeader, /^POST \/phase-upload HTTP\/1\.1\r?\n/);
        assert.match(uploadHeader, /Content-Length: 1048576/i);
        for (let retry = 0; retry < 50 && sockets.size; retry++) await delay(10);
        assert.ok(uploadReceived > 0 && uploadReceived < 1048576, 'cancelled during upload');
        assert.equal(rows('/phase-download').length, 1);
        assert.equal(rows('/phase-peer').length, 1);
        assert.equal(sockets.size, 0);
        probe.phases = { queries, tlsTcpAttempts: connections.stall, uploadReceived, uploadExpected: 1048576,
            partialDownloads: rows('/phase-download').length, remainingSockets: sockets.size };
        probe.vela = [];
        for (const stress of [false, true]) {
            const before = requests.length;
            const { out, err } = await run(velaExe, [tcp(a), tcp(b), `https://127.0.0.1:${c}`, path.join(work, 'good.pem'), path.join(work, 'bad.pem')],
                { ...process.env, VELA_GC_STRESS: stress ? '1' : '0', VELA_GC_REPORT: stress ? '1' : '0' }, true);
            assert.equal(out.trim(), 'Vela HTTP multi passed');
            const observed = requests.slice(before);
            const selected = route => observed.filter(r => r.route === route);
            assert.equal(selected('/reuse').length, 10);
            assert.equal(new Set(selected('/reuse').map(r => r.socket)).size, 1);
            assert.equal(selected('/server-close').length, 1);
            assert.equal(selected('/after-server-close').length, 1);
            assert.notEqual(selected('/server-close')[0].socket, selected('/after-server-close')[0].socket);
            assert.equal(selected('/queued').length + selected('/over-budget').length + selected('/untrusted').length, 0);
            assert.equal(selected('/hold').length, 1);
            assert.equal(selected('/peer').length, 1);
            assert.equal(selected('/close').length, 1);
            assert.deepEqual(selected('/delete').map(r => [r.method, r.body]), [['DELETE', '4100ff42']]);
            assert.deepEqual(selected('/no-replay').map(r => [r.method, r.body]), [['POST', '636f6d6d6974']]);
            assert.notEqual(selected('/no-replay')[0].socket, selected('/delete')[0].socket);
            assert.equal(selected('/tls').length, 2);
            assert.equal(new Set(selected('/tls').map(r => r.socket)).size, 1);
            for (let retry = 0; retry < 50 && sockets.size; retry++) await delay(10);
            assert.equal(sockets.size, 0);
            if (stress) assert.match(err, /gc: collections=[1-9][0-9]*/i);
            else assert.equal(err, '');
            probe.vela.push({ stress, gc: err.trim(), observed });
        }
    }
    probe.executable = { bytes: (await fs.stat(exe)).size, sha256: createHash('sha256').update(await fs.readFile(exe)).digest('hex') };
    probe.passed = true;
    await fs.writeFile(output, JSON.stringify(probe, null, 2) + '\n');
    console.log(JSON.stringify({ checks: probe.checks.length, version: probe.version, deadline_ms: probe.queue_deadline_ms, wall_ms: probe.samples.map(p => p.wall_ms), output }));
} finally {
    for (const socket of sockets) socket.destroy();
    if (velaExe && upload.listening) await new Promise(resolve => dns.close(resolve));
    await Promise.all([first, other, tls, reserve, stall, upload].map(close));
}
