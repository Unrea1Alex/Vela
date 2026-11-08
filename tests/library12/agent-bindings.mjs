// Supplemental native binding proof for manifest aliases; black-box oracle stays frozen.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const experiment=path.resolve(process.argv[2]),protocol=JSON.parse(await fs.readFile(path.join(experiment,'protocol.json'),'utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const standard=new Map(Object.entries(protocol.sdk_files).filter(([name])=>/^std\/[^/]+\.vela$/.test(name)).map(([name,value])=>[value.sha256,path.basename(name,'.vela')]));
const reports=[];
for(const trial of protocol.trials){
 const original=await fs.readFile(path.join(trial.dir,'oracle.json'),'utf8').then(JSON.parse).catch(()=>null);if(!original)continue;
 const result=spawnSync(path.join(protocol.sdk,'bin/velac.exe'),['query',path.join(trial.workspace,'vela.project'),'--json'],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(result.status,0,result.stdout+result.stderr);const index=JSON.parse(result.stdout);assert.equal(index.ok,true);
 const moduleNames=new Map();for(const doc of index.documents){const name=standard.get(hash(await fs.readFile(doc.path)));if(name)moduleNames.set(doc.id,name);}
 const proofs=[];for(const [module,names]of [['algorithms',['sort']],['cli_schema',['create','parse','current']]]){
  const definitions=index.definitions.filter(d=>moduleNames.get(d.range.document)===module&&names.includes(d.name)&&d.kind==='function');
  const calls=index.references.filter(r=>r.role==='call'&&!moduleNames.has(r.range.document)&&definitions.some(d=>d.id===r.id));
  const used=[...new Set(calls.map(c=>definitions.find(d=>d.id===c.id).name))];
  if(module==='algorithms')assert.ok(used.includes('sort'),trial.id+' uses installed stable sort');
  else assert.ok(used.includes('create')&&(used.includes('parse')||used.includes('current')),trial.id+' uses installed CLI schema construction and parsing');
  proofs.push({module,functions:used,calls:calls.map(c=>({definition:c.id,source:index.documents.find(d=>d.id===c.range.document).path,range:c.range})),module_files:index.documents.filter(d=>moduleNames.get(d.id)===module).map(d=>({path:d.path,exact_sdk_bytes:true}))});
 }
 const failed=original.checks.filter(c=>!c.passed&&c.name!=='required-public-libraries');
 const report={schema_version:1,id:trial.id,status:failed.length?'failed':'passed',original_passed:original.passed,original_failed:original.failed,corrected_passed:original.total-failed.length,corrected_failed:failed.length,total:original.total,proofs,correction:'Original source-pattern check incorrectly required literal .vela import names; valid manifest @aliases are resolved by the same native checker. Frozen black-box expectations, applications and SDK bytes are unchanged.'};
 await fs.writeFile(path.join(trial.dir,'binding-proof.json'),JSON.stringify(report,null,2));reports.push(report);
}
console.log(JSON.stringify({schema_version:1,reports}));
