import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { allocationCounters, readCounters, swap } from './codegen-counters.mjs';

const [host, specArg, output, distro = 'VelaRelease100', bench = 'G:/VelaBench'] = process.argv.slice(2);
assert.ok(['gcc','msvc'].includes(host) && specArg && output, 'pass host, specimen JSON and output');
const windows = host === 'msvc', root = process.cwd();
const spec = JSON.parse(await fs.readFile(specArg, 'utf8'));
const workload = path.resolve(spec.workload);
const work = await fs.mkdtemp(path.join(path.dirname(path.resolve(output)), 'compiler-cost-'));
const logs = path.join(work, 'logs');
await fs.mkdir(logs);
const target = value => {
    const absolute = path.resolve(value).replaceAll('\\', '/');
    return windows ? absolute : '/mnt/' + absolute[0].toLowerCase() + absolute.slice(2);
};
const describe = async file => {
    const bytes = await fs.readFile(file);
    return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const cc = windows ? process.env.VELA_CC || 'cl.exe' : 'gcc';
const fixed = windows ? ['/nologo','/TC','/std:c11','/utf-8','/O2','/fp:strict','/W3','/wd4102','/MT']
    : ['-std=c11','-O2','-ffp-contract=off'];
function call(exe, args, env = {}) {
    const vars = Object.entries(env).map(([name,value]) => name + '=' + value);
    const parameters = windows ? args : ['--distribution',distro,'--cd',target(root),'--exec',
        'env','VELA_CC=gcc','VELA_CC_KIND=cc',...vars,exe,...args];
    const result = spawnSync(windows ? exe : 'wsl.exe', parameters, { cwd: root, windowsHide: true, encoding: 'utf8',
        timeout: 300000, maxBuffer: 24 * 1024 * 1024, env: windows ? {...process.env,...env} : process.env });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, exe + ' ' + args.join(' ') + '\n' + result.stdout + result.stderr);
    return result.stdout;
}
const meter = path.join(work, 'linux-meter');
let winMeasure;
if (windows) ({ measure: winMeasure } = await import(pathToFileURL(path.resolve(bench, 'src/meter.mjs'))));
else call(cc, ['-std=c11','-Wall','-Wextra','-Werror','-O2',target('tests/library13/codegen/linux-meter.c'),'-o',target(meter)]);

const result = { stage: '1.3.5a', host, work, flags: fixed, workload: {}, variants: {}, ordinary: [], instrumented: [] };
const parent = path.dirname(workload);
for (const file of (await fs.readdir(parent)).filter(file => /\.(vela|project)$/.test(file))) {
    result.workload[file] = await describe(path.join(parent, file));
}
const save = () => fs.writeFile(output, JSON.stringify(result,null,2) + '\n');
const variants = Object.entries(spec.variants);
for (const [name, variant] of variants) {
    const original = await describe(variant.executable);
    if (variant.sha256) assert.equal(original.sha256,variant.sha256);
    if (variant.instrumented) {
        const previous = variant.instrumented;
        assert.deepEqual(previous.compiler,original);
        assert.deepEqual(await describe(previous.exe),previous.instrumented_compiler);
        result.variants[name] = previous;
        console.log(host,name,'verified archived phase compiler');
        continue;
    }
    const directory = path.join(work,name);
    const sources = path.join(directory,'selfhost');
    await fs.cp(variant.sources,sources,{recursive:true});
    const driver = path.join(sources,'driver.vela');
    let code = await fs.readFile(driver,'utf8');
    const graph = '    let p = project_load(io_value(absolute_path(input)), json_mode);';
    code = swap(code,graph,'    let audit_begin = cost_stamp();\n' + graph);
    const parsedGraph = '    c.debug_codegen = debug_codegen;';
    code = swap(code,parsedGraph,parsedGraph + '\n    let audit_graph = cost_stamp();');
    const analyzed = '    analyze_mode(c, command != "symbols" && command != "api");';
    code = swap(code,analyzed,'    let audit_parse = cost_stamp();\n' + analyzed
        + '\n    let audit_end = cost_stamp();\n'
        + '    eprint(f"cost graph={audit_graph - audit_begin:d} parse={audit_parse - audit_graph:d} semantic={audit_end - audit_parse:d}");');
    code += '\nfn cost_stamp() -> Int effects { io, process } {\n'
        + '    match monotonic_millis() {\n'
        + '        IntResult::Ok(value) => { return value; }\n'
        + '        IntResult::Err(error) => { panic(error); }\n'
        + '    }\n}\n';
    await fs.writeFile(driver,code);
    const c = path.join(directory,'compiler.c'), exe = path.join(directory,windows ? 'phases.exe' : 'phases');
    call(target(variant.executable),['emit-c',target(path.join(sources,'vela.project')),'-o',target(c)]);
    let generated = allocationCounters(await fs.readFile(c,'utf8'));
    const declarations = 'typedef struct { const char *data; size_t length; const void *owner; } v_string;';
    generated = swap(generated,declarations,`static uint64_t audit_copies, audit_copied;
static void *audit_memcpy(void *to, const void *from, size_t bytes) {
    ++audit_copies; audit_copied += bytes; return memcpy(to, from, bytes);
}
#define memcpy audit_memcpy
${declarations}`);
    const teardown = 'static void v_runtime_free(void) {';
    generated = swap(generated,teardown,teardown + '\n    fprintf(stderr, "cost copies=%" PRIu64 " copied=%" PRIu64 "\\n", audit_copies, audit_copied);');
    await fs.writeFile(c,generated);
    call(cc,[...fixed,...(windows ? ['/Fo'+target(exe+'.obj'),'/Fe'+target(exe),target(c),'/link','/INCREMENTAL:NO']
        : [target(c),'-o',target(exe),'-lm'])]);
    result.variants[name] = { compiler: original, exe, instrumented_compiler: await describe(exe),
        instrumented_c: await describe(c), instrumented_driver: await describe(driver) };
    await save();
    console.log(host,name,'phase compiler built');
}

