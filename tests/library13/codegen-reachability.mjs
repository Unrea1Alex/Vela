import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [compilerArg, outputArg, referenceArg] = process.argv.slice(2);
assert.ok(compilerArg && outputArg && referenceArg, 'pass compiler, output directory and 1.3.4i compiler');
const compiler = path.resolve(compilerArg), out = path.resolve(outputArg), reference = path.resolve(referenceArg);
await fs.mkdir(out, { recursive: true });
const run = (exe, args, code = 0, env = process.env) => {
    const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 120000,
        env });
    if (result.error) throw result.error;
    assert.equal(result.status, code, result.stdout + result.stderr);
    return result.stdout.replaceAll('\r\n', '\n');
};
const emit = async (exe, source, tag, flags = []) => {
    const c = path.join(out, tag + '.c');
    run(exe, ['emit-c', source, '-o', c, ...flags]);
    return fs.readFile(c, 'utf8');
};
const hash = value => createHash('sha256').update(value).digest('hex');
const source = 'tests/cases/v134j_reachability.vela';
const buildlens = 'apps/build-lens/vela.project';
const previous = await emit(reference, source, 'before');
assert.match(previous, /\bv_f_dead_branch\(/);
assert.match(previous, /\bv_e_Dead\b/);
const modes = {};
for (const [mode, flags] of [['default', []], ['bypass', ['--no-ir-simplify']]]) {
    const c = await emit(compiler, source, mode, flags);
    assert.equal(await emit(compiler, source, mode + '-repeat', flags), c);
    assert.doesNotMatch(c, /\bv_(?:f_dead_branch|e_Dead)\b/);
    for (const name of ['first', 'second', 'positive', 'emit_cleanup', 'execute']) {
        assert.match(c, new RegExp('\\bv_f_' + name + '\\('));
    }
    for (const name of ['Live', 'LivePayload']) assert.match(c, new RegExp('\\bv_e_' + name + '\\b'));
    assert.equal([...c.matchAll(/^static void \(\*const v_dynamic_/gm)].length, 1);
    assert.equal([...c.matchAll(/^} v_env_\d+;/gm)].length, 1);
    assert.equal([...c.matchAll(/^static void v_trace_v_env_\d+\(const void \*slot\) \{/gm)].length, 1);
    modes[mode] = hash(c);
}

const invalid = 'tests/cases/v134j_unused_error.vela';
const check = exe => JSON.parse(run(exe, ['check', invalid, '--json'], 1)).diagnostics;
const diagnostics = check(compiler);
assert.deepEqual(diagnostics, check(reference));
assert.equal(diagnostics[0].code, 'E201');
assert.equal(diagnostics[0].span.line, 1);
const native = path.join(out, 'reachable.exe');
run(compiler, ['build', source, '-o', native]);
assert.equal(run(native, [], 0, { ...process.env, VELA_GC_STRESS: '1' }), '5\n1\ncleanup\n');

const { tests, passed, failed } = JSON.parse(run(compiler,
    ['test', 'tests/library13/codegen/reachability-tests.vela', '--json']));
assert.equal(passed, 2);
assert.equal(failed, 0);
const testRoots = tests.map(test => [test.name, test.stdout.replaceAll('\r\n', '\n'), test.stderr, test.exit_code]);
assert.deepEqual(testRoots, [['first root', 'first\n', '', 0], ['second root', 'second\n', '', 0]]);

const count = c => {
    const start = c.indexOf('typedef struct { void (*code)(void); void *environment; } v_callable;');
    assert.ok(start > 0);
    return [...c.slice(start).matchAll(/^static [^\r\n;=]+\([^;\r\n]*\) \{/gm)].length;
};
const baseline = count(await emit(reference, buildlens, 'buildlens-before'));
const candidate = count(await emit(compiler, buildlens, 'buildlens-after'));
assert.equal(baseline, 502);
assert.ok(candidate <= 426, 'BuildLens definitions: ' + candidate);
const evidence = { modes, unreachable_diagnostic: diagnostics[0], test_roots: testRoots,
    live_output: ['5', '1', 'cleanup'], buildlens: { baseline, candidate } };
await fs.writeFile(path.join(out, 'reachability.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ test_roots: testRoots.length, baseline, candidate }));
