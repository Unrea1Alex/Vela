import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { SUITE_VERSION, SENTINEL, createFixtureSuite, createMaintenanceSuite } from './fixtures.mjs';

export async function runExecutable(exe, args, { cwd, timeoutMs = 10000 } = {}) {
  const start = performance.now();
  return new Promise(resolve => {
    let stdout = '', stderr = '', spawnError = null, timedOut = false;
    const child = spawn(path.resolve(exe), args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const append = (current, data) => (current + data.toString('utf8')).slice(0, 65536);
    child.stdout.on('data', data => { stdout = append(stdout, data); });
    child.stderr.on('data', data => { stderr = append(stderr, data); });
    child.on('error', error => { spawnError = error.message; });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, timedOut, spawnError, stdout, stderr, elapsed_ms: performance.now() - start });
    });
  });
}

function describeDifference(actual, expected, at = '$') {
  if (actual === expected) return null;
  if (typeof actual !== typeof expected || actual === null || expected === null) return `${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${at}: expected array`;
    if (actual.length !== expected.length) return `${at}: expected ${expected.length} entries, got ${actual.length}`;
    for (let i = 0; i < expected.length; i++) { const d = describeDifference(actual[i], expected[i], `${at}[${i}]`); if (d) return d; }
    return null;
  }
  if (typeof expected === 'object') {
    if (Array.isArray(actual)) return `${at}: expected object`;
    const a = Object.keys(actual).sort(), e = Object.keys(expected).sort();
    if (!isDeepStrictEqual(a, e)) return `${at}: expected keys ${JSON.stringify(e)}, got ${JSON.stringify(a)}`;
    for (const key of e) { const d = describeDifference(actual[key], expected[key], `${at}.${key}`); if (d) return d; }
    return null;
  }
  return `${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}

export function compareOutput(actual, expected) {
  return describeDifference(actual, expected);
}

async function readOutput(file) {
  const bytes = await fs.readFile(file);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

function checkHttp(test, before = null) {
  const stats = test.http.fixture.snapshot(test.http.batch);
  const baseline = before?.requests.length ?? 0;
  const requests = stats.requests.slice(baseline);
  if (stats.max_active > test.http.concurrency) return `maximum active requests ${stats.max_active} exceeds ${test.http.concurrency}`;
  if (requests.some(r => r.method !== 'GET')) return 'server received a non-GET request';
  const expected = Array.from({ length: test.http.repetitions ?? 1 }, () => test.http.urls.map(url => new URL(url).pathname)).flat().sort();
  const actual = requests.map(r => r.path).sort();
  if (!isDeepStrictEqual(expected, actual)) return `request paths/count differ: expected ${expected.length} requests, received ${actual.length}`;
  return null;
}

async function evaluateSuite({ task, exe, workDir, factory, prefix = '' }) {
  const absoluteWork = path.resolve(workDir);
  await fs.mkdir(absoluteWork, { recursive: true });
  const root = await fs.mkdtemp(path.join(absoluteWork, `fixtures-${prefix || 'baseline-'}${task}-`));
  const suite = await factory(task, root);
  const checks = [];
  try {
    for (const test of suite.cases) {
      await fs.writeFile(test.output, SENTINEL);
      const before = test.http?.fixture.snapshot(test.http.batch);
      const run = await runExecutable(exe, test.args, { cwd: absoluteWork, timeoutMs: test.timeoutMs ?? 10000 });
      let detail = null;
      if (run.spawnError) detail = `launch error: ${run.spawnError}`;
      else if (run.timedOut) detail = 'process exceeded 10000 ms deadline';
      else if (run.signal) detail = `process terminated by ${run.signal}`;
      else if (test.expectSuccess) {
        const expectedExit = test.expectedExit ?? 0;
        if (run.exitCode !== expectedExit) detail = `expected exit ${expectedExit}, got ${run.exitCode}; stderr: ${run.stderr.slice(0, 1200)}`;
        else {
          try { detail = compareOutput(await readOutput(test.output), test.expected); }
          catch (error) { detail = `invalid or missing UTF-8 JSON output: ${error.message}`; }
          if (!detail && test.maxElapsedMs && run.elapsed_ms > test.maxElapsedMs) detail = `timeout result took ${run.elapsed_ms.toFixed(1)} ms; expected <= ${test.maxElapsedMs} ms`;
          if (!detail && test.http) detail = checkHttp(test, before);
        }
      } else {
        if (run.exitCode === 0 || run.exitCode === null) detail = `invalid input must exit nonzero; got ${run.exitCode}`;
        try {
          if (!(await fs.readFile(test.output)).equals(SENTINEL)) detail = (detail ? detail + '; ' : '') + 'preexisting output changed on invalid input';
        } catch (error) { detail = (detail ? detail + '; ' : '') + `preexisting output unavailable: ${error.message}`; }
        if (test.noHttpBatch && suite.fixture.snapshot(test.noHttpBatch).requests.length) detail = (detail ? detail + '; ' : '') + 'requests issued before complete configuration validation';
      }
      checks.push({ name: prefix + test.name, passed: detail === null, detail: detail ?? 'ok', elapsed_ms: run.elapsed_ms });
    }
  } finally { await suite.stop(); }
  const passed = checks.filter(c => c.passed).length;
  return { passed, failed: checks.length - passed, total: checks.length, checks, fixtures_summary: { suite_version: SUITE_VERSION, ...(suite.maintenance_version ? { maintenance_version: suite.maintenance_version } : {}), task, root, cases: checks.length, valid_cases: suite.cases.filter(c => c.expectSuccess).length, invalid_cases: suite.cases.filter(c => !c.expectSuccess).length } };
}

export async function validateAttempt({ task, exe, workDir }) {
  return evaluateSuite({ task, exe, workDir, factory: createFixtureSuite });
}

export async function validateMaintenance({ task, exe, workDir }) {
  const baseline = await validateAttempt({ task, exe, workDir });
  const change = await evaluateSuite({ task, exe, workDir, factory: createMaintenanceSuite, prefix: 'maintenance-' });
  return { passed: baseline.passed + change.passed, failed: baseline.failed + change.failed, total: baseline.total + change.total, checks: [...baseline.checks, ...change.checks], fixtures_summary: { baseline: baseline.fixtures_summary, maintenance: change.fixtures_summary } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [task, exe, workDir, mode = 'baseline'] = process.argv.slice(2);
  if (!task || !exe || !workDir || !['baseline', 'maintenance'].includes(mode)) {
    process.stderr.write('Usage: node private/validate.mjs TASK EXE WORKDIR [baseline|maintenance]\n'); process.exitCode = 2;
  } else {
    try {
      const result = await (mode === 'maintenance' ? validateMaintenance : validateAttempt)({ task, exe, workDir });
      process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exitCode = result.failed ? 1 : 0;
    } catch (error) { process.stderr.write(error.stack + '\n'); process.exitCode = 2; }
  }
}
