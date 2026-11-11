import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const [baselineFile, comparisonFile, output] = process.argv.slice(2);
assert.ok(baselineFile && comparisonFile && output,
    'usage: node codegen-compare.mjs BASELINE.json PAIRED.json OUTPUT.json');
const [baseline, comparison] = await Promise.all([baselineFile, comparisonFile].map(async file =>
    JSON.parse(await readFile(file, 'utf8'))));
assert.equal(baseline.complete, true);
assert.equal(baseline.paired_same_compiler, true);
assert.equal(comparison.complete, true);
assert.equal(comparison.host, baseline.host);

function percentage(value, reference) {
    return Number.isFinite(value) && Number.isFinite(reference) && reference > 0
        ? 100 * (value - reference) / reference : null;
}
function metrics(baselineValues, referenceValues, candidateValues) {
    return Object.fromEntries(Object.keys(candidateValues).map(key => {
        const fixed = baselineValues[key]?.median ?? null;
        const previous = referenceValues[key]?.median ?? null;
        const candidate = candidateValues[key]?.median ?? null;
        return [key, { fixed, previous, candidate, previous_percent: percentage(candidate, previous),
            fixed_percent: percentage(candidate, fixed) }];
    }));
}
function pairedNoise(rows) {
    const deltas = rows.map(({ reference, candidate }) => Math.abs(reference.wall_ms - candidate.wall_ms)
        * 200 / (reference.wall_ms + candidate.wall_ms)).sort((a, b) => a - b);
    return deltas[Math.floor(deltas.length / 2)];
}
function comparisonMetrics(fixed, pair) {
    assert.equal(fixed.raw.length, 5);
    assert.equal(pair.raw.length, 5);
    return {
        timing: metrics(fixed.ranges.reference, pair.ranges.reference, pair.ranges.candidate),
        fixed_wall_noise_percent: pairedNoise(fixed.raw),
    };
}
function counts(fixed, previous, candidate) {
    return Object.fromEntries(Object.keys(candidate).map(key => [key,
        { fixed: fixed[key] ?? null, previous: previous[key] ?? null, candidate: candidate[key],
            previous_percent: percentage(candidate[key], previous[key]),
            fixed_percent: percentage(candidate[key], fixed[key]) }]));
}

const workloads = {};
for (const row of comparison.workloads) {
    const original = baseline.workloads.find(value => value.program === row.program && value.size === row.size);
    assert.ok(original);
    assert.deepEqual(row.input, original.input);
    workloads[row.program + '/' + row.size] = {
        ...comparisonMetrics(original.timing, row.timing),
        counters: counts(original.counters.reference, row.counters.reference, row.counters.candidate),
    };
}
assert.equal(Object.keys(workloads).length, baseline.workloads.length);
const code = {};
for (const [key, current] of Object.entries(comparison.artifacts)) {
    if (!key.startsWith('candidate/')) continue;
    const program = key.slice('candidate/'.length);
    const original = baseline.artifacts['reference/' + program];
    const previous = comparison.artifacts['reference/' + program];
    assert.ok(original && previous);
    code[program] = {
        emitted: counts(original.emitted, previous.emitted, current.emitted),
        c_bytes: counts({ size: original.c.bytes }, { size: previous.c.bytes }, { size: current.c.bytes }).size,
        executable_bytes: counts({ size: original.exe.bytes }, { size: previous.exe.bytes }, { size: current.exe.bytes }).size,
    };
}
const builds = {};
for (const row of comparison.builds) {
    const original = baseline.builds.find(value => value.name === row.name);
    assert.ok(original);
    const phases = Object.fromEntries(Object.entries(row.phases).map(([phase, pair]) =>
        [phase, comparisonMetrics(original.phases[phase], pair)]));
    const emitted = counts(original.artifacts.reference.emitted,
        row.artifacts.reference.emitted, row.artifacts.candidate.emitted);
    const sizesOf = artifact => ({ package: artifact.package.bytes, c: artifact.c.bytes, exe: artifact.exe.bytes });
    const sizes = counts(sizesOf(original.artifacts.reference), sizesOf(row.artifacts.reference),
        sizesOf(row.artifacts.candidate));
    builds[row.name] = { phases, emitted, sizes };
}
await writeFile(output, JSON.stringify({ host: comparison.host, workloads, code, builds }, null, 2) + '\n');
