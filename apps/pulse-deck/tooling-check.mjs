import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
const invoke = promisify(execFile);
const app = path.resolve(import.meta.dirname), root=path.resolve(app,'../..');
const compiler=path.resolve(process.argv[2]??path.join(root,'bin/velac.exe')), project=path.join(app,'vela.project');
const base=await fs.mkdtemp(path.join(app,'work/tooling-'));
async function run(file,args,options={}) {
  try {return {...await invoke(file,args,{windowsHide:true,timeout:60000,maxBuffer:32*1024*1024,...options}),code:0};}
  catch(error){return error;}
}
async function query(args) { const r=await run(compiler,args);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout); }
const times=[];
await fs.mkdir(path.join(base,'cache'));
for(const label of ['cold','warm']) {
  const start=performance.now(),r=await run(compiler,['check',project,'--cache',path.join(base,'cache'),'--cache-report']);
  assert.equal(r.code,0,r.stdout+r.stderr);
  const events=r.stderr.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  const program=events.find(e=>e.layer==='check-v1'&&e.phase==='read');
  assert.equal(program?.status,label==='cold'?'miss':'hit');
  times.push({label,ms:Math.round(performance.now()-start),cache:program.status});
}
const cacheEntries=(await fs.readdir(path.join(base,'cache'))).filter(x=>x.startsWith('vela-cache-v1-'));
assert.ok(cacheEntries.length>0,'cache records actually published');
const full=await query(['query',project]);
const joined={definitions:[],references:[],imports:[]};
let page=await query(['query',project,'--page','1500']),pages=0;
while(true){
  pages++;assert.equal(page.revision,full.revision);
  for(const key of Object.keys(joined))joined[key].push(...page[key]);
  if(page.page.next_offset===null)break;
  page=await query(['query',project,'--page','1500','--offset',String(page.page.next_offset),'--revision',page.page.revision]);
}
for(const key of Object.keys(joined))assert.deepEqual(joined[key],full[key],key);
assert.deepEqual(full.scope,{root:'entry',excluded_test_roots:1});
const debug=path.join(app,'work/debug');
assert.ok((await fs.readFile(path.join(debug,'pulse.pdb'))).includes(Buffer.from('engine.vela')));
const profiled=await run(path.join(debug,'pulse-deck.exe'),['--headless','--output',base],{env:{...process.env,VELA_PROFILE:'1',VELA_TRACE:'1'}});
assert.equal(profiled.code,1,profiled.stderr);
const profile=JSON.parse(profiled.stderr.split(/\r?\n/).find(l=>l.startsWith('{"vela_profile":1,')));
const awaitedHttp=profile.functions.filter(f=>f.name.endsWith('::fetch'));
assert.ok(awaitedHttp.length>0);assert.equal(awaitedHttp.reduce((a,f)=>a+f.calls,0),6);assert.equal(awaitedHttp.reduce((a,f)=>a+f.completed,0),6);
const reportPath=profiled.stdout.match(/REPORT=(.+)/)[1].trim();
const report=JSON.parse(await fs.readFile(reportPath));assert.equal(report.timer_cleanups,6);
const result={schema:1,checks:times,cache_entries:cacheEntries.length,query:{pages,records:page.page.total,scope:full.scope},debug:{pdb_source:'engine.vela',awaitedHttp,report_cleanups:report.timer_cleanups},passed:4,failed:0};
await fs.writeFile(path.join(app,'tooling-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
