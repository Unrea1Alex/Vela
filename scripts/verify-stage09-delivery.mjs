import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const native=path.resolve(process.argv[2]??path.join(repo,'work/native-0.9.0-delivery'));
const mcp=path.resolve(process.argv[3]??path.join(repo,'work/mcp-0.9.0-delivery'));
const sha=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const reports=[];
for(const root of [native,mcp]){
  const manifest=JSON.parse(await fs.readFile(path.join(root,'delivery-manifest.json'),'utf8'));
  assert.equal(manifest.version,'0.9.0');
  const files=[];
  async function walk(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      if(dir===root&&entry.name==='node_modules'&&root===mcp)continue;
      const file=path.join(dir,entry.name);
      const stat=await fs.lstat(file);
      assert.ok(!stat.isSymbolicLink(),'Link in delivery: '+file);
      if(stat.isDirectory())await walk(file);
      else {assert.ok(stat.isFile()&&stat.nlink===1,'Nonregular file: '+file);files.push(file);}
    }
  }
  await walk(root);
  const actual=files.map(f=>path.relative(root,f).replaceAll('\\','/')).filter(f=>f!=='delivery-manifest.json');
  assert.deepEqual(actual.sort(),Object.keys(manifest.files).sort(),'Exact delivery file inventory');
  let links=0,documents=0;
  for(const relative of actual){
    const file=path.join(root,relative);
    assert.equal(await sha(file),manifest.files[relative],relative);
    assert.ok(!relative.startsWith('build/'),'Build output in delivery');
    if(root===native)assert.ok(!/\.(py|pyc)$/i.test(relative)&&path.basename(relative)!=='node.exe','Scripting runtime in native delivery');
    if(!relative.endsWith('.md'))continue;
    ++documents;
    for(const match of (await fs.readFile(file,'utf8')).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
      const target=match[1].split('#')[0].replace(/^<|>$/g,'');
      if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target))continue;
      ++links;
      assert.ok(await fs.stat(path.resolve(path.dirname(file),decodeURIComponent(target))).catch(()=>null),'Broken link: '+relative+' → '+target);
    }
  }
  reports.push({root,verified_files:actual.length,documents,links});
}
for(const [file,expected] of [['vela-0.8.0-windows-x64.zip','6ce36ebc8e6c9d94f164e34fa13a56ea02229dae888a2400c18a7878b9738a59'],['vela-mcp-0.8.0.zip','be7784aaf0ddbe2207f85c2bb32ea00e2acad2772e93205b9138d46b5b12bf0c']]){assert.equal(await sha(path.join(repo,'dist',file)),expected,file);}
const compatibility=JSON.parse(await fs.readFile(path.join(mcp,'compatibility.json'),'utf8'));
for(const [relative,hash]of Object.entries(compatibility.files))assert.equal(await sha(path.join(native,relative)),hash,relative);
for(const item of JSON.parse(await fs.readFile(path.join(repo,'dist/stage06-archive-hashes.json'),'utf8')).archives){
  assert.equal(await sha(path.join(repo,item.file)),item.sha256,'Historical archive changed: '+item.file);
}
console.log(JSON.stringify({schema_version:1,reports,native_mcp_fingerprints_match:true,historical_archives_unchanged:true},null,2));
