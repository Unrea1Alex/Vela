import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {packageRoot,server,tomlString,inspect,verifyToolchain} from './connection.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
 if(!['--workspace','--toolchain','--execution-manifest'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Usage: node scripts/setup.mjs --workspace ABSOLUTE_PROJECT --toolchain ABSOLUTE_NATIVE [--execution-manifest ABSOLUTE_MANIFEST]');
 options[args[i]]=args[i+1];
}
for(const name of ['--workspace','--toolchain'])if(!options[name]||!path.isAbsolute(options[name]))throw Error(name+' must be absolute.');
const workspace=await fs.realpath(options['--workspace']);
const toolchain=await fs.realpath(options['--toolchain']);
await verifyToolchain(toolchain);
const configDir=path.join(workspace,'.codex');
const configPath=path.join(configDir,'vela-mcp.json');
let execution;
if(options['--execution-manifest']){
 if(!path.isAbsolute(options['--execution-manifest']))throw Error('Execution manifest must be absolute.');
 const manifest=await fs.realpath(options['--execution-manifest']);
 execution={manifest,sha256:createHash('sha256').update(await fs.readFile(manifest)).digest('hex'),native_allowlist:[]};
}
const data=JSON.stringify({schema_version:1,toolchain,workspace,aliases:{},...(execution?{execution}:{})},null,2)+'\n';
const skillSource=await fs.access(path.join(packageRoot,'agent/vela-app/SKILL.md')).then(()=>path.join(packageRoot,'agent/vela-app')).catch(()=>path.resolve(packageRoot,'../agent/vela-app'));
// Preflight all owned files before writing; no global config or trust changes.
const files=new Map([[configPath,data],
 [path.join(workspace,'vela-codex.mjs'),'import {start} from '+JSON.stringify(pathToFileURL(path.join(packageRoot,'scripts/connection.mjs')).href)+';\nawait start('+JSON.stringify(configPath)+');\n'],
 [path.join(workspace,'.agents/skills/vela-app/SKILL.md'),await fs.readFile(path.join(skillSource,'SKILL.md'),'utf8')]]);
for(const name of ['text','path','collections','json','cli','config','fs','process','testing','result','lines','services','replay','event_loop','tasks','task_group','async_io','gui','http','http_server']) {
 files.set(path.join(workspace,'vela-stdlib',name+'.vela'),await fs.readFile(path.join(toolchain,'std',name+'.vela'),'utf8'));
}
const section='[mcp_servers.vela]\ncommand = '+tomlString(process.execPath)+'\nargs = ['+tomlString(server)+', "--config", '+tomlString(configPath)+']\nrequired = true\nstartup_timeout_sec = '+(execution?180:30)+'\ntool_timeout_sec = '+(execution?180:40)+'\n';
const clientPath=path.join(configDir,'config.toml');
const current=await fs.readFile(clientPath,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(current===null||current===section)files.set(clientPath,section);
else files.set(path.join(configDir,'vela-mcp.fragment.toml'),section);
const missing=[];
for(const [file,text]of files){
 let parent=path.dirname(file);
 while(parent!==workspace){
  if(!parent.startsWith(workspace+path.sep))throw Error('Setup path outside workspace.');
  const info=await fs.lstat(parent).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(info?.isSymbolicLink())throw Error('Setup refuses filesystem links: '+parent);
  parent=path.dirname(parent);
 }
 const info=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(info&&(info.isSymbolicLink()||!info.isFile()||info.nlink!==1))throw Error('Setup refuses nonregular/link target: '+file);
 const existing=await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(existing!==null&&existing!==text)throw Error('Existing file differs; review and relocate it before setup: '+file);
 if(existing===null)missing.push([file,text]);
}
for(const [file,text]of missing){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text,{flag:'wx'});}
console.log(JSON.stringify(await inspect(configPath),null,2));
console.log('Start: '+process.execPath+' '+path.join(workspace,'vela-codex.mjs'));
console.log('Desktop/IDE: open this workspace as a trusted project, then start a new session. Existing config.toml is preserved; use the fragment when supplied.');
