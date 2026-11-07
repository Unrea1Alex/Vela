import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
export const packageRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const server=path.join(packageRoot,'dist/index.js');
export async function verifyToolchain(toolchain) {
 if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24 or newer is required.');
 const manifest=JSON.parse(await fs.readFile(path.join(packageRoot,'compatibility.json'),'utf8'));
 for(const [relative,expected]of Object.entries(manifest.files)){
  const full=path.resolve(toolchain,relative),rel=path.relative(toolchain,full);
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Invalid compatibility path.');
  const bytes=await fs.readFile(full);
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Toolchain/docs mismatch: '+relative+'. Install matching native/MCP deliveries.');
 }
}
export function codexPath() {
 return process.env.VELA_CODEX ?? (process.platform==='win32' ? path.join(process.env.LOCALAPPDATA??'', 'Programs/OpenAI/Codex/bin/codex.exe') : 'codex');
}
export const tomlString=value=>JSON.stringify(value.replaceAll('\\','/'));
export function override(configPath) {
 return 'mcp_servers.vela={command='+tomlString(process.execPath)+',args=['+tomlString(server)+',"--config",'+tomlString(configPath)+'],required=true,startup_timeout_sec=180,tool_timeout_sec=180}';
}
export async function inspect(configPath) {
 const configuration=JSON.parse(await fs.readFile(configPath,'utf8'));
 if(!path.isAbsolute(configuration.workspace)||!path.isAbsolute(configuration.toolchain))throw Error('Workspace/toolchain must be absolute.');
 await verifyToolchain(configuration.toolchain);
 const client=new Client({name:'vela-doctor',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[server,'--config',path.resolve(configPath)],stderr:'pipe'});
 const task=(async()=>{
  await client.connect(transport);
  const listed=await client.listTools();
  const expected=['vela_get_context','vela_get_help','vela_check','vela_format','vela_symbols','vela_query','vela_plan'];
  if(expected.some(name=>!listed.tools.some(t=>t.name===name)))throw Error('Missing required Vela tools.');
  const response=await client.callTool({name:'vela_get_context',arguments:{}});
  const value=response.structuredContent;
  if(response.isError||value?.status!=='ok')throw Error(JSON.stringify(value??response));
  const help=await client.callTool({name:'vela_get_help',arguments:{topic:'idioms'}});
  if(help.isError)throw Error('Idioms help unavailable.');
  const skill=path.join(configuration.workspace,'.agents/skills/vela-app/SKILL.md');
  const text=await fs.readFile(skill,'utf8');
  if(!/^name: vela-app$/m.test(text))throw Error('Application skill is absent or invalid.');
  return {schema_version:1,status:'ok',transport:'stdio',workspace:configuration.workspace,
   compiler_id:value.compiler_id,version:value.data?.version,tools:listed.tools.map(t=>t.name),
   execution:value.data?.execution,execution_reason:value.data?.execution_reason,
   skill,client_discovery:'not_tested',next:'Start a new client in workspace and call vela_get_context as a native tool.'};
 })();
 let timer;
 try {
  return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Doctor timed out.')),configuration.execution?180000:40000);})]);
 }catch(error){throw Error(String(error));}
 finally {clearTimeout(timer);await client.close();await transport.close();}
}
export async function start(configPath,args=process.argv.slice(2)) {
 const config=JSON.parse(await fs.readFile(configPath,'utf8'));
 const report=await inspect(configPath);
 if(args[0]==='--doctor'){console.log(JSON.stringify(report,null,2));return;}
 const codex=codexPath();
 const argv=['-C',config.workspace,'-c',override(path.resolve(configPath)),...args];
 console.error('Vela MCP verified. Starting Codex in '+config.workspace+'.');
 const child=spawn(codex,argv,{cwd:config.workspace,stdio:'inherit',windowsHide:true});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 process.exitCode=code??1;
}
