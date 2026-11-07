import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [compiler, work] = process.argv.slice(2).map(value => path.resolve(value));
assert.ok(compiler && work, 'pass compiler and test output directory');
const base = await fs.mkdtemp(path.join(work, 'resource-gate-'));
const project = path.join(base, 'project');
const manifest = path.join(project, 'vela.project');
const sourceName = 'Данные 🌲.bin';
const source = path.join(project, sourceName);
const output = path.join(base, 'output');
const exe = path.join(output, 'probe.exe');
const outputResource = path.join(output, 'assets/tables/check.bin');
const bytes = Buffer.from([86, 101, 108, 97, 0, 255]);
const digest = data => createHash('sha256').update(data).digest('hex');
const header = 'vela-project|1\nname|resource_gate\nentry|probe.vela\ntest|probe.vela\n';
const record = 'resource|assets/tables/check.bin|' + sourceName + '\n';
const checks = [];
function call(program, args, code, pattern, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, code, result.stdout + result.stderr);
  if (pattern) assert.match(result.stdout + result.stderr, pattern);
  return result.stdout;
}
const run = (args, code = 0, pattern) => call(compiler, args, code, pattern);
const set = (records) => fs.writeFile(manifest, header + records);
await fs.mkdir(path.join(project, 'stdlib'), { recursive: true });
await fs.mkdir(output);
await fs.copyFile('tests/tooling/resource-probe.vela', path.join(project, 'probe.vela'));
await fs.copyFile('std/path.vela', path.join(project, 'stdlib/path.vela'));
await fs.copyFile('std/text.vela', path.join(project, 'stdlib/text.vela'));
await fs.writeFile(source, bytes);
await set(record);
run(['lock', manifest]);
assert.match(await fs.readFile(manifest + '.lock', 'utf8'), new RegExp('resource\\|assets/tables/check.bin\\|.*\\|' + digest(bytes)));
run(['build', manifest, '-o', exe]);
run(['build', manifest, '-o', exe]);
assert.deepEqual(await fs.readFile(outputResource), bytes);
checks.push('locked resource and identical existing destination');

const relocated = path.join(base, 'Перенос 🌲 с пробелами');
await fs.cp(output, relocated, { recursive: true });
const moved = path.join(relocated, 'probe.exe');
const system = process.env.SystemRoot;
const env = process.platform === 'win32' ? { SystemRoot: system, Path: system + '\\System32' } : { PATH: '/usr/bin:/bin' };
const result = call(moved, [], 0, null, { cwd: base, env }).trim().split(/\r?\n/);
assert.equal(path.normalize(result[0]), path.normalize(moved));
assert.equal(result[1], digest(bytes));
checks.push('Unicode relocation independent of cwd and PATH');

const tests = JSON.parse(run(['test', manifest, '--json']).trim().split(/\r?\n/).at(-1));
assert.equal(tests.passed, 1);
assert.equal(tests.tests[0].artifact_dir, '');
run(['run', manifest], 0, new RegExp(digest(bytes)));
checks.push('run and test stage and clean private resources');

const originalExe = digest(await fs.readFile(exe));
await fs.writeFile(outputResource, 'existing resource');
run(['build', manifest, '-o', exe], 2, /Conflicting artifact output/);
assert.equal(digest(await fs.readFile(exe)), originalExe);
assert.equal(await fs.readFile(outputResource, 'utf8'), 'existing resource');
checks.push('different destination preserves executable and resource');

await fs.writeFile(source, 'modified input');
run(['check', manifest, '--json'], 1, /E226/);
await fs.writeFile(source, bytes);
run(['check', manifest]);
run(['build', manifest, '-o', source], 2, /must not overwrite project metadata/);
assert.deepEqual(await fs.readFile(source), bytes);
checks.push('stale hash rejection and input protection');

for (const [name, records, error] of [
  ['missing', 'resource|assets/lost|missing.bin\n', /E225/],
  ['source traversal', 'resource|assets/x|../outside.bin\n', /relative to the project/],
  ['destination traversal', 'resource|assets/../escape|' + sourceName + '\n', /Invalid resource destination/],
  ['device name', 'resource|assets/COM1.txt|' + sourceName + '\n', /Invalid resource destination/],
  ['case collision', record + 'resource|assets/tables/CHECK.bin|' + sourceName + '\n', /Colliding resource destinations/],
  ['prefix collision', record + 'resource|assets/tables|' + sourceName + '\n', /Colliding resource destinations/],
  ['native target', 'native|x.dll|' + sourceName + '|linux-x64|1|shared\n', /Unsupported native target/],
  ['native ABI', 'native|x.dll|' + sourceName + '|windows-x64|2|shared\n', /Unsupported native target/],
  ['native kind', 'native|x.dll|' + sourceName + '|windows-x64|1|static\n', /Unsupported native target/],
  ['native PE', 'native|x.dll|' + sourceName + '|windows-x64|1|shared\n', /Expected a Windows x64 PE DLL/],
]) {
  if (process.platform !== 'win32' && name === 'native PE') continue;
  await set(records);
  run(['lock', manifest, '--json'], 1, error);
  checks.push(name);
}

const outside = path.join(base, 'outside');
await fs.mkdir(outside);
await fs.writeFile(path.join(outside, sourceName), bytes);
await fs.symlink(outside, path.join(project, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
await set('resource|assets/check.bin|alias/' + sourceName + '\n');
run(['lock', manifest], 1, /escapes the project directory/);
await set(record);
run(['lock', manifest]);
const aliasOutput = path.join(base, 'aliased-output');
await fs.mkdir(aliasOutput);
await fs.symlink(outside, path.join(aliasOutput, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
run(['build', manifest, '-o', path.join(aliasOutput, 'probe.exe')], 2, /Artifact destination is an alias/);
assert.deepEqual(await fs.readdir(outside), [sourceName]);
checks.push('source and destination link escape rejection');
console.log(JSON.stringify({ passed: checks.length, checks, base }));
