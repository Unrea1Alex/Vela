import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

export const hash=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
export const inside=(root:string,file:string)=>{const r=path.relative(root,file);return !!r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep);};
export class SandboxError extends Error {
  constructor(public status:'incompatible'|'cancelled'|'timeout'|'limit'|'invalid_input',message:string){super(message);}
}
type Manifest={schema_version:number;platform:string;root:string;helper:string;helper_sha256:string;c_compiler?:string;files:Record<string,string>};
export type SandboxResult={status:string;exit_code:number;os_error:number;out:Buffer;err:Buffer;supervisor_stderr?:string};
export class Sandbox {
  manifest!:Manifest;
  id='';
  base='';
  reason='';
  ready=false;
  supervisorPid?:number;
  private manifestBytes=Buffer.alloc(0);
  private lease?:ReturnType<typeof spawn>;
  private leaseDone?:Promise<unknown>;
  private leaseReady=false;
  constructor(public manifestPath:string,public expectedHash:string){}
  async init(compilerId:string){
    if(!path.isAbsolute(this.manifestPath))throw new SandboxError('incompatible','Execution manifest must be absolute.');
    if(await fs.stat(this.manifestPath+'.lock.failure.txt').catch(()=>null))throw new SandboxError('incompatible','Previous temporary-tree cleanup failed; inspect '+this.manifestPath+'.lock.failure.txt');
    if(process.platform!=='win32'||process.arch!=='x64')throw new SandboxError('incompatible','Execution requires Windows x64 LPAC.');
    this.manifestBytes=await fs.readFile(this.manifestPath);
    if(hash(this.manifestBytes)!==this.expectedHash)throw new SandboxError('incompatible','Execution manifest fingerprint changed.');
    this.manifest=JSON.parse(this.manifestBytes.toString('utf8'));
    const m=this.manifest;
    for(const root of [m.root,m.helper,this.manifestPath]){
      const info=await fs.lstat(root);
      if(info.isSymbolicLink()||path.resolve(await fs.realpath(root)).toLowerCase()!==path.resolve(root).toLowerCase()||
        (root!==m.root&&(!info.isFile()||info.nlink!==1)))throw new SandboxError('incompatible','Linked execution installation path.');
    }
    if(m.schema_version!==1||m.platform!=='windows-x64-lpac'||!path.isAbsolute(m.root)||!path.isAbsolute(m.helper)||
       m.files['velac.exe']!==compilerId||!m.files['probe.exe']||!m.files['bin/cl.exe'])throw new SandboxError('incompatible','Invalid execution toolchain manifest.');
    this.id=hash(this.manifestBytes);
    await this.verify();
    // A delete-on-close native lease survives long enough to wait for supervisor
    // cleanup if the client forcibly terminates this Node process.
    this.base=await fs.mkdtemp(path.join(os.tmpdir(),'vela-exec-'));
    this.lease=spawn(m.helper,['--lease',this.manifestPath+'.lock',this.base],{windowsHide:true,detached:true,stdio:['pipe','pipe','pipe']});
    const lease=this.lease;this.leaseDone=new Promise(resolve=>lease.on('close',resolve));lease.stderr!.resume();lease.stdin!.on('error',()=>{});
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{lease.kill();reject(new SandboxError('incompatible','Execution lease timed out.'));},10000);
      lease.once('error',e=>{clearTimeout(timer);reject(e);});
      lease.once('close',()=>{clearTimeout(timer);reject(new SandboxError('incompatible','Execution cache is already in use or requires stale-lock review.'));});
      lease.stdout!.once('data',b=>{clearTimeout(timer);if(b.toString().trim()==='ready'){this.leaseReady=true;resolve();}else reject(new SandboxError('incompatible','Invalid execution lease.'));});
    });
    try {await this.probe();this.ready=true;} catch(e){await this.close();throw e;}
  }
  async verify(){
    const m=this.manifest;
    if(hash(await fs.readFile(this.manifestPath))!==this.id&&this.id)throw new SandboxError('incompatible','Execution manifest changed.');
    if(hash(await fs.readFile(m.helper))!==m.helper_sha256)throw new SandboxError('incompatible','OS supervisor changed.');
    const found=new Set<string>();
    const walk=async(dir:string)=>{
      for(const name of (await fs.readdir(dir)).sort()){
        const file=path.join(dir,name), info=await fs.lstat(file);
        if(info.isSymbolicLink()||!(await fs.realpath(file)).toLowerCase().startsWith(m.root.toLowerCase()+path.sep))
          throw new SandboxError('incompatible','Toolchain filesystem link.');
        if(info.isDirectory()){await walk(file);continue;}
        const rel=path.relative(m.root,file).replaceAll('\\','/');
        if(!info.isFile()||info.nlink!==1||!m.files[rel]||hash(await fs.readFile(file))!==m.files[rel])
          throw new SandboxError('incompatible','Toolchain changed: '+rel);
        found.add(rel);
      }
    };
    await walk(m.root);
    if(found.size!==Object.keys(m.files).length)throw new SandboxError('incompatible','Missing toolchain files.');
  }
  async directory(){
    if(!this.base)throw new SandboxError('incompatible','Sandbox is closed.');
    return fs.mkdtemp(path.join(this.base,'request-'));
  }
  environment(root:string){
    const t=this.manifest.root,system=process.env.SystemRoot??'C:\\Windows';
    const compiler=this.manifest.c_compiler??'bin/cl.exe';
    return {SystemRoot:system,WINDIR:system,PATH:path.join(t,'bin')+';'+path.join(system,'System32'),
      INCLUDE:['vc','ucrt','shared','um'].map(n=>path.join(t,'include',n)).join(';'),
      LIB:['vc','ucrt','um'].map(n=>path.join(t,'lib',n)).join(';'),
      TEMP:root,TMP:root,VELA_CC:path.join(t,compiler),
      VELA_CC_KIND:'msvc',VELA_SOURCE_ROOT:path.join(root,'project'),VELA_EXECUTION_LOCK:this.manifestPath+'.lock',VSLANG:'1033'};
  }
  async run(root:string,exe:string,args:string[],signal:AbortSignal,timeoutMs:number,cwd=root):Promise<SandboxResult>{
    if(!inside(this.base,root)||(!inside(root,exe)&&!inside(this.manifest.root,exe)))throw new SandboxError('invalid_input','Invalid isolated executable path.');
    if(cwd!==root&&!inside(root,cwd))throw new SandboxError('invalid_input','Invalid isolated cwd.');
    if(signal.aborted)throw new SandboxError('cancelled','Execution cancelled.');
    await fs.mkdir(path.join(root,'tmp'),{recursive:true});
    const profile='vela-mcp-exec-'+randomUUID();
    // GetTempPathW in AppContainer derives this private path from LOCALAPPDATA.
    await fs.mkdir(path.join(root,'Packages',profile,'AC','Temp'),{recursive:true});
    const child=spawn(this.manifest.helper,[root,this.manifest.root,profile,String(timeoutMs),cwd,exe,...args],
      {cwd:root,env:{...this.environment(root),USERPROFILE:process.env.USERPROFILE,LOCALAPPDATA:process.env.LOCALAPPDATA,
        APPDATA:process.env.APPDATA,SystemDrive:process.env.SystemDrive},windowsHide:true,detached:true,stdio:['pipe','pipe','pipe'],shell:false});
    this.supervisorPid=child.pid;
    const out:Buffer[]=[],err:Buffer[]=[];let bytes=0;
    const cancel=()=>{if(!child.stdin.destroyed)child.stdin.write('cancel\n');};
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
    child.stdin.on('error',()=>{});
    child.stdout.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes<65536)out.push(b);else cancel();});
    child.stderr.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes<65536)err.push(b);else cancel();});
    let forced=false;
    const guard=setTimeout(()=>{forced=true;child.kill();},timeoutMs+30000);
    let code:number|null;
    try{code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});}
    finally{this.supervisorPid=undefined;clearTimeout(guard);signal.removeEventListener('abort',cancel);}
    const recover=async()=>{
      if(hash(await fs.readFile(this.manifest.helper))!==this.manifest.helper_sha256)throw new SandboxError('incompatible','Supervisor changed; review owned profile '+profile);
      const helper=spawn(this.manifest.helper,['--recover',this.manifest.root,profile],{windowsHide:true,detached:true,stdio:'ignore'});
      const guard=setTimeout(()=>helper.kill(),10000);
      try{const code=await new Promise((resolve,reject)=>{helper.on('error',reject);helper.on('close',resolve);});
        if(code!==0)throw new SandboxError('incompatible','Profile recovery failed; review '+profile);
      }finally{clearTimeout(guard);}
    };
    if(forced){await recover();throw new SandboxError('incompatible','OS supervisor did not terminate; execution disabled, owned profile recovered.');}
    let report:Record<string,unknown>;
    try{report=JSON.parse(Buffer.concat(out).toString('utf8'));}
    catch{await recover();throw new SandboxError('incompatible','OS supervisor exited '+code+' without a valid status; owned profile recovered. '+Buffer.concat(err).toString('utf8'));}
    if(code!==0||report.status==='incompatible')throw new SandboxError('incompatible','OS isolation failed: '+JSON.stringify(report));
    const capture=async(name:string,remaining:number)=>{
      const file=path.join(root,name),info=await fs.lstat(file);
      if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new SandboxError('incompatible','Capture file replaced.');
      const handle=await fs.open(file,'r');
      try{
        const buffer=Buffer.alloc(Math.min(info.size,remaining));
        const {bytesRead}=await handle.read(buffer,0,buffer.length,0);return buffer.subarray(0,bytesRead);
      }finally{await handle.close();}
    };
    const capturedOut=await capture('__stdout',4*1024*1024),capturedErr=await capture('__stderr',4*1024*1024-capturedOut.length);
    return {...report,supervisor_stderr:Buffer.concat(err).toString('utf8'),status:String(report.status),exit_code:Number(report.exit_code),os_error:Number(report.os_error),
      out:capturedOut,err:capturedErr};
  }
  async probe(){
    const root=await this.directory(),sentinel=path.join(this.base,'outside.txt'),marker='private-sentinel-'+randomUUID();
    await fs.writeFile(sentinel,marker);
    const server=net.createServer(socket=>socket.destroy());
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const port=(server.address() as net.AddressInfo).port;
    try{
      // Trusted, pinned fixture proves networking works with the same sanitized
      // environment outside the container; this is never caller-supplied code.
      const control=spawn(path.join(this.manifest.root,'probe.exe'),['--network-control',String(port)],
        {cwd:root,env:this.environment(root),windowsHide:true,stdio:'ignore'});
      const controlCode=await new Promise<number|null>((resolve,reject)=>{control.on('error',reject);control.on('close',resolve);});
      if(controlCode!==0)throw new SandboxError('incompatible','Host loopback control failed: '+controlCode);
      const output=await this.run(root,path.join(this.manifest.root,'probe.exe'),
        [sentinel,path.join(this.manifest.root,'velac.exe'),String(port)],new AbortController().signal,10000);
      if(output.status!=='ok'||output.exit_code!==0||!output.out.toString().includes('loopback denial passed')||
         await fs.readFile(sentinel,'utf8')!==marker||await fs.readFile(path.join(root,'inside.txt'),'utf8')!=='private')
        throw new SandboxError('incompatible','LPAC startup probe failed: '+JSON.stringify({...output,out:output.out.toString(),err:output.err.toString()}));
      const project=path.join(root,'project');await fs.mkdir(project);
      const source=path.join(project,'main.vela');
      await fs.writeFile(source,'fn main()->Unit effects{io}{print(42);} test "failure"{assert_true(false,"expected");} test "success"{assert_true(true,"ok");}');
      const compiler=path.join(this.manifest.root,'velac.exe'),exe=path.join(root,'app.exe'),signal=new AbortController().signal;
      const built=await this.run(root,compiler,['build',source,'-o',exe],signal,30000,project);
      if(built.status!=='ok'||built.exit_code!==0)throw new SandboxError('incompatible','Isolated compiler startup probe failed: '+JSON.stringify({...built,out:built.out.toString(),err:built.err.toString()}));
      const ran=await this.run(root,exe,[],signal,5000,project);
      if(ran.status!=='ok'||ran.exit_code!==0||ran.out.toString().trim()!=='42')throw new SandboxError('incompatible','Isolated run startup probe failed.');
      const tested=await this.run(root,compiler,['test',source,'--json'],signal,30000,project);
      let report;try{report=JSON.parse(tested.out.toString());}catch{throw new SandboxError('incompatible','Invalid startup test report.');}
      if(tested.status!=='ok'||tested.exit_code!==1||report.passed!==1||report.failed!==1)throw new SandboxError('incompatible','Isolated test startup probe failed: '+tested.err.toString());
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await this.remove(root);await fs.rm(sentinel,{force:true});}
  }
  async remove(root:string){
    if(!this.base||!inside(this.base,path.resolve(root)))throw new Error('Cleanup outside owned execution root.');
    await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});
  }
  async close(){
    this.ready=false;
    if(this.base){
      const root=this.base;this.base='';
      if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('vela-exec-'))throw new Error('Invalid execution root.');
      await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});
    }
    if(this.lease){this.lease.stdin!.end();const code=await this.leaseDone;this.lease=undefined;this.leaseDone=undefined;
      if(code!==0&&this.leaseReady)throw new SandboxError('incompatible','Native lease/temporary-tree cleanup failed.');this.leaseReady=false;}
  }
}
