import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bench = path.resolve(process.argv[2] ?? 'G:/VelaBench');
const out = path.resolve(process.argv[3] ?? path.join(root, 'build/stage13/baseline.json'));
const resume = process.argv[4] === '--resume-after-workloads';
const typedOnly = process.argv[4] === '--json-typed-only';
const release = process.argv[4] === '--release';
const delivery = release ? path.resolve(process.argv[5]) : path.join(root, 'dist');
const adapter = release ? path.resolve(process.argv[6]) : null;
const { measure } = await import(pathToFileURL(path.join(bench, 'src/meter.mjs')));
await fs.mkdir(path.join(root, 'build/stage13'), { recursive: true });
const work = await fs.mkdtemp(path.join(root, 'build/stage13/profile-'));
const logDir = path.join(work, 'logs');
const compiler = path.join(root, 'bin/velac.exe');
const probe = path.join(work, 'probe.exe');
const probeSource = path.join(root, 'tests/library13/profile.vela');
const httpApp = path.join(work, 'http.exe');
const probeC = path.join(work, 'probe.c');
const instrumented = path.join(work, 'probe-profile.exe');
const curl = path.join(process.env.SystemRoot, 'System32/curl.exe');
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');

function call(exe, args) {
    const p = spawnSync(exe, args, { cwd: work, windowsHide: true, encoding: 'utf8', timeout: 120000 });
    assert.equal(p.status, 0, `${exe}: ${p.error ?? ''}\n${p.stdout}\n${p.stderr}`);
    return p.stdout.trim();
}

assert.equal(process.platform, 'win32');
assert.equal(process.env.VELA_CC_KIND, 'msvc', 'Run in a VS x64 Developer Command Prompt with VELA_CC=cl.exe and VELA_CC_KIND=msvc');
const cc = process.env.VELA_CC;
const cl = spawnSync(cc, ['/Bv'], { cwd: work, windowsHide: true, encoding: 'utf8' });
const clVersion = `${cl.stdout ?? ''}\n${cl.stderr ?? ''}`.trim();
assert.match(clVersion, /19\.\d+/);
delete process.env.VELA_GC_REPORT;
delete process.env.VELA_GC_STRESS;
delete process.env.VELA_PROFILE;
delete process.env.VELA_TRACE;
if (!resume) {
    call(compiler, ['build', probeSource, '-o', probe]);
    if (!typedOnly) {
        call(compiler, ['build', path.join(root, 'apps/http-collector/main.vela'), '-o', httpApp]);
        if (adapter) await fs.copyFile(adapter, path.join(work, 'vela-http.dll'));
    }
    call(compiler, ['emit-c', probeSource, '-o', probeC]);
}

// Instrument emitted C only. The runtime and release executable bytes are untouched.
function replaceAnchor(source, anchor, replacement) {
    const first = source.indexOf(anchor);
    assert.ok(first >= 0 && source.indexOf(anchor, first + anchor.length) < 0, `instrumentation anchor: ${anchor}`);
    return source.replace(anchor, replacement);
}
function instrument(source) {
    source = replaceAnchor(source, 'static size_t v_gc_bytes, v_gc_peak, v_gc_collections;', `
static uint64_t profile_allocations, profile_allocated_bytes, profile_copies, profile_copied_bytes;
static void *profile_memcpy(void *target, const void *source, size_t count) {
    ++profile_copies; profile_copied_bytes += count;
    return memcpy(target, source, count);
}
#define memcpy profile_memcpy
static size_t v_gc_bytes, v_gc_peak, v_gc_collections;`);
    source = replaceAnchor(source, '    v_gc_bytes += bytes;', '    v_gc_bytes += bytes;\n    ++profile_allocations; profile_allocated_bytes += bytes;');
    return replaceAnchor(source, 'static void v_runtime_free(void) {', `static void v_runtime_free(void) {
    fprintf(stderr, "profile allocations=%" PRIu64 " allocated=%" PRIu64 " copies=%" PRIu64 " copied=%" PRIu64 "\\n",
        profile_allocations, profile_allocated_bytes, profile_copies, profile_copied_bytes);`);
}
function compileC(source, exe) {
    call(cc, ['/nologo', '/std:c11', '/utf-8', '/MT', '/O2', `/Fo${exe}.obj`, `/Fe${exe}`, source]);
}
const profileC = path.join(work, 'probe-profile.c');
if (!resume) {
    await fs.writeFile(profileC, instrument(await fs.readFile(probeC, 'utf8')));
    compileC(profileC, instrumented);
}

