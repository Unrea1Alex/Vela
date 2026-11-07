import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

export const SUITE_VERSION = 'pilot-1';
export const MAINTENANCE_SUITE_VERSION = 'pilot-maintenance-2-repeat';
export const SENTINEL = Buffer.from('existing output must survive\r\n\u0000\u00ff', 'utf8');

export function ordinal(a, b) {
  const x = Array.from(a, c => c.codePointAt(0));
  const y = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return x.length - y.length;
}

function checkedNumber(n) {
  if (n < -(1n << 63n) || n >= (1n << 63n)) throw new Error('fixture exceeds signed64');
  if (n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('fixture exceeds JSON exact-number oracle');
  return Number(n);
}

export function logsOracle(records, minLevel = 0) {
  const groups = new Map();
  let count = 0n, sum = 0n;
  for (const row of records) {
    if (row.level < minLevel) continue;
    count++; sum += BigInt(row.value);
    const group = groups.get(row.service) ?? { count: 0n, sum: 0n, min: row.value, max: row.value };
    group.count++; group.sum += BigInt(row.value);
    group.min = Math.min(group.min, row.value); group.max = Math.max(group.max, row.value);
    groups.set(row.service, group);
  }
  return {
    count: checkedNumber(count), sum: checkedNumber(sum),
    services: [...groups].sort((a, b) => ordinal(a[0], b[0])).map(([name, g]) => ({ name, count: checkedNumber(g.count), sum: checkedNumber(g.sum), min: g.min, max: g.max })),
  };
}

export function indexOracle(files, query = '') {
  const included = files.filter(f => f.path.includes(query)).sort((a, b) => ordinal(a.path, b.path)).map(f => {
    const data = Buffer.from(f.data);
    let lines = 0;
    for (const byte of data) if (byte === 10) lines++;
    if (data.length && data.at(-1) !== 10) lines++;
    return { path: f.path, bytes: data.length, lines };
  });
  return { files: included, total_bytes: checkedNumber(included.reduce((n, f) => n + BigInt(f.bytes), 0n)), total_lines: checkedNumber(included.reduce((n, f) => n + BigInt(f.lines), 0n)) };
}

async function writeTree(root, files) {
  await fs.mkdir(root, { recursive: true });
  for (const file of files) {
    const target = path.join(root, ...file.path.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.data);
  }
}

function generatedRecords(n) {
  const names = ['api', 'worker', 'API', 'service with spaces', 'ёж', '数据', '', 'a/b', 'quote"name', 'é', 'e\u0301'];
  return Array.from({ length: n }, (_, i) => ({ service: names[(i * 7) % names.length], level: i % 6, value: ((i * 7919) % 2000001) - 1000000 }));
}

async function logsCases(root) {
  const cases = [];
  async function add(name, content, expected, options = []) {
    const dir = path.join(root, name); await fs.mkdir(dir, { recursive: true });
    const input = path.join(dir, 'input.ndjson'), output = path.join(dir, 'output.json');
    await fs.writeFile(input, content);
    cases.push({ name, args: [input, output, ...options], output, expected, expectSuccess: expected !== undefined });
  }
  const rows = [{ service: 'worker', level: 4, value: 3 }, { service: 'api', level: 2, value: 5 }, { service: 'api', level: 3, value: -2, extra: { deep: [1, true] } }];
  const ndjson = list => list.map(r => JSON.stringify(r)).join('\n');
  await add('sample-default', ndjson(rows), logsOracle(rows));
  await add('sample-filter', ndjson(rows), logsOracle(rows, 3), ['--min-level', '3']);
  await add('empty', '', logsOracle([]));
  await add('blank-lines', ' \t\r\n\n\t\r\n', logsOracle([]));
  await add('no-kept-records', ndjson([{ service: 'x', level: 0, value: 1 }]), logsOracle([], 5), ['--min-level', '5']);
  const unicode = [{ service: 'ёж', level: 0, value: -1000000 }, { service: 'Z', level: 5, value: 1000000 }, { service: 'a', level: 1, value: 0 }, { service: '', level: 3, value: -1 }, { service: 'a', level: 2, value: 8 }, { service: 'quote"\t\\', level: 4, value: -7 }, { service: '数据', level: 2, value: 6 }, { service: 'é', level: 5, value: 4 }, { service: 'e\u0301', level: 2, value: 3 }];
  await add('unicode-escapes-crlf', '\r\n' + ndjson(unicode).replaceAll('\n', '\r\n') + '\r\n \t\r\n', logsOracle(unicode));
  const large = Array.from({ length: 5000 }, (_, i) => ({ service: i % 2 ? 'positive' : 'negative', level: 5, value: i % 2 ? 1000000 : -1000000 }));
  await add('signed64-sums', ndjson(large), logsOracle(large));
  const generated = generatedRecords(1000);
  await add('deterministic-mixed', ndjson(generated) + '\n', logsOracle(generated, 2), ['--min-level', '2']);
  const invalid = [
    ['invalid-json', '{'], ['trailing-garbage', '{"service":"x","level":0,"value":1} trailing'],
    ['array-record', '[]'], ['null-record', 'null'], ['missing-service', '{"level":0,"value":1}'],
    ['service-number', '{"service":12,"level":0,"value":1}'], ['missing-level', '{"service":"x","value":1}'],
    ['level-string', '{"service":"x","level":"2","value":1}'], ['level-bool', '{"service":"x","level":true,"value":1}'],
    ['level-range', '{"service":"x","level":6,"value":1}'], ['value-range', '{"service":"x","level":0,"value":1000001}'],
    ['level-decimal-literal', '{"service":"x","level":1.0,"value":1}'], ['value-exponent-literal', '{"service":"x","level":0,"value":1e0}'],
    ['value-fraction', '{"service":"x","level":0,"value":1.5}'], ['value-null', '{"service":"x","level":0,"value":null}'],
    ['missing-value', '{"service":"x","level":0}'], ['value-string', '{"service":"x","level":0,"value":"1"}'],
    ['late-invalid', ndjson(rows) + '\n{"service":"x","level":2,"value":false}'],
    ['filtered-invalid', '{"service":"x","level":0,"value":"bad"}'],
  ];
  for (const [name, data] of invalid) await add(name, data, undefined, name === 'filtered-invalid' ? ['--min-level', '5'] : []);
  await add('bad-cli-level', ndjson(rows), undefined, ['--min-level', '6']);
  await add('unknown-option', ndjson(rows), undefined, ['--unknown']);
  await add('missing-option-value', ndjson(rows), undefined, ['--min-level']);
  return { cases, stop: async () => {} };
}

async function indexCases(root) {
  const cases = [];
  const files = [
    { path: 'a.txt', data: Buffer.from('a\nb') }, { path: 'A-upper.txt', data: Buffer.from('\n') },
    { path: '.hidden', data: Buffer.from('hidden\rdata') }, { path: 'sub/empty.bin', data: Buffer.alloc(0) },
    { path: 'sub/two.txt', data: Buffer.from('first\r\nsecond\r\n') }, { path: 'sub/deep/raw.bin', data: Buffer.from([0, 255, 10, 128, 13, 10, 0]) },
    { path: 'other/Sub-name.txt', data: Buffer.from('\n\n\n') }, { path: 'папка/ёж.txt', data: Buffer.from('Привет\nмир', 'utf8') },
    { path: '数据/文件.txt', data: Buffer.from('数据\r\n') }, { path: 'with spaces/a b.txt', data: Buffer.from('last\r') },
    { path: 'é.txt', data: Buffer.from('composed') }, { path: 'e\u0301.txt', data: Buffer.from('decomposed\n') },
  ];
  const tree = path.join(root, 'tree with spaces'); await writeTree(tree, files);
  async function add(name, inputRoot, expected, options = []) {
    const dir = path.join(root, name); await fs.mkdir(dir, { recursive: true });
    const output = path.join(dir, 'output.json');
    cases.push({ name, args: [inputRoot, output, ...options], output, expected, expectSuccess: expected !== undefined });
  }
  await add('mixed-tree', tree, indexOracle(files));
  await add('directory-query', tree, indexOracle(files, 'sub/'), ['--query', 'sub/']);
  await add('case-sensitive-query', tree, indexOracle(files, 'A'), ['--query', 'A']);
  await add('unicode-query', tree, indexOracle(files, 'папка/ё'), ['--query', 'папка/ё']);
  await add('unmatched-query', tree, indexOracle(files, 'not-present'), ['--query', 'not-present']);
  await add('empty-query', tree, indexOracle(files), ['--query', '']);
  const empty = path.join(root, 'empty tree'); await fs.mkdir(path.join(empty, 'nested-empty'), { recursive: true });
  await add('empty-tree', empty, indexOracle([]));
  const many = Array.from({ length: 130 }, (_, i) => ({ path: `dir-${i % 7}/file-${String(i).padStart(4, '0')}.bin`, data: Buffer.from(Array.from({ length: (i * 17) % 311 }, (_, j) => (i + j * 23) % 256)) }));
  const manyTree = path.join(root, 'many'); await writeTree(manyTree, many);
  await add('many-files', manyTree, indexOracle(many));
  await add('missing-root', path.join(root, 'does-not-exist'), undefined);
  await add('file-root', path.join(tree, 'a.txt'), undefined);
  await add('missing-query-value', tree, undefined, ['--query']);
  await add('unknown-option', tree, undefined, ['--unknown']);
  return { cases, stop: async () => {} };
}

export async function startServer() {
  const batches = new Map();
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://fixture.local').pathname;
    const [, batch, kind, arg, text] = route.split('/');
    const stats = batches.get(batch) ?? { active: 0, max_active: 0, requests: [] };
    batches.set(batch, stats); stats.active++; stats.max_active = Math.max(stats.max_active, stats.active);
    stats.requests.push({ path: route, method: req.method, started_ms: Date.now() });
    let finished = false;
    const done = () => { if (!finished) { finished = true; stats.active--; } };
    res.on('close', done); res.on('finish', done);
    const send = (status, body) => { if (!res.destroyed) { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }); res.end(body); } };
    if (kind === 'drop') { req.socket.destroy(); return; }
    if (kind === 'slow') { const timer = setTimeout(() => send(200, 'late'), 1200); res.on('close', () => clearTimeout(timer)); return; }
    if (kind === 'partial') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '9' }); res.write('part');
      const timer = setTimeout(() => res.end('ial!!'), 1200); res.on('close', () => clearTimeout(timer)); return;
    }
    if (kind === 'delay') { const timer = setTimeout(() => send(200, decodeURIComponent(text ?? 'delayed')), Number(arg)); res.on('close', () => clearTimeout(timer)); return; }
    if (kind === 'unicode') { send(200, 'Привет 🌍\n'); return; }
    if (kind === 'notfound') { send(404, 'нет'); return; }
    if (kind === 'servererror') { send(503, 'busy'); return; }
    if (kind === 'empty') { send(204, ''); return; }
    if (kind === 'first-error') { const first = stats.requests.filter(r => r.path === route).length === 1; send(first ? 503 : 200, first ? 'busy' : 'hello'); return; }
    send(200, 'hello');
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    snapshot(batch) { const s = batches.get(batch); return s ? { active: s.active, max_active: s.max_active, requests: s.requests.map(r => ({ ...r })) } : { active: 0, max_active: 0, requests: [] }; },
    get requestLogs() { return [...batches].flatMap(([batch, s]) => s.requests.map(r => ({ batch, ...r }))); },
    async stop() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); },
  };
}

