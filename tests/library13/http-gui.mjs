import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [controller, fielddesk, pulse, evidence] = process.argv.slice(2).map(value => path.resolve(value));
const work = await mkdtemp(path.join(path.dirname(evidence), 'http-gui-'));
const sockets = new Set();
const socketsById = new WeakMap();
const seen = { field: [], pulse: [] };
let socketId = 0;
const data = Buffer.from('{"station":"station from server","value":24,"accepted":true}\n');
const server = http.createServer((req, res) => {
    const key = req.url.slice(1);
    assert.ok(Object.hasOwn(seen, key));
    seen[key].push(socketsById.get(req.socket));
    res.setHeader('Content-Length', data.length);
    if (key === 'field' && seen.field.length <= 2) {
        setTimeout(() => res.end(data), 600).unref();
    } else {
        res.write(data.subarray(0, 1));
    }
});
server.on('connection', socket => {
    socketsById.set(socket, ++socketId);
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
});
function start(exe, args, windowsHide = true) {
    const child = spawn(exe, args, { cwd: work, windowsHide, timeout: 25000 });
    let out = '', err = '';
    child.stdout.setEncoding('utf8').on('data', bytes => { out += bytes; });
    child.stderr.setEncoding('utf8').on('data', bytes => { err += bytes; });
    const completion = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal, out, err }));
    });
    return { child, completion };
}
async function simulate(mode, exe, args) {
    const app = start(exe, args, false);
    try {
        const clicks = await start(controller, [mode, String(app.child.pid)]).completion;
        const failedApp = app.child.exitCode === null ? '' : JSON.stringify(await app.completion);
        assert.equal(clicks.code, 0, clicks.err + failedApp);
        const finished = await app.completion;
        assert.equal(finished.code, 0, finished.err);
        assert.equal(finished.err, '');
        for (let turn = 0; turn < 50 && sockets.size; turn++) await delay(10);
        assert.equal(sockets.size, 0, 'application closed every socket');
        return { controls: clicks.out.trim(), output: finished.out.trim() };
    } finally {
        if (app.child.exitCode === null && app.child.signalCode === null) app.child.kill();
    }
}
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
try {
    const fieldConfig = path.join(work, 'field.json');
    const reportFile = path.join(work, 'field-report.html');
    await writeFile(fieldConfig, JSON.stringify({ scheme: 'http', host: '127.0.0.1', port,
        target: '/field', timeout_ms: 12000, ca_file: '' }));
    await writeFile(reportFile, 'preserve report');
    const field = await simulate('fielddesk', fielddesk, ['--gui', reportFile, '--endpoint', fieldConfig]);
    assert.equal(await readFile(reportFile, 'utf8'), 'preserve report');
    assert.equal(seen.field.length, 4);
    assert.equal(seen.field[0], seen.field[1], 'GUI reused a completed connection');
    assert.notEqual(seen.field[2], seen.field[3], 'GUI discarded cancelled connection');
    const pulseConfig = path.join(work, 'pulse.json');
    await writeFile(pulseConfig, JSON.stringify({ demo: false, ca_file: '', concurrency: 1,
        endpoints: [{ name: 'slow local service', scheme: 'http', host: '127.0.0.1', port, target: '/pulse',
            expect: 200, delay_ms: 0, timeout_ms: 12000, body_limit: 1024 }] }));
    const deck = await simulate('pulse', pulse, ['--config', pulseConfig, '--output', work]);
    assert.equal(seen.pulse.length, 2);
    const reports = [...deck.output.matchAll(/^REPORT=(.+)$/gm)];
    assert.equal(reports.length, 2);
    const result = JSON.parse(await readFile(reports.at(-1)[1].trim(), 'utf8'));
    assert.equal(result.results[0].state, 'cancelled');
    await writeFile(evidence, JSON.stringify({ field, deck, seen, openSocketsAfter: sockets.size }, null, 2) + '\n');
    console.log(field.controls);
    console.log(deck.controls);
} finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
}
