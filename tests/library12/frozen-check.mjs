// Conservative surface regression guard, alongside independent literal fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]??'.');
const read=rel=>fs.readFile(path.join(root,rel));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await read('tests/library12/frozen/manifest.json'));
for(const [file,hash]of Object.entries(manifest.fixtures))assert.equal(sha(await read(file)),hash,file);
for(const [file,hash]of [['apps-1.1.zip',manifest.app_archive_sha256],['api-baseline.json',manifest.interface_sha256]])assert.equal(sha(await read('tests/library12/frozen/'+file)),hash,file);
const baseline=JSON.parse(await read('tests/library12/frozen/api-baseline.json'));
const current=JSON.parse(await read('docs/api-index.json'));
const semantic=item=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='span'));
const entries=new Map(current.modules.flatMap(module=>module.api.items.map(item=>[module.module+':'+item.name,semantic(item)])));
let checked=0;
for(const module of baseline.modules)for(const item of module.api.items){
 const id=module.module+':'+item.name;
 assert.deepEqual(entries.get(id),semantic(item),id);checked++;
}
console.log(JSON.stringify({schema_version:1,old_surface_entries:checked,frozen_fixture_files:Object.keys(manifest.fixtures).length,archive:'unchanged',status:'passed'}));