function response(url, route) {
  if (route === 'slow' || route === 'partial') return { url, status: 0, bytes: 0, error: 'timeout' };
  if (route === 'drop') return { url, status: 0, bytes: 0, error: 'network' };
  const status = route === 'notfound' ? 404 : route === 'servererror' ? 503 : route === 'empty' ? 204 : 200;
  const body = route === 'unicode' ? 'Привет 🌍\n' : route === 'notfound' ? 'нет' : route === 'servererror' ? 'busy' : route === 'empty' ? '' : route.startsWith('delay/') ? decodeURIComponent(route.split('/')[2] ?? 'delayed') : 'hello';
  return { url, status, bytes: Buffer.byteLength(body), error: null };
}

async function httpCases(root) {
  const fixture = await startServer();
  const cases = [];
  async function add(name, routes, concurrency = 3, timeout_ms = 1500, extra = {}) {
    const dir = path.join(root, name); await fs.mkdir(dir, { recursive: true });
    const urls = routes.map(route => `${fixture.baseUrl}/${name}/${route}`);
    const input = path.join(dir, 'config.json'), output = path.join(dir, 'output.json');
    await fs.writeFile(input, JSON.stringify({ urls, concurrency, timeout_ms, ...extra }));
    cases.push({ name, args: [input, output], output, expected: { results: routes.map((route, i) => response(urls[i], route)) }, expectSuccess: true, http: { batch: name, urls, concurrency, fixture }, ...(routes.some(r => r === 'slow' || r === 'partial') ? { maxElapsedMs: 950 } : {}) });
  }
  await add('empty-list', []);
  await add('status-and-byte-counts', ['ok', 'unicode', 'notfound', 'servererror', 'empty'], 3, 1500, { ignored: [1, 'extra'] });
  await add('preserve-input-order', ['delay/140/first', 'delay/5/second', 'ok', 'delay/30/last'], 4);
  await add('bounded-concurrency', Array.from({ length: 8 }, (_, i) => `delay/120/item-${i}`), 2);
  await add('serial-concurrency', ['delay/30/a', 'delay/30/b', 'delay/30/c'], 1);
  await add('duplicate-urls', ['ok', 'ok', 'unicode', 'ok'], 2);
  await add('timeout', ['slow'], 1, 80);
  await add('body-timeout', ['partial'], 1, 80);
  await add('dropped-connection', ['drop', 'ok'], 2);
  await add('queue-time-not-timeout', ['delay/70/a', 'delay/70/b', 'delay/70/c', 'delay/70/d'], 1, 180);
  const invalid = [
    ['invalid-json', '{'], ['not-object', '[]'], ['missing-urls', '{"concurrency":1,"timeout_ms":100}'],
    ['urls-not-array', '{"urls":"x","concurrency":1,"timeout_ms":100}'], ['url-not-string', '{"urls":[7],"concurrency":1,"timeout_ms":100}'],
    ['missing-concurrency', '{"urls":[],"timeout_ms":100}'], ['concurrency-zero', '{"urls":[],"concurrency":0,"timeout_ms":100}'],
    ['concurrency-nine', '{"urls":[],"concurrency":9,"timeout_ms":100}'], ['concurrency-fraction', '{"urls":[],"concurrency":1.5,"timeout_ms":100}'],
    ['concurrency-decimal-literal', '{"urls":[],"concurrency":1.0,"timeout_ms":100}'], ['timeout-exponent-literal', '{"urls":[],"concurrency":1,"timeout_ms":1e2}'],
    ['concurrency-bool', '{"urls":[],"concurrency":true,"timeout_ms":100}'], ['missing-timeout', '{"urls":[],"concurrency":1}'],
    ['timeout-low', '{"urls":[],"concurrency":1,"timeout_ms":49}'], ['timeout-high', '{"urls":[],"concurrency":1,"timeout_ms":5001}'],
    ['timeout-string', '{"urls":[],"concurrency":1,"timeout_ms":"100"}'], ['timeout-null', '{"urls":[],"concurrency":1,"timeout_ms":null}'],
  ];
  for (const [name, content] of invalid) {
    const dir = path.join(root, name); await fs.mkdir(dir, { recursive: true });
    const input = path.join(dir, 'config.json'), output = path.join(dir, 'output.json'); await fs.writeFile(input, content);
    cases.push({ name, args: [input, output], output, expectSuccess: false });
  }
  const validationBatch = 'late-invalid-url';
  const validationDir = path.join(root, validationBatch); await fs.mkdir(validationDir, { recursive: true });
  const validationInput = path.join(validationDir, 'config.json'), validationOutput = path.join(validationDir, 'output.json');
  await fs.writeFile(validationInput, JSON.stringify({ urls: [`${fixture.baseUrl}/${validationBatch}/ok`, 7], concurrency: 1, timeout_ms: 100 }));
  cases.push({ name: validationBatch, args: [validationInput, validationOutput], output: validationOutput, expectSuccess: false, noHttpBatch: validationBatch });
  const cli = cases[0];
  cases.push({ name: 'extra-argument', args: [...cli.args, '--unknown'], output: cli.output, expectSuccess: false });
  return { cases, stop: () => fixture.stop(), fixture };
}

