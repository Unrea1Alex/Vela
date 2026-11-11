import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [legacy, candidate, reportPath, bench = 'G:/VelaBench'] = process.argv.slice(2).map(value => path.resolve(value));
const stage = process.argv[6] ?? '1.3.4';
const root = path.resolve(import.meta.dirname, '../..');
const work = await fs.mkdtemp(path.join(path.dirname(reportPath), 'typed-json-profile-'));
const { measure } = await import(pathToFileURL(path.join(bench, 'src/meter.mjs')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const frozen = JSON.parse(await fs.readFile(path.join(root, 'docs/acceptance/1.3.1-baseline.json'), 'utf8'));
const report = { schema_version: 1, stage, rounds: 300, warmup: 1, expected: '2100', workloads: [] };
function range(rows, field) {
    const values = rows.map(row => row[field]).sort((a, b) => a - b);
    return { min: values[0], median: values[2], max: values[4] };
}
for (const [label, keys] of [['small', 8], ['medium', 64], ['large', 256]]) {
    const input = path.join(work, `${label}.json`);
    const object = Object.fromEntries(Array.from({ length: keys - 1 }, (_, n) => [`key${n}`, `value-${n}-я`]).concat([['target', 7]]));
    const json = JSON.stringify(object);
    const baseline = frozen.workloads.find(row => row.mode === 'json-typed' && row.label === label);
    assert.equal(hash(json), baseline.input.sha256, 'frozen input bytes');
    await fs.writeFile(input, json);
    const workload = { label, keys, sha256: hash(json), legacy: [], candidate: [] };
    for (let i = 0; i <= 5; i++) {
        for (const variant of i % 2 ? ['candidate', 'legacy'] : ['legacy', 'candidate']) {
            const trial = await measure({
                exe: variant === 'legacy' ? legacy : candidate, args: ['json-typed', input, '300'],
                cwd: work, logDir: path.join(work, 'logs'), timeoutMs: 30000,
            });
            assert.equal(trial.exit_code, 0, await fs.readFile(trial.stderr_path, 'utf8'));
            assert.equal(trial.timed_out, false);
            assert.equal((await fs.readFile(trial.stdout_path, 'utf8')).trim(), report.expected);
            if (i) workload[variant].push({
                wall_ms: trial.wall_ms, cpu_ms: trial.cpu_ms, peak_job_commit_bytes: trial.peak_job_commit_bytes,
            });
        }
    }
    workload.metrics = Object.fromEntries(['wall_ms', 'cpu_ms', 'peak_job_commit_bytes'].map(key => [key, {
        historical: baseline[key], legacy: range(workload.legacy, key), candidate: range(workload.candidate, key),
    }]));
    report.workloads.push(workload);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ label, wall_ms: workload.metrics.wall_ms, peak_job_commit_bytes: workload.metrics.peak_job_commit_bytes }));
}
