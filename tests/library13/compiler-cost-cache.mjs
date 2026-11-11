import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [compilerArg, referenceArg, bundlerArg, outputArg] = process.argv.slice(2);
assert.ok(compilerArg && referenceArg && bundlerArg && outputArg, 'pass candidate, reference, bundler and output directory');
const compiler = path.resolve(compilerArg), reference = path.resolve(referenceArg);
const bundler = path.resolve(bundlerArg), output = path.resolve(outputArg);
await fs.mkdir(output,{recursive:true});
const work = await fs.mkdtemp(path.join(output,'cost-cache-'));
const checks = [];
const hash = data => createHash('sha256').update(data).digest('hex');
function run(exe,args,code=0,env={}) {
    const result=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:32*1024*1024,
        env:{...process.env,...env}});
    if (result.error) throw result.error;
    assert.equal(result.status,code,exe+' '+args.join(' ')+'\n'+result.stdout+result.stderr);
    return result;
}
const report = result => result.stderr.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const verify = (exe, root, cache, code=0) => run(exe,['check',root,'--json',
    ...(cache?['--cache',cache,'--cache-report']:[])],code);
const root=path.join(work,'main.vela'), empty=path.join(work,'empty.vela');
const prefix=path.join(work,'prefix.vela'), leaf=path.join(work,'leaf.vela');
const cache=path.join(work,'cache');
const correct='// я😀\r\npub fn value() -> Int { return 7; }\r\n';
const incorrect=correct.replace('return 7','return true');
await fs.writeFile(root,'import "empty.vela";\r\nimport "prefix.vela" as prefix;\r\nimport "leaf.vela" as leaf;\r\n'
    +'fn main() -> Int effects { io } { print(prefix::value() + leaf::value()); return 0; }\r\n');
await fs.writeFile(empty,'');
await fs.writeFile(prefix,'\uFEFF// preceding module\r\npub fn value() -> Int { return 4; }\r\n\r\n');
await fs.writeFile(leaf,correct);
const full=verify(reference,root).stdout;
assert.equal(verify(compiler,root).stdout,full);
const seeded=verify(reference,root,cache);
assert.equal(seeded.stdout,full);
const changedVersion=verify(compiler,root,cache);
assert.equal(changedVersion.stdout,full);
const priorKey=report(seeded).find(event=>event.phase==='write'&&event.layer==='check-v1').key;
const current=report(changedVersion).find(event=>event.phase==='read'&&event.layer==='check-v1');
assert.equal(current.status,'miss');
assert.notEqual(priorKey,current.key);
checks.push('compiler source fingerprint isolates exact and semantic records');

const cHashes={};
for (const [mode,flags] of [['normal',[]],['debug',['--debug']],['reference',['--no-ir-simplify']]]) {
    const args=['emit-c',root,...flags];
    const oracle=run(reference,args).stdout;
    const cold=run(compiler,[...args,'--cache',cache,'--cache-report']);
    const warm=run(compiler,[...args,'--cache',cache,'--cache-report']);
    assert.equal(cold.stdout,oracle);
    assert.equal(warm.stdout,oracle);
    const stored=report(cold).find(event=>event.phase==='write'&&event.layer.includes('c-v1'));
    assert.ok(report(warm).some(event=>event.phase==='read'&&event.key===stored.key&&event.status==='hit'));
    await fs.writeFile(path.join(cache,'vela-cache-v1-'+stored.key),'broken C record');
    const recovered=run(compiler,[...args,'--cache',cache,'--cache-report']);
    assert.equal(recovered.stdout,oracle);
    assert.ok(report(recovered).some(event=>event.key===stored.key&&event.reason==='corrupt'));
    cHashes[mode]=hash(oracle);
}
checks.push('checked C from normal, debug and bypass pipelines survives cache hits and corruption');

await fs.writeFile(leaf,incorrect);
const error=verify(reference,root,undefined,1);
const result=verify(compiler,root,cache,1);
assert.equal(result.stdout,error.stdout);
assert.equal(verify(compiler,root,undefined,1).stdout,error.stdout);
const diagnostic=JSON.parse(result.stdout).diagnostics[0];
assert.deepEqual([diagnostic.source,diagnostic.code,diagnostic.span.line,diagnostic.span.column],[leaf,'E201',2,25]);
assert.ok(!report(result).some(event=>event.phase==='write'&&event.layer==='check-v1'));
const query=(exe,args,code)=>{
    const value=JSON.parse(run(exe,args,code).stdout);
    delete value.revision;
    return value;
};
const overlay=path.join(work,'overlay.txt');
await fs.writeFile(overlay,correct);
const queryArgs=['query',root,'--json','--overlay',leaf,overlay];
assert.deepEqual(query(compiler,queryArgs,0),query(reference,queryArgs,0));
assert.equal(await fs.readFile(leaf,'utf8'),incorrect);
await fs.writeFile(leaf,correct);
checks.push('empty module, BOM, CRLF and trailing lines preserve imported diagnostics and overlay query');

await fs.appendFile(leaf,'pub fn value() -> Int { return 9; }\r\n');
const duplicate=verify(compiler,root,cache,1);
assert.equal(duplicate.stdout,verify(reference,root,undefined,1).stdout);
const repeated=JSON.parse(duplicate.stdout).diagnostics[0];
assert.deepEqual([repeated.code,repeated.span.line,repeated.related[0].span.line],['E202',3,2]);
await fs.writeFile(leaf,correct);
checks.push('indexed duplicate names retain the first declaration and related span');

