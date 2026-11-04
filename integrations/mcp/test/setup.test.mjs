import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const root=path.resolve('../..'),pkg=path.resolve('.');
test('setup idempotence, preserved config and real MCP handshake',async()=>{
 const work=await fs.mkdtemp(path.join(os.tmpdir(),'vela-setup-'));
 const workspace=path.join(work,'проект with spaces');await fs.mkdir(workspace);
 await fs.mkdir(path.join(workspace,'.codex'));
 const existing='# unrelated client settings\n[mcp_servers.existing]\ncommand="untouched"\n';
 await fs.writeFile(path.join(workspace,'.codex/config.toml'),existing);
 const args=[path.join(pkg,'scripts/setup.mjs'),'--workspace',workspace,'--toolchain',root];
 try {
  const first=execFileSync(process.execPath,args,{encoding:'utf8'});assert.match(first,/"status": "ok"/);
  assert.equal(await fs.readFile(path.join(workspace,'.codex/config.toml'),'utf8'),existing);
  const configPath=path.join(workspace,'.codex/vela-mcp.json');
  const stat=await fs.stat(configPath);
  execFileSync(process.execPath,args,{encoding:'utf8'});
  assert.equal((await fs.stat(configPath)).mtimeMs,stat.mtimeMs);
  const doctor=JSON.parse(execFileSync(process.execPath,[path.join(workspace,'vela-codex.mjs'),'--doctor'],{encoding:'utf8'}));
  assert.equal(doctor.tools.length,5);assert.equal(doctor.client_discovery,'not_tested');
  assert.equal(await fs.readFile(path.join(workspace,'vela-stdlib/json.vela'),'utf8'),await fs.readFile(path.join(root,'std/json.vela'),'utf8'));
  const client=new Client({name:'vela-installed-library-gate',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(pkg,'dist/index.js'),'--config',configPath]});
  try {
   await client.connect(transport);
   const checked=await client.callTool({name:'vela_check',arguments:{path:'suite.vela',text:'import "vela-stdlib/testing.vela" as t; test "installed library" {t::equal(2,2,"numbers");}'}});
   assert.equal(checked.structuredContent.status,'ok');
   const help=await client.callTool({name:'vela_get_help',arguments:{topic:'testing'}});
   assert.equal(help.structuredContent.status,'ok');assert.match(help.structuredContent.data.text,/schema_version=2/);
  } finally {await client.close();await transport.close();}
  const skillPath=path.join(workspace,'.agents/skills/vela-app/SKILL.md');
  await fs.writeFile(skillPath,'changed');
  const denied=spawnSync(process.execPath,args,{encoding:'utf8'});assert.notEqual(denied.status,0);assert.match(denied.stderr,/Existing file differs/);
  const missing=spawnSync(process.execPath,[path.join(pkg,'scripts/doctor.mjs'),configPath],{encoding:'utf8'});assert.notEqual(missing.status,0);assert.match(missing.stderr,/skill/);
  assert.equal(await fs.readFile(path.join(workspace,'.codex/config.toml'),'utf8'),existing);
  const copy=path.join(work,'bad-native');await fs.mkdir(copy);await fs.mkdir(path.join(copy,'bin'));await fs.writeFile(path.join(copy,'bin/velac.exe'),'wrong build');
  await fs.writeFile(configPath,JSON.stringify({schema_version:1,workspace,toolchain:copy}));
  const mismatch=spawnSync(process.execPath,[path.join(pkg,'scripts/doctor.mjs'),configPath],{encoding:'utf8'});assert.notEqual(mismatch.status,0);assert.match(mismatch.stderr,/Toolchain\/docs mismatch/);
 }finally{await fs.rm(work,{recursive:true,force:true});}
});