export async function createFixtureSuite(task, root) {
  await fs.mkdir(root, { recursive: true });
  if (task === 'logs') return logsCases(root);
  if (task === 'index') return indexCases(root);
  if (task === 'http') return httpCases(root);
  throw new Error(`unknown task: ${task}`);
}

export async function createMaintenanceSuite(task, root) {
  await fs.mkdir(root, { recursive: true });
  const cases = [];
  if (task === 'logs') {
    const records = Array.from({ length: 24 }, (_, i) => ({ service: ['z', 'api', 'ёж'][i % 3], level: i % 6, value: i * 13 - 100 }));
    const input = path.join(root, 'input.ndjson'); await fs.writeFile(input, records.map(r => JSON.stringify(r)).join('\n'));
    const add = (name, options, min = 0, max = 5, valid = true) => {
      const output = path.join(root, name + '.json');
      cases.push({ name, args: [input, output, ...options], output, expected: valid ? logsOracle(records.filter(r => r.level <= max), min) : undefined, expectSuccess: valid });
    };
    add('max-only', ['--max-level', '2'], 0, 2);
    add('bounded-range', ['--min-level', '2', '--max-level', '4'], 2, 4);
    add('same-endpoints', ['--max-level', '3', '--min-level', '3'], 3, 3);
    add('maximum-zero', ['--max-level', '0'], 0, 0);
    add('explicit-full-range', ['--max-level', '5'], 0, 5);
    add('reversed-range', ['--min-level', '4', '--max-level', '2'], 0, 5, false);
    add('maximum-out-of-range', ['--max-level', '6'], 0, 5, false);
    add('maximum-negative', ['--max-level', '-1'], 0, 5, false);
    add('maximum-missing', ['--max-level'], 0, 5, false);
    const bad = path.join(root, 'excluded-invalid.ndjson'); await fs.writeFile(bad, '{"service":"x","level":5,"value":null}\n');
    const output = path.join(root, 'excluded-invalid.json'); cases.push({ name: 'excluded-invalid', args: [bad, output, '--max-level', '0'], output, expectSuccess: false });
    add('repeat-two', ['--max-level', '4', '--min-level', '2', '--repeat', '2'], 2, 4);
    add('repeat-three', ['--repeat', '3', '--max-level', '2'], 0, 2);
    for (const [name, value] of [['zero', '0'], ['high', '1001'], ['fraction', '1.5']]) add('repeat-' + name, ['--repeat', value], 0, 5, false);
    add('repeat-missing', ['--repeat'], 0, 5, false);
    return { cases, maintenance_version: MAINTENANCE_SUITE_VERSION, stop: async () => {} };
  }
  if (task === 'index') {
    const files = [{ path: 'a.txt', data: Buffer.from('a\n') }, { path: 'UPPER.TXT', data: Buffer.from('B') }, { path: 'sub/b.txt', data: Buffer.from('x\ny') }, { path: 'sub/c.bin', data: Buffer.from([0, 10]) }, { path: 'папка/ёж.txt', data: Buffer.from('ёж') }, { path: 'no-extension', data: Buffer.alloc(0) }];
    const tree = path.join(root, 'tree'); await writeTree(tree, files);
    const add = (name, options, suffix = '', query = '', valid = true) => {
      const output = path.join(root, name + '.json');
      cases.push({ name, args: [tree, output, ...options], output, expected: valid ? indexOracle(files.filter(f => f.path.endsWith(suffix)), query) : undefined, expectSuccess: valid });
    };
    add('text-suffix', ['--extension', '.txt'], '.txt');
    add('uppercase-suffix', ['--extension', '.TXT'], '.TXT');
    add('literal-without-dot', ['--extension', 'txt'], 'txt');
    add('empty-suffix', ['--extension', '']);
    add('query-and-suffix', ['--extension', '.txt', '--query', 'sub/'], '.txt', 'sub/');
    add('unicode-and-suffix', ['--query', 'папка/', '--extension', '.txt'], '.txt', 'папка/');
    add('unmatched-suffix', ['--extension', '.missing'], '.missing');
    add('missing-suffix', ['--extension'], '', '', false);
    add('repeat-two', ['--extension', '.txt', '--query', 'sub/', '--repeat', '2'], '.txt', 'sub/');
    add('repeat-three', ['--repeat', '3', '--extension', '.TXT'], '.TXT');
    for (const [name, value] of [['zero', '0'], ['high', '1001'], ['fraction', '1.5']]) add('repeat-' + name, ['--repeat', value], '', '', false);
    add('repeat-missing', ['--repeat'], '', '', false);
    return { cases, maintenance_version: MAINTENANCE_SUITE_VERSION, stop: async () => {} };
  }
  if (task === 'http') {
    const fixture = await startServer();
    const add = async (name, routes, expectedExit = 0, flag = ['--fail-on-error'], valid = true) => {
      const urls = routes.map(route => `${fixture.baseUrl}/${name}/${route}`), input = path.join(root, name + '-config.json'), output = path.join(root, name + '-output.json');
      await fs.writeFile(input, JSON.stringify({ urls, concurrency: 2, timeout_ms: 80 }));
      cases.push({ name, args: [input, output, ...flag], output, expectSuccess: valid, expectedExit, expected: valid ? { results: routes.map((r, i) => response(urls[i], r)) } : undefined, http: valid ? { batch: name, urls, concurrency: 2, fixture } : undefined });
    };
    await add('flag-empty', []);
    await add('flag-all-success', ['ok', 'unicode', 'empty']);
    await add('flag-http-error', ['ok', 'notfound'], 1);
    await add('flag-server-error', ['servererror'], 1);
    await add('flag-network-error', ['drop', 'ok'], 1);
    await add('flag-timeout', ['slow'], 1);
    await add('no-flag-http-error', ['notfound'], 0, []);
    await add('flag-takes-no-value', [], 0, ['--fail-on-error', 'true'], false);
    await add('repeat-two', ['ok', 'unicode'], 0, ['--fail-on-error', '--repeat', '2']);
    cases.at(-1).http.repetitions = 2;
    await add('repeat-three', ['notfound', 'empty'], 0, ['--repeat', '3']);
    cases.at(-1).http.repetitions = 3;
    await add('repeat-earlier-failure', ['first-error'], 1, ['--fail-on-error', '--repeat', '3']);
    cases.at(-1).http.repetitions = 3;
    for (const [name, value] of [['zero', '0'], ['high', '1001'], ['fraction', '1.5']]) await add('repeat-' + name, [], 0, ['--repeat', value], false);
    await add('repeat-missing', [], 0, ['--repeat'], false);
    return { cases, fixture, maintenance_version: MAINTENANCE_SUITE_VERSION, stop: () => fixture.stop() };
  }
  throw new Error(`unknown task: ${task}`);
}

