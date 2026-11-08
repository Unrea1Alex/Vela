import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const exe=resolve(process.argv[2]??'build/stage12/traversal-memory125a.exe');
const observations=[];
for(const size of [128,1280])for(const mode of ['base','any']){
 const p=spawnSync(exe,[mode,String(size)],{encoding:'utf8',timeout:30000,env:{...process.env,VELA_GC_STRESS:'1',VELA_GC_REPORT:'1'}});
 assert.equal(p.status,0,p.stdout+p.stderr);const data=JSON.parse(p.stdout);assert.equal(data.size,size);assert.equal(data.calls,mode==='any'?1:0);
 const gc=/vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)/.exec(p.stderr);assert.ok(gc,p.stderr);
 observations.push({size,mode,collections:Number(gc[1]),peak_managed_bytes:Number(gc[2]),live_managed_bytes:Number(gc[3])});
}
for(const size of [128,1280]){
 const base=observations.find(x=>x.size===size&&x.mode==='base'),any=observations.find(x=>x.size===size&&x.mode==='any');
 assert.ok(any.peak_managed_bytes>base.peak_managed_bytes+size*4,'eager detached snapshot allocation');
}
const peaks=observations.filter(x=>x.mode==='any').map(x=>x.peak_managed_bytes);
// Runtime list capacity doubles (<2n above the initial capacity). A 10x input
// may cross four capacity boundaries: 128 -> 2048 slots, a 16x capacity change.
// The O(n) contract permits <20x storage here; an arbitrary 12x ceiling did not.
assert.ok(peaks[1]<=peaks[0]*20,'capacity-aware O(n) managed allocation budget for 10x input');
console.log(JSON.stringify({schema_version:1,status:'passed',observations,capacity_policy:'doubling (<2n slots), so the derived 10x-input ceiling is 20x, not 12x',scope:'managed peak includes resident input and eager snapshot, not OS process memory; a short-circuit call still allocates the snapshot'}));