const stressed=run(compiler,['check',root,'--json'],0,{VELA_GC_STRESS:'1',VELA_GC_REPORT:'1'});
assert.equal(stressed.stdout,full);
const gc=/vela gc: collections=(\d+) peak=(\d+)/.exec(stressed.stderr);
assert.ok(gc&&+gc[1]>0,stressed.stderr);
checks.push('module index remains reachable under forced GC');

const mutated=path.join(work,'catalog');
await fs.cp('selfhost',path.join(mutated,'selfhost'),{recursive:true});
await fs.mkdir(path.join(mutated,'vela/backends'),{recursive:true});
await fs.copyFile('vela/builtins.def',path.join(mutated,'vela/builtins.def'));
await fs.copyFile('vela/backends/runtime.h',path.join(mutated,'vela/backends/runtime.h'));
const bundle=path.join(mutated,'compiler.vela');
const fingerprint=async()=>{
    const value=await fs.readFile(path.join(mutated,'selfhost/embedded.vela'),'utf8');
    return /compiler_fingerprint\(\) -> String \{ return "([a-f0-9]{64})";/.exec(value)[1];
};
run(bundler,[mutated,bundle]);
const original=await fingerprint();
await fs.appendFile(path.join(mutated,'vela/builtins.def'),'\n');
run(bundler,[mutated,bundle]);
const changed=await fingerprint();
assert.notEqual(changed,original);
const packed=await fs.readFile(bundle);
run(bundler,[mutated,bundle]);
assert.deepEqual(await fs.readFile(bundle),packed);
const altered=path.join(mutated,'catalog-compiler.exe');
run(compiler,['build',bundle,'-o',altered]);
const fresh=verify(altered,root,cache);
assert.equal(fresh.stdout,full);
for (const layer of ['check-v1','semantic-modules-v1']) {
    assert.ok(report(fresh).some(event=>event.phase==='read'&&event.layer===layer&&event.status==='miss'));
}
const alteredC=run(altered,['emit-c',root,'--cache',cache,'--cache-report']);
assert.equal(hash(alteredC.stdout),cHashes.normal);
assert.ok(report(alteredC).some(event=>event.phase==='read'&&event.layer==='c-v1'&&event.status==='miss'));
checks.push('bundler incorporates catalog bytes and invalidates semantic and C records');

const companion=path.join(work,'fixture.dll'), manifest=path.join(work,'vela.project');
const delivery=path.join(work,'delivery');
await fs.mkdir(delivery);
run(process.env.VELA_CC||'cl.exe',['/nologo','/LD','/TC','/std:c11','/utf-8','/O2','/MT',
    '/Fo'+path.join(work,'fixture.obj'),'tests/ffi/adapter.c','/link','/OUT:'+companion,
    '/IMPLIB:'+path.join(work,'fixture.lib')]);
await fs.writeFile(manifest,'vela-project|1\nname|dependency_audit\nentry|main.vela\n'
    +'native|fixture.dll|fixture.dll|windows-x64|1|shared\n');
run(compiler,['lock',manifest]);
const profile=path.join(work,'profile');
run(compiler,['pgo-instrument',manifest,'--profile',profile]);
assert.equal(run(compiler,['pgo-train',profile]).stdout.replaceAll('\r\n','\n'),'11\n');
const exe=path.join(delivery,'program.exe');
const build=['build',manifest,'-o',exe,'--cache',cache,'--cache-report','--json'];
run(compiler,build);
const previousExe=hash(await fs.readFile(exe));
const delivered=path.join(delivery,'fixture.dll');
const previousDLL=hash(await fs.readFile(delivered));
assert.equal(previousDLL,hash(await fs.readFile(companion)));
await fs.appendFile(companion,Buffer.from([0]));
assert.equal(JSON.parse(run(compiler,build,1).stdout).diagnostics[0].code,'E226');
assert.equal(hash(await fs.readFile(exe)),previousExe);
assert.equal(hash(await fs.readFile(delivered)),previousDLL);
run(compiler,['lock',manifest]);
const staleProfile=run(compiler,[...build,'--pgo-profile',profile],1);
assert.equal(JSON.parse(staleProfile.stdout).diagnostics[0].code,'E243');
assert.ok(staleProfile.stderr.includes('"layer":"c-v1","status":"hit"'));
assert.equal(hash(await fs.readFile(exe)),previousExe);
assert.match(run(compiler,build,2).stderr,/Conflicting artifact output/);
assert.equal(hash(await fs.readFile(exe)),previousExe);
assert.equal(hash(await fs.readFile(delivered)),previousDLL);
const updated=path.join(work,'updated');
await fs.mkdir(updated);
const nextExe=path.join(updated,'program.exe');
const rebuilt=run(compiler,build.map(arg=>arg===exe?nextExe:arg));
assert.ok(rebuilt.stderr.includes('"layer":"c-v1","status":"hit"'));
const nextDLL=hash(await fs.readFile(path.join(updated,'fixture.dll')));
assert.equal(nextDLL,hash(await fs.readFile(companion)));
assert.notEqual(nextDLL,previousDLL);
assert.equal(run(nextExe,[]).stdout.replaceAll('\r\n','\n'),'11\n');
checks.push('C reuse preserves native lock and profile invalidation and publishes current companion bytes');

const resultFile=path.join(output,'build-dependencies.json');
await fs.writeFile(resultFile,JSON.stringify({status:'passed',checks,c_hashes:cHashes,
    diagnostic, catalog:{original,changed,bundle_sha256:hash(packed)},
    companion:{before:previousDLL,after:nextDLL},gc:{collections:+gc[1],peak_managed_bytes:+gc[2]},work},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length}));
