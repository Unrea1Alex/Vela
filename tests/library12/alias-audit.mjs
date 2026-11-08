import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]??'.'),compiler=path.resolve(process.argv[3]??path.join(root,'bin/velac.exe'));
const work=await fs.mkdtemp(path.join(root,'build/stage12/alias-audit-')),checks=[];
const call=args=>{const p=spawnSync(compiler,args,{encoding:'utf8',windowsHide:true,timeout:20000});assert.ok(p.status===0||p.status===1,p.stdout+p.stderr);return {status:p.status,data:JSON.parse(p.stdout)};};
try {
 for(const [name,code,alias] of [
  ['builtin','fn main()->Int{return Int::answer();}\n','Int'],
  ['parameter','fn wrong<T>(value:T)->Int{return T::answer();} fn main()->Int{return wrong(4);}\n','T']
 ]){
  const dir=path.join(work,name);await fs.mkdir(dir);const source=path.join(dir,'main.vela');await fs.writeFile(source,code);await fs.writeFile(path.join(dir,alias+'.vela'),'pub fn answer()->Int{return 42;}\n');
  const query=call(['query',source,'--json']);assert.equal(query.status,1);assert.equal(query.data.diagnostics[0].code,'E200');assert.equal(query.data.diagnostics[0].message,'Unknown enum.');
  const plan=call(['plan',source,query.data.revision,'0','diagnose']);assert.equal(plan.status,0);checks.push({name,diagnostic:query.data.diagnostics[0].message,validated:plan.data.validated,changes:plan.data.changes});
  console.error(JSON.stringify(checks.at(-1)));assert.equal(plan.data.validated,false,'known type namespace must not be reinterpreted as a file import');assert.deepEqual(plan.data.changes,[]);assert.equal(await fs.readFile(source,'utf8'),code);
 }
 console.log(JSON.stringify({schema_version:1,status:'passed',checks}));
} finally {assert.ok(work.startsWith(path.join(root,'build/stage12/alias-audit-')));await fs.rm(work,{recursive:true,force:true});}
