import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'.'),exe=path.join(root,'build/stage12/io-probe126a.exe');
const work=await fs.mkdtemp(path.join(root,'build/stage12/io-large-')),observations=[];
const block=Buffer.alloc(1024*1024,97);for(let i=1023;i<block.length;i+=1024)block[i]=10;
const hash=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
const run=(mode,input,output,total)=>{
 const p=spawnSync(exe,[mode,input,output,'8192',String(total)],{encoding:'utf8',timeout:600000,windowsHide:true,env:{...process.env,VELA_GC_REPORT:'1'}});
 assert.equal(p.status,0,p.stdout+p.stderr);const data=JSON.parse(p.stdout);
 const gc=/vela gc: collections=(\d+) peak=(\d+) bytes=(\d+)/.exec(p.stderr);assert.ok(gc,p.stderr);
 const record={...data,collections:+gc[1],managed_peak:+gc[2],managed_live:+gc[3]};observations.push(record);process.stderr.write(mode+' '+data.bytes+' bytes passed\n');return record;
};
try{
 for(const mb of [27,270]){
  const input=path.join(work,mb+'-вход-尾.input'),output=path.join(work,mb+'-выход-😀.output'),handle=await fs.open(input,'wx');
  try{for(let i=0;i<mb;i++)await handle.write(block);}finally{await handle.close();}
  const size=mb*block.length,copy=run('file-copy',input,output,size);
  assert.equal(copy.bytes,size);assert.equal(copy.peak_chunk,8192);assert.equal(copy.reads,size/8192+1);assert.equal(copy.writes,size/8192);
  assert.equal(await hash(input),await hash(output));
  const lines=run('file-lines',input,output,size);assert.equal(lines.lines,size/1024);assert.equal(lines.payload,lines.lines*1023);assert.equal(lines.bytes,size);
  assert.equal(lines.reads,size/8192+1);assert.equal(lines.peak_chunk,8192);assert.equal(lines.peak_record,1023);assert.equal(lines.peak_parts,1);
  assert.ok(lines.peak_working_payload<=2*(1024+4)+2*8192+3);
  await fs.unlink(input);await fs.unlink(output);
 }
 for(const count of [1280,12800])for(const mode of ['memory','memory-lines']){
  const r=run(mode,String(count),path.join(work,'memory-output'),count*37);assert.equal(r.bytes,count*37);
  assert.equal(r.input_owned,count*37);assert.equal(r.reads,Math.ceil(count*37/8192)+1);
  assert.ok(r.peak_chunk<=8192);
  if(mode==='memory'){assert.equal(r.output_owned,count*37);assert.equal(r.writes,Math.ceil(count*37/8192));}
  else{assert.equal(r.lines,count);assert.equal(r.peak_record,36);assert.ok(r.peak_parts<=2);assert.ok(r.peak_working_payload<=2*(1024+4)+2*8192+3);}
 }
 const small=observations.find(x=>x.mode==='file-lines'),large=observations.filter(x=>x.mode==='file-lines')[1];
 assert.equal(large.bytes,small.bytes*10);assert.equal(large.peak_working_payload,small.peak_working_payload);assert.equal(large.peak_parts,small.peak_parts);
 for(const mode of ['memory','memory-lines']){const [a,b]=observations.filter(x=>x.mode===mode);assert.equal(b.bytes,a.bytes*10);assert.equal(b.peak_chunk,a.peak_chunk);if(mode==='memory-lines')assert.equal(b.peak_working_payload,a.peak_working_payload);}
 // Normal GC may collect at a threshold; compare peaks with generous fixed
 // headroom rather than claiming they equal retained payload counters.
 assert.ok(large.managed_peak<=small.managed_peak*2+65536);
 console.log(JSON.stringify({schema_version:1,status:'passed',observations,scope:'actual chunk/record/retained-part counters; normal managed GC peaks separately; input/output-owned storage excluded from working payload; SHA256 file copies, legacy cap and >256 MiB tested'}));
}finally{await fs.rm(work,{recursive:true,force:true});}
