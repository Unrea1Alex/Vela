import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [profileFile, compilerArg, output, distro = 'VelaRelease100', bench = 'G:/VelaBench'] = process.argv.slice(2);
assert.ok(profileFile && compilerArg && output, 'pass completed LTO profile, compiler, and output JSON');
const profile = JSON.parse(await fs.readFile(profileFile, 'utf8'));
assert.deepEqual([profile.stage, profile.complete], ['1.3.4l', true]);
const windows = profile.host === 'msvc';
const root = process.cwd();
const work = await fs.mkdtemp(path.join(profile.work, 'split-native-'));
const logs = path.join(work, 'logs');
await fs.mkdir(logs);
const hash = data => createHash('sha256').update(data).digest('hex');
const fileIdentity = async file => {
    const data = await fs.readFile(file);
    return { bytes: data.length, sha256: hash(data) };
};
const wsl = file => {
    const absolute = path.resolve(file).replaceAll('\\', '/');
    return '/mnt/' + absolute[0].toLowerCase() + absolute.slice(2);
};
const target = file => windows ? path.resolve(file) : wsl(file);
const compiler = target(compilerArg);
assert.deepEqual(await fileIdentity(compilerArg), profile.compiler);
const winTools = windows ? path.join(process.env.VCToolsInstallDir, 'bin/Hostx64/x64') : '';
const cl = windows ? path.join(winTools, 'cl.exe') : 'gcc';
const linker = windows ? path.join(winTools, 'link.exe') : 'gcc';
const meter = path.join(profile.work, 'linux-meter');
let winMeasure;
if (windows) ({ measure: winMeasure } = await import(pathToFileURL(path.resolve(bench, 'src/meter.mjs'))));
function call(exe, args, directory = root, vars = {}) {
    const tool = windows ? exe : 'wsl.exe';
    const parameters = windows ? args : ['--distribution', distro, '--cd', wsl(directory), '--exec',
        'env', ...Object.entries(vars).map(([key, value]) => key + '=' + value), exe, ...args];
    const result = spawnSync(tool, parameters, { encoding: 'utf8', windowsHide: true, cwd: directory,
        timeout: 360000, maxBuffer: 8 * 1024 * 1024, env: windows ? { ...process.env, ...vars } : process.env });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout.trim();
}
async function measured(exe, args, directory) {
    let data, stdout, stderr;
    if (windows) {
        data = await winMeasure({ exe, args, cwd: directory, logDir: logs, timeoutMs: 300000 });
        stdout = data.stdout_path;
        stderr = data.stderr_path;
    } else {
        const id = randomUUID();
        stdout = path.join(logs, id + '.out');
        stderr = path.join(logs, id + '.err');
        data = JSON.parse(call(target(meter), ['300000', target(stdout), target(stderr), exe, ...args], directory));
    }
    const streams = (await fs.readFile(stdout, 'utf8')) + (await fs.readFile(stderr, 'utf8'));
    assert.equal(data.exit_code, 0, streams);
    assert.deepEqual([data.timed_out, data.active_processes_after], [false, 0]);
    return { wall_ms: data.wall_ms, cpu_ms: data.cpu_ms, peak_tree_bytes: data.peak_job_commit_bytes ?? data.peak_tree_rss_bytes,
        peak_process_bytes: windows ? data.parent_peak_working_set_bytes : data.peak_process_rss_bytes, streams };
}
const modes = ['o2', 'lto', 'pgo', 'combined'];
const nativeCompiler = windows ? await fileIdentity(cl) : {
    sha256: call('sha256sum', ['/usr/bin/gcc']).split(/\s+/)[0],
    bytes: Number(call('stat', ['-c', '%s', '/usr/bin/gcc'])),
};
const result = { host: profile.host, c_tool: nativeCompiler,
    work, source: 'One separate compile per mode and five isolated linker pairs after warmup.', workloads: {} };
const payload = windows ? 'program.pgd' : 'program.gcda';
const pgoFlags = dir => ['-fprofile-prefix-path=' + target(dir), '-fprofile-use=' + target(dir),
    '-Werror=missing-profile', '-Werror=coverage-mismatch'];
