import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [compilerArg, outputArg, distro = 'VelaRelease100', optimization] = process.argv.slice(2);
assert.ok(compilerArg && outputArg && (optimization === undefined || optimization === '--lto'),
    'usage: node codegen-ir-oracle.mjs COMPILER OUT [WSL_DISTRO] [--lto]');
const lto = optimization === '--lto';
const gccLto = lto ? ['-flto', '-fuse-linker-plugin'] : [];
const compiler = path.resolve(compilerArg), out = path.resolve(outputArg);
await fs.mkdir(out, { recursive: true });
const wsl = value => {
    const absolute = path.resolve(value).replaceAll('\\', '/');
    return '/mnt/' + absolute[0].toLowerCase() + absolute.slice(2);
};
const normalized = value => value.replaceAll('\r\n', '\n');
const run = (exe, args, options = {}) => {
    const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, ...options });
    if (result.error) throw result.error;
    return { code: result.status, stdout: normalized(result.stdout), stderr: normalized(result.stderr) };
};
const linux = (exe, args) => run('wsl.exe', ['--distribution', distro, '--cd', wsl(process.cwd()), '--exec', exe, ...args]);
const ok = (result, tag) => assert.equal(result.code, 0, tag + '\n' + result.stdout + result.stderr);
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const panicCases = [
    ['overflow', 'integer overflow in addition'],
    ['overflow_2', 'integer overflow in addition'],
    ['overflow_3', 'integer overflow in subtraction'],
    ['overflow_4', 'integer overflow in subtraction'],
    ['overflow_5', 'integer overflow in multiplication'],
    ['overflow_6', 'integer overflow in multiplication'],
    ['overflow_7', 'integer overflow in multiplication'],
    ['overflow_8', 'integer overflow in negation'],
    ['overflow_9', 'integer overflow in division'],
    ['overflow_10', 'division by zero'],
    ['overflow_11', 'remainder by zero'],
];
const cases = panicCases.map(([name, message]) => ({ name, code: 70, stdout: '',
    stderr: name + '.vela:1:42: runtime error: ' + message + '\n' }));
cases.push({ name: 'v134i_range_trap', code: 70, stdout: '',
    stderr: 'v134i_range_trap.vela:3:15: runtime error: integer overflow in multiplication\n' });
for (const [name, text] of [['precondition', 'precondition failed: n > 0'],
    ['postcondition', 'postcondition failed: result > 0']]) {
    cases.push({ name, code: 70, stdout: '', diagnostic: text });
}
for (const name of ['v134j_reachability', 'v134i_ranges', 'v134h_ir', 'v134d_lowering', 'v07_float', 'v08_defer', 'v103_methods', 'v105_callables']) {
    cases.push({ name, code: 0, stdout: normalized(await fs.readFile('tests/cases/' + name + '.out', 'utf8')), stderr: '' });
}
const evidence = [];
for (const test of cases) {
    const outcomes = {};
    for (const mode of ['default', 'bypass']) {
        const prefix = path.join(out, test.name + '-' + mode);
        const c = prefix + '.c';
        ok(run(compiler, ['emit-c', 'tests/cases/' + test.name + '.vela', '--source-name',
            test.name + '.vela', '-o', c, ...(mode === 'bypass' ? ['--no-ir-simplify'] : [])]), test.name);
        const win = prefix + '.exe', posix = prefix + '-linux';
        ok(run(process.env.VELA_CC || 'cl.exe',
            ['/nologo', '/TC', '/std:c11', '/utf-8', '/O2', '/fp:strict', '/MT',
                ...(lto ? ['/GL', '/DVELA_LTO_COMPACT'] : []),
                '/Fo' + prefix + '.obj', '/Fe' + win, c, ...(lto ? ['/link', '/LTCG', '/INCREMENTAL:NO'] : [])]), 'MSVC ' + test.name);
        ok(linux('gcc', ['-std=c11', '-O2', '-ffp-contract=off', ...gccLto, '-fsanitize=undefined,float-cast-overflow',
            '-fsanitize-undefined-trap-on-error', wsl(c), '-lm', '-o', wsl(posix)]), 'GCC ' + test.name);
        const reports = { msvc: run(win, []), gcc: linux(wsl(posix), []) };
        reports.gcc.stderr = reports.gcc.stderr.replace(/^wsl: Failed to mount J:\\, see dmesg for more details\.\n/m, '');
        for (const [host, actual] of Object.entries(reports)) {
            assert.equal(actual.code, test.code, host + ' ' + test.name + ' ' + actual.stderr);
            assert.equal(actual.stdout, test.stdout);
            if (test.stderr !== undefined) assert.equal(actual.stderr, test.stderr);
            if (test.diagnostic) assert.ok(actual.stderr.includes(test.diagnostic));
            if (mode === 'default') outcomes[host] = actual;
            else assert.deepEqual(actual, outcomes[host], host + ' ' + test.name + ' bypass parity');
        }
        evidence.push({ case: test.name, mode, c_sha256: await hash(c), outcome: reports });
    }
    console.log('pass ' + test.name);
}
let debug;
if (lto) {
    const c = path.join(out, 'debug-lto.c');
    const exe = path.join(out, 'debug-lto-linux');
    ok(run(compiler, ['emit-c', 'tests/tooling/debug.vela', '--debug', '--source-name', 'debug.vela', '-o', c]), 'debug C');
    assert.match(await fs.readFile(c, 'utf8'), /^#line \d+ "debug\.vela"/m);
    ok(linux('gcc', ['-std=c11', '-O2', '-ffp-contract=off', '-g', ...gccLto, wsl(c), '-lm', '-o', wsl(exe)]), 'GCC debug LTO');
    const fatal = linux('env', ['VELA_TRACE=1', 'VELA_PROFILE=1', wsl(exe), 'fatal']);
    assert.equal(fatal.code, 70, fatal.stderr);
    assert.equal(fatal.stdout, '');
    assert.match(fatal.stderr, /debug\.vela:2:5: panic: Ошибка Vela/);
    assert.match(fatal.stderr, /at explode/);
    assert.match(fatal.stderr, /at main/);
    assert.match(fatal.stderr, /"vela_profile":1/);
    debug = { exit: fatal.code, location: 'debug.vela:2:5', trace: true, profile: true };
}
await fs.writeFile(path.join(out, 'ir-oracle.json'), JSON.stringify({ cases: cases.length,
    modes: 2, hosts: 2, lto, debug, evidence }, null, 2) + '\n');
