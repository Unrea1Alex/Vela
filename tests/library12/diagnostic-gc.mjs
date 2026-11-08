import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]??'.'),compiler=path.resolve(process.argv[3]??'build/stage12/compiler128.exe'),work=await fs.mkdtemp(path.join(root,'build/stage12/diagnostic-gc-'));
try{const source=path.join(work,'main.vela'),code='fn main()->Unit {print("я😀");}\n';await fs.writeFile(source,code);
 const run=args=>{const p=spawnSync(compiler,args,{encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,VELA_GC_STRESS:'1',VELA_GC_REPORT:'1'}});assert.ok(p.status===0||p.status===1,p.stdout+p.stderr);return {...p,data:JSON.parse(p.stdout)};};
 const q=run(['query',source,'--json']);assert.equal(q.status,1);const p=run(['plan',source,q.data.revision,'0','diagnose']);assert.equal(p.status,0);assert.equal(p.data.validated,true);assert.match(p.data.changes[0].edits[0].new_text,/effects \{io\}/);assert.equal(await fs.readFile(source,'utf8'),code);
 const counters=entry=>{const m=/vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)/.exec(entry.stderr);assert.ok(m,entry.stderr);return {collections:+m[1],managed_peak:+m[2],managed_live:+m[3]};};console.log(JSON.stringify({schema_version:1,status:'passed',query:counters(q),plan:counters(p),scope:'bounded source/context/overlay child recheck; full compiler source and full diagnostic corpus not forced-GC tested'}));
}finally{await fs.rm(work,{recursive:true,force:true});}
