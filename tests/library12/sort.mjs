import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const exe=resolve(process.argv[2]??'build/stage12/sort125.exe');
let checks=0,maxComparisons=0;
function check(input){
 const p=spawnSync(exe,input.map(String),{encoding:'utf8',timeout:30000});assert.equal(p.status,0,p.stdout+p.stderr);
 const data=JSON.parse(p.stdout);assert.equal(data.ids.length,input.length);
 // Independent stable rank oracle: count predecessors, never merge/sort.
 const expected=Array(input.length);
 for(let i=0;i<input.length;i++){let rank=0;for(let j=0;j<input.length;j++)if(input[j]<input[i]||(input[j]===input[i]&&j<i))rank++;expected[rank]=i;}
 assert.deepEqual(data.ids,expected);
 const budget=input.length<2?0:input.length*Math.ceil(Math.log2(input.length));
 assert.ok(data.comparisons<=budget,`${input.length}: ${data.comparisons} > ${budget}`);
 maxComparisons=Math.max(maxComparisons,data.comparisons);checks++;
}
for(const n of [0,1,2,3,4,16,17,64,65,257,1025]){
 check(Array.from({length:n},(_,i)=>BigInt(i)));
 check(Array.from({length:n},(_,i)=>BigInt(n-i)));
 check(Array.from({length:n},()=>0n));
 check(Array.from({length:n},(_,i)=>BigInt((i*17)%23)));
 check(Array.from({length:n},(_,i)=>BigInt(i<=n/2?i:n-i)));
}
check([9223372036854775807n,-9223372036854775808n,0n,9223372036854775807n]);
console.log(JSON.stringify({schema_version:1,checks,maxComparisons,oracle:'independent O(n²) stable ranks; n*ceil(log2(n)) comparison bound',status:'passed'}));
