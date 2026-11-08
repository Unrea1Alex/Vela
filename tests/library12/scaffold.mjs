import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {spawnSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const compiler=resolve(process.env.VELA_TEST_COMPILER ?? join(root,'bin/velac.exe'));
const dir=mkdtempSync(join(root,'build/stage12/scaffold-'));
const other=join(dir,'other cwd'); mkdirSync(other);
let checks=0;
function run(args,code=0,cwd=other){const p=spawnSync(compiler,args,{cwd,encoding:'utf8',timeout:120000}); assert.equal(p.status,code,p.stdout+p.stderr);checks++;return p;}
function report(args,code=0){const p=run(args,code);assert.equal(p.stderr,'');return JSON.parse(p.stdout);}
function digest(path){return createHash('sha256').update(readFileSync(path)).digest('hex');}
for(const kind of ['cli','library']){
 const target=join(dir,`новый проект ${kind}`);
 const created=report(['init',target,'--kind',kind,'--json']);
 assert.equal(created.ok,true);assert.equal(created.kind,kind);assert.match(created.name,/^[A-Za-z_][A-Za-z_0-9]*$/);
 const before=Object.fromEntries(created.files.map(file=>[file,digest(join(target,file))]));
 const text=readFileSync(created.manifest,'utf8');
 assert.equal(readFileSync(created.manifest+'.lock','utf8'),'vela-lock|1\nmanifest|'+createHash('sha256').update(text).digest('hex')+'\n'); checks++;
 run(['check',created.manifest,'--json']);
 const output=join(target,'app.exe');run(['build',created.manifest,'-o',output]);
 const app=spawnSync(output,[],{cwd:other,encoding:'utf8'});assert.equal(app.status,0);assert.equal(app.stdout.replaceAll('\r\n','\n'),'42\n');checks++;
 assert.match(run(['test',created.manifest,'--json']).stdout,/"passed":1,"failed":0/);
 assert.equal(report(['init',target,'--json'],1).diagnostics[0].code,'E225');
 assert.deepEqual(Object.fromEntries(created.files.map(file=>[file,digest(join(target,file))])),before); checks++;
}
const suggested=report(['init',join(dir,'bad'),'--name','my-project','--json'],1);assert.match(suggested.diagnostics[0].message,/my_project/);
for(const [name,expected] of [['3x','project_3x'],['中文','vela_project'],['hello-world','hello_world']]){
 const p=report(['init',join(dir,name),'--json']);assert.equal(p.name,expected);
}
for(const options of [['--kind','gui'],['--kind','cli','--kind','library'],['--name'],['--mystery'],['--json','--json'],['--name','']]){
 assert.equal(report(['init',join(dir,'bad'),...options,...(options.includes('--json')?[]:['--json'])],1).diagnostics[0].code,'E225');
 assert.equal(existsSync(join(dir,'bad')),false);
}
const file=join(dir,'file');writeFileSync(file,'preserved'); report(['init',file,'--json'],1);assert.equal(readFileSync(file,'utf8'),'preserved');
const empty=join(dir,'empty');mkdirSync(empty);report(['init',empty,'--json'],1);assert.deepEqual(readdirSync(empty),[]);
const missing=report(['init',join(dir,'missing','child'),'--json'],1);assert.equal(missing.diagnostics[0].code,'E900');
const relative=report(['init','relative app','--json']);assert.equal(relative.directory,join(other,'relative app'));
const manifest=join(relative.directory,'vela.project');writeFileSync(manifest,'vela-project|1\nname|my-project\nentry|main.vela\n');
assert.match(report(['check',manifest,'--json'],1).diagnostics[0].message,/my_project/);
const race=join(dir,'concurrent');
const racing=()=>new Promise((done,reject)=>{const p=spawn(compiler,['init',race,'--json'],{cwd:other});let out='';p.stdout.on('data',x=>out+=x);p.on('error',reject);p.on('close',code=>done({code,out}));});
const results=await Promise.all([racing(),racing()]);assert.deepEqual(results.map(x=>x.code).sort(),[0,1]);checks++;
assert.equal(readdirSync(dir).some(x=>/^vela-tmp/.test(x)),false);
assert.match(run(['--help']).stdout,/vela init DIRECTORY/);
console.log(JSON.stringify({schema_version:1,stage:'1.2.3',checks,platform:process.platform,compiler,directory:dir}));
