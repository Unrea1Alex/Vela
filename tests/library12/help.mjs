import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]??'.'),compiler=process.env.VELA_TEST_COMPILER??path.join(root,'bin/velac.exe');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'vela-help12-')),checks=[];
const run=(exe,args)=>execFileSync(exe,args,{encoding:'utf8',windowsHide:true}).replaceAll('\r','');
await fs.mkdir(path.join(work,'fixture'));await fs.writeFile(path.join(work,'fixture/example.txt'),'x');
await fs.writeFile(path.join(work,'binary'),Buffer.from([65,0,255]));
try {
 for(const [name,expected,args=[]] of [['basics','total=42\n'],['directory','example.txt\n',[path.join(work,'fixture')]],['json','valid JSON\n'],['bytes','bytes=3\n',[path.join(work,'binary')]],['result','code=7\n'],['callable','42\n'],['http','request prepared\n'],['cli','repeat=3\n'],['sort','stable=B,A,C\n'],['traversals','total=8,error=6\n'],['set','set=b,a\n'],['cell','cell=42\n'],['json-schema','record=demo:3\n'],['streams','copied=8\n'],['parallel','parallel=2\n']]){
  const source=path.join(root,'examples/recipes',name+'.vela'),exe=path.join(work,name+'.exe');
  assert.equal(JSON.parse(run(compiler,['check',source,'--json'])).ok,true);
  run(process.env.ComSpec,['/d','/c',path.join(root,'vela.cmd'),'build',source,'-o',exe]);
  assert.equal(run(exe,args),expected);checks.push('recipe '+name);
 }
 if(!process.argv.includes('--recipes-only')){
  const source=path.join(work,'api.vela');
  await fs.writeFile(source,'pub opaque struct Box {secret:Int} impl Box {pub fn get(self:Box)->Int{return self.secret;}} fn hidden()->Int{return 1;} pub fn apply<T,effect E>(value:T,action:fn(T)->T effects E)->T effects E{return action(value);} pub async fn later()->Int{return 7;}');
  const api=JSON.parse(run(compiler,['api',source,'--json']));
  assert.equal(api.schema_version,1);assert.deepEqual(api.items.find(x=>x.name==='Box').fields,[]);
  assert.equal(api.items.find(x=>x.name==='Box').opaque,true);assert.ok(!api.items.some(x=>x.name==='hidden'));
  assert.match(api.items.find(x=>x.name==='apply').signature,/fn\(T\)->T effects \{E\}/);
  assert.match(api.items.find(x=>x.name==='later').signature,/^async fn /);checks.push('generic/effect/opaque/method/async interface');
  await fs.writeFile(source,'pub fn bad()->Int{return true;}');
  const invalid=spawnSync(compiler,['api',source,'--json'],{encoding:'utf8',windowsHide:true});
  assert.equal(invalid.status,1);assert.equal(JSON.parse(invalid.stdout).diagnostics[0].code,'E201');checks.push('reject invalid interface before emission');
  const catalog=JSON.parse(run(compiler,['api','--builtins']));
  const rows=(await fs.readFile(path.join(root,'vela/builtins.def'),'utf8')).split(/\r?\n/).filter(x=>x&&!x.startsWith('#'));
  assert.equal(catalog.items.length,rows.length);checks.push('all embedded builtin rows');
  const index=JSON.parse(await fs.readFile(path.join(root,'docs/api-index.json'),'utf8'));
  const ids=new Set(index.modules.flatMap(m=>m.api.items.map(x=>m.module+':'+x.name)));
  const recipes=await fs.readFile(path.join(root,'docs/RECIPES.md'),'utf8');
  for(const id of recipes.matchAll(/(?:builtin|std\/[a-z_]+):[a-z_]+/g))assert.ok(ids.has(id[0]),id[0]);
  const expectedModules=['builtin',...(await fs.readdir(path.join(root,'std'))).filter(name=>name.endsWith('.vela')).map(name=>'std/'+name.slice(0,-5))].sort();
  assert.deepEqual(index.modules.map(module=>module.module).sort(),expectedModules);checks.push('all shipped modules and recipe IDs resolve to verified catalog');
 }
 console.log(JSON.stringify({schema_version:1,checks,passed:checks.length}));
}finally{await fs.rm(work,{recursive:true,force:true});}
