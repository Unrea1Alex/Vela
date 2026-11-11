import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [host, compilerArg, outArg, distro = 'VelaRelease100', optimization] = process.argv.slice(2);
assert.ok(['msvc', 'gcc'].includes(host) && compilerArg && outArg && (optimization === undefined || optimization === '--lto'),
    'usage: node pgo-gate.mjs msvc|gcc COMPILER OUT [WSL_DISTRO] [--lto]');
const windows = host === 'msvc';
const lto = optimization === '--lto';
const root = path.resolve(outArg);
await fs.mkdir(root, { recursive: true });
const work = await fs.mkdtemp(path.join(root, 'profile gate '));
const wsl = value => {
    const file = path.resolve(value).replaceAll('\\', '/');
    return '/mnt/' + file[0].toLowerCase() + file.slice(2);
};
const target = value => windows ? path.resolve(value) : wsl(value);
const compiler = target(compilerArg);
const withoutMountWarning = value => value.replaceAll('\r\n', '\n')
    .replace(/^wsl: Failed to mount J:\\, see dmesg for more details\.\n/gm, '');
function command(exe, args, overrides) {
    if (windows) return [exe, args];
    return ['wsl.exe', ['--distribution', distro, '--cd', wsl(process.cwd()), '--exec',
        ...(Object.keys(overrides).length ? ['env', ...Object.entries(overrides).map(([k, v]) => k + '=' + v)] : []),
        exe, ...args]];
}
function run(exe, args, code = 0, overrides = {}) {
    const [tool, options] = command(exe, args, overrides);
    const result = spawnSync(tool, options, { encoding: 'utf8', timeout: 300000,
        windowsHide: true, env: windows ? { ...process.env, ...overrides } : process.env,
        maxBuffer: 4 * 1024 * 1024 });
    if (result.error) throw result.error;
    assert.equal(result.status, code, result.stdout + result.stderr);
    return { stdout: withoutMountWarning(result.stdout), stderr: withoutMountWarning(result.stderr) };
}
const invoke = (args, code, env) => run(compiler, args, code, env);
const hash = data => createHash('sha256').update(data).digest('hex');
const file = name => path.join(work, name);
const checks = [];
const source = `import "word.vela" as word;
fn main() -> Int effects { args, io, process } {
    if arg_count() != 1 { return 7; }
    match arg(0) {
        StringResult::Ok(value) => { print(word::prefix() + value); return 0; }
        StringResult::Err(_) => { return 8; }
    }
}
`;
await fs.writeFile(file('main.vela'), source);
await fs.writeFile(file('word.vela'), 'pub fn prefix() -> String { return "answer: "; }\n');
await fs.writeFile(file('empty.txt'), '');
await fs.writeFile(file('vela.project'), 'vela-project|1\nname|pgo_gate\nentry|main.vela\nresource|assets/empty.txt|empty.txt\n');
const project = target(file('vela.project'));
const profile = file('profile');
const o2 = file('ordinary/program.exe'), pgo = file('delivery/program.exe');
await fs.mkdir(path.dirname(o2));
await fs.mkdir(path.dirname(pgo));
invoke(['lock', project]);
const build = (output, mode = [], code, env) => invoke(['build', project, '-o', target(output), ...mode], code, env);
const ltoFlags = lto ? ['--lto'] : [];
const instrument = (profile, code = 0, env, flags = ltoFlags) =>
    invoke(['pgo-instrument', project, '--profile', target(profile), '--json', ...flags], code, env);
