import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const compiler = path.join(root, 'bin/velac.exe');
const work = await fs.mkdtemp(path.join(root, 'build/stage13/functions-'));
const output = path.resolve(process.argv[2] ?? path.join(root, 'build/stage13/function-profile.json'));
const typedOnly = process.argv[3] === '--json-typed-only';
const cc = process.env.VELA_CC;
assert.ok(cc && process.env.VELA_CC_KIND === 'msvc', 'Use the VS x64 developer environment');
const profile = { schema_version: 1, instrumentation: 'Vela debug per-function counters and native GC report', workloads: [] };

function call(exe, args, env = process.env) {
    const p = spawnSync(exe, args, { cwd: work, windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', env });
    assert.equal(p.status, 0, `${exe}: ${p.error ?? ''}\n${p.stdout}\n${p.stderr}`);
    return p;
}
function build(name, input) {
    const c = path.join(work, name + '.c'), exe = path.join(work, name + '.exe');
    call(compiler, ['emit-c', input, '--debug', '-o', c]);
    call(cc, ['/nologo', '/std:c11', '/utf-8', '/MT', '/O2', `/Fo${exe}.obj`, `/Fe${exe}`, c]);
    return exe;
}
async function observe(exe, label, args, expected) {
    const p = call(exe, args, { ...process.env, VELA_PROFILE: '1', VELA_GC_REPORT: '1', VELA_TRACE: '0', VELA_GC_STRESS: '0' });
    expected(p.stdout);
    const functions = JSON.parse(p.stderr.split(/\r?\n/).find(line => line.startsWith('{"vela_profile":'))).functions;
    const gc = /vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)/.exec(p.stderr);
    assert.ok(gc && functions.length, p.stderr);
    assert.ok(functions.every(f => f.calls === f.completed), `${label}: unbalanced profile frames`);
    await fs.writeFile(path.join(work, label + '.stderr'), p.stderr);
    const ordered = functions.map(f => ({ ...f, file: path.relative(root, f.file).replaceAll('\\', '/') }))
        .sort((a, b) => b.inclusive_us - a.inclusive_us);
    const counters = ordered.filter(f => /(?:^|::)(invalid_offset|from_value|checked|slice|parent)$/.test(f.name));
    profile.workloads.push({ label, functions: functions.length, top_inclusive: ordered.slice(0, 12), validation_counters: counters,
        gc: { collections: +gc[1], peak_managed_bytes: +gc[2], before_teardown_bytes: +gc[3] } });
    await fs.writeFile(output, JSON.stringify(profile, null, 2) + '\n');
    console.log(`${label}: ${functions.length} instrumented functions`);
}

const exe = build('probe', path.join(root, 'tests/library13/profile.vela'));
const json = path.join(work, 'medium.json'), text = path.join(work, 'medium.txt');
await fs.writeFile(json, JSON.stringify(Object.fromEntries(Array.from({ length: 63 }, (_, n) => [`key${n}`, `value-${n}-я`]).concat([['target', 7]]))));
await fs.writeFile(text, '/папка/' + 'a'.repeat(1024));
for (const [mode, input, rounds, expected] of [
    ['config', json, '2000', '14000'], ['text', text, '2000', '2000'], ['path', text, '2000', '2000'],
    ['json-tree', json, '300', '300'], ['json-stream', json, '300', '300'], ['json-typed', json, '300', '2100'],
]) {
    if (typedOnly && mode !== 'json-typed') continue;
    await observe(exe, mode, [mode, input, rounds], stdout => assert.equal(stdout.trim(), expected));
}
if (!typedOnly) {
    const compilerExe = build('compiler', path.join(root, 'selfhost/vela.project'));
    await observe(compilerExe, 'compiler-check', ['check', path.join(root, 'selfhost/vela.project'), '--json'],
        stdout => assert.equal(JSON.parse(stdout).ok, true));
}
profile.completed = true;
await fs.writeFile(output, JSON.stringify(profile, null, 2) + '\n');
