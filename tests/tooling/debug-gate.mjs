import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const [compilerArg, baseArg, optimization] = process.argv.slice(2);
assert.ok(compilerArg && baseArg && (optimization === undefined || optimization === '--lto'), 'pass compiler and output directory');
const compiler = path.resolve(compilerArg), base = path.resolve(baseArg);
const lto = optimization === '--lto';
const cc = process.env.VELA_CC || 'cl.exe';
const checks = [];
function run(executable, args = [], options = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  if (result.error) throw result.error;
  return { ...result, stdout: result.stdout.replaceAll('\r\n', '\n'), stderr: result.stderr.replaceAll('\r\n', '\n') };
}
function ok(executable, args) {
  const result = run(executable, args);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
async function build(source, tag, instrumented = true) {
  const c = path.join(base, tag + '.c');
  const exe = path.join(base, tag + '.exe');
  const pdb = path.join(base, tag + '.pdb');
  ok(compiler, ['emit-c', source, ...(instrumented ? ['--debug'] : []), '-o', c]);
  const text = await fs.readFile(c, 'utf8');
  if (instrumented) {
    assert.match(text, /#define VELA_DEBUG_INSTRUMENTED 1/);
    assert.ok(/^#line \d+ ".*\.vela"/m.test(text), 'Vela source line directive');
  } else {
    assert.doesNotMatch(text, /^#define VELA_DEBUG_INSTRUMENTED 1$/m);
  }
  const optimizationFlags = lto ? ['/O2', '/fp:strict', '/GL', '/DVELA_LTO_COMPACT'] : ['/Od'];
  const linkFlags = lto ? ['/LTCG', '/INCREMENTAL:NO'] : [];
  ok(cc, ['/nologo', '/std:c11', '/TC', '/utf-8', '/MT', ...optimizationFlags, '/Z7',
    '/Fo' + path.join(base, tag + '.obj'), '/Fe' + exe, c, '/link', ...linkFlags, '/DEBUG:FULL', '/PDB:' + pdb]);
  assert.ok((await fs.stat(pdb)).size > 0);
  return { exe, pdb };
}
const env = { ...process.env, VELA_TRACE: '1', VELA_PROFILE: '1', VELA_GC_STRESS: '1' };
const frames = stderr => stderr.split('\n').filter(line => line.startsWith('  at '));
function profile(stderr) {
  const line = stderr.split('\n').find(line => line.startsWith('{"vela_profile":1,'));
  assert.ok(line, stderr);
  return JSON.parse(line).functions;
}

const debug = await build('tests/tooling/debug.vela', 'debug');
assert.ok((await fs.readFile(debug.pdb)).includes(Buffer.from('debug.vela')), 'source path in PDB');
const passed = run(debug.exe, [], { env });
assert.equal(passed.status, 0, passed.stderr);
assert.equal(passed.stdout, 'cleanup leaf\ncleanup leaf\ncleanup branch\n');
const counts = profile(passed.stderr);
for (const [name, times] of [['leaf', 2], ['branch', 1], ['main', 1]]) {
  const record = counts.find(row => row.name === name);
  assert.ok(record, JSON.stringify(counts));
  assert.equal(record.calls, times);
  assert.equal(record.completed, times);
  assert.ok(Number.isSafeInteger(record.inclusive_us) && record.inclusive_us >= 0);
}
checks.push('MSVC PDB Vela source path and profiled normal cleanup');

const fatal = run(debug.exe, ['fatal'], { env });
assert.equal(fatal.status, 70, fatal.stderr);
assert.equal(fatal.stdout, '');
assert.match(fatal.stderr, /debug\.vela:2:5: panic: Ошибка Vela/);
assert.equal(frames(fatal.stderr).length, 3);
assert.match(frames(fatal.stderr)[1], /at explode/);
assert.match(frames(fatal.stderr)[2], /at main/);
assert.equal(profile(fatal.stderr).find(row => row.name === 'main').completed, 0);
checks.push('generic panic, source location and nested stack');

const release = await build('tests/tooling/debug.vela', 'regular', false);
const ordinary = run(release.exe, ['fatal'], { env });
assert.equal(ordinary.status, 70);
assert.doesNotMatch(ordinary.stderr, /Vela stack:|vela_profile/);
checks.push('regular C export omits instrumentation');

const tasks = await build('tests/stdlib/tasks.vela', 'tasks-debug');
const completed = run(tasks.exe, [], { env });
assert.equal(completed.status, 0, completed.stderr);
assert.match(completed.stdout, /typed tasks passed/);
assert.ok(profile(completed.stderr).every(row => row.calls === row.completed), completed.stderr);
const fiber = await build('tests/tooling/debug-fiber.vela', 'fiber-debug');
const suspended = run(fiber.exe, [], { env });
assert.equal(suspended.status, 70, suspended.stderr);
assert.match(suspended.stderr, /panic: fiber failure/);
assert.equal(frames(suspended.stderr).length, 3);
assert.match(frames(suspended.stderr)[0], /at suspended/);
assert.match(frames(suspended.stderr)[2], /tasks\.vela/);
assert.ok(frames(suspended.stderr).every(line => !/at main|event_loop\.vela/.test(line)));
checks.push('fiber isolation, cancellation cleanup and frame completion');

ok(cc, ['/nologo', '/std:c11', '/LD', '/MT', '/utf-8', '/Fo' + path.join(base, 'adapter.obj'),
  'tests/ffi/adapter.c', '/link', '/OUT:' + path.join(base, 'fixture.dll'), '/IMPLIB:' + path.join(base, 'fixture.lib')]);
const callback = await build('tests/tooling/debug-callback.vela', 'callback-debug');
const ffi = run(callback.exe, [], { env });
assert.equal(ffi.status, 70, ffi.stderr);
assert.match(ffi.stderr, /panic: callback 42/);
assert.equal(frames(ffi.stderr).length, 2);
assert.match(frames(ffi.stderr)[1], /at main/);
checks.push('panic through a native callback terminates with Vela frames');
console.log(JSON.stringify({ passed: checks.length, checks }));