const cache = ['--cache', target(file('cache')), '--cache-report'];
const plainUse = ['--pgo-profile', target(profile), ...cache, '--json'];
const use = [...plainUse, ...ltoFlags];
const train = (...args) => ['pgo-train', target(profile), '--', ...args];
const diagnostic = (report, message, code = 'E243') => {
    const parsed = JSON.parse(report.stdout);
    assert.equal(parsed.diagnostics[0].code, code);
    assert.match(parsed.diagnostics[0].message, message);
};
const expectMissing = async name => assert.rejects(fs.access(name), { code: 'ENOENT' });
build(o2, lto ? cache : []);
assert.equal(run(target(o2), ['контроль']).stdout, 'answer: контроль\n');
checks.push('O2 project output');
const linkOnly = file('lto/program.exe');
if (lto) {
    await fs.mkdir(path.dirname(linkOnly));
    for (const command of ['emit-c', 'run', 'test']) {
        assert.match(invoke([command, project, '--lto'], 2).stderr, /Use --lto once/);
    }
    diagnostic(build(linkOnly, ['--lto', '--json'], 1, { VELA_CC_KIND: 'unsupported' }), /LTO requires/, 'E244');
    await expectMissing(linkOnly);
    assert.match(build(linkOnly, ['--lto', ...cache]).stderr, /"layer":"c-v1","status":"hit"/);
    assert.equal(run(target(linkOnly), ['контроль']).stdout, 'answer: контроль\n');
    assert.equal(run(target(o2), ['контроль']).stdout, 'answer: контроль\n');
    checks.push('LTO CLI boundaries, unsupported tools and shared checked C cache');

    const published = hash(await fs.readFile(linkOnly));
    const overrides = windows
        ? [[{ VCToolsVersion: '14.43.0' }, /MSVC 19\.44\.35222/], [{ CL: '/O1' }, /fixed MSVC flags/]]
        : [[{ VELA_CC: '/unknown/gcc' }, /GCC 14\.2\.0/], [{ GCC_EXEC_PREFIX: '/invalid' }, /fixed GCC environment/]];
    for (const [environment, message] of overrides) {
        const rejected = build(linkOnly, ['--lto', ...cache, '--json'], 1, environment);
        diagnostic(rejected, message, 'E244');
        assert.match(rejected.stderr, /"layer":"c-v1","status":"hit"/);
        assert.equal(hash(await fs.readFile(linkOnly)), published);
    }
    checks.push('C hit revalidates native toolchain and flag overrides before publication');

    const compact = file('compact.vela');
    const compactC = file('compact.c');
    const compactExe = file('compact.exe');
    await fs.writeFile(compact, `fn one() -> Int { return 1; }
fn total() -> Int {
    var sum = 0;
    for i in 0 .. 3 { sum = sum + one(); }
    return sum;
}
fn main() -> Int effects { io } { print(total()); return 0; }
`);
    invoke(['emit-c', target(compact), '-o', target(compactC)]);
    const c = withoutMountWarning(await fs.readFile(compactC, 'utf8'));
    assert.match(c, /\nVELA_LTO_COMPACT_BEGIN\nstatic int64_t v_f_one\([^\n]+\) \{/);
    assert.doesNotMatch(c, /\nVELA_LTO_COMPACT_BEGIN\nstatic int64_t v_f_total\([^\n]+\) \{/);
    invoke(['build', target(compact), '-o', target(compactExe), '--lto']);
    assert.equal(run(target(compactExe), []).stdout, '3\n');
    checks.push('size preference leaves the emitted loop in the normal policy');
}

const unsupported = file('unsupported');
diagnostic(instrument(unsupported, 1, { VELA_CC_KIND: 'unsupported' }), /requires/);
await expectMissing(unsupported);
checks.push('unsupported toolchain rejects without publishing');
const first = instrument(profile);
assert.equal(JSON.parse(first.stdout).ok, true);
diagnostic(instrument(profile, 1), /new directory/);
diagnostic(build(pgo, use, 1), /Cannot read PGO file/);
await expectMissing(pgo);
checks.push('instrument publishes once and untrained use rejects');

const planFile = path.join(profile, 'plan');
const plan = await fs.readFile(planFile, 'utf8');
assert.equal(plan.split('\n')[1], lto && !windows ? 'gcc-lto' : host);
const wrong = plan.split('\n');
wrong[6] = '0'.repeat(64);
await fs.writeFile(planFile, wrong.join('\n'));
assert.match(invoke(train('training'), 1).stderr, /flag fingerprint differs/);
const wrongToolchain = plan.split('\n');
wrongToolchain[5] = '0'.repeat(64);
await fs.writeFile(planFile, wrongToolchain.join('\n'));
assert.match(invoke(train('training'), 1).stderr, /toolchain or flag fingerprint differs/);
await fs.writeFile(planFile, plan);
const companion = path.join(profile, 'assets/empty.txt');
await fs.writeFile(companion, 'changed');
assert.match(invoke(train('training'), 1).stderr, /Changed PGO companion/);
await fs.writeFile(companion, '');
assert.match(invoke(train(), 1).stderr, /training failed with exit 7/);
await expectMissing(path.join(profile, 'trained'));
checks.push('training rejects changed toolchain, flags or companion and publishes nothing on failure');

const concurrentTrain = () => new Promise((resolve, reject) => {
    const [exe, args] = command(compiler, train('training'), {});
    const child = spawn(exe, args, { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
    child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout: withoutMountWarning(stdout), stderr: withoutMountWarning(stderr) }));
});
const outcomes = await Promise.all([concurrentTrain(), concurrentTrain()]);
assert.deepEqual(outcomes.map(row => row.code).sort(), [0, 1]);
assert.equal(outcomes.find(row => row.code === 0).stdout, 'answer: training\n');
assert.match(outcomes.find(row => row.code !== 0).stderr, /training is active|already has an accepted/);
assert.match(invoke(train('again'), 1).stderr, /already has an accepted/);
checks.push('one concurrent trainer publishes and a second training is rejected');

const trained = path.join(profile, 'trained');
const receiptFile = path.join(trained, 'receipt');
const payloadFile = path.join(trained, windows ? 'program.pgd' : 'program.gcda');
const receipt = await fs.readFile(receiptFile, 'utf8');
const payload = await fs.readFile(payloadFile);
assert.deepEqual(receipt.split('\n').slice(0, 3), ['vela-pgo-trained|1', hash(plan), hash(payload)]);
const used = build(pgo, use);
if (windows) assert.match(used.stderr, /[1-9]\d* of \d+ functions .*optimized using profile data/);
assert.match(build(pgo, use).stderr, /"layer":"c-v1","status":"hit"/);
assert.equal(run(target(pgo), ['контроль']).stdout, 'answer: контроль\n');
if (lto && windows) {
    assert.match(build(pgo, plainUse).stderr, /[1-9]\d* of \d+ functions .*optimized using profile data/);
    assert.equal(run(target(pgo), ['контроль']).stdout, 'answer: контроль\n');
    checks.push('MSVC explicit LTO and PGO alone accept the same trained plan');
}
if (lto && !windows) {
    diagnostic(build(pgo, plainUse, 1), /flag fingerprint differs/);
    const plainProfile = file('plain profile');
    instrument(plainProfile, 0, {}, []);
    assert.equal(invoke(['pgo-train', target(plainProfile), '--', 'plain']).stdout, 'answer: plain\n');
    const plainFlags = ['--pgo-profile', target(plainProfile), '--json'];
    diagnostic(build(pgo, [...plainFlags, '--lto'], 1), /flag fingerprint differs/);
    build(file('ordinary/pgo.exe'), plainFlags);
    assert.equal(run(target(file('ordinary/pgo.exe')), ['plain']).stdout, 'answer: plain\n');
    checks.push('GCC rejects cross-mode profiles in both directions and ordinary PGO still runs');
}
const previous = hash(await fs.readFile(pgo));
checks.push('PGO use and warm C cache preserve held-out output');

await fs.appendFile(payloadFile, 'tamper');
diagnostic(build(pgo, use, 1), /digest differs/);
await fs.writeFile(payloadFile, payload);
await fs.writeFile(receiptFile, 'malformed\n');
diagnostic(build(pgo, use, 1), /receipt does not match/);
await fs.writeFile(receiptFile, receipt);
await fs.appendFile(file('word.vela'), '// changed source bytes\n');
diagnostic(build(pgo, use, 1), /stale for this source graph/);
await fs.writeFile(file('word.vela'), 'pub fn prefix() -> String { return "answer: "; }\n');
await fs.writeFile(file('empty.txt'), 'new locked resource');
invoke(['lock', project]);
diagnostic(build(pgo, use, 1), /stale for this source graph/);
assert.equal(hash(await fs.readFile(pgo)), previous);
checks.push('changed payload, receipt, import and locked resource reject with old output intact');

await fs.rename(profile, file('profile sealed elsewhere'));
assert.deepEqual((await fs.readdir(path.dirname(pgo))).sort(), ['assets', 'program.exe']);
const cleanPath = windows ? { PATH: 'C:\\Windows\\System32' } : { PATH: '/bin' };
assert.equal(run(target(pgo), ['portable'], 0, cleanPath).stdout, 'answer: portable\n');
assert.equal((await fs.stat(path.join(path.dirname(pgo), 'assets/empty.txt'))).size, 0);
if (lto) {
    assert.deepEqual((await fs.readdir(path.dirname(linkOnly))).sort(), ['assets', 'program.exe']);
    assert.equal(run(target(linkOnly), ['portable'], 0, cleanPath).stdout, 'answer: portable\n');
}
checks.push('delivered executable and resource work without the profile or tools');
await fs.writeFile(path.join(root, 'focused.json'), JSON.stringify({ host, lto, checks, payload_bytes: payload.length,
    plan_sha256: hash(plan), trained_sha256: hash(payload), packaged_executable_sha256: previous }, null, 2) + '\n');
console.log(JSON.stringify({ host, checks: checks.length }));
