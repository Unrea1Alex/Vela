import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [input, output, fixedRoot, distro = 'VelaRelease100', bench = 'G:/VelaBench'] = process.argv.slice(2);
assert.ok(input && output && fixedRoot, 'pass the PGO report, output and fixed compiler source tree');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const report = await read(input);
assert.equal(report.complete, true);
const host = report.host;
const windows = host === 'msvc';
const linkMode = report.stage === '1.3.4l';
const [fixed, previous] = await Promise.all(['e', linkMode ? 'k' : 'j']
    .map(stage => read('docs/acceptance/1.3.4' + stage + '-' + host + '.json')));
const describe = async file => {
    const data = await fs.readFile(file);
    return { sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length };
};
const target = value => {
    const absolute = path.resolve(value).replaceAll('\\', '/');
    return windows ? absolute : '/mnt/' + absolute[0].toLowerCase() + absolute.slice(2);
};
const wsl = value => {
    const absolute = path.resolve(value).replaceAll('\\', '/');
    return '/mnt/' + absolute[0].toLowerCase() + absolute.slice(2);
};
const logs = await fs.mkdtemp(path.join(report.work, 'historical-'));
const meter = path.join(report.work, 'linux-meter');
let winMeasure;
if (windows) ({ measure: winMeasure } = await import(pathToFileURL(path.resolve(bench, 'src/meter.mjs'))));
for (const name of ['VELA_TRACE', 'VELA_PROFILE', 'VELA_GC_STRESS', 'VELA_GC_REPORT']) delete process.env[name];
async function measure(file, args, oracle) {
    let data, stdout, stderr;
    if (windows) {
        data = await winMeasure({ exe: path.resolve(file), args, cwd: process.cwd(), timeoutMs: 30000, logDir: logs });
        stdout = data.stdout_path;
        stderr = data.stderr_path;
    } else {
        const id = randomUUID();
        stdout = path.join(logs, id + '.out');
        stderr = path.join(logs, id + '.err');
        const result = spawnSync('wsl.exe', ['--distribution', distro, '--cd', wsl(process.cwd()), '--exec',
            target(meter), '30000', target(stdout), target(stderr), target(file), ...args],
        { encoding: 'utf8', windowsHide: true, timeout: 45000 });
        if (result.error) throw result.error;
        assert.equal(result.status, 0, result.stdout + result.stderr);
        data = JSON.parse(result.stdout);
    }
    assert.deepEqual([data.exit_code, data.timed_out, data.active_processes_after], [0, false, 0]);
    assert.equal((await fs.readFile(stderr, 'utf8')).trim(), '');
    oracle(JSON.parse(await fs.readFile(stdout, 'utf8')));
    return { wall_ms: data.wall_ms, cpu_ms: data.cpu_ms,
        peak_tree_bytes: data.peak_job_commit_bytes ?? data.peak_tree_rss_bytes };
}
const exts = windows ? '.exe' : '';
const buildlensInput = path.join(report.work, 'evaluation.jsonl');
assert.equal((await describe(buildlensInput)).sha256, report.evaluation.buildlens.sha256);
for (const [name, expected] of Object.entries(report.evaluation.compiler)) {
    assert.equal((await describe(path.join(fixedRoot, name))).sha256, expected);
}
const workloads = {
    buildlens: {
        before: path.join(fixed.work, 'reference/buildlens/buildlens' + exts),
        preceding: linkMode ? previous.workloads.buildlens.first.o2 : path.join(previous.work, 'candidate/buildlens/buildlens' + exts),
        expected: [fixed.artifacts['reference/buildlens'].exe.sha256, linkMode ? previous.workloads.buildlens.first.artifacts.o2.sha256
            : previous.artifacts['candidate/buildlens'].exe.sha256],
        args: [target(buildlensInput), '--top', '1'],
        oracle: data => assert.deepEqual(data.summary, report.evaluation.buildlens.expected),
    },
    compiler: {
        before: 'build/stage13/codegen-134e/reference' + (windows ? '.exe' : '-linux'),
        preceding: linkMode ? previous.workloads.compiler.first.o2 : 'build/stage13/codegen-134j/candidate' + (windows ? '.exe' : '-linux'),
        expected: [fixed.compilers[0].sha256, linkMode ? previous.workloads.compiler.first.artifacts.o2.sha256 : previous.compilers[1].sha256],
        args: ['check', target(path.join(fixedRoot, 'vela.project')), '--json'],
        oracle: data => assert.equal(data.ok, true),
    },
};
const results = {};
for (const [name, item] of Object.entries(workloads)) {
    const current = report.workloads[name].first;
    const variants = { fixed: item.before, previous: item.preceding, o2: current.o2, pgo: current.optimized };
    const expected = [...item.expected, current.artifacts.o2.sha256, current.artifacts.pgo.sha256];
    if (linkMode) {
        const archived = previous.workloads[name].first;
        Object.assign(variants, { previous_pgo: archived.optimized, lto: current.lto, combined: current.combined });
        expected.push(archived.artifacts.pgo.sha256, current.artifacts.lto.sha256, current.artifacts.pgo_lto.sha256);
    }
    const labels = Object.keys(variants);
    const artifacts = Object.fromEntries(await Promise.all(labels.map(async key => [key, await describe(variants[key])])));
    assert.deepEqual(labels.map(key => artifacts[key].sha256), expected);
    const run = key => measure(variants[key], item.args, item.oracle);
    for (const key of labels) await run(key);
    const samples = [];
    for (let round = 0; round < 5; round++) {
        const sample = {};
        for (let index = 0; index < labels.length; index++) {
            const key = labels[(round + index) % labels.length];
            sample[key] = await run(key);
        }
        samples.push(sample);
    }
    const medians = Object.fromEntries(labels.map(key => [key, Object.fromEntries(Object.keys(samples[0][key])
        .map(metric => [metric, samples.map(row => row[key][metric]).sort((a, b) => a - b)[2]]))]));
    results[name] = { artifacts, samples, medians };
    console.log(host, name, JSON.stringify(medians));
}
await fs.writeFile(output, JSON.stringify({ host, fixed: '1.3.4d', previous: linkMode ? '1.3.4k' : '1.3.4j',
    workloads: results }, null, 2) + '\n');
