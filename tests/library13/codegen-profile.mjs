import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { allocationCounters, readCounters, swap } from './codegen-counters.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [host, outputArg, referenceArg, candidateArg, distro = 'VelaRelease100', benchArg = 'G:/VelaBench'] = process.argv.slice(2);
assert.ok(['msvc', 'gcc'].includes(host) && outputArg && referenceArg && candidateArg,
    'usage: node codegen-profile.mjs msvc|gcc OUTPUT REFERENCE CANDIDATE [WSL_DISTRO] [VELABENCH]');
const windows = host === 'msvc';
assert.equal(process.platform, 'win32', 'The benchmark controller runs on Windows and uses WSL for GCC.');
const output = path.resolve(outputArg);
const bench = path.resolve(benchArg);
const stageRoot = path.join(root, 'build/stage13');
await fs.mkdir(stageRoot, { recursive: true });
const work = await fs.mkdtemp(path.join(stageRoot, 'codegen-profile-'));
const logs = path.join(work, 'logs');
await fs.mkdir(logs);
const variants = [
    { label: 'reference', compiler: path.resolve(referenceArg), dir: path.join(work, 'reference') },
    { label: 'candidate', compiler: path.resolve(candidateArg), dir: path.join(work, 'candidate') },
];
const referenceOnly = variants[0].compiler === variants[1].compiler;
const meter = path.join(work, 'linux-meter');
const exts = windows ? '.exe' : '';
const report = { schema_version: 1, host, paired_same_compiler: referenceOnly, work, workloads: [], builds: [] };
const envKeys = ['VELA_TRACE', 'VELA_PROFILE', 'VELA_GC_STRESS', 'VELA_GC_REPORT'];
for (const key of envKeys) delete process.env[key];
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const describe = async file => ({ bytes: (await fs.stat(file)).size, sha256: await hash(file) });
const save = async () => fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
const wslPath = value => {
    const absolute = path.resolve(value).replaceAll('\\', '/');
    assert.match(absolute, /^[A-Z]:\//i);
    return '/mnt/' + absolute[0].toLowerCase() + absolute.slice(2);
};
const target = value => windows ? path.resolve(value) : wslPath(value);
const baseArgs = ['--distribution', distro, '--cd', wslPath(root), '--exec'];
const environment = windows ? [] : ['env', 'VELA_CC=gcc', 'VELA_CC_KIND=cc'];
function call(exe, args, options = {}) {
    const p = spawnSync(exe, args, { cwd: root, windowsHide: true, encoding: 'utf8',
        timeout: 240000, maxBuffer: 8 * 1024 * 1024, ...options });
    if (p.error) throw p.error;
    return p;
}
function platform(exe, args, env = []) {
    return windows ? call(exe, args) : call('wsl.exe', [...baseArgs, ...environment, ...env, exe, ...args]);
}
function ok(exe, args) {
    const p = platform(exe, args);
    assert.equal(p.status, 0, exe + ' ' + args.join(' ') + '\n' + p.stdout + p.stderr);
    return p.stdout.trim();
}
let winMeasure;
if (windows) {
    process.env.VELA_CC = process.env.VELA_CC || 'cl.exe';
    process.env.VELA_CC_KIND = 'msvc';
    ({ measure: winMeasure } = await import(pathToFileURL(path.join(bench, 'src/meter.mjs'))));
    const p = call(process.env.VELA_CC, ['/Bv']);
    report.toolchain = (p.stdout + p.stderr).trim().split(/\r?\n/)[0];
    assert.match(report.toolchain, /19\.44\.35222/);
    report.meter = { source: await describe(path.join(bench, 'src/ProcessMeter.cs')), exe: await describe(path.join(bench, 'src/meter.exe')) };
} else {
    report.toolchain = ok('gcc', ['--version']).split('\n')[0];
    assert.match(report.toolchain, /14\.2\.0/);
    report.kernel = ok('uname', ['-r']);
    const src = path.join(root, 'tests/library13/codegen/linux-meter.c');
    ok('gcc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2', target(src), '-o', target(meter)]);
    report.meter = { source: await describe(src), exe: await describe(meter), rss_interval_ms: 5 };
}
report.machine = { system: os.release(), cpu: os.cpus()[0].model, logical_cpus: os.cpus().length };
const cc = windows ? process.env.VELA_CC : 'gcc';
const fixedFlags = windows ? ['/nologo', '/TC', '/std:c11', '/utf-8', '/O2', '/fp:strict', '/W3', '/wd4102', '/MT']
    : ['-std=c11', '-O2', '-ffp-contract=off'];
