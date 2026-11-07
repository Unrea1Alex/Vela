import * as fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Host,HostError,limits,type Status} from './host.js';
import {Sandbox,SandboxError,hash,inside} from './sandbox.js';

type Entry={relative:string;bytes:Buffer;signature:string};
type Artifact={created:number;disk:string;snapshot:string;id:string;entries:Entry[];files:Map<string,Buffer>;size:number;fingerprint:string};
type Output={output_id:string;name:string;size:number;sha256:string;mime:string;run_id:string;artifact_id:string;snapshot_id:string;expires_at:number};
const mimeTypes:Record<string,string>={html:'text/html',svg:'image/svg+xml',tsv:'text/tab-separated-values',csv:'text/csv',
  json:'application/json',txt:'text/plain',png:'image/png',bin:'application/octet-stream'};
export const outputLimits={per_run:4,file_bytes:512*1024,run_bytes:2*1024*1024,session_count:16,session_bytes:8*1024*1024,age_ms:300000,chunk_bytes:65536};
const outputName=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.(?:html|svg|tsv|csv|json|txt|png|bin)$/;
const deviceName=/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])\./i;
export const executionLimits={active:1,build_test_ms:120000,run_default_ms:5000,run_max_ms:30000,
  artifacts:8,artifact_bytes:64*1024*1024,artifact_age_ms:30*60*1000,args:64,arg_bytes:16384};