export async function prepareWorkload(task, workDir, scale = 'small') {
  await fs.mkdir(workDir, { recursive: true });
  const root = await fs.mkdtemp(path.join(workDir, `workload-${task}-`));
  const output = path.join(root, 'output.json');
  const sizes = { tiny: 0, small: 0, medium: 1, moderate: 2, large: 2, single: 0 };
  if (!(scale in sizes)) throw new Error(`unknown workload scale: ${scale}`);
  if (task === 'logs') {
    const n = [100, 1000, 10000][sizes[scale]], records = generatedRecords(n), input = path.join(root, 'input.ndjson');
    const text = records.map(r => JSON.stringify(r)).join('\n') + '\n'; await fs.writeFile(input, text);
    return { args: [input, output, '--min-level', '2'], expected: logsOracle(records, 2), units: n, workload_summary: { records: n, input_bytes: Buffer.byteLength(text) }, root, output, stop: async () => {} };
  }
  if (task === 'index') {
    const n = [20, 100, 500][sizes[scale]], files = Array.from({ length: n }, (_, i) => ({ path: `group-${i % 13}/file-${String(i).padStart(5, '0')}.txt`, data: Buffer.from(('line one\nстрока два\n' + i + '\n').repeat(1 + (i % 11))) }));
    const tree = path.join(root, 'tree'); await writeTree(tree, files);
    return { args: [tree, output], expected: indexOracle(files), units: n, workload_summary: { files: n, input_bytes: files.reduce((n, f) => n + f.data.length, 0) }, root, output, stop: async () => {} };
  }
  if (task === 'http') {
    const n = scale === 'single' ? 1 : [6, 12, 24][sizes[scale]], delay = [10, 20, 20][sizes[scale]];
    const fixture = await startServer(), batch = `perf-${crypto.randomBytes(4).toString('hex')}`, routes = scale === 'single' ? ['ok'] : Array.from({ length: n }, (_, i) => `delay/${delay}/item-${i}`);
    const urls = routes.map(r => `${fixture.baseUrl}/${batch}/${r}`), input = path.join(root, 'config.json');
    await fs.writeFile(input, JSON.stringify({ urls, concurrency: 3, timeout_ms: 1500 }));
    return { args: [input, output], expected: { results: routes.map((r, i) => response(urls[i], r)) }, units: n, workload_summary: { requests: n, concurrency: 3, delay_ms: scale === 'single' ? 0 : delay }, root, output, fixture, batch, stop: () => fixture.stop() };
  }
  throw new Error(`unknown task: ${task}`);
}

