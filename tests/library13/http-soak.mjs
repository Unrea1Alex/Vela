import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const [executable, evidence, requestedDuration = '1800000', bench = 'G:/VelaBench'] = process.argv.slice(2);
const duration = Number(requestedDuration);
assert.ok(Number.isSafeInteger(duration) && duration >= 2000 && duration <= 3600000);
const exe = path.resolve(executable);
const output = path.resolve(evidence);
const { measure } = await import(pathToFileURL(path.resolve(bench, 'src/meter.mjs')));
const sockets = new Set();
const requests = { ok: 0, hold: 0, never: 0 };
let connections = 0;
let maxSockets = 0;
const bytes = Buffer.alloc(64, 120);
const server = http.createServer((req, res) => {
    const route = req.url.slice(1);
    assert.ok(Object.hasOwn(requests, route));
    requests[route]++;
    res.setHeader('Content-Length', bytes.length);
    if (route === 'hold') res.write(bytes.subarray(0, 1));
    else res.end(bytes);
});
server.on('connection', socket => {
    connections++;
    sockets.add(socket);
    maxSockets = Math.max(maxSockets, sockets.size);
    socket.once('close', () => sockets.delete(socket));
});
await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
});
try {
    await mkdir(path.dirname(output), { recursive: true });
    const measured = await measure({
        exe, args: [`http://127.0.0.1:${server.address().port}`, String(duration)],
        cwd: path.dirname(exe), logDir: path.join(path.dirname(output), 'soak-meter'),
        timeoutMs: duration + 20000, sampleMs: duration >= 60000 ? 1000 : 50,
    });
    const stdout = await readFile(measured.stdout_path, 'utf8');
    const stderr = await readFile(measured.stderr_path, 'utf8');
    for (let i = 0; sockets.size > 0 && i < 100; i++) await delay(10);
    const matched = /^soak rounds=(\d+) elapsed_ms=(\d+) slots=0/m.exec(stdout);
    const window = (from, to) => {
        const samples = measured.memory_samples.filter(p => !p.incomplete
            && p.elapsed_ms >= from && p.elapsed_ms < to).map(p => p.private_commit_bytes).sort((a, b) => a - b);
        return { count: samples.length, min: samples[0], median: samples[Math.floor(samples.length / 2)], max: samples.at(-1) };
    };
    const initial = window(duration / 6, duration / 3);
    const final = window(duration * 5 / 6, duration);
    const report = { duration, measured, stdout, stderr, requests, connections, maxSockets,
        remainingSockets: sockets.size, initial, final };
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    assert.equal(measured.exit_code, 0, stderr);
    assert.equal(measured.timed_out, false);
    assert.ok(matched && Number(matched[2]) >= duration, stdout);
    assert.equal(requests.ok, Number(matched[1]));
    assert.ok(requests.hold >= requests.ok * 0.95, 'observed live partial downloads before cancellation');
    assert.equal(requests.never, 0, 'queued cancellation never reached server');
    assert.equal(sockets.size, 0, 'all sockets closed before shutdown of fixture');
    assert.ok(maxSockets <= 3, 'server-side socket count remained bounded');
    assert.equal(measured.memory_samples_truncated, false);
    if (duration >= 1800000) {
        assert.ok(initial.count >= 250 && final.count >= 250, 'complete commit sampling windows');
        assert.ok(final.median - initial.median <= 2097152 && final.max - initial.max <= 2097152,
            'retained private commit stays within 2 MiB of the warmed process');
    }
    console.log(JSON.stringify({ duration, rounds: Number(matched[1]), requests, connections, maxSockets, output }));
} finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
}
