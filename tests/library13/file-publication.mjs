import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [program, evidence, bench = 'G:/VelaBench'] = process.argv.slice(2).map(value => path.resolve(value));
const work = await fs.mkdtemp(path.join(path.dirname(evidence), 'file-publication-'));
const { measure } = await import(pathToFileURL(path.join(bench, 'src/meter.mjs')));
const block = Buffer.allocUnsafe(1048576);
for (let i = 0; i < block.length; i++) block[i] = (i * 17 + (i >> 8)) & 255;
async function digest(file) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
function median(rows, field) {
    return rows.map(row => row[field]).sort((a, b) => a - b)[2];
}
const report = { schema_version: 1, stage: '1.3.4b', warmup: 1, chunk_bytes: 8192, workloads: [] };
for (const mb of [2, 20]) {
    const folder = path.join(work, String(mb));
    await fs.mkdir(folder);
    const input = path.join(folder, 'вход.bin');
    const output = path.join(folder, 'выход.bin');
    const file = await fs.open(input, 'wx');
    try {
        for (let i = 0; i < mb; i++) await file.writeFile(block);
    } finally { await file.close(); }
    const size = mb * block.length;
    const expected = await digest(input);
    const args = [input, output, String(size)];
    const samples = [];
    for (let round = 0; round <= 5; round++) {
        const result = await measure({ exe: program, args, cwd: folder, logDir: path.join(work, 'logs'), timeoutMs: 30000 });
        assert.equal(result.exit_code, 0, await fs.readFile(result.stderr_path, 'utf8'));
        assert.equal((await fs.readFile(result.stdout_path, 'utf8')).trim(), String(size));
        assert.equal(await digest(output), expected);
        assert.deepEqual((await fs.readdir(folder)).sort(), ['вход.bin', 'выход.bin']);
        if (round) samples.push({ wall_ms: result.wall_ms, cpu_ms: result.cpu_ms, peak_job_commit_bytes: result.peak_job_commit_bytes });
    }
    const instrumented = spawnSync(program, args, {
        cwd: folder, encoding: 'utf8', windowsHide: true, timeout: 30000,
        env: { ...process.env, VELA_GC_REPORT: '1', VELA_GC_STRESS: '0' },
    });
    assert.equal(instrumented.status, 0, instrumented.stdout + instrumented.stderr);
    const gc = /vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)/.exec(instrumented.stderr);
    assert.ok(gc, instrumented.stderr);
    report.workloads.push({ size, sha256: expected, samples,
        median: Object.fromEntries(['wall_ms', 'cpu_ms', 'peak_job_commit_bytes'].map(field => [field, median(samples, field)])),
        gc: { collections: +gc[1], managed_peak_bytes: +gc[2], before_teardown_bytes: +gc[3] } });
    await fs.writeFile(evidence, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.workloads.at(-1).median));
}
assert.ok(report.workloads[1].gc.managed_peak_bytes <= report.workloads[0].gc.managed_peak_bytes + 131072,
    'tenfold input keeps managed working storage bounded');
