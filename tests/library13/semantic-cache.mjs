import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const [compilerArg, referenceArg, outputArg] = process.argv.slice(2);
assert.ok(compilerArg && referenceArg && outputArg, 'pass candidate compiler, reference compiler and output directory');
const compiler = path.resolve(compilerArg), reference = path.resolve(referenceArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: true });
const base = await fs.mkdtemp(path.join(output, 'module-cache-'));
const run = promisify(execFile);
const evidence = { stage: '1.3.5', checks: [] };
const record = (name, data = {}) => evidence.checks.push({ name, ...data });
const hash = value => createHash('sha256').update(value).digest('hex');
async function invoke(exe, args, expected = 0) {
    const result = await run(exe, args, { windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024 })
        .then(result => ({ ...result, code: 0 }), error => {
            if (typeof error.code !== 'number') throw error;
            return error;
        });
    assert.equal(result.code, expected, args.join(' ') + '\n' + result.stdout + result.stderr);
    return result;
}
const call = (args, code) => invoke(compiler, args, code);
const events = result => result.stderr.split(/\r?\n/).filter(Boolean).map(JSON.parse);
const checkWithCache = (file, cache, code) => call(['check', file, '--cache', cache, '--cache-report', '--json'], code);
const checkFull = (file, code) => call(['check', file, '--json'], code);
const counts = event => [event.modules, event.declarations_checked, event.bodies_checked, event.reused_modules];
async function check(file, cache, reason, expected) {
    const cached = await checkWithCache(file, cache);
    assert.equal(cached.stdout, (await checkFull(file)).stdout);
    assert.equal(cached.stdout, (await invoke(reference, ['check', file, '--json'])).stdout);
    const report = events(cached).find(event => event.phase === 'analysis');
    assert.equal(report.reason, reason, cached.stderr);
    assert.deepEqual(counts(report), expected);
    return report;
}
async function reject(file, cache, expected) {
    const cached = await checkWithCache(file, cache, 1);
    assert.equal(cached.stdout, (await checkFull(file, 1)).stdout);
    assert.equal(cached.stdout, (await invoke(reference, ['check', file, '--json'], 1)).stdout);
    const diagnostic = JSON.parse(cached.stdout).diagnostics[0];
    assert.equal(diagnostic.code, expected);
    assert.ok(!events(cached).some(event => event.phase === 'analysis'
        || event.phase === 'write' && ['semantic-modules-v1', 'check-v1'].includes(event.layer)));
    return diagnostic;
}
const queryOutput = result => {
    const value = JSON.parse(result.stdout);
    delete value.revision;
    return value;
};
async function queryParity(args, expected = 0) {
    const actual = queryOutput(await call(args, expected));
    assert.deepEqual(actual, queryOutput(await invoke(reference, args, expected)));
    return actual;
}
async function generated(file, cache) {
    const [current, uncached, old] = await Promise.all([
        call(['emit-c', file, '--cache', cache, '--cache-report']), call(['emit-c', file]), invoke(reference, ['emit-c', file]),
    ]);
    assert.equal(current.stdout, uncached.stdout);
    assert.equal(current.stdout, old.stdout);
    const warm = await call(['emit-c', file, '--cache', cache, '--cache-report']);
    assert.equal(current.stdout, warm.stdout);
    assert.ok(events(warm).some(event => event.layer === 'c-v1' && event.status === 'hit'));
    return hash(current.stdout);
}

const main = path.join(base, 'main.vela'), hub = path.join(base, 'hub.vela');
const left = path.join(base, 'left.vela'), right = path.join(base, 'right.vela');
const cache = path.join(base, 'cache'), manifest = path.join(base, 'vela.project');
const test = path.join(base, 'tests.vela');
const entry = second => `import "hub.vela" as hub;\nimport "${second}" as side;\n`
    + 'fn main() -> Int effects { io } { print(hub::answer()); print(side::answer()); return 0; }\n';
const intermediary = effect => 'import "left.vela" as left;\n'
    + `pub fn answer() -> Int ${effect} { return left::value(); }\n`;
const leftValue = n => `pub fn value() -> Int { return ${n}; }\n`;
await fs.writeFile(main, entry('right.vela'));
await fs.writeFile(hub, intermediary(''));
await fs.writeFile(left, leftValue(7));
await fs.writeFile(right, 'pub fn answer() -> Int { return 11; }\n');
await fs.writeFile(test, 'test "independent root" { assert_true(1 + 2 == 3, "sum"); }\n');
await fs.writeFile(manifest, 'vela-project|1\nname|cache_gate\nentry|main.vela\ntest|tests.vela\n');