const fixedWindows = ['/nologo', '/TC', '/std:c11', '/utf-8', '/O2', '/fp:strict', '/W3', '/wd4102', '/MT'];
const fixedGcc = ['-O2', '-ffp-contract=off'];
async function prepareC(name, row) {
    const file = path.join(work, name + '.c');
    const project = name === 'compiler' ? 'selfhost/vela.project' : 'apps/build-lens/vela.project';
    call(compiler, ['emit-c', target(project), '-o', target(file)]);
    const [, , , , expected] = (await fs.readFile(path.join(row.profile, 'plan'), 'utf8')).split('\n');
    const digest = await fileIdentity(file);
    assert.equal(digest.sha256, expected);
    return { file, digest };
}
function compileLinkArgs(mode, dir) {
    const usesProfile = mode === 'pgo' || mode === 'combined';
    const lto = mode === 'lto' || mode === 'combined' || (windows && mode === 'pgo');
    if (windows) {
        return {
            compile: [...fixedWindows, ...(lto ? ['/GL'] : []), ...(mode === 'lto' ? ['/DVELA_LTO_COMPACT'] : []),
                '/c', 'program.c', '/Foprogram.obj'],
            link: ['/nologo', '/OUT:program.exe', '/INCREMENTAL:NO', 'program.obj', ...(lto ? ['/LTCG'] : []),
                ...(usesProfile ? ['/USEPROFILE:AGGRESSIVE', '/WX'] : [])],
        };
    }
    const codegen = [...fixedGcc, ...(lto ? ['-flto', '-fuse-linker-plugin'] : []), ...(usesProfile ? pgoFlags(dir) : [])];
    return { compile: ['-std=c11', ...codegen, '-c', 'program.c', '-o', 'program.o'],
        link: [...codegen, 'program.o', '-o', 'program.exe', '-lm'] };
}
async function archiveMode(name, mode, binary, directory) {
    const stage = path.join(directory, 'package');
    await fs.mkdir(stage);
    const executableName = (name === 'compiler' ? 'velac' : 'buildlens') + (windows ? '.exe' : '');
    await fs.copyFile(binary, path.join(stage, executableName));
    await fs.copyFile('LICENSE', path.join(stage, 'LICENSE'));
    const inventory = [executableName, 'LICENSE'];
    if (name === 'compiler') {
        await fs.copyFile('selfhost/compiler.vela', path.join(stage, 'compiler.vela'));
        call(compiler, ['emit-c', target('selfhost/compiler.vela'), '--source-name', 'compiler.vela',
            '-o', target(path.join(stage, 'recovery.c'))]);
        await fs.cp('std', path.join(stage, 'std'), { recursive: true });
        inventory.push('compiler.vela', 'recovery.c', 'std');
    } else {
        for (const file of ['README.md', 'demo.jsonl']) {
            await fs.copyFile(path.join('apps/build-lens', file), path.join(stage, file));
            inventory.push(file);
        }
    }
    const archive = path.join(directory, mode + (windows ? '.zip' : '.tar.gz'));
    call(windows ? 'tar.exe' : 'tar', [windows ? '-acf' : '-czf', target(archive), '-C', target(stage), '.']);
    const extraction = path.join(directory, 'unpacked');
    await fs.mkdir(extraction);
    call(windows ? 'tar.exe' : 'tar', ['-xf', target(archive), '-C', target(extraction)]);
    assert.deepEqual((await fs.readdir(extraction)).sort(), inventory.sort());
    const unpacked = path.join(extraction, executableName);
    assert.deepEqual(await fileIdentity(unpacked), await fileIdentity(binary));
    const vars = windows ? { PATH: 'C:\\Windows\\System32' } : { PATH: '/bin' };
    let validated;
    if (name === 'compiler') {
        assert.match(call(target(unpacked), ['--version'], extraction, vars), /^Vela /);
        const example = path.join(extraction, 'checked-values.vela');
        const source = await fs.readFile('examples/recipes/checked-values.vela', 'utf8');
        await fs.writeFile(example, source.replaceAll('"../../std/', '"std/'));
        assert.equal(JSON.parse(call(target(unpacked), ['check', target(example), '--json'], extraction, vars)).ok, true);
        validated = ['version', 'check using the unpacked standard library'];
    } else {
        const demo = JSON.parse(call(target(unpacked), ['demo.jsonl', '--top', '1'], extraction, vars));
        const expected = JSON.parse(await fs.readFile('docs/acceptance/1.3.4k.json', 'utf8')).tooling_example.summary;
        assert.deepEqual(demo.summary, expected);
        validated = ['bundled demo summary'];
    }
    return { archive: await fileIdentity(archive), inventory, executable: await fileIdentity(unpacked), validated };
}
for (const [name, group] of Object.entries(profile.workloads)) {
    const c = await prepareC(name, group.first);
    const details = {};
    const executables = { o2: group.first.o2, lto: group.first.lto, pgo: group.first.optimized, combined: group.first.combined };
    const archived = { o2: group.first.artifacts.o2, lto: group.first.artifacts.lto,
        pgo: group.first.artifacts.pgo, combined: group.first.artifacts.pgo_lto };
    for (const mode of modes) {
        assert.deepEqual(await fileIdentity(executables[mode]), archived[mode]);
        const dir = path.join(work, name + '-' + mode);
        await fs.mkdir(dir);
        await fs.copyFile(c.file, path.join(dir, 'program.c'));
        const trained = mode === 'pgo' ? group.first.profile : mode === 'combined' ? group.first.combined_profile : '';
        const raw = trained ? await fs.readFile(path.join(trained, 'trained', payload)) : null;
        if (raw) await fs.writeFile(path.join(dir, payload), raw);
        const args = compileLinkArgs(mode, dir);
        details[mode] = { dir, raw, args, compiled: await measured(cl, args.compile, dir) };
    }
    async function link(mode) {
        const { dir, raw, args } = details[mode];
        if (raw) await fs.writeFile(path.join(dir, payload), raw);
        const { streams, ...metrics } = await measured(linker, args.link, dir);
        if (windows && raw) assert.match(streams, /[1-9]\d* of \d+ functions .*optimized using profile data/);
        return metrics;
    }
    for (const mode of modes) await link(mode);
    const samples = [];
    for (let round = 0; round < 5; round++) {
        const pair = {};
        for (const mode of round % 2 === 0 ? modes : [...modes].reverse()) pair[mode] = await link(mode);
        samples.push(pair);
    }
    const variants = {};
    for (const mode of modes) {
        const { dir, args, compiled } = details[mode];
        const measuredSamples = samples.map(row => row[mode]);
        const medians = Object.fromEntries(Object.keys(measuredSamples[0]).map(key =>
            [key, measuredSamples.map(row => row[key]).sort((a, b) => a - b)[2]]));
        variants[mode] = { flags: args, compile: compiled, link: medians,
            delivered: await archiveMode(name, mode, executables[mode], dir) };
    }
    result.workloads[name] = { c: c.digest, samples, variants };
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
    console.log(profile.host, name, 'split link and unpacked delivery verified');
}
result.complete = true;
await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
