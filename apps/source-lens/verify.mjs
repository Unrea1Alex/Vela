// Optional host acceptance harness. Native build/runtime do not require Node.js.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const app=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(app,'../..');
const compiler=path.resolve(process.argv[2]??path.join(repo,'bin/velac.exe')),exe=path.join(app,'bin/source-lens.exe');
const evidencePath=path.resolve(process.argv[3]??path.join(app,'validation.json'));
await fs.mkdir(path.join(repo,'build/source-lens'),{recursive:true});
const work=await fs.mkdtemp(path.join(repo,'build/source-lens/acceptance-'));
const input=path.join(work,'индекс 🌿.json'),output=path.join(work,'отчёт.html');
const checks=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
const native=(...args)=>{
 const r=spawnSync(compiler,args,{encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,timeout:60000});
 assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;
};
const original=native('query',path.join(app,'demo/main.vela'));
const model=JSON.parse(original);
function run(args=[input,output],expected=0,stress=false){
 const env={...process.env,PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot};
 delete env.VELA_GC_STRESS;delete env.VELA_GC_REPORT;
 if(stress){env.VELA_GC_STRESS='1';env.VELA_GC_REPORT='1'}
 const r=spawnSync(exe,args,{cwd:work,env,encoding:'utf8',windowsHide:true,timeout:stress?60000:30000,maxBuffer:2*1024*1024});
 assert.equal(r.status,expected,r.stderr||String(r.error));return r;
}
await fs.writeFile(input,original);
const demo=run();
// Independently counted in the three demo sources: 12 declarations; 7+6+2+3+5+2 call sites.
assert.equal(demo.stdout.trim(),'modules=3 functions=12 calls=25 imports=3');
assert.equal(demo.stderr,'');
const html=await fs.readFile(output);
assert.equal((html.toString().match(/class="function"/g)||[]).length,12);
assert.match(html.toString(),/Int \| String/);
assert.match(html.toString(),/Документация|pipeline\.vela/);
checks.push('real native query: exact modules/functions/call sites/imports; generic result types');
const stressStart=performance.now(),stress=run([input,output],0,true);
const stressMs=Math.round(performance.now()-stressStart);
assert.ok(html.equals(await fs.readFile(output)));
assert.match(stress.stderr,/collections=([1-9]\d*)/);
const collections=Number(stress.stderr.match(/collections=(\d+)/)[1]);
checks.push('Unicode paths and byte-identical output under forced GC with system-only PATH');

async function reject(name,value,message){
 await fs.writeFile(input,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));
 await fs.writeFile(output,'PREVIOUS REPORT');
 const r=run([input,output],2);
 assert.match(r.stderr,message,name);assert.equal(await fs.readFile(output,'utf8'),'PREVIOUS REPORT',name);
 checks.push(name);
}
async function mutated(name,edit,message){const m=structuredClone(model);edit(m);await reject(name,m,message)}
await reject('malformed JSON preserves report','{',/JSON byte/);
await reject('invalid UTF-8 preserves report',Buffer.from([255]),/UTF-8/);
await reject('2 MiB input bound','x'.repeat(2097153),/2097152/);
await mutated('future schema',m=>m.schema_version=2,/schema 1/);
await mutated('failed analysis',m=>m.ok=false,/not successful/);
await mutated('nonboolean status',m=>m.ok='true',/\$\.ok: expected boolean/);
await mutated('missing definitions',m=>delete m.definitions,/\$\.definitions: missing field/);
await mutated('invalid revision',m=>m.revision='z'.repeat(64),/SHA-256/);
await mutated('duplicate documents',m=>m.documents.push(m.documents[0]),/duplicate document/);
await mutated('document count bound',m=>m.documents=Array.from({length:129},(_,id)=>({id,path:'x'})),/1\.\.128/);
const fn=m=>m.definitions.find(d=>d.kind==='function');
const call=m=>m.references.find(r=>r.role==='call');
await mutated('unknown document in function',m=>fn(m).range.document=999,/unknown document/);
await mutated('negative coordinate',m=>fn(m).range.start.line=-1,/expected integer/);
await mutated('wrong coordinate type with JSON path',m=>fn(m).range.start.line='bad',/\.range\.start\.line: expected integer/);
await mutated('reversed range',m=>fn(m).range.end.byte=0,/reversed range/);
await mutated('unknown effect',m=>fn(m).effects=['network'],/unknown 0.9 effect/);
await mutated('conflicting function identity',m=>{const d=structuredClone(fn(m));d.name='other';m.definitions.push(d)},/conflicting function identity/);
await mutated('unknown caller',m=>call(m).caller='missing',/unknown caller/);
await mutated('unknown callee',m=>call(m).id='missing',/unknown call target/);
await mutated('unknown import target',m=>m.imports[0].to=999,/unknown document/);