export const encoded=(bytes:Buffer)=>{
  try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),encoding:'utf8'};}
  catch{return {text:bytes.toString('hex'),encoding:'hex'};}
};
const manifest=(p:string)=>p.endsWith('.vproj')||path.basename(p)==='vela.project';
const fingerprint=(files:Map<string,Buffer>)=>hash(JSON.stringify([...files].map(([n,b])=>[n,hash(b)])));
export class Execution {
  sandbox:Sandbox;
  reason='Not configured.';
  busy=false;
  artifacts=new Map<string,Artifact>();
  outputs=new Map<string,{meta:Output;bytes:Buffer}>();
  outputTimer=setInterval(()=>this.prune(),15000).unref();
  constructor(public host:Host){const c=host.config.execution!;this.sandbox=new Sandbox(c.manifest,c.sha256);}
  async init(){
    try{await this.sandbox.init(this.host.compilerId);this.reason='';}
    catch(e){this.reason=String(e);await this.sandbox.close();}
  }
  prune(){
    const now=Date.now();
    for(const [id,a] of this.artifacts)if(now-a.created>=executionLimits.artifact_age_ms)this.artifacts.delete(id);
    for(const [id,a] of this.outputs)if(now>=a.meta.expires_at)this.outputs.delete(id);
  }
  async captureOutputs(directory:string,expected:string[],signal:AbortSignal){
    // The supervisor has stopped the entire job and checked every tree entry
    // for reparse tags. Only the host can access this tree now.
    const info=await fs.lstat(directory);
    if(!info.isDirectory()||info.isSymbolicLink()||
      path.resolve(await fs.realpath(directory)).toLowerCase()!==path.resolve(directory).toLowerCase())
      throw new HostError('invalid_input','Unsafe output directory.');
    const names=await fs.readdir(directory);
    if(names.length!==expected.length||!expected.every(name=>names.includes(name)))
      throw new HostError('invalid_input','Output directory must contain exactly the requested file names.');
    const results=[];
    let total=0;
    for(const name of expected){
      signal.throwIfAborted();
      const file=path.join(directory,name),info=await fs.lstat(file);
      if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)
        throw new HostError('invalid_input','Output must be an unlinked regular file.');
      if(info.size>outputLimits.file_bytes||total+info.size>outputLimits.run_bytes)
        throw new HostError('limit','Generated output exceeds byte limits.');
      const handle=await fs.open(file,'r');
      try{
        const after=await handle.stat();
        if(!after.isFile()||after.nlink!==1||after.size!==info.size||after.ino!==info.ino||after.dev!==info.dev)
          throw new HostError('invalid_input','Output changed during capture.');
        const bytes=Buffer.alloc(info.size);
        let read=0;
        while(read<bytes.length){
          const {bytesRead}=await handle.read(bytes,read,bytes.length-read,read);
          if(!bytesRead)throw new HostError('invalid_input','Output was truncated.');
          read+=bytesRead;
        }
        total+=bytes.length;
        results.push({name,bytes});
      }finally{await handle.close();}
    }
    return {results,total};
  }
  readOutput(id:string,offset:number,length:number){
    this.prune();
    const entry=this.outputs.get(id);
    const response=(status:Status,message:string,data:Record<string,unknown>={})=>({schema_version:1 as const,status,message,
      compiler_id:this.host.compilerId,snapshot_id:entry?.meta.snapshot_id??'',data});
    if(!entry)return response('invalid_input','Unknown or expired output_id.');
    if(!Number.isSafeInteger(offset)||offset<0||offset>entry.bytes.length||
       !Number.isSafeInteger(length)||length<1||length>outputLimits.chunk_bytes)
      return response('invalid_input','Invalid byte range.');
    const end=Math.min(offset+length,entry.bytes.length);
    return response('ok','',{...entry.meta,offset,next_offset:end,eof:end===entry.bytes.length,encoding:'base64',
      bytes:entry.bytes.subarray(offset,end).toString('base64')});
  }
  async unchanged(entries:Entry[],signal:AbortSignal){
    const now=await this.host.inventory(signal);
    if(this.host.inventoryId(entries)!==this.host.inventoryId(now)||
       JSON.stringify(entries.map(e=>[e.relative,e.signature]))!==JSON.stringify(now.map(e=>[e.relative,e.signature])))
      throw new HostError('source_changed','Workspace changed during execution.');
  }
  async snapshot(input:string,text:string|undefined,overlayPath:string|undefined,signal:AbortSignal){
    const relative=this.host.resolve(input),disk=await this.host.inventory(signal),entries=disk.map(e=>({...e}));
    if(overlayPath!==undefined&&text===undefined)throw new HostError('invalid_input','overlay_path requires text.');
    if(text!==undefined){
      const rel=overlayPath===undefined?relative:this.host.resolve(overlayPath);
      if(!rel.endsWith('.vela')||rel.split(path.sep).some(p=>['.git','.codex','node_modules','build','bin','dist','work'].includes(p)))
        throw new HostError('invalid_input','Overlay requires an included .vela source path.');
      if(Buffer.from(text).toString()!==text)throw new HostError('invalid_input','Overlay must be valid Unicode.');
      const bytes=Buffer.from(text),i=entries.findIndex(e=>e.relative===rel);
      if(bytes.length>limits.fileBytes)throw new HostError('limit','Overlay exceeds source bound.');
      const entry={relative:rel,bytes,signature:'overlay'};
      if(i<0)entries.push(entry);else entries[i]=entry;
      entries.sort((a,b)=>a.relative.localeCompare(b.relative,'en'));
    }
    if(entries.length>limits.files||entries.reduce((n,e)=>n+e.bytes.length,0)>limits.bytes)throw new HostError('limit','Snapshot exceeds bounds.');
    if(!entries.some(e=>e.relative===relative))throw new HostError('invalid_input','Input is missing or excluded.');
    return {relative,disk,entries};
  }
  // Host authorization of the documented manifest protocol, not language analysis.
  natives(entries:Entry[],root:string){
    const allowed=new Set(this.host.config.execution!.native_allowlist),companions=new Map<string,Buffer>();
    for(const entry of entries.filter(e=>manifest(e.relative))){
      let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(entry.bytes).replaceAll('\r','');}catch{continue;}
      for(const line of text.split('\n')){
        const fields=line.split('|');
        if(fields[0]==='resource'&&entry.relative===root)throw new HostError('invalid_input','Declared project resources require local CLI execution.');
        if(fields[0]!=='native')continue;
        const supported=fields.length===3||fields.length===6&&fields[3]==='windows-x64'&&fields[4]==='1'&&fields[5]==='shared';
        if(!supported||!/^[A-Za-z0-9_-]{1,124}\.dll$/.test(fields[1]))throw new HostError('invalid_input','Invalid native declaration.');
        const resolved=this.host.resolve(path.join(path.dirname(entry.relative),fields[2]));
        const source=entries.find(e=>e.relative===resolved);
        if(!source||!allowed.has(hash(source.bytes)))throw new HostError('invalid_input','Native DLL is not authorized by host SHA-256 allowlist: '+fields[1]);
        const key=fields[1].toLowerCase(),previous=companions.get(key);
        if(previous&&!previous.equals(source.bytes))throw new HostError('invalid_input','Conflicting native companions.');
        companions.set(key,source.bytes);
      }
    }
    return companions;
  }
  async copy(root:string,entries:Entry[]){
    const project=path.join(root,'project');await fs.mkdir(project);
    for(const e of entries){const target=path.join(project,e.relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,e.bytes);}
    return project;
  }
  remap(value:unknown,project:string):unknown{
    if(Array.isArray(value))return value.map(v=>this.remap(v,project));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,
      ['source','file','path'].includes(k)&&typeof v==='string'&&inside(project,v)?path.join(this.host.config.workspace,path.relative(project,v)):this.remap(v,project)]));
    return value;
  }
  async request(kind:'build'|'test'|'run',input:string,external:AbortSignal,options:{text?:string;overlay_path?:string;args?:string[];timeout_ms?:number;outputs?:string[]}={}){
    let snapshot='',root='';
    const answer=(status:Status,data:Record<string,unknown>={},message='')=>({schema_version:1 as const,status,
      compiler_id:this.host.compilerId,snapshot_id:snapshot,data:{execution_toolchain_id:this.sandbox.id,...data},message});
    if(!this.sandbox.ready)return answer('incompatible',{},this.reason);
    if(this.busy)return answer('limit',{},'One execution request at a time.');
    this.busy=true;
    const signal=AbortSignal.any([external,this.host.controller.signal]);
    try{
      signal.throwIfAborted();await this.host.verify();await this.sandbox.verify();this.prune();signal.throwIfAborted();
      const expected=options.outputs??[];
      if(expected.length>outputLimits.per_run||expected.some(name=>!outputName.test(name)||deviceName.test(name))||
        new Set(expected.map(n=>n.toLowerCase())).size!==expected.length)
        throw new HostError('invalid_input','Output names must be distinct safe names with supported extensions.');
      let entries:Entry[],disk:Entry[],relative='',artifact:Artifact|undefined;
      if(kind==='run'){
        artifact=this.artifacts.get(input);if(!artifact)throw new HostError('invalid_input','Unknown or expired artifact_id.');
        if(fingerprint(artifact.files)!==artifact.fingerprint||hash(this.host.compilerId+this.sandbox.id+this.host.inventoryId(artifact.entries))!==artifact.snapshot)
          throw new HostError('invalid_input','Artifact bytes changed.');
        const args=options.args??[],timeout=options.timeout_ms??executionLimits.run_default_ms;
        if(args.length>64||args.some(s=>s.includes('\0')||Buffer.from(s).toString()!==s)||args.reduce((n,s)=>n+Buffer.byteLength(s),0)>16384||
           !Number.isInteger(timeout)||timeout<1||timeout>executionLimits.run_max_ms)throw new HostError('invalid_input','Invalid run arguments/timeout.');
        disk=await this.host.inventory(signal);
        if(this.host.inventoryId(disk)!==artifact.disk)throw new HostError('source_changed','Artifact workspace changed; build again.');
        entries=artifact.entries;snapshot=artifact.snapshot;
      }else{
        const captured=await this.snapshot(input,options.text,options.overlay_path,signal);
        ({entries,disk,relative}=captured);snapshot=hash(this.host.compilerId+this.sandbox.id+this.host.inventoryId(entries));
      }
      const natives=this.natives(entries,relative);
      root=await this.sandbox.directory();const project=await this.copy(root,entries),output=path.join(root,'output');await fs.mkdir(output);
      const exportDir=path.join(root,'export');
      if(expected.length)await fs.mkdir(exportDir);
      await this.unchanged(disk,signal);
      let exe=path.join(this.sandbox.manifest.root,'velac.exe'),args:string[];
      if(kind==='run'){
        for(const [name,bytes]of artifact!.files)await fs.writeFile(path.join(output,name),bytes);
        exe=path.join(output,'app.exe');args=options.args??[];
      }else args=kind==='build'?['build',path.join(project,relative),'-o',path.join(output,'app.exe'),'--json']:['test',path.join(project,relative),'--json'];
      const result=await this.sandbox.run(root,exe,args,signal,kind==='run'?(options.timeout_ms??5000):120000,project);
      await this.sandbox.verify();await this.host.verify();await this.unchanged(disk,signal);
      signal.throwIfAborted();
      const stdout=encoded(result.out),stderr=encoded(result.err);
      const data:Record<string,unknown>={exit_code:result.exit_code,stdout:stdout.text,stderr:stderr.text,
        stdout_encoding:stdout.encoding,stderr_encoding:stderr.encoding};
      if(result.status!=='ok')return answer(result.status as Status,data);
      if(kind==='run'){
        if(!expected.length||result.exit_code!==0)return answer('ok',data);
        const captured=await this.captureOutputs(exportDir,expected,signal);
        await this.sandbox.remove(root);root='';
        await this.unchanged(disk,signal);
        signal.throwIfAborted();
        this.prune();
        if(this.outputs.size+captured.results.length>outputLimits.session_count||
          captured.total+[...this.outputs.values()].reduce((n,o)=>n+o.bytes.length,0)>outputLimits.session_bytes)
          throw new HostError('limit','Generated output store is full.');
        const run_id=hash(randomUUID()+snapshot+artifact!.id),expires_at=Date.now()+outputLimits.age_ms;
        const files=captured.results.map(({name,bytes})=>{
          const sha256=hash(bytes),output_id=hash(randomUUID()+run_id+sha256);
          const meta={output_id,name,size:bytes.length,sha256,mime:mimeTypes[path.extname(name).slice(1)],run_id,
            artifact_id:artifact!.id,snapshot_id:snapshot,expires_at};
          this.outputs.set(output_id,{meta,bytes});
          return meta;
        });
        return answer('ok',{...data,run_id,outputs:files});
      }
      try{data.native=this.remap(JSON.parse(result.out.toString('utf8')),project);}catch{if(kind==='test'&&result.exit_code===0)throw new HostError('toolchain_error','Invalid native test report.');}
      if(result.exit_code!==0)return answer(result.exit_code===1?'rejected':'toolchain_error',data);
      if(kind==='test')return answer('ok',data);
      const files=new Map<string,Buffer>();
      for(const name of await fs.readdir(output)){
        const file=path.join(output,name),info=await fs.lstat(file);
        if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>executionLimits.artifact_bytes)throw new HostError('invalid_input','Unsafe build artifact.');
        if(name!=='app.exe'&&!natives.has(name.toLowerCase()))throw new HostError('invalid_input','Unexpected build output.');
        const bytes=await fs.readFile(file);
        if(name!=='app.exe'&&!bytes.equals(natives.get(name.toLowerCase())!))throw new HostError('invalid_input','Native companion changed.');
        files.set(name,bytes);
      }
      if(!files.has('app.exe'))throw new HostError('toolchain_error','Build produced no executable.');
      const size=entries.reduce((n,e)=>n+e.bytes.length,0)+[...files.values()].reduce((n,b)=>n+b.length,0);
      if(this.artifacts.size>=8||size+[...this.artifacts.values()].reduce((n,a)=>n+a.size,0)>executionLimits.artifact_bytes)throw new HostError('limit','Artifact store full; reconnect or wait for expiry.');
      const id=hash(randomUUID()+snapshot+JSON.stringify([...files].map(([n,b])=>[n,hash(b)])));
      this.artifacts.set(id,{id,created:Date.now(),disk:this.host.inventoryId(disk),snapshot,entries,files,size,fingerprint:fingerprint(files)});
      return answer('ok',{...data,artifact_id:id,artifact_bytes:size,expires_in_ms:executionLimits.artifact_age_ms});
    }catch(e){
      if(signal.aborted)return answer('cancelled',{},'Execution cancelled.');
      if(e instanceof SandboxError&&e.status==='incompatible'){this.sandbox.ready=false;this.reason=e.message;}
      return answer(e instanceof HostError||e instanceof SandboxError?e.status:'toolchain_error',{},String(e));
    }finally{try{if(root)await this.sandbox.remove(root);}finally{this.busy=false;}}
  }
  async close(){clearInterval(this.outputTimer);this.outputs.clear();this.artifacts.clear();await this.sandbox.close();}
}
