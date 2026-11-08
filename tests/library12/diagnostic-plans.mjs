import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]??'.'),compiler=path.resolve(process.argv[3]??path.join(root,'build/stage12/compiler128.exe'));
const work=await fs.mkdtemp(path.join(root,'build/stage12/diagnostics-')),checks=[];
const hash=x=>createHash('sha256').update(x).digest('hex');
const call=args=>{const p=spawnSync(compiler,args,{encoding:'utf8',timeout:20000,windowsHide:true});assert.ok(p.status===0||p.status===1,p.stdout+p.stderr);return {code:p.status,data:JSON.parse(p.stdout)};};
async function fixture(name,files,input='main.vela'){
 const folder=path.join(work,name);await fs.mkdir(folder);for(const [file,text]of Object.entries(files)){await fs.mkdir(path.dirname(path.join(folder,file)),{recursive:true});await fs.writeFile(path.join(folder,file),text);}
 const source=path.join(folder,input),before=new Map(Object.entries(files).map(([f,t])=>[f,hash(t)]));
 return {folder,source,before,files};
}
async function plan(f,code,actionable,document=0){
 const query=call(['query',f.source,'--json']);assert.equal(query.code,1,JSON.stringify(query));assert.equal(query.data.diagnostics[0].code,code);assert.match(query.data.revision,/^[a-f0-9]{64}$/);
 const revision=hash(query.data.documents.map(d=>hash(f.files[path.relative(f.folder,d.path).replaceAll('\\','/')].replaceAll('\r\n','\n'))).join(''));assert.equal(query.data.revision,revision);
 const result=call(['plan',f.source,query.data.revision,String(document),'diagnose']);assert.equal(result.code,0,JSON.stringify(result));assert.equal(result.data.ok,true);assert.equal(result.data.validated,actionable,JSON.stringify(result.data));assert.equal(result.data.changes.length,actionable?1:0);assert.equal(result.data.diagnostics[0].code,code);assert.ok(result.data.explanations[0].root_cause);
 for(const [file,digest]of f.before)assert.equal(hash(await fs.readFile(path.join(f.folder,file))),digest,'plan never writes '+file);
 checks.push(nameOf(f)+': '+(actionable?'checked preview':'explanation'));
 return {query:query.data,plan:result.data};
}
const nameOf=f=>path.basename(f.folder);
try{
 const typed=await fixture('типы-😀',{'main.vela':'fn main() -> Int { let label="я😀"; return true; }\n'});
 const t=await plan(typed,'E201',false);assert.equal(t.plan.explanations[0].expected,'Int');assert.equal(t.plan.explanations[0].actual,'Bool');const prefix=typed.files['main.vela'].split('return')[0];assert.equal(t.query.diagnostics[0].range.start.byte,Buffer.byteLength(prefix));assert.equal(t.query.diagnostics[0].range.start.character,prefix.length);checks.push('independent Unicode UTF16/byte coordinates');
 await plan(await fixture('main-effects',{'main.vela':'fn main()->Unit { print("checked only"); }\n'}),'E209',true);
 await plan(await fixture('existing-effects',{'main.vela':'fn main()->Unit effects {args} { print("checked only"); }\n'}),'E209',true);
 await plan(await fixture('public-effects',{'main.vela':'pub fn action()->Unit { print("unsafe expansion"); } fn main()->Unit {}\n'}),'E209',false);
 await plan(await fixture('process-effects',{'main.vela':'fn main()->Unit { exit(0); }\n'}),'E209',false);
 await plan(await fixture('closure-effects',{'main.vela':'fn main()->Unit { let action=fn []()->Unit {print("x");}; }\n'}),'E209',false);
 const projectName=await plan(await fixture('project-name',{'vela.project':'vela-project|1\nname|bad-name\nentry|main.vela\n','main.vela':'fn main()->Int{return 0;}\n'},'vela.project'),'E225',true);assert.equal(projectName.plan.explanations[0].expected,'ASCII identifier');assert.equal(projectName.plan.explanations[0].actual,'bad-name');
 await plan(await fixture('empty-project-name',{'vela.project':'vela-project|1\nname|\nentry|main.vela\n','main.vela':'fn main()->Int{return 0;}\n'},'vela.project'),'E225',true);
 await plan(await fixture('project-field',{'vela.project':'vela-project|1\nname|good\nentri|main.vela\n','main.vela':'fn main()->Int{return 0;}\n'},'vela.project'),'E225',true);
 await plan(await fixture('duplicate-field',{'vela.project':'vela-project|1\nname|good\nentry|main.vela\nentri|main.vela\n','main.vela':'fn main()->Int{return 0;}\n'},'vela.project'),'E225',false);
 await plan(await fixture('import',{'main.vela':'fn main()->Int{return math::answer();}\n','math.vela':'pub fn answer()->Int{return 7;}\n'}),'E200',true);
 await plan(await fixture('unicode-leading-import',{'main.vela':'\u2003fn main()->Int{return math::answer();}\n','math.vela':'pub fn answer()->Int{return 7;}\n'}),'E200',true);
 await plan(await fixture('installed-import',{'main.vela':'fn main()->Int{return math::answer();}\n','vela-stdlib/math.vela':'pub fn answer()->Int{return 7;}\n'}),'E200',true);
 await plan(await fixture('ambiguous-import',{'main.vela':'fn main()->Int{return math::answer();}\n','math.vela':'pub fn answer()->Int{return 7;}\n','vela-stdlib/math.vela':'pub fn answer()->Int{return 8;}\n'}),'E200',false);
 await plan(await fixture('alias-conflict',{'main.vela':'fn math()->Int{return 1;} fn main()->Int{return math::answer();}\n','math.vela':'pub fn answer()->Int{return 7;}\n'}),'E200',false);
 const multi=await fixture('несколько-😀',{'main.vela':'import "helper.vela" as helper; fn main()->Int{return helper::run();}\n','helper.vela':'pub fn run()->Int{return math::answer();}\n','math.vela':'pub fn answer()->Int{return 7;}\n'});const m=await plan(multi,'E200',true,1);assert.equal(m.plan.changes[0].edits[0].range.document,1);checks.push('imported-document correction');
 const stale=call(['plan',multi.source,'0'.repeat(64),'1','diagnose']);assert.equal(stale.code,1);assert.equal(stale.data.diagnostics[0].code,'E231');checks.push('stale revision rejected');
 const badDoc=call(['plan',multi.source,m.query.revision,'9','diagnose']);assert.equal(badDoc.code,1);assert.equal(badDoc.data.diagnostics[0].code,'E231');checks.push('invalid document rejected');
 const wrongDoc=call(['plan',multi.source,m.query.revision,'0','diagnose']);assert.equal(wrongDoc.code,1);assert.equal(wrongDoc.data.diagnostics[0].code,'E231');checks.push('different diagnostic document rejected');
 const allocation=[];
 for(const [name,value]of [['text','x'],['lines','\n']]){
  const file=path.join(work,'oversized-'+name+'.vproj');await fs.writeFile(file,value.repeat(1048577));
  const p=spawnSync(compiler,['query',file,'--json'],{encoding:'utf8',timeout:20000,windowsHide:true,env:{...process.env,VELA_GC_REPORT:'1'}});assert.equal(p.status,1);const rejected=JSON.parse(p.stdout);assert.equal(rejected.diagnostics[0].code,'E225');
  const peak=/vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)/.exec(p.stderr);assert.ok(peak,p.stderr);allocation.push({name,managed_peak:+peak[2]});
  const refused=call(['plan',file,rejected.revision,'0','diagnose']);assert.equal(refused.code,1);assert.equal(refused.data.diagnostics[0].code,'E231');
 }
 assert.ok(Math.abs(allocation[0].managed_peak-allocation[1].managed_peak)<32768,'oversized line count must not allocate a line table');checks.push('oversized manifest: no diagnostic line-table growth or plan');
 const helpFolder=path.join(work,'help-no-writes');await fs.mkdir(helpFolder);
 for(const args of [['init','--help'],['init','--help','--json']]){const p=spawnSync(compiler,args,{cwd:helpFolder,encoding:'utf8',windowsHide:true});assert.equal(p.status,0,p.stdout+p.stderr);assert.match(p.stdout,/Usage: vela init NEW_DIRECTORY/);if(args.includes('--json'))assert.equal(JSON.parse(p.stdout).ok,true);assert.deepEqual(await fs.readdir(helpFolder),[]);}
 const usage=spawnSync(compiler,[],{cwd:helpFolder,encoding:'utf8',windowsHide:true});assert.equal(usage.status,2);assert.match(usage.stderr,/api/);assert.match(usage.stderr,/vela init/);checks.push('init help JSON/plain no filesystem writes; complete empty usage');
 console.log(JSON.stringify({schema_version:1,status:'passed',checks,passed:checks.length,allocation,work}));
}finally{await fs.rm(work,{recursive:true,force:true});}