const ccArgs = (c, exe) => [...fixedFlags, ...(windows ? ['/Fo' + target(exe + '.obj'), '/Fe' + target(exe),
    target(c), '/link', '/INCREMENTAL:NO'] : [target(c), '-o', target(exe), '-lm'])];
report.flags = fixedFlags;
for (const v of variants) {
    await fs.mkdir(v.dir);
    v.version = ok(target(v.compiler), ['--version']);
    v.artifact = await describe(v.compiler);
}
report.compilers = variants.map(({ label, version, artifact }) => ({ label, version, ...artifact }));

async function measure(exe, args, profile = false) {
    let data, stdout, stderr;
    if (windows) {
        if (profile) process.env.VELA_GC_REPORT = '1';
        try { data = await winMeasure({ exe, args, cwd: root, logDir: logs, timeoutMs: 180000 }); }
        finally { delete process.env.VELA_GC_REPORT; }
        stdout = await fs.readFile(data.stdout_path, 'utf8');
        stderr = await fs.readFile(data.stderr_path, 'utf8');
    } else {
        const id = randomUUID();
        const out = path.join(logs, id + '.out'), err = path.join(logs, id + '.err');
        const p = platform(target(meter), ['180000', target(out), target(err), exe, ...args],
            ['VELA_TRACE=0', 'VELA_PROFILE=0', 'VELA_GC_STRESS=0', 'VELA_GC_REPORT=' + (profile ? 1 : 0)]);
        assert.equal(p.status, 0, p.stdout + p.stderr);
        data = JSON.parse(p.stdout);
        stdout = await fs.readFile(out, 'utf8');
        stderr = await fs.readFile(err, 'utf8');
    }
    assert.ok(!data.timed_out && data.exit_code === 0 && data.active_processes_after === 0,
        exe + ' ' + args.join(' ') + '\n' + JSON.stringify(data) + '\n' + stdout + stderr);
    const { wall_ms, cpu_ms } = data;
    const peak = windows ? {
        peak_process_working_set_bytes: data.parent_peak_working_set_bytes,
        peak_tree_commit_bytes: data.peak_job_commit_bytes,
    } : {
        peak_process_rss_bytes: data.peak_process_rss_bytes,
        peak_tree_rss_bytes: data.peak_tree_rss_bytes,
        peak_single_rss_wait4_bytes: data.peak_single_rss_wait4_bytes,
        observed_processes: data.observed_processes,
    };
    return { metrics: { wall_ms, cpu_ms, ...peak }, stdout: stdout.trim(), stderr: stderr.trim() };
}
function summarize(rows) {
    return Object.fromEntries(Object.keys(rows[0]).map(key => {
        const values = rows.map(row => row[key]).filter(value => value !== null).sort((a, b) => a - b);
        return [key, values.length ? { min: values[0], median: values[Math.floor(values.length / 2)], max: values.at(-1) } : null];
    }));
}
async function paired(task) {
    const raw = [];
    for (const v of variants) await task(v, true);
    for (let round = 0; round < 5; round++) {
        const pair = {};
        for (const index of round % 2 ? [1, 0] : [0, 1]) {
            const v = variants[index];
            pair[v.label] = await task(v, false);
        }
        raw.push(pair);
    }
    const ranges = Object.fromEntries(variants.map(v => [v.label, summarize(raw.map(row => row[v.label]))]));
    return { raw, ranges };
}

