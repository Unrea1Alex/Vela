import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [compilerPath='bin/velac.exe', lspPath='bin/vela-lsp.exe', mode='test'] = process.argv.slice(2);
const compiler = path.resolve(compilerPath), lsp = path.resolve(lspPath);

function client(workspace, entry) {
  const child = spawn(lsp,[compiler,workspace,entry],{stdio:['pipe','pipe','inherit'],windowsHide:true});
  let buffer = Buffer.alloc(0), next = 0;
  const pending = new Map(), notes = [];
  child.stdout.on('data', data => {
    buffer = Buffer.concat([buffer,data]);
    for (;;) {
      const marker = buffer.indexOf('\r\n\r\n');
      if (marker < 0) return;
      const length = Number(buffer.subarray(0,marker).toString().split(': ')[1]);
      const end = marker + 4 + length;
      if (buffer.length < end) return;
      const payload = JSON.parse(buffer.subarray(marker+4,end).toString());
      buffer = buffer.subarray(end);
      if (payload.id !== undefined) {pending.get(payload.id)?.(payload);pending.delete(payload.id);}
      else notes.push(payload);
    }
  });
  const exited = new Promise(resolve => child.on('close',resolve));
  const send = value => {
    const json = JSON.stringify({jsonrpc:'2.0',...value});
    child.stdin.write('Content-Length: '+Buffer.byteLength(json)+'\r\n\r\n'+json);
  };
  const ask = (method,params) => {
    const id=++next;
    return new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('LSP timeout: '+method)),25000);
      pending.set(id,value=>{clearTimeout(timer);resolve(value);});
      send({id,method,params});
    });
  };
  const notify = (method,params) => send({method,params});
  const open = (filename,text,version=1) => notify('textDocument/didOpen',{textDocument:{uri:pathToFileURL(filename).href,text,version,languageId:'vela'}});
  const change = (filename,text,version) => notify('textDocument/didChange',{textDocument:{uri:pathToFileURL(filename).href,version},contentChanges:[{text}]});
  const end = async () => {assert.equal((await ask('shutdown')).result,null);notify('exit');child.stdin.end();assert.equal(await exited,0);};
  return {ask,notify,open,change,notes,end,child};
}

const doc = filename => ({uri:pathToFileURL(filename).href});
const point = (filename,line,character) => ({textDocument:doc(filename),position:{line,character}});
const init = async c => {
  assert.equal((await c.ask('initialize',{capabilities:{}})).result.capabilities.positionEncoding,'utf-16');
  c.notify('initialized',{});
};
const at = (text, offset) => {
  const lines=text.slice(0,offset).split('\n');
  return {line:lines.length-1,character:lines.at(-1).length};
};
const toOffset = (text, position) => {
  const lines = text.split('\n');
  return lines.slice(0,position.line).reduce((n,l)=>n+l.length+1,0)+position.character;
};
const native = (...args) => JSON.parse(execFileSync(compiler,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}));
const stats = pid => process.platform==='win32' ? JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',
  '(Get-Process -Id '+pid+' | Select-Object WorkingSet64,HandleCount) | ConvertTo-Json -Compress'],
  {encoding:'utf8',windowsHide:true})) : null;

