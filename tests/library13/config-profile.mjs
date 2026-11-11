import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bench = path.resolve(process.argv[2] ?? 'G:/VelaBench');
const output = path.resolve(process.argv[3] ?? path.join(root, 'build/stage13/131b-profile.json'));
const { measure } = await import(pathToFileURL(path.join(bench, 'src/meter.mjs')));
const work = await fs.mkdtemp(path.join(root, 'build/stage13/config-profile-'));
const compiler = path.join(root, 'bin/velac.exe');
const source = path.join(root, 'tests/library13/profile.vela');
const ordinary = path.join(work, 'probe.exe'), debug = path.join(work, 'debug.exe');
const c = path.join(work, 'debug.c');
const base = JSON.parse(await fs.readFile(path.join(root, 'docs/acceptance/1.3.1-baseline.json'), 'utf8'));
const cc = process.env.VELA_CC;
assert.ok(cc && process.env.VELA_CC_KIND === 'msvc');
for (const name of ['VELA_TRACE', 'VELA_PROFILE', 'VELA_GC_STRESS', 'VELA_GC_REPORT']) delete process.env[name];
function call(exe, args, env = process.env) {
    const p = spawnSync(exe, args, { cwd: work, encoding: 'utf8', windowsHide: true, timeout: 120000, env });
    assert.equal(p.status, 0, `${exe}: ${p.error ?? ''}\n${p.stdout}\n${p.stderr}`);
    return p;
}
function ranges(samples) {
    return Object.fromEntries(['wall_ms', 'cpu_ms', 'peak_job_commit_bytes'].map(key => {
        const values = samples.map(sample => sample[key]).sort((a, b) => a - b);
        return [key, { min: values[0], median: values[2], max: values[4] }];
    }));
}
call(compiler, ['build', source, '-o', ordinary]);
call(compiler, ['emit-c', source, '--debug', '-o', c]);
call(cc, ['/nologo', '/std:c11', '/utf-8', '/MT', '/O2', `/Fo${debug}.obj`, `/Fe${debug}`, c]);
const report = { schema_version: 1, stage: '1.3.1b', groups: [], targets: { medium_wall_reduction: 0.2, peak_commit_increase: 0.1 } };
const modes = ['config', 'snapshot-parse', 'snapshot-copy'];
for (const [label, size] of [['small', 8], ['medium', 64], ['large', 256]]) {
    const raw = JSON.stringify(Object.fromEntries(Array.from({ length: size - 1 }, (_, n) => [`key${n}`, `value-${n}-я`]).concat([['target', 7]])));
    const input = path.join(work, label + '.json');
    await fs.writeFile(input, raw);
    const sha256 = createHash('sha256').update(raw).digest('hex');
    const historical = base.workloads.find(row => row.mode === 'config' && row.label === label);
    assert.equal(historical.input.sha256, sha256);
    for (const rounds of [1, 2000]) {
        const samples = Object.fromEntries(modes.map(mode => [mode, []]));
        for (let round = 0; round <= 5; round++) {
            for (const mode of modes.slice(round % 3).concat(modes.slice(0, round % 3))) {
                const p = await measure({ exe: ordinary, args: [mode, input, String(rounds)], cwd: work, logDir: path.join(work, 'logs'), timeoutMs: 30000 });
                assert.equal(p.exit_code, 0);
                assert.equal(p.timed_out, false);
                assert.equal((await fs.readFile(p.stdout_path, 'utf8')).trim(), String(rounds * 7));
                assert.equal((await fs.readFile(p.stderr_path, 'utf8')).trim(), '');
                if (round) samples[mode].push({ wall_ms: p.wall_ms, cpu_ms: p.cpu_ms, peak_job_commit_bytes: p.peak_job_commit_bytes });
            }
        }
        for (const mode of modes) {
            const p = call(debug, [mode, input, String(rounds)], { ...process.env, VELA_PROFILE: '1', VELA_GC_REPORT: '1' });
            assert.equal(p.stdout.trim(), String(rounds * 7));
            const fn = JSON.parse(p.stderr.split(/\r?\n/).find(line => line.startsWith('{"vela_profile":'))).functions;
            const calls = name => fn.filter(f => f.name.endsWith('::' + name)).reduce((n, item) => n + item.calls, 0);
            const counters = { invalid_offset: calls('invalid_offset'), from_value: calls('from_value'), index: calls('index'), checked_copy: calls('checked_copy') };
            if (mode === 'config') {
                assert.equal(counters.from_value, rounds + 1);
                assert.equal(counters.invalid_offset, (rounds + 1) * size + 1);
            } else {
                assert.equal(counters.index, 1);
                assert.equal(counters.from_value, mode === 'snapshot-copy' ? 1 : 0);
                assert.equal(counters.checked_copy, mode === 'snapshot-copy' ? size + 1 : 0);
                assert.equal(counters.invalid_offset, mode === 'snapshot-copy' ? size * 2 : 1);
            }
            const current = ranges(samples[mode]);
            const legacy = ranges(samples.config);
            report.groups.push({ mode, label, size, rounds, sha256, samples: samples[mode], ...current, counters,
                paired_wall_reduction: 1 - current.wall_ms.median / legacy.wall_ms.median,
                paired_commit_increase: current.peak_job_commit_bytes.median / legacy.peak_job_commit_bytes.median - 1,
                ...(rounds === 2000 ? { historical_wall_reduction: 1 - current.wall_ms.median / historical.wall_ms.median,
                    historical_commit_increase: current.peak_job_commit_bytes.median / historical.peak_job_commit_bytes.median - 1 } : {}) });
            console.log(`${mode}/${label}/${rounds}: ${current.wall_ms.median.toFixed(2)} ms`);
        }
    }
}
report.passed = report.groups.filter(g => g.mode !== 'config' && g.rounds === 2000).every(g =>
    g.paired_commit_increase <= 0.1 && g.historical_commit_increase <= 0.1 &&
    (g.label !== 'medium' || (g.paired_wall_reduction >= 0.2 && g.historical_wall_reduction >= 0.2)));
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
assert.ok(report.passed, 'Config snapshot budgets not met');
