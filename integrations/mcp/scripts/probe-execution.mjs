import fs from 'node:fs/promises';
import path from 'node:path';
import {Sandbox,hash} from '../dist/sandbox.js';
const manifest=path.resolve(process.argv[2]??'../../build/mcp-execution/execution.json');
const bytes=await fs.readFile(manifest);
const sandbox=new Sandbox(manifest,hash(bytes));
try{
  await sandbox.init(hash(await fs.readFile('../../bin/velac.exe')));
  console.log('OS isolation probe passed');
  const root=await sandbox.directory();
  const spawn=await sandbox.run(root,path.join(sandbox.manifest.root,'probe.exe'),['--spawn',path.join(sandbox.manifest.root,'velac.exe')],new AbortController().signal,10000);
  console.log('child spawn',spawn.status,spawn.exit_code,spawn.out.toString(),spawn.err.toString());
  for(const [exe,args] of [[path.join(sandbox.manifest.root,'velac.exe'),['--version']],[path.join(sandbox.manifest.root,sandbox.manifest.c_compiler??'bin/cl.exe'),['/?']]]){
    const value=await sandbox.run(root,exe,args,new AbortController().signal,10000);
    console.log('tool probe',path.basename(exe),value.status,value.exit_code,value.out.toString().slice(0,500),value.err.toString().slice(0,500));
  }
  await fs.mkdir(path.join(root,'project'));
  await fs.writeFile(path.join(root,'project','main.vela'),'fn main()->Unit effects{io}{print(42);}');
  const built=await sandbox.run(root,path.join(sandbox.manifest.root,'velac.exe'),
    ['build',path.join(root,'project','main.vela'),'-o',path.join(root,'app.exe')],new AbortController().signal,30000);
  console.log('build',built.status,built.exit_code,built.out.toString(),built.err.toString());
  if(built.exit_code!==0){
    for(const cmd of [
      [path.join(sandbox.manifest.root,'velac.exe'),['emit-c',path.join(root,'project','main.vela'),'-o',path.join(root,'app.c')]],
      [path.join(sandbox.manifest.root,sandbox.manifest.c_compiler),['-fintegrated-cc1','-no-canonical-prefixes','-fuse-ld=lld','/nologo','/std:c11','/O2','/MT','/utf-8',path.join(root,'app.c'),'/Fe'+path.join(root,'app.exe')]]
    ]){
      const v=await sandbox.run(root,cmd[0],cmd[1],new AbortController().signal,30000);
      console.log('diagnostic',v.status,v.exit_code,v.out.toString().slice(-8000),v.err.toString().slice(-8000));
    }
  }
  if(built.status!=='ok'||built.exit_code!==0)throw Error('Isolated compilation failed');
  const ran=await sandbox.run(root,path.join(root,'app.exe'),[],new AbortController().signal,5000);
  console.log('run',ran.status,ran.exit_code,ran.out.toString(),ran.err.toString());
  if(ran.status!=='ok'||ran.exit_code!==0||ran.out.toString().trim()!=='42')throw Error('Isolated execution failed');
  await fs.writeFile(path.join(root,'project','tests.vela'),'test "first"{assert_true(false,"expected");} test "second"{assert_true(true,"second");}');
  const tested=await sandbox.run(root,path.join(sandbox.manifest.root,'velac.exe'),['test',path.join(root,'project','tests.vela'),'--json'],new AbortController().signal,30000);
  console.log('test',JSON.stringify(tested),tested.out.toString(),tested.err.toString());
  if(tested.exit_code!==1)throw Error('Isolated test failed');
}finally{await sandbox.close();}