const repeated=structuredClone(model);
repeated.references.push(...model.references.filter(r=>r.role==='call'));
repeated.definitions.push(...model.definitions.filter(d=>d.kind==='function'));
await fs.writeFile(input,JSON.stringify(repeated));
assert.equal(run().stdout.trim(),demo.stdout.trim());
assert.ok(html.equals(await fs.readFile(output)));
checks.push('duplicate instantiations keep exact report and counts');

const sparse=structuredClone(model);
for(const d of sparse.documents)d.id+=7;
for(const d of [...sparse.definitions,...sparse.references])d.range.document+=7;
for(const d of sparse.imports){d.from+=7;d.to+=7;d.range.document+=7}
await fs.writeFile(input,JSON.stringify(sparse));
assert.equal(run().stdout.trim(),demo.stdout.trim());checks.push('sparse document IDs');

const hostile=structuredClone(model),attack='</script><img src=x onerror="alert(1)">&';
hostile.documents[0].path=attack;fn(hostile).name=attack;
await fs.writeFile(input,JSON.stringify(hostile));run();
const safe=await fs.readFile(output,'utf8');
assert.ok(!safe.includes(attack));assert.ok(safe.includes('&lt;/script&gt;&lt;img'));
assert.equal((safe.match(/<script>/g)||[]).length,1);
checks.push('HTML injection escaped in paths and symbol names');

const wide={...structuredClone(model),references:[],imports:[],definitions:[]};
for(let i=0;i<400;i++)wide.definitions.push({...structuredClone(fn(model)),id:'wide'+i,name:'n'.repeat(1500)+i});
await reject('512 KiB output bound preserves previous report',wide,/Report exceeds 512 KiB/);
await fs.writeFile(input,original);
const before=hash(await fs.readFile(input));
assert.match(run([input,input],2).stderr,/aliases input/);
const alias=path.join(work,'hardlink.json');await fs.link(input,alias);
assert.match(run([input,alias],2).stderr,/aliases input/);
assert.equal(hash(await fs.readFile(input)),before);checks.push('same-file and hardlink input protection');
assert.match(run([input,path.join(work,'absent/report.html')],2).stderr,/./);checks.push('missing output directory');
assert.match(run(['--help']).stdout,/Usage:/);
assert.match(run(['--unknown'],2).stderr,/Usage:/);checks.push('help and invalid CLI option');

const route=native('query',path.join(repo,'apps/route-audit/main.vela'));
await fs.writeFile(input,route);run([input,output,'--json-nodes','131072']);
checks.push('full RouteAudit import graph renders successfully');
const large=native('query',path.join(app,'vela.project'));
await reject('self index exceeds default JSON node budget',large,/JSON node limit exceeded \(65536\)/);
const own=run([input,output,'--json-nodes','131072']);
assert.match(own.stdout,/modules=\d+ functions=\d+ calls=\d+ imports=\d+/);
const ownHtml=await fs.readFile(output);
assert.match(ownHtml.toString(),/parse_with_node_limit/);
checks.push('full self index succeeds with explicit JSON node budget');
assert.match(run([input,output,'--json-nodes','131073'],2).stderr,/must be between 1 and 131072/);
assert.ok(ownHtml.equals(await fs.readFile(output)));
checks.push('invalid JSON node budget preserves previous report');
const nodeCount=v=>1+(Array.isArray(v)?v.reduce((n,x)=>n+nodeCount(x),0):v&&typeof v==='object'?Object.values(v).reduce((n,x)=>n+nodeCount(x),0):0);
const formats=[];
for(const name of ['main.vela','graph.vela','report.vela','tests.vela']){
 const file=path.join(app,name),before=await fs.readFile(file,'utf8');
 const formatted=native('fmt',file);assert.equal(formatted,before);
 const temp=path.join(work,name);await fs.writeFile(temp,formatted);
 assert.equal(native('fmt',temp),formatted);formats.push(name);
}
checks.push('formatter fixed point, raw HTML/CSS/JS preserved');
const evidence={schema_version:1,compiler:native('--version').trim(),passed:checks.length,failed:0,checks,
 demo:{modules:3,functions:12,calls:25,imports:3,bytes:html.length,sha256:hash(html)},
 stress_collections:collections,stress_ms:stressMs,large_index:{bytes:Buffer.byteLength(large),json_nodes:nodeCount(JSON.parse(large)),default_result:'expected JSON node-limit rejection',explicit_nodes:131072,report_bytes:ownHtml.length},
 formatted:formats};
await fs.writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
