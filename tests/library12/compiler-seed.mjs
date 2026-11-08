import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]??'.'),hash=x=>createHash('sha256').update(x).digest('hex');
const report=JSON.parse(await fs.readFile(path.join(root,'docs/bootstrap-evidence.json'),'utf8'));
assert.equal(report.fixed_point,true);assert.equal(report.bundler_fixed_point,true);assert.equal(report.tests_run,true);
const files={};for(const name of ['seed.exe','stage1.exe','stage2.exe','stage3.exe','stage1.c','stage2.c','stage3.c','compiler.vela','rebundled.vela']){
 const data=await fs.readFile(path.join(root,'build/native',name));files[name]={bytes:data.length,sha256:hash(data)};
}
assert.equal(files['stage2.c'].sha256,files['stage3.c'].sha256);
assert.equal(files['compiler.vela'].sha256,files['rebundled.vela'].sha256);
assert.equal(files['compiler.vela'].sha256,hash(await fs.readFile(path.join(root,'selfhost/compiler.vela'))));
console.log(JSON.stringify({schema_version:1,status:'passed',bootstrap:report,files,scope:'mandatory verify transition from installed compiler through bundle seed and authored stages; independent hash comparisons'}));
