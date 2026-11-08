import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const root=path.resolve(process.argv[2]??'.'),compiler=path.join(root,'bin/velac.exe');
const hash=x=>createHash('sha256').update(x).digest('hex');
const work=await fs.mkdtemp(path.join(root,'build/stage12/audit-'));
const checks=[],profiles=[];
function call(args){const start=performance.now();const p=spawnSync(compiler,args,{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,VELA_CC:'vela-audit-unavailable-c-compiler'}});assert.ok(p.status===0||p.status===1,p.stdout+p.stderr);return {...p,ms:performance.now()-start};}
async function rejected(name,code,text,needle){const source=path.join(work,name+'.vela'),output=source+'.c';await fs.writeFile(source,text);const p=call(['emit-c',source,'-o',output,'--json']);assert.equal(p.status,1,p.stdout+p.stderr);const d=JSON.parse(p.stdout).diagnostics[0];assert.equal(d.code,code);assert.equal(await fs.stat(output).then(()=>true,()=>false),false);if(needle){const before=text.slice(0,text.indexOf(needle));assert.equal(d.range.start.byte,Buffer.byteLength(before));assert.equal(d.range.start.character,before.split('\n').at(-1).length);}checks.push(name+': '+code+' before emission');return d;}
try {
 await rejected('nominal','E201',await fs.readFile(path.join(root,'tests/cases/v128a_nominal.vela'),'utf8'));
 await rejected('unicode','E201','fn main()->Int {let text="я😀"; return true;}\n','return');
 await rejected('missing-effect','E209','fn main()->Unit {print(7);}\n');
 const imported='pub fn answer()->Int {return true;}\n';await fs.writeFile(path.join(work,'dependency.vela'),imported);await fs.writeFile(path.join(work,'main.vela'),'import "dependency.vela" as dep; fn main()->Int{return dep::answer();}\n');
 const multi=call(['query',path.join(work,'main.vela'),'--json']);assert.equal(multi.status,1);const md=JSON.parse(multi.stdout).diagnostics[0];assert.equal(md.code,'E201');assert.ok(md.source.endsWith('dependency.vela'));assert.equal(md.range.start.byte,imported.indexOf('return'));checks.push('multifile diagnostic owner/span');
 await fs.writeFile(path.join(work,'dependency.vela'),'pub fn answer()->Int {return 42;}\n');
 for(let round=0;round<3;round++){
   const cache=path.join(work,'cache'+round);await fs.mkdir(cache);
   for(const profile of ['cold','warm','edit']){
     if(profile==='edit')await fs.writeFile(path.join(work,'dependency.vela'),`pub fn answer()->Int {return ${43+round};}\n`);
     const p=call(['check',path.join(work,'main.vela'),'--cache',cache,'--cache-report','--json']);assert.equal(p.status,0,p.stdout+p.stderr);
     const events=p.stderr.trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
     assert.ok(events.length>0);if(profile==='warm')assert.ok(events.some(e=>e.status==='hit'));if(profile==='edit')assert.ok(events.some(e=>e.status==='miss'));
     profiles.push({round,profile,elapsed_ms:p.ms,dependency_sha256:hash(await fs.readFile(path.join(work,'dependency.vela'))),events});
   }
 }
 checks.push('cold/warm/edit, three independent caches');
 const names=(await fs.readFile(path.join(root,'selfhost/sources.list'),'utf8')).trim().split(/\r?\n/);
 const modules=[];for(const name of names){const code=await fs.readFile(path.join(root,'selfhost',name+'.vela'));modules.push({name,bytes:code.length,sha256:hash(code),functions:code.toString().match(/^(?:pub )?fn /gm)?.length??0});}
 if(process.argv.includes('--compiler')){
   const copied=path.join(work,'selfhost');await fs.mkdir(copied);
   for(const name of [...names,'embedded'])await fs.copyFile(path.join(root,'selfhost',name+'.vela'),path.join(copied,name+'.vela'));
   const original=await fs.readFile(path.join(copied,'driver.vela'),'utf8');
   for(let round=0;round<3;round++){
     await fs.writeFile(path.join(copied,'driver.vela'),original);const cache=path.join(work,'compiler-cache'+round);await fs.mkdir(cache);
     for(const profile of ['cold','warm','edit']){
       if(profile==='edit')await fs.writeFile(path.join(copied,'driver.vela'),original+`\n// audit edit ${round}\n`);
       const p=call(['check',path.join(copied,'driver.vela'),'--cache',cache,'--cache-report','--json']);assert.equal(p.status,0,p.stdout+p.stderr);
       const events=p.stderr.trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
       if(profile==='warm')assert.ok(events.some(e=>e.status==='hit'));if(profile==='edit')assert.ok(events.some(e=>e.status==='miss'));
       profiles.push({corpus:'authored compiler, copied without repository edits',round,profile,elapsed_ms:p.ms,events});
     }
   }
   checks.push('whole compiler cold/warm/edit, three independent caches');
 }
 console.log(JSON.stringify({schema_version:1,status:'passed',checks,compiler_sha256:hash(await fs.readFile(compiler)),modules,profiles,scope:'local wall-time frontend/cache microprofiles; seed transition measured by mandatory native verify'}));
} finally {assert.ok(work.startsWith(path.join(root,'build/stage12/audit-')));await fs.rm(work,{recursive:true,force:true});}