const summary = resume ? JSON.parse(await fs.readFile(out, 'utf8')) : {
    schema_version: 1,
    protocol: 'docs/contracts/PERFORMANCE-1.3.md',
    stage: release ? '1.3.6' : typedOnly ? (process.argv[5] ?? '1.3.4') : '1.3.1',
    host: { platform: os.platform(), arch: os.arch(), release: os.release(), cpu: os.cpus()[0].model, logical_cpus: os.cpus().length },
    version: call(compiler, ['--version']),
    revision: call('git', ['-C', root, 'rev-parse', 'HEAD']),
    compiler_sha256: await hash(compiler),
    toolchain: clVersion,
    meter: { source_sha256: await hash(path.join(bench, 'src/ProcessMeter.cs')), binary_sha256: await hash(path.join(bench, 'src/meter.exe')) },
    curl: { version: call(curl, ['--version']).split(/\r?\n/)[0], bytes: (await fs.stat(curl)).size, sha256: await hash(curl) },
    sizes: { profile_exe: (await fs.stat(probe)).size, http_exe: typedOnly ? null : (await fs.stat(httpApp)).size, compiler_exe: (await fs.stat(compiler)).size },
    package: {}, workloads: [], compiler: [], build: [],
};
if (resume) {
    assert.equal(summary.completed, undefined);
    assert.equal(summary.compiler_sha256, await hash(compiler));
    assert.equal(summary.toolchain, clVersion);
    assert.equal(summary.workloads.length, 36);
    summary.compiler = [];
}
if (release) {
    assert.equal(summary.version, 'Vela 1.3.0 (self-hosted)');
    summary.http_adapter = { bytes: (await fs.stat(adapter)).size, sha256: await hash(adapter) };
}
const packageVersion = release ? '1.3.0' : '1.2.0';
if (!typedOnly) for (const name of [`vela-${packageVersion}-windows-x64.zip`, `vela-${packageVersion}-linux-x64-musl.tar.gz`, `vela-mcp-${packageVersion}.zip`]) {
    const file = path.join(delivery, name);
    summary.package[name] = { bytes: (await fs.stat(file)).size, sha256: await hash(file) };
}
const checkpoint = async () => fs.writeFile(out, JSON.stringify(summary, null, 2) + '\n');
function range(samples, key) {
    const sorted = samples.map(s => s[key]).sort((a, b) => a - b);
    return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) };
}
const metric = ({ wall_ms, cpu_ms, peak_job_commit_bytes }) => ({ wall_ms, cpu_ms, peak_job_commit_bytes });
function ranges(samples) {
    return Object.fromEntries(['wall_ms', 'cpu_ms', 'peak_job_commit_bytes'].map(key => [key, range(samples, key)]));
}
async function run(exe, args) {
    const p = await measure({ exe, args, cwd: work, timeoutMs: 90000, logDir });
    const stdout = await fs.readFile(p.stdout_path, 'utf8');
    const stderr = await fs.readFile(p.stderr_path, 'utf8');
    assert.ok(!p.timed_out && p.exit_code === 0, `${args.join(' ')}\n${stdout}\n${stderr}`);
    assert.equal(p.active_processes_after, 0);
    return { ...metric(p), stdout, stderr };
}
async function repeats(exe, args, verify, before = async () => {}) {
    const samples = [];
    for (let round = 0; round <= 5; round++) {
        await before();
        const measured = await run(exe, args);
        await verify(measured);
        if (round) samples.push(metric(measured));
    }
    return { samples, ...ranges(samples) };
}

if (!resume) for (const [i, label] of ['small', 'medium', 'large'].entries()) {
    const keys = [8, 64, 256][i];
    const textSize = [64, 1024, 8192][i];
    const count = [128, 2048, 16384][i];
    const bytes = [262144, 2097152, 16777216][i];
    const config = Object.fromEntries(Array.from({ length: keys - 1 }, (_, n) => [`key${n}`, `value-${n}-я`]).concat([['target', 7]]));
    const json = path.join(work, `${label}.json`), text = path.join(work, `${label}.txt`);
    const binary = path.join(work, `${label}.bin`), output = path.join(work, 'copy.bin');
    await fs.writeFile(json, JSON.stringify(config));
    let expectedFile;
    if (!typedOnly) {
        await fs.writeFile(text, '/папка/' + 'a'.repeat(textSize));
        const data = Buffer.allocUnsafe(bytes);
        for (let j = 0; j < bytes; j++) data[j] = (j * 17 + (j >> 8)) & 255;
        await fs.writeFile(binary, data);
        expectedFile = await hash(binary);
    }
    for (const [mode, input, rounds, expected] of [
        ['config', json, 2000, 14000], ['json-tree', json, 300, 300],
        ['json-stream', json, 300, 300], ['json-typed', json, 300, 2100],
        ['text', text, 2000, 2000], ['path', text, 2000, 2000], ['strings', text, 4000, 4000],
        ['fold', String(count), 12, 6 * count * (count + 1)], ['set', String(count), 12, 12 * count],
        ['cell', String(count), 12, 12 * count], ['file', binary, 1, bytes],
    ]) {
        if (typedOnly && mode !== 'json-typed') continue;
        const args = [mode, input, String(rounds), ...(mode === 'file' ? [output] : [])];
        const before = async () => { if (mode === 'file') await fs.rm(output, { force: true }); };
        const verify = async p => {
            assert.equal(p.stdout.trim(), String(expected), `${mode}/${label}`);
            if (mode === 'file') assert.equal(await hash(output), expectedFile);
        };
        const results = await repeats(probe, args, verify, before);
        await before();
        process.env.VELA_GC_REPORT = '1';
        let profile;
        try { profile = await run(instrumented, args); } finally { delete process.env.VELA_GC_REPORT; }
        await verify(profile);
        const counters = /profile allocations=(\d+) allocated=(\d+) copies=(\d+) copied=(\d+)/.exec(profile.stderr);
        const gc = /vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)/.exec(profile.stderr);
        assert.ok(counters && gc, profile.stderr);
        const inputSize = ['fold', 'set', 'cell'].includes(mode) ? { items: count } : { bytes: (await fs.stat(input)).size, sha256: await hash(input) };
        summary.workloads.push({ mode, label, input: inputSize, rounds, expected, ...results,
            profile: { allocations: +counters[1], allocated_bytes: +counters[2], copies: +counters[3], copied_bytes: +counters[4], gc_collections: +gc[1], peak_managed_bytes: +gc[2], before_teardown_bytes: +gc[3] } });
        console.log(`${mode}/${label}: ${results.wall_ms.median.toFixed(2)} ms`);
        await checkpoint();
    }
}