function emittedCounts(text) {
    const marker = text.indexOf('typedef struct { void (*code)(void); void *environment; } v_callable;');
    assert.ok(marker > 0);
    const code = text.slice(marker);
    const count = re => Array.from(code.matchAll(re)).length;
    return {
        roots: count(/\bv_gc_push\(/g),
        polls: count(/\bv_gc_poll\(/g),
        arithmetic_guards: count(/\bv_(?:add|sub|mul|div|rem|neg)\(/g),
        temporaries: count(/^[^\r\n;]+ \*?v_t_\d+ = /gm),
        branches: count(/^\s*if \(/gm),
        functions: count(/^static [^\r\n;=]+\([^;\r\n]*\) \{/gm),
        types: count(/^(?:typedef struct|struct v_[a-z])\b/gm),
        traces: count(/^static void v_trace_\d+\([^;\r\n]*\) \{/gm),
    };
}
const sourceRoot = path.join(root, 'tests/library13/codegen');
const synth = ['numeric', 'aggregate', 'mixed', 'dispatch', 'constant'];
const programs = Object.fromEntries(synth.map(name => [name, path.join(sourceRoot, name + '.vela')]));
programs.data = path.join(root, 'tests/library13/profile.vela');
programs.buildlens = path.join(root, 'apps/build-lens/vela.project');
programs.fielddesk = path.join(root, 'apps/fielddesk/main.vela');
const compilerWorkload = path.resolve(process.env.VELA_CODEGEN_COMPILER_WORKLOAD || path.join(root, 'selfhost'));
programs.compiler = path.join(compilerWorkload, 'vela.project');
if (windows) {
    programs.callbacks = path.join(root, 'tests/ffi/callbacks.vela');
    programs.async = path.join(root, 'tests/library12/parallel-values.vela');
}
report.source_sha256 = Object.fromEntries(await Promise.all(Object.entries(programs).map(async ([name, source]) => [name, await hash(source)])));
report.compiler_workload = {};
for (const entry of await fs.readdir(compilerWorkload)) {
    if (/\.(vela|project)$/.test(entry)) report.compiler_workload[entry] = await hash(path.join(compilerWorkload, entry));
}
report.dependencies = {};
for (const directory of ['selfhost', 'std', 'tests/library13/codegen', 'apps/build-lens', 'apps/fielddesk']) {
    for (const entry of await fs.readdir(path.join(root, directory))) {
        if (!/\.(vela|project|lock)$/.test(entry)) continue;
        const relative = directory + '/' + entry;
        report.dependencies[relative] = await hash(path.join(root, relative));
    }
}
for (const relative of ['vela/builtins.def', 'vela/backends/runtime.h', 'tests/ffi/adapter.c']) {
    report.dependencies[relative] = await hash(path.join(root, relative));
}
report.artifacts = {};
const compiled = new Map();
async function prepare(v, name, source) {
    const key = (referenceOnly ? 'reference' : v.label) + '/' + name;
    if (compiled.has(key)) return compiled.get(key);
    const folder = path.join(v.dir, name);
    await fs.mkdir(folder, { recursive: true });
    const artifact = { c: path.join(folder, name + '.c'), exe: path.join(folder, name + exts),
        profile: path.join(folder, 'profile' + exts) };
    ok(target(v.compiler), ['emit-c', target(source), '-o', target(artifact.c)]);
    const original = await fs.readFile(artifact.c, 'utf8');
    ok(cc, ccArgs(artifact.c, artifact.exe));
    const instrumented = path.join(folder, 'profile.c');
    await fs.writeFile(instrumented, allocationCounters(original));
    ok(cc, ccArgs(instrumented, artifact.profile));
    if (name === 'callbacks') {
        ok(cc, ['/nologo', '/LD', '/std:c11', '/utf-8', '/O2', '/MT', '/Fo' + target(path.join(folder, 'fixture.obj')),
            target(path.join(root, 'tests/ffi/adapter.c')), '/link', '/OUT:' + target(path.join(folder, 'fixture.dll'))]);
    }
    const artifactEntry = { c: await describe(artifact.c), exe: await describe(artifact.exe),
        counters_exe: await describe(artifact.profile), emitted: emittedCounts(original) };
    report.artifacts[key] = artifactEntry;
    compiled.set(key, artifact);
    await save();
    return artifact;
}

const descriptors = [];
function add(program, size, args, oracle, input = null) {
    descriptors.push({ program, size, args, oracle, input });
}
const numeric = n => Math.floor(n / 1000) * 1499500 + (n % 1000) * (3 * (n % 1000 - 1) + 2) / 2;
const triangular = n => n * (n - 1) / 2;
function decimalDigits(n) {
    let result = 1;
    for (let next = 10, width = 1; next / 10 < n; next *= 10, width++) {
        const start = width === 1 ? 1 : next / 10;
        result += (Math.min(next, n) - start) * width;
    }
    return result;
}
for (const [i, size] of ['small', 'medium', 'large'].entries()) {
    const n = [20000, 200000, 1000000][i];
    for (const [name, expected] of Object.entries({
        numeric: numeric(n), aggregate: 3 * triangular(n) + n,
        mixed: triangular(n) + 10 * n + decimalDigits(n),
        dispatch: 2 * triangular(n) + 13 * n, constant: triangular(n) + 149 * n,
    })) add(name, size, [String(n)], output => assert.equal(output, String(expected)), { iterations: n, expected });
    const keys = [8, 64, 256][i];
    const json = path.join(work, size + '.json');
    await fs.writeFile(json, JSON.stringify(Object.fromEntries(
        Array.from({ length: keys - 1 }, (_, k) => ['key' + k, 'value-' + k + '-я']).concat([['target', 7]]))));
    add('data', size + '/typed-json', ['json-typed', target(json), '300'], output => assert.equal(output, '2100'),
        { keys, ...await describe(json), expected: 2100 });
    const text = path.join(work, size + '.txt');
    await fs.writeFile(text, '/папка/' + 'a'.repeat([64, 1024, 8192][i]));
    add('data', size + '/strings', ['strings', target(text), '4000'], output => assert.equal(output, '4000'),
        { ...await describe(text), expected: 4000 });
    const count = [128, 2048, 16384][i];
    const fold = 6 * count * (count + 1);
    add('data', size + '/fold', ['fold', String(count), '12'], output => assert.equal(output, String(fold)), { items: count, expected: fold });
    const jsonl = path.join(work, size + '.jsonl');
    const events = [100, 1000, 10000][i];
    await fs.writeFile(jsonl, Array.from({ length: events }, (_, k) =>
        JSON.stringify({ id: 'run-' + k, suite: 'suite', name: 'test-' + k % 100, status: 'passed', duration_ms: 10 })).join('\n') + '\n');
    const expected = { events, duplicates: 0, selected: events, tests: 100, failed: 0, flaky: 0, skipped: 0, total_ms: events * 10 };
    add('buildlens', size, [target(jsonl), '--top', '1'], output => assert.deepEqual(JSON.parse(output).summary, expected),
        { ...await describe(jsonl), expected });
}
const html = path.join(work, 'fielddesk.html');
add('fielddesk', 'demo', ['--demo', target(html), '--replay-check'], async output => {
    assert.match(output, /^Replay verified: identical report, all requests consumed/m);
    assert.match(output, /^Accepted 9 \| excluded 1 \| alerts 2 \| mean 20\.67$/m);
    const text = await fs.readFile(html, 'utf8');
    assert.match(text, /<title>FieldDesk/);
    assert.match(text, /<strong>6\.39<\/strong>/);
    assert.match(text, /Лесная 🌲/);
}, { demo: await describe(path.join(root, 'apps/fielddesk/demo.json')) });
if (windows) {
    add('callbacks', 'native', [], output => assert.equal(output, 'callbacks passed'));
    add('async', 'typed-values', [], output => assert.equal(output, 'parallel values and limits passed'));
} else {
    report.unsupported = ['Windows GUI, DLL FFI, Win32 fibers and native HTTP adapter'];
}

const compilerPath = v => target(v.compiler);
const compilerArgs = (operation, name, extra = []) => [operation, target(programs[name]), ...extra];
async function phaseCompiler(v) {
    const chosen = v.label === 'reference' ? process.env.VELA_CODEGEN_REFERENCE_SELFHOST : process.env.VELA_CODEGEN_CANDIDATE_SELFHOST;
    assert.ok(chosen || referenceOnly, 'Provide the authored source tree for each compared compiler.');
    const folder = path.join(v.dir, 'phases');
    const sources = path.join(folder, 'selfhost');
    await fs.mkdir(folder);
    await fs.cp(chosen ? path.resolve(chosen) : path.join(root, 'selfhost'), sources, { recursive: true });
    const driver = path.join(sources, 'driver.vela');
    let code = await fs.readFile(driver, 'utf8');
    code = swap(code, '    let cache = cache_prepare(cache_directory, cache_report);',
        '    let audit_start = codegen_stamp();\n    let cache = cache_prepare(cache_directory, cache_report);');
    code = swap(code, '    analyze_mode(c, command != "symbols" && command != "api");',
        '    analyze_mode(c, command != "symbols" && command != "api");\n    let audit_frontend = codegen_stamp() - audit_start;');
    const simplify = '    if !reference_ir { simplify_checked(c); }';
    const before = '    let audit_ir_before = codegen_ir_nodes(c);\n';
    const generate = '    let generated = generate(c);';
    if (code.includes(simplify)) {
        code = swap(code, simplify, before + '    let audit_opt_start = codegen_stamp();\n' + simplify
            + '\n    let audit_opt = codegen_stamp() - audit_opt_start;\n'
            + '    let audit_ir_after = codegen_ir_nodes(c);');
    } else {
        code = swap(code, generate, before + '    let audit_ir_after = audit_ir_before;\n'
            + '    let audit_opt = 0;\n' + generate);
    }
    const ranges = '    prove_ranges(c);';
    if (code.includes(ranges)) {
        code = swap(code, ranges, '    let audit_range_start = codegen_stamp();\n' + ranges
            + '\n    let audit_range = codegen_stamp() - audit_range_start;');
    } else {
        code = swap(code, generate, '    let audit_range = 0;\n' + generate);
    }
    code = swap(code, '    let generated = generate(c);',
        '    let audit_generation = codegen_stamp();\n    let generated = generate(c);\n'
        + '    let audit_done = codegen_stamp();\n'
        + '    eprint(f"codegen-phase frontend={audit_frontend:d} optimization={audit_opt:d} ranges={audit_range:d} generation={audit_done - audit_generation:d} ir_before={audit_ir_before:d} ir_after={audit_ir_after:d}");');
    code += '\nfn codegen_stamp() -> Int effects { io, process } {\n'
        + '    match monotonic_millis() {\n'
        + '        IntResult::Ok(value) => { return value; }\n'
        + '        IntResult::Err(error) => { panic(error); }\n'
        + '    }\n}\n';
    code += `
fn codegen_expr_nodes(c: Context, id: ExprId) -> Int effects { state, io, process } {
    if !has_expr(id) { return 0; }
    let node = checked_expr(c, id);
    var total = 1 + codegen_expr_nodes(c, node.left) + codegen_expr_nodes(c, node.right);
    for i in 0 .. list_len(node.arguments) { total = total + codegen_expr_nodes(c, list_get(node.arguments, i)); }
    for i in 0 .. list_len(node.arms) { total = total + codegen_expr_nodes(c, list_get(node.arms, i).value); }
    return total;
}
fn codegen_block_nodes(c: Context, body: List<StmtId>) -> Int effects { state, io, process } {
    var total = 0;
    for i in 0 .. list_len(body) {
        let node = checked_stmt(c, list_get(body, i));
        total = total + 1 + codegen_expr_nodes(c, node.value) + codegen_expr_nodes(c, node.target);
        total = total + codegen_block_nodes(c, node.yes) + codegen_block_nodes(c, node.no);
        for j in 0 .. list_len(node.arms) { total = total + codegen_block_nodes(c, list_get(node.arms, j).body); }
    }
    return total;
}
fn codegen_ir_nodes(c: Context) -> Int effects { state, io, process } {
    var total = 0;
    for i in 0 .. list_len(c.functions) {
        let function = list_get(c.functions, i);
        total = total + codegen_block_nodes(c, function.body);
        for j in 0 .. list_len(function.preconditions) { total = total + codegen_expr_nodes(c, list_get(function.preconditions, j)); }
        for j in 0 .. list_len(function.postconditions) { total = total + codegen_expr_nodes(c, list_get(function.postconditions, j)); }
    }
    return total;
}
`;
    await fs.writeFile(driver, code);
    const c = path.join(folder, 'phases.c');
    const exe = path.join(folder, 'phases' + exts);
    ok(compilerPath(v), ['emit-c', target(path.join(sources, 'vela.project')), '-o', target(c)]);
    await fs.writeFile(c, allocationCounters(await fs.readFile(c, 'utf8')));
    ok(cc, ccArgs(c, exe));
    return exe;
}
async function packageSize(v, name, c, exe) {
    const content = path.join(v.dir, name + '-payload');
    await fs.mkdir(content);
    const files = { [name + exts]: exe, LICENSE: path.join(root, 'LICENSE') };
    if (name === 'compiler') {
        files['recovery.c'] = c;
        files['compiler.vela'] = path.join(compilerWorkload, 'compiler.vela');
        await fs.cp(path.join(root, 'std'), path.join(content, 'std'), { recursive: true });
    } else if (name === 'buildlens') {
        files['demo.jsonl'] = path.join(root, 'apps/build-lens/demo.jsonl');
        files['README.md'] = path.join(root, 'apps/build-lens/README.md');
    } else {
        files['README.md'] = path.join(root, 'apps/fielddesk/README.md');
        if (windows) {
            files['vela-gui.dll'] = path.join(root, 'apps/fielddesk/bin/vela-gui.dll');
            files['vela-http.dll'] = path.join(root, 'apps/fielddesk/bin/vela-http.dll');
            await fs.mkdir(path.join(content, 'assets'));
            files['assets/settings.json'] = path.join(root, 'apps/fielddesk/demo.json');
        }
    }
    for (const [name, from] of Object.entries(files)) {
        await fs.copyFile(from, path.join(content, name));
    }
    const archive = path.join(v.dir, name + (windows ? '.zip' : '.tar.gz'));
    ok(windows ? 'tar.exe' : 'tar',
        [windows ? '-acf' : '-czf', target(archive), '-C', target(content), '.']);
    return { ...await describe(archive), inventory: Object.keys(files).sort(), scope: 'benchmark payload' };
}
const groups = [...new Set(descriptors.map(row => row.program))];
for (const name of groups) {
    for (const v of variants) await prepare(v, name, programs[name]);
    for (const row of descriptors.filter(row => row.program === name)) {
        const timing = await paired(async v => {
            const binary = await prepare(v, name, programs[name]);
            const p = await measure(target(binary.exe), row.args);
            await row.oracle(p.stdout);
            assert.equal(p.stderr, '');
            return p.metrics;
        });
        const counters = {};
        for (const v of variants) {
            const binary = await prepare(v, name, programs[name]);
            const p = await measure(target(binary.profile), row.args, true);
            await row.oracle(p.stdout);
            counters[v.label] = readCounters(p.stderr);
        }
        report.workloads.push({ program: name, size: row.size, input: row.input, timing, counters });
        console.log(host + ' ' + name + '/' + row.size + ' ' + timing.ranges.reference.wall_ms.median + 'ms');
        await save();
    }
}

const phasesExes = {};
for (const v of variants) {
    phasesExes[v.label] = referenceOnly && phasesExes.reference ? phasesExes.reference : await phaseCompiler(v);
}
for (const name of ['buildlens', 'fielddesk', 'compiler']) {
    const phases = {};
    for (const phase of ['frontend', 'emit_c_total', 'c_compile_link', 'build_total']) {
        phases[phase] = await paired(async v => {
            const out = path.join(v.dir, name + '-timing');
            await fs.mkdir(out, { recursive: true });
            const c = path.join(out, 'program.c');
            const exe = path.join(out, 'program' + exts);
            let p;
            if (phase === 'frontend') {
                p = await measure(compilerPath(v), compilerArgs('check', name, ['--json']));
                assert.equal(JSON.parse(p.stdout).ok, true);
            } else if (phase === 'emit_c_total') {
                p = await measure(compilerPath(v), compilerArgs('emit-c', name, ['-o', target(c)]));
                assert.ok((await fs.stat(c)).size > 0);
            } else if (phase === 'c_compile_link') {
                p = await measure(cc, ccArgs(c, exe));
            } else {
                p = await measure(compilerPath(v), compilerArgs('build', name, ['-o', target(exe)]));
            }
            return p.metrics;
        });
        console.log(host + ' ' + name + '/' + phase + ' ' + phases[phase].ranges.reference.wall_ms.median + 'ms');
    }
    const artifacts = {};
    for (const v of variants) {
        const timing = path.join(v.dir, name + '-timing');
        const c = path.join(timing, 'program.c');
        const exe = path.join(timing, 'program' + exts);
        artifacts[v.label] = { c: await describe(c), exe: await describe(exe),
            emitted: emittedCounts(await fs.readFile(c, 'utf8')), package: await packageSize(v, name, c, exe) };
    }
    const instrumented = await paired(async v => {
        const emitted = path.join(v.dir, name + '-phase-output.c');
        const p = await measure(target(phasesExes[v.label]), compilerArgs('emit-c', name, ['-o', target(emitted)]), true);
        const stages = /codegen-phase frontend=(\d+) optimization=(\d+) ranges=(\d+) generation=(\d+) ir_before=(\d+) ir_after=(\d+)/.exec(p.stderr);
        assert.ok(stages, p.stderr);
        return { frontend_ms: +stages[1], optimization_ms: +stages[2], range_analysis_ms: +stages[3], generation_ms: +stages[4],
            checked_ir_before: +stages[5], checked_ir_after: +stages[6], ...readCounters(p.stderr) };
    });
    report.builds.push({ name, phases, artifacts, instrumented });
    await save();
}

report.complete = true;
await save();
