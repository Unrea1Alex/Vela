import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [host, compilerArg, reportArg, fixedArg, distro = 'VelaRelease100', bench = 'G:/VelaBench', optimization] = process.argv.slice(2);
assert.ok(['msvc', 'gcc'].includes(host) && compilerArg && reportArg && fixedArg
    && (optimization === undefined || ['--lto', '--lto-recheck', '--release-lto'].includes(optimization)),
    'usage: node pgo-profile.mjs msvc|gcc COMPILER REPORT FIXED_SELFHOST [WSL_DISTRO] [VELABENCH] [--lto|--lto-recheck|--release-lto]');
const linkMode = optimization !== undefined;
const recheck = optimization === '--lto-recheck';
const release = optimization === '--release-lto';
const windows = host === 'msvc';
const root = process.cwd();
const previous = JSON.parse(await fs.readFile('docs/acceptance/1.3.4j-' + host + '.json', 'utf8'));
const initial = recheck ? JSON.parse(await fs.readFile(reportArg, 'utf8')) : null;
if (recheck) assert.deepEqual([initial.stage, initial.host, initial.primary_target, initial.complete], ['1.3.4l', host, false, undefined]);
const work = recheck ? initial.work : await fs.mkdtemp(path.join(root, 'build/stage13/' + (linkMode ? 'lto-' : 'pgo-') + host + '-'));
const logs = path.join(work, recheck ? 'recheck-logs' : 'logs');
await fs.mkdir(logs);
const digest = value => createHash('sha256').update(value).digest('hex');
const describe = async file => {
    const data = await fs.readFile(file);
    return { sha256: digest(data), bytes: data.length };
};
const wsl = value => {
    const absolute = path.resolve(value).replaceAll('\\', '/');
    return '/mnt/' + absolute[0].toLowerCase() + absolute.slice(2);
};
const target = file => windows ? path.resolve(file) : wsl(file);
const compiler = target(compilerArg);
const linux = (exe, args) => {
    const result = spawnSync('wsl.exe', ['--distribution', distro, '--cd', wsl(root), '--exec',
        'env', 'VELA_CC=gcc', 'VELA_CC_KIND=cc', exe, ...args],
    { encoding: 'utf8', windowsHide: true, timeout: 650000, maxBuffer: 8 * 1024 * 1024 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
};
for (const name of ['VELA_TRACE', 'VELA_PROFILE', 'VELA_GC_STRESS', 'VELA_GC_REPORT']) delete process.env[name];
const linuxMeter = path.join(work, 'linux-meter');
let winMeasure;
if (windows) {
    ({ measure: winMeasure } = await import(pathToFileURL(path.resolve(bench, 'src/meter.mjs'))));
} else {
    linux('gcc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', 'tests/library13/codegen/linux-meter.c',
        '-o', target(linuxMeter)]);
}
async function measure(exe, args) {
    let data, stdout, stderr;
    if (windows) {
        data = await winMeasure({ exe, args, cwd: root, logDir: logs, timeoutMs: 600000 });
        stdout = data.stdout_path;
        stderr = data.stderr_path;
    } else {
        const id = randomUUID();
        stdout = path.join(logs, id + '.out');
        stderr = path.join(logs, id + '.err');
        data = JSON.parse(linux(target(linuxMeter), ['600000', target(stdout), target(stderr), exe, ...args]));
    }
    const output = (await fs.readFile(stdout, 'utf8')).trim();
    const error = (await fs.readFile(stderr, 'utf8')).trim();
    assert.equal(data.timed_out, false, exe + ' ' + args.join(' '));
    assert.equal(data.active_processes_after, 0);
    assert.equal(data.exit_code, 0, exe + ' ' + args.join(' ') + '\n' + output + '\n' + error);
    return { output, error, metrics: { wall_ms: data.wall_ms, cpu_ms: data.cpu_ms,
        peak_tree_bytes: data.peak_job_commit_bytes ?? data.peak_tree_rss_bytes,
        peak_process_bytes: windows ? data.parent_peak_working_set_bytes : data.peak_process_rss_bytes } };
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function stats(rows) {
    return Object.fromEntries(Object.keys(rows[0]).map(key => {
        const values = rows.map(row => row[key]).filter(Number.isFinite);
        return [key, { median: median(values) ?? null, min: values.length ? Math.min(...values) : null,
            max: values.length ? Math.max(...values) : null }];
    }));
}
const fixed = path.resolve(fixedArg);
for (const [name, expected] of Object.entries(previous.compiler_workload)) {
    assert.equal((await describe(path.join(fixed, name))).sha256, expected);
}
const heldOut = path.join(work, 'evaluation.jsonl');
if (!recheck) {
    await fs.writeFile(heldOut, Array.from({ length: 10000 }, (_, k) =>
        JSON.stringify({ id: 'run-' + k, suite: 'suite', name: 'test-' + k % 100, status: 'passed', duration_ms: 10 })).join('\n') + '\n');
}
const evaluation = previous.workloads.find(row => row.program === 'buildlens' && row.size === 'large').input;
assert.equal((await describe(heldOut)).sha256, evaluation.sha256);
const training = path.join(work, 'training.jsonl');
const trainingRows = Array.from({ length: 30000 }, (_, k) => ({ id: 'train-' + k,
    suite: 'train/module-' + k % 7, name: 'target-' + k % 511, status: 'passed', duration_ms: k % 23 + 1 }));
if (!recheck) await fs.writeFile(training, trainingRows.map(row => JSON.stringify(row)).join('\n') + '\n');
const trainingSummary = { events: trainingRows.length, duplicates: 0, selected: trainingRows.length,
    tests: new Set(trainingRows.map(row => row.suite + '/' + row.name)).size,
    failed: 0, flaky: 0, skipped: 0, total_ms: trainingRows.reduce((sum, row) => sum + row.duration_ms, 0) };
const fieldDesk = path.resolve('apps/fielddesk/main.vela');
const workload = {
    buildlens: {
        source: path.resolve('apps/build-lens/vela.project'),
        train: [target(training), '--top', '1'],
        eval: [target(heldOut), '--top', '1'],
        trainOracle: text => assert.deepEqual(JSON.parse(text).summary, trainingSummary),
        evalOracle: text => assert.deepEqual(JSON.parse(text).summary, evaluation.expected),
    },
    compiler: {
        source: path.resolve('selfhost/vela.project'),
        train: ['check', target(fieldDesk), '--json'],
        eval: ['check', target(path.join(fixed, 'vela.project')), '--json'],
        trainOracle: text => assert.equal(JSON.parse(text).ok, true),
        evalOracle: text => assert.equal(JSON.parse(text).ok, true),
    },
};
const report = initial ?? { schema_version: 1, stage: release ? '1.3.6' : linkMode ? '1.3.4l' : '1.3.4k', host, work,
    toolchain: previous.toolchain, compiler: await describe(compilerArg),
    training: { buildlens: { ...await describe(training), expected: trainingSummary }, fielddesk: await describe(fieldDesk) },
    evaluation: { buildlens: evaluation, compiler: previous.compiler_workload }, workloads: {} };
if (recheck) {
    assert.deepEqual(await describe(compilerArg), report.compiler);
    assert.equal((await describe(training)).sha256, report.training.buildlens.sha256);
}
const save = () => fs.writeFile(reportArg, JSON.stringify(report, null, 2) + '\n');
const capture = async (file, run) => {
    await fs.writeFile(file, run.output + '\n' + run.error + '\n');
    return describe(file);
};
async function prepareProfile(item, profile, flags = []) {
    const instrument = await measure(compiler, ['pgo-instrument', target(item.source), '--profile', target(profile), '--json', ...flags]);
    assert.equal(JSON.parse(instrument.output).ok, true);
    const train = await measure(compiler, ['pgo-train', target(profile), '--', ...item.train]);
    item.trainOracle(train.output);
    return { instrument: instrument.metrics, train: train.metrics };
}
async function workflow(item, folder, index) {
    const o2 = path.join(folder, 'o2.exe'), optimized = path.join(folder, 'pgo.exe'), profile = path.join(folder, 'profile');
    await fs.mkdir(folder, { recursive: true });
    const source = target(item.source);
    let baseline;
    const buildDefault = async () => { baseline = await measure(compiler, ['build', source, '-o', target(o2)]); };
    if (index % 2 === 0) await buildDefault();
    const preparation = await prepareProfile(item, profile);
    const use = await measure(compiler, ['build', source, '-o', target(optimized), '--pgo-profile', target(profile)]);
    if (windows) assert.match(use.error, /[1-9]\d* of \d+ functions .*optimized using profile data/);
    if (index % 2 !== 0) await buildDefault();
    const data = path.join(profile, 'trained', windows ? 'program.pgd' : 'program.gcda');
    return { o2, optimized, profile, metrics: { o2: baseline.metrics, ...preparation, use: use.metrics },
    artifacts: { o2: await describe(o2), pgo: await describe(optimized),
        instrumented: await describe(path.join(profile, 'program.exe')), trained: await describe(data),
        plan: await describe(path.join(profile, 'plan')), receipt: await describe(path.join(profile, 'trained', 'receipt')),
        use_log: await capture(path.join(folder, 'use.log'), use) } };
}
async function ltoWorkflow(item, folder, index, trained) {
    await fs.mkdir(folder, { recursive: true });
    const o2 = path.join(folder, 'o2.exe'), optimized = path.join(folder, 'pgo.exe');
    const lto = path.join(folder, 'lto.exe'), combined = path.join(folder, 'pgo-lto.exe');
    const profile = trained?.profile ?? path.join(folder, 'profile');
    const combinedProfile = windows ? profile : (trained?.combined_profile ?? path.join(folder, 'lto-profile'));
    const preparation = trained ? {} : await prepareProfile(item, profile);
    const combinedPreparation = windows || trained ? {} : await prepareProfile(item, combinedProfile, ['--lto']);
    const source = target(item.source);
    const variants = {
        o2: [o2, []], lto: [lto, ['--lto']],
        use: [optimized, ['--pgo-profile', target(profile)]],
        combined: [combined, ['--pgo-profile', target(combinedProfile), '--lto']],
    };
    const order = index % 2 ? ['combined', 'use', 'lto', 'o2'] : ['o2', 'lto', 'use', 'combined'];
    const metrics = { ...preparation };
    if (!windows && !trained) {
        metrics.combined_instrument = combinedPreparation.instrument;
        metrics.combined_train = combinedPreparation.train;
    }
    const logs = {};
    for (const mode of order) {
        const [file, flags] = variants[mode];
        const build = await measure(compiler, ['build', source, '-o', target(file), ...flags]);
        if (windows && (mode === 'use' || mode === 'combined')) {
            assert.match(build.error, /[1-9]\d* of \d+ functions .*optimized using profile data/);
        }
        metrics[mode] = build.metrics;
        logs[mode] = await capture(path.join(folder, mode + '.log'), build);
    }
    const payload = windows ? 'program.pgd' : 'program.gcda';
    const regularPlan = await fs.readFile(path.join(profile, 'plan'), 'utf8');
    const combinedPlan = await fs.readFile(path.join(combinedProfile, 'plan'), 'utf8');
    assert.equal(regularPlan.split('\n')[1], host);
    assert.equal(combinedPlan.split('\n')[1], windows ? 'msvc' : 'gcc-lto');
    assert.equal(regularPlan.split('\n')[4], combinedPlan.split('\n')[4]);
    assert.equal(regularPlan.split('\n')[6] === combinedPlan.split('\n')[6], windows);
    return { o2, optimized, lto, combined, profile, combined_profile: combinedProfile, metrics, logs,
        artifacts: { o2: await describe(o2), pgo: await describe(optimized), lto: await describe(lto),
            pgo_lto: await describe(combined), instrumented: await describe(path.join(profile, 'program.exe')),
            combined_instrumented: await describe(path.join(combinedProfile, 'program.exe')),
            trained: await describe(path.join(profile, 'trained', payload)),
            combined_trained: await describe(path.join(combinedProfile, 'trained', payload)),
            plan: await describe(path.join(profile, 'plan')),
            combined_plan: await describe(path.join(combinedProfile, 'plan')),
        } };
}
async function evaluate(item, variants, rounds = 5) {
    const run = async bin => {
        const result = await measure(target(bin), item.eval);
        item.evalOracle(result.output);
        assert.equal(result.error, '');
        return result.metrics;
    };
    const labels = linkMode ? ['o2', 'lto', 'optimized', 'combined'] : ['o2', 'optimized'];
    for (const label of labels) await run(variants[label]);
    const noise = [], profileNoise = [], pairs = [];
    for (let index = 0; index < rounds; index++) {
        noise.push([await run(variants.o2), await run(variants.o2)]);
        if (linkMode) profileNoise.push([await run(variants.optimized), await run(variants.optimized)]);
        const order = index % 2 ? [...labels].reverse() : labels;
        const pair = {};
        for (const key of order) pair[key] = await run(variants[key]);
        pairs.push(pair);
    }
    const ranges = Object.fromEntries(labels.map(key => [key, stats(pairs.map(row => row[key]))]));
    const noisePercent = median(noise.map(([a, b]) => 200 * Math.abs(a.wall_ms - b.wall_ms) / (a.wall_ms + b.wall_ms)));
    if (linkMode) {
        const sizeGain = 100 * (variants.artifacts.o2.bytes - variants.artifacts.lto.bytes) / variants.artifacts.o2.bytes;
        const gain = 100 * (ranges.o2.wall_ms.median - ranges.lto.wall_ms.median) / ranges.o2.wall_ms.median;
        const combinedSizeGain = 100 * (variants.artifacts.pgo.bytes - variants.artifacts.pgo_lto.bytes) / variants.artifacts.pgo.bytes;
        const combinedGain = 100 * (ranges.optimized.wall_ms.median - ranges.combined.wall_ms.median) / ranges.optimized.wall_ms.median;
        const profileNoisePercent = median(profileNoise.map(([a, b]) => 200 * Math.abs(a.wall_ms - b.wall_ms) / (a.wall_ms + b.wall_ms)));
        return { noise, profile_noise: profileNoise, pairs, ranges, noise_percent: noisePercent,
            improvement_percent: gain, size_reduction_percent: sizeGain, combined_improvement_percent: combinedGain,
            combined_size_reduction_percent: combinedSizeGain, profile_noise_percent: profileNoisePercent,
            target: sizeGain >= 2 || (gain >= 3 && gain > noisePercent) };
    }
    const gain = 100 * (ranges.o2.wall_ms.median - ranges.optimized.wall_ms.median) / ranges.o2.wall_ms.median;
    return { noise, pairs, ranges, noise_percent: noisePercent, improvement_percent: gain,
        target: gain >= 3 && gain > noisePercent };
}
const buildWorkflow = linkMode ? ltoWorkflow : workflow;
if (release) {
    report.scope = 'Release behavior only. Stage 1.3.4k/l measure native mode performance independently.';
    for (const [name, item] of Object.entries(workload)) {
        const first = await ltoWorkflow(item, path.join(work, name), 0);
        for (const file of [first.o2, first.lto, first.optimized, first.combined]) {
            const result = await measure(target(file), item.eval);
            item.evalOracle(result.output);
            assert.equal(result.error, '');
        }
        report.workloads[name] = { first, checked_modes: ['O2', 'LTO', 'PGO', 'PGO+LTO'] };
        console.log(host + ' ' + name + ' release modes passed');
    }
    report.complete = true;
    await save();
    process.exit(0);
}
for (const [name, item] of Object.entries(workload)) {
    if (recheck) {
        const group = report.workloads[name], first = group.first;
        for (const [file, key] of [['o2', 'o2'], ['lto', 'lto'], ['optimized', 'pgo'], ['combined', 'pgo_lto']]) {
            assert.deepEqual(await describe(first[file]), first.artifacts[key]);
        }
        group.initial_runtime = group.runtime;
        group.runtime = await evaluate(item, first, 21);
    } else {
        const first = await buildWorkflow(item, path.join(work, name + '-warm'), 0);
        report.workloads[name] = { first, runtime: await evaluate(item, first) };
    }
    await save();
    const { improvement_percent, noise_percent } = report.workloads[name].runtime;
    console.log(host + ' ' + name + ' held-out gain=' + improvement_percent + '% noise=' + noise_percent + '%');
}
report.primary_target = Object.values(report.workloads).some(row => row.runtime.target);
await save();
assert.equal(report.primary_target, true, 'Neither held-out workload meets the native optimization threshold.');
for (const [name, item] of Object.entries(workload)) {
    const row = report.workloads[name];
    row.build_pairs = [];
    for (let index = 0; index < 5; index++) {
        row.build_pairs.push(await buildWorkflow(item, path.join(work, name + '-round-' + index), index, row.first));
        await save();
        console.log(host + ' ' + name + ' workflow pair ' + (index + 1));
    }
    row.build = Object.fromEntries(Object.keys(row.build_pairs[0].metrics).map(key =>
        [key, stats(row.build_pairs.map(pair => pair.metrics[key]))]));
    if (!linkMode) {
        const saving = row.runtime.ranges.o2.wall_ms.median - row.runtime.ranges.optimized.wall_ms.median;
        const overhead = row.build.instrument.wall_ms.median + row.build.train.wall_ms.median
            + row.build.use.wall_ms.median - row.build.o2.wall_ms.median;
        row.break_even_runs = saving > 0 ? Math.max(0, Math.ceil(overhead / saving)) : null;
    }
}
report.complete = true;
await save();
