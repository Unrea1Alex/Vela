import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const [compiler, output] = process.argv.slice(2).map(value => path.resolve(value));
assert.ok(compiler && output, 'pass compiler and test output directory');
const run = promisify(execFile);
const invoke = (args) => run(compiler, args, { windowsHide: true, maxBuffer: 24 * 1024 * 1024, timeout: 120000 });
const json = async (args) => JSON.parse((await invoke(args)).stdout);
const base = await fs.mkdtemp(path.join(output, 'incremental-'));
const cache = path.join(base, 'cache');
const root = path.join(base, 'main.vela');
const lib = path.join(base, 'lib.vela');
const manifest = path.join(base, 'vela.project');
const checks = [];
await fs.mkdir(cache);
const write = (file, value) => fs.writeFile(file, value);
const score = (type, value) => write(lib, `pub fn score() -> ${type} { return ${value}; }\n`);
const checkArgs = ['check', root, '--cache', cache];
const emitArgs = ['emit-c', root, '--cache', cache];
await score('Int', '7');
await write(root, 'import "lib.vela" as sample;\nfn main() -> Int { return sample::score(); }\n');

const plain = (await invoke(['emit-c', root])).stdout;
const first = (await invoke(emitArgs)).stdout;
assert.equal(first, plain);
assert.equal((await invoke(emitArgs)).stdout, plain);
const records = await fs.readdir(cache);
assert.equal(records.length, 3);
checks.push('cold and warm C byte equality');

const entry = path.join(cache, records[0]);
await write(entry, 'damaged record\n');
assert.equal((await invoke(emitArgs)).stdout, plain);
assert.match(await fs.readFile(entry, 'utf8'), /^VLC1\n/);
checks.push('corrupt cache recovery');

await invoke(checkArgs);
const beforeCheck = await fs.readdir(cache);
await invoke(checkArgs);
assert.deepEqual(await fs.readdir(cache), beforeCheck);
await score('Bool', 'true');
await assert.rejects(invoke(checkArgs), (error) => error.code === 1 && /E201/.test(error.stderr));
await score('Int', '9');
const changed = (await invoke(emitArgs)).stdout;
assert.notEqual(changed, plain);
assert.equal(changed, (await invoke(['emit-c', root])).stdout);
checks.push('changed imported source invalidates check and C');

const renamed = (await invoke([...emitArgs, '--source-name', 'virtual.vela'])).stdout;
assert.notEqual(renamed, changed);
assert.equal(renamed, (await invoke(['emit-c', root, '--source-name', 'virtual.vela'])).stdout);
await assert.rejects(invoke([...emitArgs, '-o', lib]), (error) => error.code === 2 && /overwrite source/.test(error.stderr));
checks.push('source-name key and output protection on a warm cache');

await write(root, 'import "@sample" as sample;\nfn main() -> Int { return sample::score(); }\n');
await write(manifest, 'vela-project|1\nname|incremental_fixture\nentry|main.vela\ndep|sample|lib.vela\n');
await invoke(['lock', manifest]);
const checkedProject = ['check', manifest, '--cache', cache];
await invoke(checkedProject);
await score('Int', '10');
await assert.rejects(invoke(checkedProject), (error) => error.code !== 0 && /lock/i.test(error.stderr));
await invoke(['lock', manifest]);
await invoke(checkedProject);
checks.push('project lock is verified even on cache hit');

const simultaneous = path.join(base, 'concurrent');
await fs.mkdir(simultaneous);
const shared = ['emit-c', manifest, '--cache', simultaneous];
const concurrent = await Promise.all([invoke(shared), invoke(shared), invoke(shared)]);
assert.ok(concurrent.every(result => result.stdout === concurrent[0].stdout));
assert.ok((await fs.readdir(simultaneous)).every(name => /^vela-cache-v1-[a-f0-9]{64}$/.test(name)));
checks.push('concurrent cache publication');

const fixturePage = await json(['query', manifest, '--page', '1']);
await write(root, 'import "@sample" as sample;\nfn main() -> Int { return sample::score() + 1; }\n');
await assert.rejects(invoke(['query', manifest, '--page', '1', '--offset', '1', '--revision', fixturePage.page.revision]),
  (error) => error.code !== 0 && /Stale query continuation/.test(error.stderr + error.stdout));
checks.push('stale continuation rejected');

const pageStats = [];
for (const input of ['apps/fielddesk/vela.project', 'apps/source-lens/vela.project', 'selfhost/compiler.vela']) {
  const full = await json(['query', input]);
  const pageSize = '2000';
  const joined = { definitions: [], references: [], imports: [] };
  let page = await json(['query', input, '--page', pageSize]);
  let pages = 0;
  while (true) {
    pages++;
    assert.equal(page.revision, full.revision);
    assert.deepEqual(page.scope, full.scope);
    assert.deepEqual(page.documents, full.documents);
    for (const field of Object.keys(joined)) joined[field].push(...page[field]);
    if (page.page.next_offset === null) break;
    page = await json(['query', input, '--page', pageSize, '--offset', String(page.page.next_offset), '--revision', page.page.revision]);
  }
  for (const field of Object.keys(joined)) assert.deepEqual(joined[field], full[field], `${input} ${field}`);
  pageStats.push({ input, pages, records: page.page.total });
  if (input.startsWith('apps/fielddesk')) {
    assert.deepEqual(full.scope, { root: 'entry', excluded_test_roots: 1 });
    const transform = full.definitions.find(item => item.name === 'transform');
    assert.ok(transform);
    const plan = await json(['plan', input, full.revision, String(transform.range.document), String(transform.range.start.byte), 'map_measurements']);
    assert.deepEqual(plan.scope, full.scope);
    assert.ok(plan.changes.length > 0);
    assert.ok(plan.changes.every(change => !change.path.endsWith('/tests.vela')));
  }
}
checks.push('page parity on FieldDesk, SourceLens and selfhost', 'FieldDesk entry-only rename scope');
console.log(JSON.stringify({ checks, pageStats }));