const args = ['check',target(workload),'--json'];
let oracle;
async function measure(exe, instrumented) {
    let run, stdout, stderr;
    if (windows) {
        if (instrumented) process.env.VELA_GC_REPORT='1';
        try { run=await winMeasure({exe,args,cwd:root,logDir:logs,timeoutMs:180000}); }
        finally { delete process.env.VELA_GC_REPORT; }
        stdout=run.stdout_path;
        stderr=run.stderr_path;
    } else {
        const id=randomUUID();
        stdout=path.join(logs,id+'.out');
        stderr=path.join(logs,id+'.err');
        run=JSON.parse(call(target(meter),['180000',target(stdout),target(stderr),exe,...args],{
            VELA_GC_REPORT:instrumented?'1':'0',VELA_TRACE:'0',VELA_PROFILE:'0',VELA_GC_STRESS:'0',
        }));
    }
    assert.deepEqual([run.exit_code,run.timed_out,run.active_processes_after],[0,false,0]);
    const out=await fs.readFile(stdout,'utf8');
    assert.equal(JSON.parse(out).ok,true);
    if (oracle===undefined) oracle=out;
    assert.equal(out,oracle);
    const error=await fs.readFile(stderr,'utf8');
    const data={wall_ms:run.wall_ms,cpu_ms:run.cpu_ms,
        peak_tree_bytes:run.peak_job_commit_bytes??run.peak_tree_rss_bytes,
        peak_process_bytes:windows?run.parent_peak_working_set_bytes:run.peak_process_rss_bytes};
    if (!instrumented) {
        assert.equal(error,'');
        return data;
    }
    const phases=/cost graph=(\d+) parse=(\d+) semantic=(\d+)/.exec(error);
    const copies=/cost copies=(\d+) copied=(\d+)/.exec(error);
    assert.ok(phases&&copies,error);
    return {...data,graph_ms:+phases[1],parse_ms:+phases[2],semantic_ms:+phases[3],
        copies:+copies[1],copied_bytes:+copies[2],...readCounters(error)};
}
for (const [kind, rounds] of [['ordinary',5],['instrumented',3]]) {
    const instrumented=kind==='instrumented';
    const execute=([name,v])=>measure(target(instrumented?result.variants[name].exe:v.executable),instrumented);
    for (const variant of variants) await execute(variant);
    for (let round=0;round<rounds;round++) {
        const sample={};
        for (const variant of round%2?[...variants].reverse():variants) sample[variant[0]]=await execute(variant);
        result[kind].push(sample);
        await save();
        console.log(host,kind,'round',round+1);
    }
}
result.summary=Object.fromEntries(['ordinary','instrumented'].map(kind=>[kind,Object.fromEntries(variants.map(([name])=>{
    const raw=result[kind].map(row=>row[name]);
    return [name,Object.fromEntries(Object.keys(raw[0]).map(key=>{
        const sorted=raw.map(row=>row[key]).sort((a,b)=>a-b);
        return [key,{min:sorted[0],median:sorted[Math.floor(sorted.length/2)],max:sorted.at(-1)}];
    }))];
}))]));
result.complete=true;
await save();
