// Release-maintainer action: run only after validating the native build and docs.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'../..');
const files={};
for(const file of ['bin/velac.exe','vela/builtins.def','vela/backends/runtime.h',
 'docs/AGENT-QUICKSTART.md','docs/LANGUAGE.md','docs/PROJECTS.md',
 'docs/contracts/MODULES.md','docs/MEMORY.md','examples/agent-idioms/main.vela','docs/contracts/NUMBERS.md',
 'docs/STDLIB.md','docs/contracts/TESTING.md','docs/contracts/FFI.md','vela/ffi.h',...['text','path','collections','json','cli','config','fs','process','testing'].map(name=>'std/'+name+'.vela')]){
 files[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
}
await writeFile(new URL('../compatibility.json',import.meta.url),JSON.stringify({
 schema_version:1,version:'0.7.0',sdk:'2.4.0',node:'>=24',wire:['2025-11-25','2026-07-28'],
 clients:[],files
},null,2)+'\n');