const cold = await check(manifest, cache, 'full', [4, 4, 4, 0]);
const warm = await check(manifest, cache, 'exact', [4, 0, 0, 4]);
record('cold and warm scopes', { cold: counts(cold), warm: counts(warm) });
const beforeComment = await queryParity(['query', manifest, '--json']);
const beforeC = await generated(manifest, cache);
await fs.writeFile(left, '// я😀\r\n' + leftValue(7));
const comment = await check(manifest, cache, 'token_equivalent', [4, 0, 0, 4]);
const currentQuery = await queryParity(['query', manifest, '--json']);
assert.notDeepEqual(beforeComment, currentQuery);
const commentC = await generated(manifest, cache);
assert.notEqual(commentC, beforeC);
record('trivia reuses the graph while query spans and C use current positions', { modules: counts(comment), beforeC, commentC });

await fs.writeFile(left, leftValue(8));
const body = await check(manifest, cache, 'mixed', [4, 4, 1, 3]);
const bodyC = await generated(manifest, cache);
assert.notEqual(bodyC, commentC);
record('private body edit checks one module', { modules: counts(body), c_sha256: bodyC });

const proofFile = path.join(cache, 'vela-cache-v1-' + body.key);
const accepted = await fs.readFile(proofFile, 'utf8');
const effectful = 'pub fn value() -> Int effects { io } { print("effect"); return 8; }\n';
await fs.writeFile(left, effectful);
const effect = await reject(manifest, cache, 'E209');
assert.equal(await fs.readFile(proofFile, 'utf8'), accepted);
await fs.writeFile(hub, intermediary('effects { io }'));
const api = await check(manifest, cache, 'mixed', [4, 4, 3, 1]);
record('public effect changes invalidate transitive importers', { modules: counts(api), diagnostic: effect });

const overlay = path.join(base, 'overlay.txt');
await fs.writeFile(overlay, '// 😀\n' + 'pub fn value() -> Bool effects { io } { return true; }\n');
const overlayQuery = await queryParity(['query', manifest, '--json', '--overlay', left, overlay], 1);
assert.equal(overlayQuery.diagnostics[0].code, 'E201');
assert.equal(await fs.readFile(left, 'utf8'), effectful);
await check(manifest, cache, 'exact', [4, 0, 0, 4]);
record('unsaved dependency query sees its diagnostic and preserves the successful disk graph');

await fs.writeFile(left, 'pub fn value() -> Bool { return true; }\n');
await reject(manifest, cache, 'E201');
await fs.writeFile(hub, 'import "left.vela" as left;\n'
    + 'pub fn answer() -> Int { if left::value() { return 8; } return 0; }\n');
const changedType = await check(manifest, cache, 'mixed', [4, 4, 3, 1]);
record('public return type invalidates transitive consumers', { modules: counts(changedType) });

const moved = path.join(base, 'moved.vela');
await fs.rename(right, moved);
await reject(manifest, cache, 'E221');
await fs.writeFile(main, entry('moved.vela'));
const renamed = await check(manifest, cache, 'full', [4, 4, 4, 0]);
const selected = await check(test, cache, 'full', [1, 1, 1, 0]);
const tests = JSON.parse((await call(['test', manifest, '--json'])).stdout);
assert.deepEqual([tests.passed, tests.failed], [1, 0]);
record('missing and renamed imports and an independent declared test root', { renamed: counts(renamed), test: counts(selected) });

const currentProof = path.join(cache, 'vela-cache-v1-' + renamed.key);
await fs.writeFile(currentProof, 'bad envelope');
await fs.appendFile(main, '// damaged envelope\n');
const damaged = await checkWithCache(manifest, cache);
assert.ok(events(damaged).some(event => event.layer === 'semantic-modules-v1' && event.reason === 'corrupt'));
assert.deepEqual(counts(events(damaged).find(event => event.phase === 'analysis')), [4, 4, 4, 0]);
const invalid = 'VSM1\nscalar\ninvalid row\n';
await fs.writeFile(currentProof, 'VLC1\n' + renamed.key + '\n' + hash(invalid) + '\n' + invalid);
await fs.appendFile(main, '// malformed payload\n');
const malformed = await checkWithCache(manifest, cache);
assert.equal(malformed.stdout, (await checkFull(manifest)).stdout);
assert.ok(events(malformed).some(event => event.layer === 'semantic-modules-v1' && event.reason === 'invalid_modules'));
assert.deepEqual(counts(events(malformed).find(event => event.phase === 'analysis')), [4, 4, 4, 0]);
await fs.appendFile(main, '// concurrent writers\n');
const concurrent = await Promise.all([checkWithCache(manifest, cache), checkWithCache(manifest, cache)]);
assert.ok(concurrent.every(item => item.stdout === malformed.stdout));
assert.ok((await fs.readdir(cache)).every(file => /^vela-cache-v1-[a-f0-9]{64}$/.test(file)));
record('checksum and shape corruption fall back and concurrent publication stays atomic');

