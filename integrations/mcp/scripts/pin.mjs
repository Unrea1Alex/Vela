// Release-maintainer action: run only after validating the native build and docs.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'../..');
const version=/^Vela (\S+) \(self-hosted\)/.exec(execFileSync(path.join(root,'bin/velac.exe'),['--version'],{encoding:'utf8'}))?.[1];
if(!version)throw new Error('Cannot determine the pinned native compiler version.');
const files={};
for(const file of ['bin/velac.exe','vela/builtins.def','vela/backends/runtime.h',
 'docs/AGENT-QUICKSTART.md','docs/LANGUAGE.md','docs/PROJECTS.md','docs/COMPATIBILITY.md','docs/MIGRATING-1.0.md','docs/CHANGELOG.md','docs/stable-1.0.json','docs/contracts/STABLE-1.0.md',
 'docs/contracts/MODULES.md','docs/MEMORY.md','examples/agent-idioms/main.vela','docs/contracts/NUMBERS.md',
 'docs/STDLIB.md','docs/TOOLING.md','docs/contracts/TESTING.md','docs/contracts/FFI.md','vela/ffi.h',
 ...['LIBRARY-1.1','SEMANTIC-QUERIES','REFACTORING','LSP','FORMATTER','TEXT-LITERALS-RESOURCES','MCP-OUTPUT-ARTIFACTS','MCP-PROTOCOL','MCP-EXECUTION','ENCAPSULATION','METHODS','INTERFACES','CALLABLES-EFFECTS','SERVICES','REPLAY','CALLBACKS','GUI-APPLICATION','GUI-LIBRARY','EVENT-LOOP','ASYNC-CANCELLATION','TASK-GROUPS','NETWORK-TLS','HTTP-API','ENUM-EQUALITY','GUI-NETWORK','INCREMENTAL-BUILD','DEBUGGING','PACKAGING','PLATFORM-SUPPORT'].map(name=>'docs/contracts/'+name+'.md'),
 ...['json_stream','directory','text','path','collections','json','cli','config','fs','process','testing','result','lines','services','replay','event_loop','tasks','task_group','async_io','gui','http','http_server'].map(name=>'std/'+name+'.vela')]){
 files[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
}
await writeFile(new URL('../compatibility.json',import.meta.url),JSON.stringify({
 schema_version:1,version,sdk:'2.4.0',node:'>=24',wire:['2025-11-25','2026-07-28'],
 clients:[],files
},null,2)+'\n');
