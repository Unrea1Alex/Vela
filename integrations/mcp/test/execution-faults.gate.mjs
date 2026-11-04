import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Host,configSchema} from '../dist/host.js';
import {Execution} from '../dist/execution.js';
import {hash} from '../dist/sandbox.js';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const root=path.resolve('../..'),manifest=path.join(root,'build/mcp-execution/execution.json');
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'vela-exec-faults-'));
const config=configSchema.parse({schema_version:1,workspace,toolchain:root,execution:{manifest,sha256:hash(await fs.readFile(manifest))}});
const host=new Host(config),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS',name);};
const signal=()=>new AbortController().signal;
let execution;
try{
 await fs.writeFile(path.join(workspace,'main.vela'),'fn main()->Unit{}');
 await host.init(path.resolve('compatibility.json'));execution=new Execution(host);await execution.init();assert.ok(execution.sandbox.ready,execution.reason);
 const build=await execution.request('build','main.vela',signal());assert.equal(build.status,'ok');const id=build.data.artifact_id;
 const artifact=execution.artifacts.get(id),originalByte=artifact.files.get('app.exe')[0];artifact.files.get('app.exe')[0]^=1;
 check('changed artifact bytes rejected',(await execution.request('run',id,signal())).status==='invalid_input');artifact.files.get('app.exe')[0]=originalByte;
 artifact.created-=1800001;
 check('expired artifact rejected',(await execution.request('run',id,signal())).status==='invalid_input');
 // Exercise store bounds with the already verified immutable artifact bytes.
 for(let i=0;i<8;i++)execution.artifacts.set(String(i),{...artifact,created:Date.now()});
 check('artifact count bound',(await execution.request('build','main.vela',signal())).status==='limit');execution.artifacts.clear();
 const binary=await execution.request('build','binary.vela',signal(),{text:'fn main()->Unit effects{io}{write_stdout(str_from_byte(255));}'});
 console.log('binary build',binary.status,binary.message);
 assert.equal(binary.status,'ok');
 const bytes=await execution.request('run',binary.data.artifact_id,signal());
 check('invalid UTF8 stdout uses hex',bytes.status==='ok'&&bytes.data.stdout_encoding==='hex'&&bytes.data.stdout==='ff');
 const original=host.inventory.bind(host);let calls=0;
 host.inventory=async s=>{const entries=await original(s);if(++calls===1)await fs.writeFile(path.join(workspace,'main.vela'),'fn main()->Unit{}\n');return entries;};
 check('snapshot race rejected',(await execution.request('build','main.vela',signal())).status==='source_changed');host.inventory=original;
 const cancel=new AbortController();cancel.abort();
 check('cancelled build publishes nothing',(await execution.request('build','main.vela',cancel.signal)).status==='cancelled');
 const dll=await fs.readFile(path.join(root,'build/stage07/ffi-work/fixture.dll'));
 host.config.execution.native_allowlist.push(hash(dll));await fs.writeFile(path.join(workspace,'fixture.dll'),dll);
 await fs.writeFile(path.join(workspace,'native.vela'),'extern "fixture.dll" fn echo64(x:Int)->Int effects{state,process}; fn main()->Unit effects{state,process,io}{print(echo64(42));}');
 await fs.writeFile(path.join(workspace,'vela.project'),'vela-project|1\nname|native\nentry|native.vela\nnative|fixture.dll|fixture.dll\n');
 execFileSync(path.join(root,'bin/velac.exe'),['lock',path.join(workspace,'vela.project')]);
 const native=await execution.request('build','vela.project',signal());assert.equal(native.status,'ok',JSON.stringify(native));
 const nativeRun=await execution.request('run',native.data.artifact_id,signal());
 check('authorized native DLL is pinned and staged',nativeRun.status==='ok'&&nativeRun.data.exit_code===0&&nativeRun.data.stdout.trim()==='42');
 const cacheProbe=path.join(execution.sandbox.manifest.root,'probe.exe'),saved=await fs.readFile(cacheProbe);
 try{await fs.appendFile(cacheProbe,'tamper');check('toolchain mutation disables execution',(await execution.request('build','main.vela',signal())).status==='incompatible'&&!execution.sandbox.ready);}
 finally{await fs.writeFile(cacheProbe,saved);}
 await execution.close();
 // A bad manifest pin leaves the five analysis tools available, with a reason.
 const cfg=path.join(workspace,'.codex','config.json');await fs.mkdir(path.dirname(cfg));
 await fs.writeFile(cfg,JSON.stringify({...config,execution:{...config.execution,sha256:'0'.repeat(64)}}));
 const client=new Client({name:'vela-disabled-gate',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('dist/index.js'),'--config',cfg],stderr:'pipe'});transport.stderr.resume();
 try{await client.connect(transport);const tools=await client.listTools(),context=(await client.callTool({name:'vela_get_context',arguments:{}})).structuredContent;
  check('failed backend keeps analysis only',tools.tools.length===5&&context.data.execution===false&&context.data.execution_reason.includes('fingerprint'));}
 finally{await client.close();await transport.close();}
}finally{await execution?.close();await host.close();await fs.rm(workspace,{recursive:true,force:true});await fs.writeFile(path.join(root,'build/stage07/078-faults.json'),JSON.stringify({schema_version:1,checks},null,2));}
console.log('Fault checks:',checks.length);