const generic = path.join(base, 'generic.vela'), genericMain = path.join(base, 'generic-main.vela');
await fs.writeFile(generic, 'pub fn id<T>(value: T) -> T { return value; }\n');
await fs.writeFile(genericMain, 'import "generic.vela" as gen;\nfn main() -> Int { return gen::id(1); }\n');
await check(genericMain, cache, 'full', [2, 2, 2, 0]);
await fs.appendFile(generic, '// generic trivia\n');
await check(genericMain, cache, 'token_equivalent', [2, 0, 0, 2]);
await fs.writeFile(generic, 'pub fn id<T>(value: T) -> T { return true; }\n');
const genericError = await reject(genericMain, cache, 'E201');
await fs.writeFile(generic, 'pub fn id<T>(value: T) -> T { let copy = value; return copy; }\n');
const genericEdit = await check(genericMain, cache, 'full', [2, 2, 2, 0]);
record('generic body edits recheck dependent instantiations', { modules: counts(genericEdit), diagnostic: genericError });

const worker = path.join(base, 'worker.vela'), asyncMain = path.join(base, 'async-main.vela');
await fs.writeFile(worker, 'pub fn work() -> Unit effects { io } {}\n');
await fs.writeFile(asyncMain, 'import "worker.vela" as worker;\n'
    + 'async fn task() -> Unit effects { io } { worker::work(); }\nfn main() -> Int { return 0; }\n');
await check(asyncMain, cache, 'full', [2, 2, 2, 0]);
await fs.writeFile(worker, 'pub fn work() -> Unit effects { io } { print(1); }\n');
const asyncError = await reject(asyncMain, cache, 'E241');
record('transitive blocking in a suspending graph remains rejected', { diagnostic: asyncError });

const cycleMain = path.join(base, 'cycle-main.vela');
const cycleA = path.join(base, 'cycle-a.vela'), cycleB = path.join(base, 'cycle-b.vela');
await fs.writeFile(cycleMain, 'import "cycle-a.vela" as a; import "moved.vela" as side;\n'
    + 'fn main() -> Int effects { io } { print(a::score() + side::answer()); return 0; }\n');
await fs.writeFile(cycleA, 'import "cycle-b.vela" as b; pub fn score() -> Int { return b::score(); }\n');
await fs.writeFile(cycleB, 'import "cycle-a.vela" as a; pub fn score() -> Int { return 7; }\n');
await check(cycleMain, cache, 'full', [4, 4, 4, 0]);
await fs.writeFile(cycleA, 'import "cycle-b.vela" as b; pub fn score() -> Int effects { io } { return b::score(); }\n');
await fs.writeFile(cycleB, 'import "cycle-a.vela" as a; pub fn score() -> Int effects { io } { print(7); return 7; }\n');
const cycle = await check(cycleMain, cache, 'mixed', [4, 4, 3, 1]);
record('public invalidation terminates through a cycle', { modules: counts(cycle) });

const literal = path.join(base, 'literal.vela');
const literalCode = content => `fn main() -> Unit effects { io } { print(f"{1:d} // ${content}"); }\n`;
await fs.writeFile(literal, literalCode('original'));
await check(literal, cache, 'full', [1, 1, 1, 0]);
await fs.writeFile(literal, literalCode('edited'));
const literalEdit = await check(literal, cache, 'full', [1, 1, 1, 0]);
record('comment-like text inside interpolation remains significant', { modules: counts(literalEdit) });

const companion = path.join(base, 'fixture.dll');
await invoke(process.env.VELA_CC || 'cl.exe', ['/nologo', '/LD', '/TC', '/std:c11', '/utf-8', '/O2', '/MT',
    '/Fo' + path.join(base, 'fixture.obj'), 'tests/ffi/adapter.c', '/link', '/OUT:' + companion,
    '/IMPLIB:' + path.join(base, 'fixture.lib')]);
await fs.appendFile(manifest, 'native|fixture.dll|fixture.dll|windows-x64|1|shared\n');
await call(['lock', manifest]);
const firstLock = await check(manifest, cache, 'full', [4, 4, 4, 0]);
await fs.appendFile(companion, ' changed');
const stale = await reject(manifest, cache, 'E226');
await call(['lock', manifest]);
const newLock = await check(manifest, cache, 'full', [4, 4, 4, 0]);
assert.notEqual(newLock.key, firstLock.key);
record('native byte and lock changes separate successful checks', { before: firstLock.key, after: newLock.key, diagnostic: stale });

await fs.writeFile(path.join(output, 'focused.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ stage: evidence.stage, checks: evidence.checks.length }));
