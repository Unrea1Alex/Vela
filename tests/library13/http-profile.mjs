import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [legacyExe, nativeExe, reportPath, bench = 'G:/VelaBench'] = process.argv.slice(2).map(value => path.resolve(value));
const dependency = path.join(path.dirname(nativeExe), 'vela-http.dll');
const work = await fs.mkdtemp(path.join(path.dirname(reportPath), 'http-profile-'));
const meterSource = await fs.readFile(path.join(bench, 'src/ProcessMeter.cs'), 'utf8');
// Preserve the independent meter and expose a second field from its existing Job query.
const anchor = '                + ",\\"active_processes_after\\":" + accounting.ActiveProcesses.ToString(CultureInfo.InvariantCulture)';
assert.equal(meterSource.split(anchor).length, 2, 'meter schema changed');
const limits = '            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;';
assert.equal(meterSource.split(limits).length, 2, 'meter limits changed');
const checkedSource = meterSource.replace(anchor, anchor +
    '\n                + ",\\"total_processes\\":" + accounting.TotalProcesses.ToString(CultureInfo.InvariantCulture)')
    .replace(limits, limits + `
            if (Environment.GetEnvironmentVariable("VELA_BENCH_SINGLE_PROCESS") == "1")
            {
                limits.BasicLimitInformation.LimitFlags |= 0x00000008; // JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                limits.BasicLimitInformation.ActiveProcessLimit = 1;
            }`);
const csc = path.join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
await fs.writeFile(path.join(work, 'ProcessMeter.cs'), checkedSource);
const built = spawnSync(csc, ['/nologo', '/optimize+', '/platform:x64', '/target:exe', '/out:meter.exe', 'ProcessMeter.cs'],
    { cwd: work, encoding: 'utf8', windowsHide: true });
assert.equal(built.status, 0, built.stdout + built.stderr);
await fs.copyFile(path.join(bench, 'src/meter.mjs'), path.join(work, 'meter.mjs'));
const { measure } = await import(pathToFileURL(path.join(work, 'meter.mjs')));
const sockets = new Set();
const requests = [];
let connections = 0;
const bytes = Buffer.alloc(64, 120);
const server = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('Content-Length', bytes.length);
    res.end(bytes);
});
server.on('connection', socket => {
    connections++;
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
});
const report = {
    schema_version: 1, stage: '1.3.3', platform: process.platform, warmup: 1,
    native_job_active_process_limit: 1,
    meter_source_sha256: createHash('sha256').update(meterSource).digest('hex'),
    file_bytes: { legacy: (await fs.stat(legacyExe)).size, native: (await fs.stat(nativeExe)).size, dll: (await fs.stat(dependency)).size },
    workloads: [],
};
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
    const previousPath = process.env.PATH;
    const previousLimit = process.env.VELA_BENCH_SINGLE_PROCESS;
    process.env.PATH = '';
    try {
        const guardInput = path.join(work, 'guard-input.json');
        await fs.writeFile(guardInput, JSON.stringify({
            urls: [`http://127.0.0.1:${server.address().port}/guard`], concurrency: 1, timeout_ms: 1000,
        }));
        process.env.VELA_BENCH_SINGLE_PROCESS = '1';
        const blocked = await measure({ exe: legacyExe, args: [guardInput, path.join(work, 'guard-output.json'), '--fail-on-error'],
            cwd: work, logDir: path.join(work, 'logs'), timeoutMs: 10000 });
        assert.equal(blocked.timed_out, false);
        assert.notEqual(blocked.exit_code, 0, 'one-process Job blocks old helper');
        assert.equal(requests.length, 0, 'old helper could not send request');
        report.guard_control = { legacy_exit: blocked.exit_code, network_requests: 0 };
        for (const count of [1, 4, 10]) {
            const urls = Array.from({ length: count }, (_, index) => `http://127.0.0.1:${server.address().port}/test/${index}`);
            const input = path.join(work, 'input.json');
            const output = path.join(work, 'output.json');
            await fs.writeFile(input, JSON.stringify({ urls, concurrency: 1, timeout_ms: 5000 }));
            const row = { count, legacy: [], native: [] };
            for (let repetition = 0; repetition <= 5; repetition++) {
                for (const mode of repetition % 2 ? ['native', 'legacy'] : ['legacy', 'native']) {
                    process.env.VELA_BENCH_SINGLE_PROCESS = mode === 'native' ? '1' : '0';
                    await fs.rm(output, { force: true });
                    const first = requests.length;
                    const accepted = connections;
                    const p = await measure({
                        exe: mode === 'native' ? nativeExe : legacyExe, args: [input, output, '--fail-on-error'],
                        cwd: work, logDir: path.join(work, 'logs'), timeoutMs: 30000,
                    });
                    assert.equal(p.exit_code, 0, await fs.readFile(p.stderr_path, 'utf8'));
                    assert.equal(p.timed_out, false);
                    const result = JSON.parse(await fs.readFile(output, 'utf8'));
                    assert.deepEqual(result.results, urls.map(url => ({ url, status: 200, bytes: 64, error: null })));
                    assert.deepEqual(requests.slice(first), urls.map(url => new URL(url).pathname));
                    const expectedSockets = mode === 'native' ? 1 : count;
                    assert.equal(connections - accepted, expectedSockets);
                    assert.ok(p.total_processes >= 1, 'nonempty Job process accounting');
                    if (repetition) row[mode].push({
                        wall_ms: p.wall_ms, cpu_ms: p.cpu_ms, peak_job_commit_bytes: p.peak_job_commit_bytes,
                        job_total_processes: p.total_processes, connections: expectedSockets,
                    });
                }
            }
            report.workloads.push(row);
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
            console.log(`HTTP ${count}: ${JSON.stringify(row.native.map(sample => sample.wall_ms))}`);
        }
    } finally {
        process.env.PATH = previousPath;
        if (previousLimit === undefined) delete process.env.VELA_BENCH_SINGLE_PROCESS;
        else process.env.VELA_BENCH_SINGLE_PROCESS = previousLimit;
    }
} finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
}
