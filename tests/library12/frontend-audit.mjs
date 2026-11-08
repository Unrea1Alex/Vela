import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]??'.'),compiler=path.resolve(process.argv[3]??path.join(root,'bin/velac.exe'));
const work=await fs.mkdtemp(path.join(root,'build/stage12/frontend-audit-')),checks=[];
const rejected=[['v05f_depth','E101'],['v03_list_type_arity','E210'],['v03_generic_type_arity','E200'],['v128a_nominal','E201'],['v102_opaque_ctor','E232'],['v102_opaque_read','E223'],['v102_opaque_write','E223'],['v102_opaque_public_leak','E224'],['v102_opaque_cycle','E204'],['v104_no_impl','E234'],['v104_no_bound','E234'],['v104_signature','E236'],['v104_effect_widen','E236'],['v104_transitive','E234'],['v106_implicit','E237'],['v106_wrong_interface','E237'],['v106_ffi_callable','E228'],['v124a_option_effect','E209'],['v127_parallel_sync','E201']];
function run(args){const p=spawnSync(compiler,args,{encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,VELA_CC:'vela-audit-no-C-compiler'}});assert.equal(p.status,1,p.stdout+p.stderr);return JSON.parse(p.stdout);}
try {
 // Native cases use ../../../std from their owned three-level staging folder.
 for(const file of await fs.readdir(path.join(root,'tests/cases')))if(file.endsWith('.vela'))await fs.copyFile(path.join(root,'tests/cases',file),path.join(work,file));
 for(const [name,expected]of rejected){const output=path.join(work,name+'.c'),reply=run(['emit-c',path.join(work,name+'.vela'),'-o',output,'--json']);assert.equal(reply.diagnostics[0].code,expected,name);assert.equal(await fs.stat(output).then(()=>true,()=>false),false);checks.push({name,code:expected,no_C_output:true});}
 const broken='// я😀\npub fn answer()->Int {return 42;\n';await fs.writeFile(path.join(work,'unclosed.vela'),broken);await fs.writeFile(path.join(work,'main.vela'),'import "unclosed.vela" as bad; fn main()->Int{return bad::answer();}\n');
 const reply=run(['query',path.join(work,'main.vela'),'--json']),d=reply.diagnostics[0];assert.equal(d.code,'E100');assert.ok(d.source.endsWith('unclosed.vela'));assert.equal(d.range.document,1);assert.equal(d.range.start.byte,Buffer.byteLength(broken));assert.equal(d.range.start.line,2);assert.equal(d.range.start.character,0);checks.push({name:'module EOF cannot consume next source',code:'E100',range:d.range});
 // Backend inputs are typed checked tables, never syntax accessor calls.
 for(const name of ['emitter','intrinsics']){const code=await fs.readFile(path.join(root,'selfhost',name+'.vela'),'utf8');assert.doesNotMatch(code,/\b(?:ast_expr|ast_stmt|parse_module|resolve_type|check_expr)\s*\(/);}
 checks.push({name:'backend boundary source inspection',scope:'accessor/call guard plus observable no-emission rejection probes; not a formal proof'});
 console.log(JSON.stringify({schema_version:1,status:'passed',checks,passed:checks.length}));
} finally {assert.ok(work.startsWith(path.join(root,'build/stage12/frontend-audit-')));await fs.rm(work,{recursive:true,force:true});}
