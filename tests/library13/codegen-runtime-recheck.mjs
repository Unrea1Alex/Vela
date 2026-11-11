import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [profileFile, comparisonFile, fixedFile, scope, output, bench = 'G:/VelaBench', distro = 'VelaRelease100'] = process.argv.slice(2);
assert.ok(profileFile && comparisonFile && fixedFile && ['previous', 'fixed'].includes(scope) && output,
    'usage: node codegen-runtime-recheck.mjs PROFILE COMPARE BASELINE previous|fixed OUTPUT [BENCH] [DISTRO]');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const [profile, compare, baseline] = await Promise.all([profileFile, comparisonFile, fixedFile].map(readJson));
assert.equal(profile.host, compare.host);
assert.equal(profile.host, baseline.host);
const windows = profile.host === 'msvc';
const exeSuffix = windows ? '.exe' : '';
const hashes = {};
const hash = async file => {
    if (!hashes[file]) hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    return hashes[file];
};
const wsl = value => {
    const absolute = path.resolve(value).replaceAll('\\', '/');
    return '/mnt/' + absolute[0].toLowerCase() + absolute.slice(2);
};
const target = value => windows ? path.resolve(value) : wsl(value);
const logs = path.join(profile.work, 'recheck-' + scope);
let meter, measure;
if (windows) {
    ({ measure } = await import(pathToFileURL(path.join(path.resolve(bench), 'src/meter.mjs'))));
} else {
    meter = path.join(profile.work, 'linux-meter');
    assert.equal(await hash(meter), profile.meter.exe.sha256);
}
for (const key of ['VELA_TRACE', 'VELA_PROFILE', 'VELA_GC_STRESS', 'VELA_GC_REPORT']) delete process.env[key];
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function workload(row) {
    const { program, size, input } = row;
    if (input?.iterations) return { args: [String(input.iterations)], verify: text => assert.equal(text, String(input.expected)) };
    if (program === 'data') {
        const [label, mode] = size.split('/');
        if (mode === 'fold') return { args: ['fold', String(input.items), '12'], verify: text => assert.equal(text, String(input.expected)) };
        const file = path.join(profile.work, label + (mode === 'typed-json' ? '.json' : '.txt'));
        assert.equal(await hash(file), input.sha256);
        return { args: [mode === 'typed-json' ? 'json-typed' : 'strings', target(file), mode === 'typed-json' ? '300' : '4000'],
            verify: text => assert.equal(text, String(input.expected)) };
    }
    if (program === 'buildlens') {
        const file = path.join(profile.work, size + '.jsonl');
        assert.equal(await hash(file), input.sha256);
        return { args: [target(file), '--top', '1'], verify: text => assert.deepEqual(JSON.parse(text).summary, input.expected) };
    }
    if (program === 'fielddesk') return { args: ['--demo', target(path.join(profile.work, 'fielddesk-recheck.html')), '--replay-check'],
        verify: text => {
            assert.match(text, /^Replay verified: identical report, all requests consumed/m);
            assert.match(text, /^Accepted 9 \| excluded 1 \| alerts 2 \| mean 20\.67$/m);
        } };
    const expected = { callbacks: 'callbacks passed', async: 'parallel values and limits passed' }[program];
    assert.ok(expected, 'unsupported recheck workload ' + program + '/' + size);
    return { args: [], verify: text => assert.equal(text, expected) };
}

async function measurement(exe, args, verify) {
    let result, out, err;
    if (windows) {
        result = await measure({ exe, args, cwd: process.cwd(), logDir: logs, timeoutMs: 180000 });
        out = result.stdout_path;
        err = result.stderr_path;
    } else {
        const id = randomUUID();
        out = path.join(profile.work, id + '.out');
        err = path.join(profile.work, id + '.err');
        const child = spawnSync('wsl.exe', ['--distribution', distro, '--cd', wsl(process.cwd()), '--exec',
            'env', 'VELA_GC_STRESS=0', 'VELA_GC_REPORT=0', 'VELA_PROFILE=0', 'VELA_TRACE=0', wsl(meter),
            '180000', wsl(out), wsl(err), wsl(exe), ...args], { encoding: 'utf8', windowsHide: true, timeout: 240000 });
        if (child.error) throw child.error;
        assert.equal(child.status, 0, child.stdout + child.stderr);
        result = JSON.parse(child.stdout);
    }
    assert.equal(result.exit_code, 0);
    assert.equal(result.timed_out, false);
    assert.equal(result.active_processes_after, 0);
    assert.equal((await readFile(err, 'utf8')).trim(), '');
    verify((await readFile(out, 'utf8')).trim());
    return { wall_ms: result.wall_ms, cpu_ms: result.cpu_ms,
        peak_tree_bytes: result.peak_job_commit_bytes ?? result.peak_tree_rss_bytes };
}

const cases = [];
for (const row of profile.workloads) {
    const name = row.program + '/' + row.size;
    const selected = Object.entries(compare.workloads[name].timing).filter(([metric, values]) =>
        (metric === 'wall_ms' || metric === 'cpu_ms' || metric.startsWith('peak_tree_')) && values[scope + '_percent'] > 10);
    if (!selected.length) continue;
    const { args, verify } = await workload(row);
    const before = scope === 'fixed' ? baseline : profile;
    const reference = path.join(before.work, 'reference', row.program, row.program + exeSuffix);
    const candidate = path.join(profile.work, 'candidate', row.program, row.program + exeSuffix);
    const oldArtifact = before.artifacts['reference/' + row.program], newArtifact = profile.artifacts['candidate/' + row.program];
    assert.equal(await hash(reference), oldArtifact.exe.sha256);
    assert.equal(await hash(candidate), newArtifact.exe.sha256);
    await measurement(reference, args, verify);
    await measurement(candidate, args, verify);
    const raw = [];
    for (let index = 0; index < 21; index++) {
        const row = {};
        if (index % 2) {
            row.candidate = await measurement(candidate, args, verify);
            row.reference = await measurement(reference, args, verify);
        } else {
            row.reference = await measurement(reference, args, verify);
            row.candidate = await measurement(candidate, args, verify);
        }
        raw.push(row);
    }
    const metrics = Object.fromEntries(Object.keys(raw[0].reference).map(metric => {
        const a = median(raw.map(row => row.reference[metric]));
        const b = median(raw.map(row => row.candidate[metric]));
        return [metric, { reference: a, candidate: b, percent: a ? 100 * (b - a) / a : null }];
    }));
    const sameC = oldArtifact.c.sha256 === newArtifact.c.sha256;
    cases.push({ name, initial: Object.fromEntries(selected), same_c_bytes: sameC, metrics, raw });
    console.log(JSON.stringify({ name, same_c_bytes: sameC, metrics }));
}
await writeFile(output, JSON.stringify({ host: profile.host, scope, cases }, null, 2) + '\n');