if (typedOnly) {
    summary.completed = true;
    await checkpoint();
    process.exit(0);
}

if (!resume) {
let connections = 0, requests = [];
const server = createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('Content-Length', '64');
    res.end('x'.repeat(64));
});
server.on('connection', () => { connections++; });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
try {
    for (const count of [1, 4, 10]) {
        const config = path.join(work, `http-${count}.json`), output = path.join(work, 'http-output.json');
        const urls = Array.from({ length: count }, (_, index) => `http://127.0.0.1:${server.address().port}/test/${index}`);
        await fs.writeFile(config, JSON.stringify({ urls, concurrency: 1, timeout_ms: 5000 }));
        const observations = [];
        const results = await repeats(httpApp, [config, output, '--fail-on-error'], async () => {
            const data = JSON.parse(await fs.readFile(output, 'utf8'));
            assert.equal(data.results.length, count);
            for (const [index, item] of data.results.entries()) {
                assert.equal(item.url, urls[index]);
                assert.equal(item.status, 200);
                assert.equal(item.bytes, 64);
            }
            assert.deepEqual(requests, urls.map(url => new URL(url).pathname));
            observations.push(connections);
        }, async () => { await fs.rm(output, { force: true }); connections = 0; requests = []; });
        summary.workloads.push({ mode: 'http', requests: count, ...results, server_connections: observations.slice(1) });
        console.log(`http/${count}: ${results.wall_ms.median.toFixed(2)} ms`);
        await checkpoint();
    }
} finally { await new Promise(resolve => server.close(resolve)); }
}

const modules = (await fs.readFile(path.join(root, 'selfhost/sources.list'), 'utf8')).trim().split(/\r?\n/).concat('embedded');
const copied = path.join(work, 'selfhost');
await fs.mkdir(copied);
for (const name of modules) await fs.copyFile(path.join(root, 'selfhost', name + '.vela'), path.join(copied, name + '.vela'));
const driver = path.join(copied, 'driver.vela');
const original = await fs.readFile(driver, 'utf8');
for (let round = 0; round <= 5; round++) {
    const cache = path.join(work, `cache-${round}`);
    await fs.writeFile(driver, original);
    for (const [phase, expected] of [['cold', 'miss'], ['warm', 'hit'], ['edit', 'miss']]) {
        if (phase === 'edit') await fs.writeFile(driver, original + '\n// Vela 1.3 profile: comment-only edit\n');
        const p = await run(compiler, ['check', driver, '--cache', cache, '--cache-report', '--json']);
        assert.equal(JSON.parse(p.stdout).ok, true);
        const events = p.stderr.trim().split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
        assert.ok(events.some(e => e.layer === 'check-v1' && e.phase === 'read' && e.status === expected), p.stderr);
        if (round) summary.compiler.push({ round, phase, ...metric(p), cache_events: events.map(({ phase, layer, status, reason }) => ({ phase, layer, status, reason })) });
    }
    console.log(`compiler cold/warm/edit round ${round}`);
    await checkpoint();
}
summary.compiler_ranges = Object.fromEntries(['cold', 'warm', 'edit'].map(phase => [phase, ranges(summary.compiler.filter(r => r.phase === phase))]));
const appOut = path.join(work, 'buildlens.exe');
summary.build = await repeats(compiler, ['build', path.join(root, 'apps/build-lens/vela.project'), '-o', appOut],
    async () => { assert.ok((await fs.stat(appOut)).size > 0); }, async () => { await fs.rm(appOut, { force: true }); });
summary.sizes.buildlens_exe = (await fs.stat(appOut)).size;
summary.completed = true;
await checkpoint();
console.log(`Recorded ${summary.workloads.length} workload groups and 15 compiler samples in ${out}`);
