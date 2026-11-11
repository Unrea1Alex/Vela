import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [profileArg, outArg, distro = 'VelaRelease100', resume] = process.argv.slice(2);
assert.ok(profileArg && outArg && (resume === undefined || resume === '--resume'),
    'usage: node pgo-compiler-gate.mjs PERFORMANCE_JSON OUT [WSL_DISTRO] [--resume]');
const profile = JSON.parse(await fs.readFile(profileArg, 'utf8'));
assert.equal(profile.complete, true);
const windows = profile.host === 'msvc';
const linkMode = profile.stage === '1.3.4l' || profile.stage === '1.3.6';
const root = process.cwd();
const out = path.resolve(outArg);
await fs.mkdir(out, { recursive: true });
const wsl = value => {
    const file = path.resolve(value).replaceAll('\\', '/');
    return '/mnt/' + file[0].toLowerCase() + file.slice(2);
};
const target = file => windows ? path.resolve(file) : wsl(file);
const normalize = value => value.replaceAll('\r\n', '\n').replace(/^wsl: Failed to mount J:\\, see dmesg for more details\.\n/gm, '');
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
function run(exe, args, vars = {}, timeout = 240000) {
    const overrides = Object.entries(vars).map(([name, value]) => name + '=' + value);
    const command = windows ? exe : 'wsl.exe';
    const parameters = windows ? args : ['--distribution', distro, '--cd', wsl(root), '--exec',
        'env', 'VELA_CC=gcc', 'VELA_CC_KIND=cc', ...overrides, exe, ...args];
    const result = spawnSync(command, parameters, { cwd: root, encoding: 'utf8', timeout,
        windowsHide: true, env: windows ? { ...process.env, ...vars } : process.env, maxBuffer: 8 * 1024 * 1024 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, exe + ' ' + args.join(' ') + '\n' + result.stdout + result.stderr);
    return { stdout: normalize(result.stdout), stderr: normalize(result.stderr) };
}
const compiler = profile.workloads.compiler.first;
assert.equal(await hash(compiler.o2), compiler.artifacts.o2.sha256);
assert.equal(await hash(compiler.optimized), compiler.artifacts.pgo.sha256);
assert.equal(await hash(path.join(compiler.profile, 'program.exe')), compiler.artifacts.instrumented.sha256);
if (linkMode) {
    assert.equal(await hash(compiler.lto), compiler.artifacts.lto.sha256);
    assert.equal(await hash(compiler.combined), compiler.artifacts.pgo_lto.sha256);
    assert.equal(await hash(path.join(compiler.combined_profile, 'program.exe')), compiler.artifacts.combined_instrumented.sha256);
}
const authored = target('selfhost/vela.project');
const bundle = target('selfhost/compiler.vela');
const referenceC = path.join(out, 'o2-authored.c');
const referenceBundle = path.join(out, 'o2-autonomous.c');
const o2 = target(compiler.o2);
run(o2, ['emit-c', authored, '-o', target(referenceC)]);
run(o2, ['emit-c', bundle, '--source-name', 'compiler.vela', '-o', target(referenceBundle)]);
const expected = { authored: await hash(referenceC), bundle: await hash(referenceBundle),
    bundler: await hash('selfhost/compiler.vela') };

async function instrumented(exe, args) {
    const scratch = await fs.mkdtemp(path.join(out, 'counter-'));
    const variables = windows ? { VCPROFILE_PATH: target(scratch) } : { VELA_PGO_COUNTER_DIR: target(scratch),
        GCOV_PREFIX: '', GCOV_PREFIX_STRIP: '0' };
    try {
        const result = run(exe, args, variables);
        assert.ok((await fs.readdir(scratch)).some(name => windows ? /^program!\d+\.pgc$/i.test(name) : name === 'program.gcda'));
        return result;
    } finally {
        for (const file of await fs.readdir(scratch)) {
            if (/^program!\d+\.pgc$/i.test(file) || file === 'program.gcda') await fs.unlink(path.join(scratch, file));
        }
        await fs.rmdir(scratch);
    }
}
const outcome = {};
const modes = linkMode ? {
    lto: { executable: compiler.lto, flags: ['--lto'] },
    'combined-instrument': { executable: path.join(compiler.combined_profile, 'program.exe'), instrumented: true, flags: ['--lto'] },
    combined: { executable: compiler.combined, flags: ['--pgo-profile', target(compiler.combined_profile), '--lto'] },
} : {
    instrument: { executable: path.join(compiler.profile, 'program.exe'), instrumented: true, flags: [] },
    use: { executable: compiler.optimized, flags: ['--pgo-profile', target(compiler.profile)] },
};
for (const [mode, configuration] of Object.entries(modes)) {
    const directory = path.join(out, mode);
    const exe = target(configuration.executable);
    const invoke = (program, args) => configuration.instrumented ? instrumented(program, args) : run(program, args);
    const generated = path.join(directory, 'autonomous.c');
    const stage1 = path.join(directory, 'stage1.c');
    const stage2 = path.join(directory, 'stage2.c');
    const bundler = path.join(directory, 'bundle.exe');
    const rebundled = path.join(directory, 'rebundled.vela');
    const recovery = path.join(directory, 'recovery.exe');
    const reemitted = path.join(directory, 'recovery-reemitted.c');
    const checks = [[generated, expected.bundle], [stage1, expected.authored], [stage2, expected.authored],
        [rebundled, expected.bundler], [reemitted, expected.bundle]];
    const hashesMatch = async () => Promise.all(checks.map(async ([file, expectedHash]) =>
        await hash(file).catch(() => '') === expectedHash));
    const resumed = resume === '--resume' && (await hashesMatch()).every(Boolean);
    if (!resumed) {
        await fs.mkdir(directory);
        await invoke(exe, ['emit-c', bundle, '--source-name', 'compiler.vela', '-o', target(generated)]);
        await invoke(exe, ['emit-c', authored, '-o', target(stage1)]);
        let next = path.join(directory, 'stage2.exe');
        if (configuration.instrumented) {
            const nextProfile = path.join(directory, 'stage2-profile');
            await invoke(exe, ['pgo-instrument', authored, '--profile', target(nextProfile), ...configuration.flags]);
            next = path.join(nextProfile, 'program.exe');
        } else {
            await invoke(exe, ['build', authored, '-o', target(next), ...configuration.flags]);
        }
        await invoke(target(next), ['emit-c', authored, '-o', target(stage2)]);
        const nativeFlags = mode === 'lto' ? ['--lto'] : [];
        await invoke(exe, ['build', target('tools/bundle.vela'), '-o', target(bundler), ...nativeFlags]);
        const bundleInputs = path.join(directory, 'bundle-inputs');
        await fs.mkdir(path.join(bundleInputs, 'vela/backends'), { recursive: true });
        await fs.cp('selfhost', path.join(bundleInputs, 'selfhost'), { recursive: true });
        await fs.copyFile('vela/builtins.def', path.join(bundleInputs, 'vela/builtins.def'));
        await fs.copyFile('vela/backends/runtime.h', path.join(bundleInputs, 'vela/backends/runtime.h'));
        run(target(bundler), [target(bundleInputs), target(rebundled)]);
        if (windows) {
            run(process.env.VELA_CC || 'cl.exe', ['/nologo', '/TC', '/std:c11', '/utf-8', '/O2', '/fp:strict', '/MT',
                '/Fo:' + target(path.join(directory, 'recovery.obj')), '/Fe:' + target(recovery), target(generated)]);
        } else {
            run('gcc', ['-std=c11', '-O2', '-ffp-contract=off', target(generated), '-lm', '-o', target(recovery)]);
        }
        run(target(recovery), ['emit-c', bundle, '--source-name', 'compiler.vela', '-o', target(reemitted)]);
    }
    for (const [file, expectedHash] of checks) assert.equal(await hash(file), expectedHash, file);
    const fixtures = [];
    for (const name of ['v134j_reachability', 'v134i_ranges', 'v134d_lowering']) {
        const file = 'tests/cases/' + name;
        const executable = path.join(directory, name + '.exe');
        await invoke(exe, ['build', target(file + '.vela'), '-o', target(executable), ...(mode === 'lto' ? ['--lto'] : [])]);
        const actual = run(target(executable), [], { VELA_GC_STRESS: '1' });
        assert.equal(actual.stdout, normalize(await fs.readFile(file + '.out', 'utf8')));
        assert.equal(actual.stderr, '');
        fixtures.push(name);
    }
    outcome[mode] = { first_sha256: await hash(stage1), second_sha256: await hash(stage2),
        bundler_sha256: await hash(rebundled), recovery_sha256: await hash(reemitted), resumed, fixtures };
    console.log(profile.host + ' ' + mode + ' compiler and fixed points passed');
}

let ffi = { supported: false };
if (windows) {
    const directory = path.join(out, 'ffi');
    const delivery = path.join(directory, 'delivery');
    await fs.mkdir(delivery, { recursive: true });
    await fs.copyFile('tests/ffi/callbacks.vela', path.join(directory, 'callbacks.vela'));
    const manifest = path.join(directory, 'vela.project');
    await fs.writeFile(manifest, 'vela-project|1\nname|pgo_callbacks\nentry|callbacks.vela\n'
        + 'native|fixture.dll|fixture.dll|windows-x64|1|shared\n');
    const fixture = path.join(directory, 'fixture.dll');
    run(process.env.VELA_CC || 'cl.exe', ['/nologo', '/LD', '/std:c11', '/utf-8', '/O2', '/MT',
        '/Fo:' + target(path.join(directory, 'fixture.obj')), target('tests/ffi/adapter.c'),
        '/link', '/OUT:' + target(fixture), '/IMPLIB:' + target(path.join(directory, 'fixture.lib'))]);
    run(o2, ['lock', target(manifest)]);
    const trained = target(path.join(directory, 'profile'));
    const linkFlags = linkMode ? ['--lto'] : [];
    run(o2, ['pgo-instrument', target(manifest), '--profile', trained, ...linkFlags]);
    assert.equal(run(o2, ['pgo-train', trained]).stdout, 'callbacks passed\n');
    const executable = path.join(delivery, 'callbacks.exe');
    run(o2, ['build', target(manifest), '-o', target(executable), '--pgo-profile', trained, ...linkFlags]);
    assert.deepEqual((await fs.readdir(delivery)).sort(), ['callbacks.exe', 'fixture.dll']);
    assert.equal(await hash(path.join(delivery, 'fixture.dll')), await hash(fixture));
    assert.equal(run(target(executable), [], { VELA_GC_STRESS: '1', PATH: 'C:\\Windows\\System32' }).stdout, 'callbacks passed\n');
    ffi = { supported: true, stdout: 'callbacks passed', executable_sha256: await hash(executable),
        companion_sha256: await hash(fixture), gc_stress: true };
    if (linkMode) {
        const standalone = path.join(delivery, 'callbacks-lto.exe');
        run(o2, ['build', target(manifest), '-o', target(standalone), '--lto']);
        assert.equal(run(target(standalone), [], { VELA_GC_STRESS: '1', PATH: 'C:\\Windows\\System32' }).stdout, 'callbacks passed\n');
        ffi.lto_sha256 = await hash(standalone);
    }
    console.log('msvc profile-use callback and packaged DLL passed');
}
await fs.writeFile(path.join(out, 'compiler-gate.json'), JSON.stringify({ host: profile.host, expected, outcome, ffi }, null, 2) + '\n');