export async function prepareMaintenanceWorkload(task, workDir, scale = 'small') {
  const workload = await prepareWorkload(task, workDir, scale);
  if (task === 'logs') {
    const records = (await fs.readFile(workload.args[0], 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    workload.args.push('--max-level', '3');
    workload.expected = logsOracle(records.filter(r => r.level <= 3), 2);
  } else if (task === 'index') {
    const suffix = '00000.txt'; workload.args.push('--extension', suffix);
    const files = workload.expected.files.filter(f => f.path.endsWith(suffix));
    workload.expected = { files, total_bytes: files.reduce((n, f) => n + f.bytes, 0), total_lines: files.reduce((n, f) => n + f.lines, 0) };
  } else if (task === 'http') workload.args.push('--fail-on-error');
  workload.expectedExit = 0;
  return workload;
}

export async function prepareLongevityWorkload(task, workDir) {
  const workload = await prepareMaintenanceWorkload(task, workDir, 'small');
  if (task === 'http') {
    const config = JSON.parse(await fs.readFile(workload.args[0], 'utf8'));
    config.urls = config.urls.map(url => url.replace('/delay/10/', '/delay/2/'));
    await fs.writeFile(workload.args[0], JSON.stringify(config));
    workload.expected.results = workload.expected.results.map((result, i) => ({ ...result, url: config.urls[i] }));
    workload.workload_summary.delay_ms = 2;
  }
  const perIteration = workload.units;
  workload.args.push('--repeat', '200');
  workload.units *= 200;
  workload.workload_summary = { ...workload.workload_summary, iterations: 200, units_per_iteration: perIteration, total_units: workload.units };
  workload.maintenance_version = MAINTENANCE_SUITE_VERSION;
  return workload;
}
