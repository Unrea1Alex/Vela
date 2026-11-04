import * as fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve('../..');
const stage=path.resolve(process.argv[3]??path.join(root,'work/mcp-0.6.0-delivery'));
const native=path.resolve(process.argv[2]??path.join(root,'work/native-0.6.0-stage'));
const workspace=path.resolve(process.argv[4]??path.join(root,'examples/agent-starter'));
const config=path.join(root,'build/stage06/inspector-host.json');
const clientConfig=path.join(root,'build/stage06/inspector-client.json');
await fs.writeFile(config,JSON.stringify({schema_version:1,toolchain:native,workspace}));
await fs.writeFile(clientConfig,JSON.stringify({mcpServers:{vela:{command:process.execPath,args:[path.join(stage,'dist/index.js'),'--config',config]}}}));
const cli=path.resolve('node_modules/@modelcontextprotocol/inspector/clients/cli/build/index.js');
const report={schema_version:1,client:'MCP Inspector 2.13.0',native,adapter:stage,checks:[]};
for(const era of ['legacy','modern']){
 for(const [method,extra] of [
  ['tools/list',[]],['tools/call',['--tool-name','vela_get_context']],
  ['tools/call',['--tool-name','vela_check','--tool-arg','path=vela.project']],
  ['tools/call',['--tool-name','vela_format','--tool-arg','path=main.vela']],
  ['tools/call',['--tool-name','vela_symbols','--tool-arg','path=vela.project']],
  ['resources/list',[]],['resources/read',['--uri','vela://help/builtins']]
 ]){
  const text=execFileSync(process.execPath,[cli,'--config',clientConfig,'--server','vela','--protocol-era',era,'--method',method,...extra],{encoding:'utf8',timeout:30000,windowsHide:true});
  const value=JSON.parse(text);
  if(value.isError||value.structuredContent?.status&&value.structuredContent.status!=='ok')throw Error(text);
  const name=(era+'-'+method.replace('/','-')+'-'+(extra[1]??'')).replaceAll(/[^A-Za-z0-9_-]/g,'-');
  await fs.writeFile(path.join(root,'build/stage06/inspector-'+name+'.json'),text);
  report.checks.push({era,method,tool:extra[1]??'',passed:true});
 }
}
await fs.writeFile(path.join(root,'docs/mcp-inspector-evidence.json'),JSON.stringify(report,null,2)+'\n');
console.log(report.checks.length+' Inspector calls/reconnections passed');
