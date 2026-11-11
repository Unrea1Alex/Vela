import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bench = path.resolve(process.argv[2] ?? 'G:/VelaBench');
const { measure } = await import(pathToFileURL(path.join(bench, 'src/meter.mjs')));
const work = await fs.mkdtemp(path.join(root, 'build/stage13/checked-'));
const output = path.resolve(process.argv[3] ?? path.join(root, 'build/stage13/131a-profile.json'));
const baselineExe = process.argv[4] ? path.resolve(process.argv[4]) : null;
const compiler = path.join(root, 'bin/velac.exe');
const source = path.join(root, 'tests/library13/profile.vela');
const ordinary = path.join(work, 'checked.exe');
const debug = path.join(work, 'checked-debug.exe');
const c = path.join(work, 'checked-debug.c');
const baseline = JSON.parse(await fs.readFile(path.join(root, 'docs/acceptance/1.3.1-baseline.json'), 'utf8'));
assert.ok(baseline.completed);
assert.equal(process.env.VELA_CC_KIND, 'msvc');
const cc = process.env.VELA_CC;
const noInstrumentation = { ...process.env, VELA_PROFILE: '0', VELA_GC_REPORT: '0', VELA_GC_STRESS: '0', VELA_TRACE: '0' };
function call(exe, args, env = noInstrumentation) {
    const p = spawnSync(exe, args, { cwd: work, encoding: 'utf8', windowsHide: true, timeout: 120000, env });
    assert.equal(p.status, 0, `${exe}: ${p.error ?? ''}\n${p.stdout}\n${p.stderr}`);
    return p;
}
call(compiler, ['build', source, '-o', ordinary]);
call(compiler, ['emit-c', source, '--debug', '-o', c]);
call(cc, ['/nologo', '/std:c11', '/utf-8', '/MT', '/O2', `/Fo${debug}.obj`, `/Fe${debug}`, c]);
const report = { stage: '1.3.1a', schema_version: 1, groups: [], targets: { medium_wall_reduction: 0.2, peak_commit_increase: 0.1 } };
if (baselineExe) {
    const frozen = await fs.readFile(baselineExe);
    assert.equal(frozen.length, baseline.sizes.profile_exe);
    report.paired_baseline_sha256 = createHash('sha256').update(frozen).digest('hex');
}
function range(samples, key) {
    const values = samples.map(sample => sample[key]).sort((a, b) => a - b);
    return { min: values[0], median: values[2], max: values[4] };
}
async function sample(exe, args) {
    const p = await measure({ exe, args, cwd: work, logDir: path.join(work, 'logs'), timeoutMs: 30000 });
    assert.equal(p.exit_code, 0);
    assert.equal(p.timed_out, false);
    assert.equal((await fs.readFile(p.stdout_path, 'utf8')).trim(), '2000');
    assert.equal((await fs.readFile(p.stderr_path, 'utf8')).trim(), '');
    return { wall_ms: p.wall_ms, cpu_ms: p.cpu_ms, peak_job_commit_bytes: p.peak_job_commit_bytes };
}
for (const [label, n] of [['small', 64], ['medium', 1024], ['large', 8192]]) {
    const input = path.join(work, label + '.txt');
    const bytes = Buffer.from('/папка/' + 'a'.repeat(n));
    await fs.writeFile(input, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    for (const mode of ['text', 'path']) {
        const base = baseline.workloads.find(row => row.mode === mode && row.label === label);
        assert.equal(base.input.sha256, sha256);
        assert.equal(base.rounds, 2000);
        const args = ['checked-' + mode, input, '2000'];
        const samples = [];
        const paired = [];
        for (let round = 0; round <= 5; round++) {
            let reference;
            if (baselineExe && round % 2 === 0) reference = await sample(baselineExe, [mode, input, '2000']);
            const p = await sample(ordinary, args);
            if (baselineExe && round % 2 !== 0) reference = await sample(baselineExe, [mode, input, '2000']);
            if (round) {
                samples.push(p);
                if (reference) paired.push(reference);
            }
        }
        const instrumented = call(debug, args, { ...noInstrumentation, VELA_PROFILE: '1', VELA_GC_REPORT: '1' });
        assert.equal(instrumented.stdout.trim(), '2000');
        const stats = JSON.parse(instrumented.stderr.split(/\r?\n/).find(line => line.startsWith('{"vela_profile":')));
        const calls = name => stats.functions.filter(f => f.name.endsWith('::' + name)).reduce((sum, f) => sum + f.calls, 0);
        assert.equal(calls('invalid_offset'), 1);
        assert.equal(calls(mode === 'text' ? 'checked_slice' : 'checked_parent'), 2000);
        const keys = ['wall_ms', 'cpu_ms', 'peak_job_commit_bytes'];
        const ranges = Object.fromEntries(keys.map(key => [key, range(samples, key)]));
        const paired_ranges = paired.length ? Object.fromEntries(keys.map(key => [key, range(paired, key)])) : null;
        const wall_reduction = 1 - ranges.wall_ms.median / base.wall_ms.median;
        const commit_increase = ranges.peak_job_commit_bytes.median / base.peak_job_commit_bytes.median - 1;
        report.groups.push({ mode, label, sha256, samples, ...ranges, baseline_wall_ms: base.wall_ms.median,
            baseline_peak_commit_bytes: base.peak_job_commit_bytes.median, wall_reduction, commit_increase,
            invalid_offset_calls: 1, checked_operations: 2000,
            ...(paired_ranges ? { paired_samples: paired, paired_ranges,
                paired_wall_reduction: 1 - ranges.wall_ms.median / paired_ranges.wall_ms.median,
                paired_commit_increase: ranges.peak_job_commit_bytes.median / paired_ranges.peak_job_commit_bytes.median - 1 } : {}) });
        console.log(`${mode}/${label} ${(paired_ranges ?? base).wall_ms.median.toFixed(2)} → ${ranges.wall_ms.median.toFixed(2)} ms`);
    }
}
report.historical_budget_passed = report.groups.every(g => g.commit_increase <= 0.1 && (g.label !== 'medium' || g.wall_reduction >= 0.2));
report.paired_budget_passed = baselineExe ? report.groups.every(g => g.paired_commit_increase <= 0.1 && (g.label !== 'medium' || g.paired_wall_reduction >= 0.2)) : null;
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
assert.ok(report.historical_budget_passed || report.paired_budget_passed, 'Wall or private-commit budget not met');
