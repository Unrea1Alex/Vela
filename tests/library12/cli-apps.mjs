import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
const root=resolve(import.meta.dirname,'../..');
const dir=mkdtempSync(join(root,'build/stage12/cli-apps-'));
let checks=0;
for(const name of ['index','logs','http']){
 const exe=join(root,`build/stage12/${name}124.exe`);
 const output=join(dir,name+'.json');writeFileSync(output,'preserved');
 const call=(args,code)=>{const p=spawnSync(exe,args,{cwd:dir,encoding:'utf8'});assert.equal(p.status,code,p.stdout+p.stderr);checks++;return p;};
 const help=call(['--help'],0);assert.equal(help.stderr,'');assert.match(help.stdout,/Usage:/);assert.match(help.stdout,/--repeat INT 1\.\.1000/);
 assert.equal(call(['--help'],0).stdout,help.stdout);
 for(const args of [[],['missing',output,'--repeat'],['missing',output,'--repeat','9223372036854775808'],['missing',output,'--repeat','-1'],['missing',output,'--what'],['missing',output,'--repeat','1','--repeat','2'],['missing',output,'--repeat','']]){
  const first=call(args,2);assert.equal(first.stdout,'');assert.ok(first.stderr.length>0);
  const second=call(args,2);assert.equal(second.stderr,first.stderr);
  assert.equal(readFileSync(output,'utf8'),'preserved');
 }
 if(name==='logs'){
  const bad=call(['missing',output,'--min-level','5','--max-level','0'],2);assert.match(bad.stderr,/min-level must be <= max-level/);
 }
}
console.log(JSON.stringify({schema_version:1,checks,status:'passed',directory:dir}));
