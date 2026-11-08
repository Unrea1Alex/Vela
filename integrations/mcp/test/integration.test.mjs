import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {Host,limits} from '../dist/host.js';
const root=path.resolve(process.env.VELA_TEST_NATIVE_ROOT??'../..'), pkg=path.resolve('.');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'vela-mcp-test-'));
const workspace=path.join(work,'workspace'); await fs.mkdir(workspace);
const config={schema_version:1,toolchain:root,workspace,aliases:{app:'main.vela'}};
const configPath=path.join(work,'config.json'); await fs.writeFile(configPath,JSON.stringify(config));
const source='// 😀\nfn main()->Unit effects{io}{print("Привет");}\n';
await fs.writeFile(path.join(workspace,'main.vela'),source);
const report={schema_version:1,node:process.version,sdk:'2.4.0',checks:[],sequential:0,cancellations:0};
const check=(name,condition)=>{assert.ok(condition,name);report.checks.push(name);};
const signal=()=>new AbortController().signal;
const client=new Client({name:'vela-integration',version:'1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(pkg,'dist/index.js'),'--config',configPath],stderr:'pipe'});
let stderr='';transport.stderr.on('data',b=>stderr+=b);
const call=async(name,args={})=>(await client.callTool({name,arguments:args})).structuredContent;
const readStats=pid=>{
 if(process.platform!=='win32')return null;
 return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',
  '(Get-Process -Id '+pid+' | Select-Object WorkingSet64,HandleCount) | ConvertTo-Json -Compress'],{encoding:'utf8'}));
};
const dirs=async()=>new Set((await fs.readdir(os.tmpdir())).filter(n=>n.startsWith('vela-mcp-')&&!n.startsWith('vela-mcp-test-')));
const beforeDirs=await dirs();
test('MCP native equivalence, bounds, lifecycle and 1000-request gate', {timeout:240000}, async()=>{
 await client.connect(transport);
 try {
  const tools=await client.listTools();
  check('seven tools with input/output schemas',tools.tools.length===7&&tools.tools.every(t=>t.inputSchema&&t.outputSchema));
  const context=await call('vela_get_context');
  check('context fingerprint',context.status==='ok'&&context.compiler_id.length===64&&context.data.quickstart.includes('list_new'));
  const compilerVersion=execFileSync(path.join(root,'bin/velac.exe'),['--version'],{encoding:'utf8'}).split(' ')[1];
  check('context reports pinned compiler version',context.data.version===compilerVersion);
  if(compilerVersion.startsWith('0.10.')){
    await fs.writeFile(path.join(workspace,'counter.vela'),'pub opaque struct Counter { count: Int }\npub fn make() -> Counter { return Counter(count: 7); }\n');
    const opaque='import "counter.vela" as api;\nfn main() -> Int { let x = api::make(); return 0; }\n';
    await fs.writeFile(path.join(workspace,'opaque.vela'),opaque);
    const index=await call('vela_query',{path:'opaque.vela'});
    check('opaque source index',index.status==='ok'&&index.data.native.definitions.some(d=>d.name==='Counter'&&d.opaque===true)&&index.data.native.definitions.some(d=>d.name==='count'&&d.visibility==='module'));
    const forbidden=await call('vela_check',{path:'opaque.vela',text:'import "counter.vela" as api;\nfn main() -> Int { let x = api::Counter(count: 7); return 0; }\n'});
    check('opaque constructor rejected through MCP',forbidden.status==='rejected'&&forbidden.data.native.diagnostics[0].code==='E232'&&forbidden.data.native.diagnostics[0].details.reason==='opaque_constructor');
  }
  if(/^0\.10\.0(?:-dev\.(?:[3-9]|\d{2,}))?$/.test(compilerVersion)){
    const library='pub opaque struct Box<T> { value: T }\nimpl<T> Box<T> { pub fn get(self: Box<T>) -> T { return self.value; } }\npub fn box<T>(value:T) -> Box<T> { return Box<T>(value:value); }\n';
    const app='import "box.vela" as api;\nfn main() -> Int { let x = api::box(21); return x.get() + api::Box<Int>::get(x); }\n';
    await fs.writeFile(path.join(workspace,'box.vela'),library);
    await fs.writeFile(path.join(workspace,'methods.vela'),app);
    const index=await call('vela_query',{path:'methods.vela'});
    assert.equal(index.status,'ok');
    const method=index.data.native.definitions.find(d=>d.method===true&&d.name==='get');
    check('both method call forms resolve to one declaration',!!method&&index.data.native.references.filter(r=>r.id===method.id&&r.role==='call').length===2);
    const preview=await call('vela_plan',{path:'methods.vela',kind:'rename',snapshot_id:index.snapshot_id,revision:index.data.native.revision,
      document:method.range.document,byte:method.range.start.byte,new_name:'fetch'});
    check('method rename preview covers declaration and both calls',preview.status==='ok'&&preview.data.native.changes.reduce((n,d)=>n+d.edits.length,0)===3&&await fs.readFile(path.join(workspace,'methods.vela'),'utf8')===app);
  }
  if(/^0\.10\.0(?:-dev\.(?:[4-9]|\d{2,}))?$/.test(compilerVersion)){
    const source='interface Reader { fn get(self: Self) -> Int effects { io }; }\nstruct One {}\nimpl Reader for One { fn get(self: One) -> Int { return 1; } }\nfn fetch<T: Reader>(x: T) -> Int effects { io } { return Reader::get(x); }\nfn main() -> Int effects { io } { return fetch(One()); }\n';
    await fs.writeFile(path.join(workspace,'interface.vela'),source);
    const query=await call('vela_query',{path:'interface.vela'});
    assert.equal(query.status,'ok');
    const declaration=query.data.native.definitions.find(d=>d.name==='fetch');
    const reference=query.data.native.references.find(r=>r.id===declaration.id&&r.role==='call');
    check('interface template and concrete call report distinct analysis status',declaration.analysis_status==='checked_constraints'&&reference.analysis_status==='checked_instance');
    const operation=query.data.native.definitions.find(d=>d.name==='get'&&!d.analysis_status);
    const plan=await call('vela_plan',{path:'interface.vela',kind:'rename',snapshot_id:query.snapshot_id,
      revision:query.data.native.revision,document:operation.range.document,byte:operation.range.start.byte,new_name:'lookup'});
    check('interface operation rename includes implementation and call',plan.status==='ok'&&plan.data.native.changes[0].edits.length===3);
  }
  if(/^0\.10\.0(?:-dev\.(?:[5-9]|\d{2,}))?$/.test(compilerVersion)){
    const file='callables.vela';
    const source='fn apply<T, effect E>(f: fn(T) -> T effects E, x: T) -> T effects E { return f(x); }\nfn main() -> Int { let offset = 2; return apply(fn [offset](x: Int) -> Int { return x + offset; }, 40); }\n';
    await fs.writeFile(path.join(workspace,file),source);
    const query=await call('vela_query',{path:file});
    check('effect-polymorphic callable checked through MCP',query.status==='ok'&&query.data.native.definitions.some(d=>d.name==='apply'&&d.analysis_status==='checked_constraints'));
    const capture=query.data.native.definitions.find(d=>d.name==='offset');
    const rename=await call('vela_plan',{path:file,kind:'rename',snapshot_id:query.snapshot_id,
      revision:query.data.native.revision,document:capture.range.document,byte:capture.range.start.byte,new_name:'delta'});
    check('closure capture rename covers declaration, capture list and body',rename.status==='ok'&&rename.data.native.changes[0].edits.length===3);
    const fmt=await call('vela_format',{path:file});
    check('closure format round trip',(await call('vela_check',{path:file,text:fmt.data.text})).status==='ok');
    const rejected=await call('vela_check',{path:file,text:source.replace('fn [offset]','fn []')});
    check('missing explicit capture reported through MCP',rejected.status==='rejected'&&rejected.data.native.diagnostics[0].code==='E238'&&rejected.data.native.diagnostics[0].details.reason==='capture_missing');
  }
  if(/^0\.10\.0(?:-dev\.(?:[6-9]|\d{2,}))?$/.test(compilerVersion)){
    const file='dynamic.vela';
    const source='interface Reader { fn get(self: Self) -> Int; }\nstruct One {}\nimpl Reader for One { fn get(self: One) -> Int { return 42; } }\nfn main() -> Int { let reader = dyn Reader(One()); return reader.get() + Reader::get(reader); }\n';
    await fs.writeFile(path.join(workspace,file),source);
    const query=await call('vela_query',{path:file});
    assert.equal(query.status,'ok');
    const operation=query.data.native.definitions.find(d=>d.name==='get'&&!d.analysis_status);
    check('both dynamic call forms identify the interface operation',query.data.native.references.filter(r=>r.role==='call'&&r.id===operation.id).length===2);
    const rejected=await call('vela_check',{path:file,text:source.replace('dyn Reader(One())','dyn Reader(dyn Reader(One()))')});
    check('explicit repacking rejected through MCP',rejected.status==='rejected'&&rejected.data.native.diagnostics[0].code==='E237'&&rejected.data.native.diagnostics[0].details.reason==='dynamic_repack');
  }
  const resources=await client.listResources();
  check('version-matched help resources',resources.resources.length===16 && resources.resources.some(r=>r.uri==='vela://help/idioms') && resources.resources.some(r=>r.uri==='vela://help/numbers') && resources.resources.some(r=>r.uri==='vela://help/stdlib') && resources.resources.some(r=>r.uri==='vela://help/testing') && resources.resources.some(r=>r.uri==='vela://help/ffi') && resources.resources.some(r=>r.uri==='vela://help/recipes') && resources.resources.some(r=>r.uri==='vela://help/capabilities'));
  const resource=await client.readResource({uri:'vela://help/builtins'});
  const help=await call('vela_get_help',{topic:'builtins'});
  check('resource/help catalog identical',resource.contents[0].text===help.data.text);
  const checked=await call('vela_check',{path:'@app'});
  check('native check',checked.status==='ok'&&checked.data.native.ok&&checked.snapshot_id.length===64);
  const native=JSON.parse(execFileSync(path.join(root,'bin/velac.exe'),['check',path.join(workspace,'main.vela'),'--json'],{encoding:'utf8'}));
  check('CLI JSON equivalence',JSON.stringify(native)===JSON.stringify(checked.data.native));
  const fmt=await call('vela_format',{path:'main.vela'});
  check('format exact CLI output',fmt.data.text===execFileSync(path.join(root,'bin/velac.exe'),['fmt',path.join(workspace,'main.vela')],{encoding:'utf8'}));
  check('format preserves file',await fs.readFile(path.join(workspace,'main.vela'),'utf8')===source);
  const overlay=await call('vela_check',{path:'draft.vela',text:'fn main()->Int{return 0;}'});
  check('unsaved source check',overlay.status==='ok'&&overlay.snapshot_id!==checked.snapshot_id);
  await assert.rejects(fs.stat(path.join(workspace,'draft.vela')));
  check('overlay never writes source',true);
  const invalidOverlay=await call('vela_check',{path:'vela.project',text:'vela-project|1'});
  check('manifest overlay rejected',invalidOverlay.status==='invalid_input');
  const symbols=await call('vela_symbols',{path:'main.vela'});
  check('symbols include original source',symbols.status==='ok'&&symbols.data.native.functions[0].source===path.join(workspace,'main.vela'));
  const semantic='fn inc(n:Int)->Int{return n+1;}\nfn main()->Int{let tag="🧭";return inc(41);}\n';
  await fs.writeFile(path.join(workspace,'main.vela'),semantic);
  const focus={path:'main.vela',line:1,character:semantic.split('\n')[1].indexOf('inc')};
  const query=await call('vela_query',{path:'main.vela',at:focus});
  const cliQuery=JSON.parse(execFileSync(path.join(root,'bin/velac.exe'),['query',path.join(workspace,'main.vela'),
    '--at',path.join(workspace,'main.vela'),String(focus.line),String(focus.character)],{encoding:'utf8'}));
  assert.deepEqual(query.data.native,cliQuery);
  check('native semantic CLI parity',query.status==='ok'&&query.data.native.references[0].type==='Int');
  const request={path:'main.vela',kind:'rename',snapshot_id:query.snapshot_id,revision:query.data.native.revision,
    document:0,byte:query.data.native.references[0].range.start.byte,new_name:'increment'};
  const preview=await call('vela_plan',request);
  check('rename preview validated without writes',preview.status==='ok'&&preview.data.native.changes[0].edits.length===2&&
    await fs.readFile(path.join(workspace,'main.vela'),'utf8')===semantic);
  const wrongRevision=await call('vela_plan',{...request,revision:'0'.repeat(64)});
  check('native stale revision rejected',wrongRevision.status==='rejected'&&wrongRevision.data.native.diagnostics[0].code==='E231');
  await fs.writeFile(path.join(workspace,'main.vela'),semantic.replace(/\n/g,'\r\n'));
  check('raw snapshot changes invalidate plans',(await call('vela_plan',request)).status==='source_changed');
  await fs.writeFile(path.join(workspace,'main.vela'),source);
  for(const input of ['../secret.vela','C:/secret.vela','@unknown','main.vela:stream']){
   check('reject path '+input,(await call('vela_check',{path:input})).status==='invalid_input');
  }
  await fs.writeFile(path.join(workspace,'main.vela'),'// 😀\nfn main()->Int{return true;}');
  const rejected=await call('vela_check',{path:'main.vela'});
  check('rejection and changed snapshot',rejected.status==='rejected'&&rejected.snapshot_id!==checked.snapshot_id&&JSON.stringify(rejected.data.native).includes('E201'));
  check('Unicode coordinates',JSON.stringify(rejected.data.native).includes('"line":2'));
  await fs.writeFile(path.join(workspace,'main.vela'),Buffer.from([255]));
  check('invalid UTF8 diagnostic',(await call('vela_check',{path:'main.vela'})).status==='toolchain_error');
  await fs.writeFile(path.join(workspace,'main.vela'),'import "../../../outside.vela"; fn main()->Unit{}');
  const escape=await call('vela_check',{path:'main.vela'});
  check('native snapshot read boundary',escape.status==='rejected'&&JSON.stringify(escape.data).includes('VELA_SOURCE_ROOT'));
  await fs.writeFile(path.join(workspace,'main.vela'),source);
  const badArgs=await client.callTool({name:'vela_check',arguments:{path:'main.vela',extra:true}});
  check('strict input schema',badArgs.isError===true);
  await assert.rejects(client.callTool({name:'unknown',arguments:{}}));
  check('unknown tool rejected',true);
  const parallel=await Promise.all(Array.from({length:8},()=>call('vela_check',{path:'main.vela'})));
  check('bounded concurrency',parallel.some(r=>r.status==='limit')&&parallel.some(r=>r.status==='ok'));
  // Lock and project aliases are parsed only by native Vela.
  await fs.writeFile(path.join(workspace,'lib.vela'),'pub fn answer()->Int{return 42;}');
  await fs.writeFile(path.join(workspace,'vela.project'),'vela-project|1\nname|sample\nentry|main.vela\ndep|lib|lib.vela\n');
  await fs.writeFile(path.join(workspace,'main.vela'),'import "@lib" as lib; fn main()->Int{return lib::answer();}');
  execFileSync(path.join(root,'bin/velac.exe'),['lock',path.join(workspace,'vela.project')]);
  check('project snapshot lock',(await call('vela_check',{path:'vela.project'})).status==='ok');
  check('project unsaved source alias',(await call('vela_check',{path:'vela.project',overlay_path:'main.vela',text:'import "@lib" as lib; fn main()->Int{return lib::answer()+1;}'})).status==='ok');
  await fs.writeFile(path.join(workspace,'lib.vela'),'pub fn answer()->Int{return 43;}');
  check('native stale lock',(await call('vela_check',{path:'vela.project'})).status==='rejected');
  await fs.unlink(path.join(workspace,'vela.project'));await fs.unlink(path.join(workspace,'vela.project.lock'));await fs.unlink(path.join(workspace,'lib.vela'));
  await fs.writeFile(path.join(workspace,'main.vela'),source);
  for(let i=0;i<25;i++)await call('vela_check',{path:'main.vela'});
  const baseline=readStats(transport.pid);
  for(let i=0;i<1000;i++){
   const value=await call(i%3===0?'vela_symbols':i%3===1?'vela_format':'vela_check',{path:'main.vela'});
   assert.equal(value.status,'ok');report.sequential++;
  }
  const final=readStats(transport.pid);report.stress={baseline,final};
  check('1000 analyses',report.sequential===1000);
  if(baseline){check('RSS growth <=64MiB',final.WorkingSet64-baseline.WorkingSet64<=64*1024*1024);check('handle growth <=16',final.HandleCount-baseline.HandleCount<=16);}
  check('protocol stdout clean',stderr==='');
 } finally {await client.close();}
 // Host fault injection uses real compiler processes and temporary files.
 const host=new Host({...config});
 await host.init(path.join(pkg,'compatibility.json'));
 await host.ensureTemp();
 try {
  host.compiler=path.join(host.base,'missing.exe');
  check('spawn failure',(await host.analyze('check','main.vela',signal())).status==='toolchain_error');
  host.compiler=path.join(host.base,'velac.exe');
  host.bounds={...limits,outputBytes:16};
  check('output limit',(await host.analyze('symbols','main.vela',signal())).status==='limit');
  host.bounds={...limits,timeMs:1};
  check('timeout',(await host.analyze('check','main.vela',signal())).status==='timeout');
  host.bounds={...limits,fileBytes:8};
  check('file size limit',(await host.analyze('check','main.vela',signal())).status==='limit');
  host.bounds=limits;
  await fs.link(path.join(workspace,'main.vela'),path.join(workspace,'hard.vela'));
  check('hardlink refusal',(await host.analyze('check','main.vela',signal())).status==='invalid_input');
  await fs.unlink(path.join(workspace,'hard.vela'));
  const outside=path.join(work,'outside');await fs.mkdir(outside);
  await fs.symlink(outside,path.join(workspace,'link'),'junction');
  check('junction refusal',(await host.analyze('check','main.vela',signal())).status==='invalid_input');
  await fs.unlink(path.join(workspace,'link'));
  const inventory=host.inventory.bind(host);let calls=0;
  host.inventory=async s=>{const entries=await inventory(s);if(++calls===1)await fs.appendFile(path.join(workspace,'main.vela'),'\n// changed');return entries;};
  check('snapshot change rejected',(await host.analyze('check','main.vela',signal())).status==='source_changed');
  host.inventory=inventory;
  const heavy='fn main()->Unit{}\n'+Array.from({length:5000},(_,i)=>'fn f'+i+'()->Int{return '+i+';}').join('\n');
  await fs.writeFile(path.join(workspace,'main.vela'),heavy);
  for(let i=0;i<25;i++){
   const controller=new AbortController(); const pending=host.analyze('check','main.vela',controller.signal);
   while(host.children.size===0&&host.active>0)await new Promise(r=>setTimeout(r,1));
   check('cancellation reached compiler '+i,host.children.size===1);
   controller.abort();
   assert.equal((await pending).status,'cancelled');report.cancellations++;
   assert.equal(host.children.size,0);
  }
  check('no idle temporary directories',host.base===''&&host.children.size===0);
  // Same-version executable modification is detected by digest, without editing real toolchain.
  host.pins={...host.pins,'bin/velac.exe':'0'.repeat(64)};
  check('same-version mismatch',(await host.analyze('check','main.vela',signal())).status==='incompatible');
 } finally {await host.close();}
 const remaining=[...(await dirs())].filter(d=>!beforeDirs.has(d));
 check('no temporary/process residue',remaining.length===0);
 await fs.writeFile(path.join(root,'docs/mcp-evidence.json'),JSON.stringify(report,null,2)+'\n');
});
