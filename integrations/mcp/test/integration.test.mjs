import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {Host,limits} from '../dist/host.js';
const root=path.resolve('../..'), pkg=path.resolve('.');
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
  check('five tools with input/output schemas',tools.tools.length===5&&tools.tools.every(t=>t.inputSchema&&t.outputSchema));
  const context=await call('vela_get_context');
  check('context fingerprint',context.status==='ok'&&context.compiler_id.length===64&&context.data.quickstart.includes('list_new'));
  const resources=await client.listResources();
  check('version-matched help resources',resources.resources.length===11 && resources.resources.some(r=>r.uri==='vela://help/idioms') && resources.resources.some(r=>r.uri==='vela://help/numbers') && resources.resources.some(r=>r.uri==='vela://help/stdlib') && resources.resources.some(r=>r.uri==='vela://help/testing') && resources.resources.some(r=>r.uri==='vela://help/ffi'));
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