if(mode === 'refactor') {
  const workspace=path.resolve('.'), root=path.join(workspace,'selfhost/vela.project');
  const file=path.join(workspace,'selfhost/query.vela'), semantic=path.join(workspace,'selfhost/semantic.vela');
  const initial=new Map(await Promise.all([file,semantic].map(async p=>[p,await readFile(p,'utf8')])));
  const c=client(workspace,root);
  try{
    await init(c);
    for(const [p,text] of initial)c.open(p,text);
    const src=initial.get(file).replaceAll('\r\n','\n');
    const position=at(src,src.indexOf('fn query_use(')+3);
    const result=await c.ask('textDocument/rename',{textDocument:doc(file),position,newName:'record_query_use'});
    assert.ok(result.result,JSON.stringify(result));
    assert.equal(result.result.documentChanges.length,2);
    const staged=[];
    for(const change of result.result.documentChanges){
      assert.equal(change.textDocument.version,1);
      const target=[...initial.keys()].find(p=>doc(p).uri===change.textDocument.uri);
      assert.ok(target);
      assert.equal(await readFile(target,'utf8'),initial.get(target));
      const original=initial.get(target).replaceAll('\r\n','\n');
      let edited=original;
      for(const edit of [...change.edits].reverse()){
        const start=toOffset(original,edit.range.start),end=toOffset(original,edit.range.end);
        assert.equal(original.slice(start,end),'query_use');
        edited=edited.slice(0,start)+edit.newText+edited.slice(end);
      }
      assert.equal(edited,original.replaceAll(/\bquery_use\b/g,'record_query_use'));
      staged.push([target,initial.get(target).includes('\r\n')?edited.replaceAll('\n','\r\n'):edited,change.edits.length]);
    }
    assert.equal(staged.length,2);
    for(const [target,contents] of staged)await writeFile(target,contents);
    assert.ok(native('check',root,'--json').ok);
    console.log(JSON.stringify({refactor:'query_use → record_query_use',files:staged.map(([p,,n])=>[path.relative(workspace,p),n]),verified:true}));
  } finally {await c.end();}
} else if (mode === 'test-root-scope') {
  const workspace=await mkdtemp(path.join(os.tmpdir(),'vela-lsp-scope-'));
  const main=path.join(workspace,'main.vela');
  const project=path.join(workspace,'vela.project');
  const source='fn score() -> Int { return 4; }\nfn main() -> Int { return score(); }\n';
  await writeFile(main,source);
  await writeFile(path.join(workspace,'tests.vela'),'test "scope" {}\n');
  await writeFile(project,'vela-project|1\nname|scope_probe\nentry|main.vela\ntest|tests.vela\n');
  const c=client(workspace,project);
  try {
    await init(c);
    c.open(main,source);
    const reply=await c.ask('textDocument/rename',{...point(main,0,4),newName:'rate'});
    assert.equal(reply.result.documentChanges[0].edits.length,2);
    assert.ok(c.notes.some(note=>note.method==='window/showMessage' && /omitted as entry points: 1/.test(note.params.message)));
    console.log(JSON.stringify({rename:true,excluded_test_roots:1,notified:true}));
  } finally {
    await c.end();
    await rm(workspace,{recursive:true,force:true});
  }
} else if (mode === 'callables') {
  const workspace=await mkdtemp(path.join(os.tmpdir(),'vela-lsp-callables-'));
  const file=path.join(workspace,'main.vela');
  const source='fn main() -> Int { let offset = 2; let add = fn [offset](value: Int) -> Int { return value + offset; }; return add(40); }\n';
  await writeFile(file,source);
  const c=client(workspace,file);
  try {
    await init(c);
    c.open(file,source);
    const reference=at(source,source.lastIndexOf('offset'));
    const params=point(file,reference.line,reference.character);
    const declaration=at(source,source.indexOf('offset'));
    const target=(await c.ask('textDocument/definition',params)).result;
    assert.deepEqual(target,[{uri:doc(file).uri,range:{start:declaration,end:at(source,source.indexOf('offset')+6)}}]);
    const refs=(await c.ask('textDocument/references',{...params,context:{includeDeclaration:true}})).result;
    assert.equal(refs.length,3);
    const rename=(await c.ask('textDocument/rename',{...params,newName:'delta'})).result;
    assert.equal(rename.documentChanges[0].edits.length,3);
    const binding=at(source,source.lastIndexOf('add'));
    const hover=(await c.ask('textDocument/hover',point(file,binding.line,binding.character))).result.contents.value;
    assert.match(hover,/fn\(Int\) -> Int effects \{\}/);
    const query=native('query',file,'--at',file,String(reference.line),String(reference.character));
    assert.deepEqual((await c.ask('vela/query',params)).result,query);
    assert.equal(await readFile(file,'utf8'),source);
    await c.end();
    console.log(JSON.stringify({callables:true,rename_edits:3,hover:true,parity:true,unchanged:true}));
  } finally { c.child.kill(); await rm(workspace,{recursive:true,force:true}); }
} else {
  const root=await mkdtemp(path.join(os.tmpdir(),'vela-lsp-gate-'));
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
  const main=path.join(root,'main.vela'),lib=path.join(root,'помощник.vela');
  const methods=mode==='methods';
  const interfaces=mode==='interfaces';
  const a=interfaces
    ? 'import "помощник.vela" as api;\r\nfn main() -> Int { let label = "🧭"; return api::Reader::answer(api::Left()) + api::Reader::answer(api::Right()); }\r\n'
    : methods
    ? 'import "помощник.vela" as api;\r\nfn main() -> Int { let label = "🧭"; return api::box(21).answer() + api::Box<Int>::answer(api::box(21)); }\r\n'
    : 'import "помощник.vela" as api;\r\nfn main() -> Int { let label = "🧭"; return api::answer(); }\r\n';
  const b=interfaces
    ? 'pub interface Reader { fn answer(self: Self) -> Int; }\r\npub struct Left {}\r\npub struct Right {}\r\nimpl Reader for Left { fn answer(self: Left) -> Int { return 21; } }\r\nimpl Reader for Right { fn answer(self: Right) -> Int { return 21; } }\r\n'
    : methods
    ? 'pub opaque struct Box<T> { value: T }\r\nimpl<T> Box<T> { pub fn answer(self: Box<T>) -> T { return self.value; } }\r\npub fn box<T>(value: T) -> Box<T> { return Box<T>(value: value); }\r\n'
    : 'pub fn answer() -> Int { return 42; }\r\n';
  const normalized=a.replaceAll('\r\n','\n');
  const pos=at(normalized,normalized.indexOf('answer'));
  await writeFile(main,a);await writeFile(lib,b);
  const c=client(root,main);
  try{
    await init(c);
    c.open(main,a);c.open(lib,b);
    const params={textDocument:doc(main),position:pos};
    const definition=await c.ask('textDocument/definition',params);
    assert.equal(definition.result[0].uri,doc(lib).uri);
    assert.deepEqual(definition.result[0].range.start,at(b,b.indexOf('answer')));
    const refs=await c.ask('textDocument/references',{...params,context:{includeDeclaration:true}});
    assert.equal(refs.result.length,methods||interfaces?3:2);
    assert.deepEqual(refs.result[1].range.start,pos);
    const hover=(await c.ask('textDocument/hover',params)).result.contents.value;
    assert.match(hover,methods?/answer:[^\n]*\nInt effects/:/answer: Int/);
    const cli=native('query',main,'--at',main,String(pos.line),String(pos.character));
    assert.deepEqual((await c.ask('vela/query',params)).result,cli);
    const preview=(await c.ask('textDocument/rename',{...params,newName:'renamed'})).result;
    assert.equal(preview.documentChanges.length,2);
    assert.equal(preview.documentChanges.reduce((n,d)=>n+d.edits.length,0),interfaces?5:methods?3:2);
    const broken=interfaces?a.replace('Reader::answer','Reader::missing'):methods?a.replace('.answer()','.missing()'):a.replace('api::answer()','missing()');
    c.change(main,broken,3);
    assert.equal((await c.ask('textDocument/definition',params)).result,null);
    assert.ok(c.notes.some(n=>n.params.version===3&&n.params.diagnostics[0].code==='E203'));
    c.change(main,a,2);
    assert.equal((await c.ask('textDocument/definition',params)).result,null);
    c.change(main,a,4);
    const rename=(await c.ask('textDocument/rename',{...params,newName:'renamed'})).result;
    assert.equal(rename.documentChanges.find(x=>x.textDocument.uri===doc(main).uri).textDocument.version,4);
    assert.equal((await c.ask('textDocument/formatting',{textDocument:doc(main)})).result.length,1);
    c.notify('textDocument/didClose',{textDocument:doc(lib)});
    assert.equal((await c.ask('textDocument/rename',{...params,newName:'renamed'})).error.code,-32801);
    assert.equal(await readFile(main,'utf8'),a);assert.equal(await readFile(lib,'utf8'),b);
    const baseline=stats(c.child.pid), before=performance.now();
    for(let i=0;i<200;i++)assert.equal((await c.ask('textDocument/definition',params)).result.length,1);
    const elapsed_ms=Math.round(performance.now()-before), final=stats(c.child.pid);
    if(baseline){
      assert.ok(final.WorkingSet64-baseline.WorkingSet64<=64*1024*1024);
      assert.ok(final.HandleCount-baseline.HandleCount<=16);
    }
    console.log(JSON.stringify({requests:200,elapsed_ms,baseline,final,utf16:true,stale_versions:true,parity:true,unchanged:true,methods,interfaces}));
    await c.end();
  }finally{c.child.kill();await rm(root,{recursive:true,force:true});}
}
