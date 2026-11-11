import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [reference, candidate, frozen, report, bench = 'G:/VelaBench'] = process.argv.slice(2);
assert.ok(reference && candidate && frozen && report,
    'pass reference compiler, candidate compiler, frozen selfhost and output JSON');
const { measure } = await import(pathToFileURL(path.resolve(bench, 'src/meter.mjs')));
const work = await fs.mkdtemp(path.join(path.dirname(path.resolve(report)), 'semantic-profile-'));
const copied = path.join(work, 'selfhost');
await fs.cp(frozen, copied, { recursive: true });
const entry = path.join(copied, 'driver.vela');
const original = await fs.readFile(entry, 'utf8');
const edited = original + '\n// Vela 1.3 profile: comment-only edit\n';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const binaries = { reference: path.resolve(reference), candidate: path.resolve(candidate) };
const phases = ['cold', 'warm', 'edit'];
const data = { stage: '1.3.5', work, baseline: '1.3.4l', scope: 'Same frozen authored selfhost graph',
    binaries: {}, original_sha256: sha256(original), edited_sha256: sha256(edited), sources: {}, runs: [] };
for (const [variant, exe] of Object.entries(binaries)) data.binaries[variant] = sha256(await fs.readFile(exe));
for (const file of (await fs.readdir(copied)).filter(file => file.endsWith('.vela') && file !== 'compiler.vela')) {
    data.sources[file] = sha256(await fs.readFile(path.join(copied, file)));
}
for (const variable of ['VELA_TRACE', 'VELA_PROFILE', 'VELA_GC_STRESS', 'VELA_GC_REPORT']) delete process.env[variable];
const save = () => fs.writeFile(report, JSON.stringify(data, null, 2) + '\n');
for (let round = 0; round <= 5; round++) {
    await fs.writeFile(entry, original);
    const row = {};
    const order = round % 2 ? ['candidate', 'reference'] : ['reference', 'candidate'];
    for (const phase of phases) {
        if (phase === 'edit') await fs.writeFile(entry, edited);
        row[phase] = {};
        let stdout;
        for (const variant of order) {
            const cache = path.join(work, variant + '-' + round);
            const run = await measure({ exe: binaries[variant],
                args: ['check', entry, '--cache', cache, '--cache-report', '--json'],
                cwd: process.cwd(), timeoutMs: 45000, logDir: path.join(work, 'logs') });
            assert.deepEqual([run.exit_code, run.timed_out, run.active_processes_after], [0, false, 0]);
            const output = await fs.readFile(run.stdout_path, 'utf8');
            assert.equal(JSON.parse(output).ok, true);
            if (stdout !== undefined) assert.equal(output, stdout);
            stdout = output;
            const events = (await fs.readFile(run.stderr_path, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
            const checkStatus = phase === 'warm' ? 'hit' : 'miss';
            assert.ok(events.some(event => event.layer === 'check-v1' && event.phase === 'read' && event.status === checkStatus));
            const semantics = events.find(event => event.layer === 'semantic-modules-v1' && event.phase === 'analysis');
            if (variant === 'candidate') {
                const reason = { cold: 'full', warm: 'exact', edit: 'token_equivalent' }[phase];
                assert.equal(semantics.reason, reason);
                assert.ok(semantics.modules >= 30);
                if (phase === 'cold') assert.deepEqual([semantics.declarations_checked, semantics.reused_modules], [semantics.modules, 0]);
                else assert.deepEqual([semantics.declarations_checked, semantics.bodies_checked, semantics.reused_modules], [0, 0, semantics.modules]);
            }
            row[phase][variant] = { wall_ms: run.wall_ms, cpu_ms: run.cpu_ms,
                peak_tree_bytes: run.peak_job_commit_bytes, peak_process_bytes: run.parent_peak_working_set_bytes,
                analysis: semantics && Object.fromEntries(['reason', 'modules', 'declarations_checked', 'bodies_checked', 'reused_modules']
                    .map(key => [key, semantics[key]])) };
        }
    }
    if (round) data.runs.push(row);
    await save();
    console.log('semantic cache performance round ' + round);
}
data.summary = Object.fromEntries(phases.map(phase => [phase, Object.fromEntries(Object.keys(binaries).map(variant => {
    const first = data.runs[0][phase][variant];
    const medians = Object.fromEntries(Object.keys(first).filter(key => key !== 'analysis').map(key => {
        const sorted = data.runs.map(row => row[phase][variant][key]).sort((a, b) => a - b);
        return [key, { median: sorted[2], min: sorted[0], max: sorted[4] }];
    }));
    return [variant, medians];
}))]));
const { reference: before, candidate: after } = data.summary.edit;
data.edit_gain_percent = 100 * (before.wall_ms.median - after.wall_ms.median) / before.wall_ms.median;
data.complete = true;
await save();
assert.ok(data.edit_gain_percent >= 20, 'comment-edit wall gain below 20%');
for (const phase of phases) {
    const { reference, candidate } = data.summary[phase];
    assert.ok(candidate.peak_tree_bytes.median <= reference.peak_tree_bytes.median * 1.10, phase + ' peak tree exceeds budget');
}
console.log('comment-edit wall gain ' + data.edit_gain_percent.toFixed(2) + '%');
