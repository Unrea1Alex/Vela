// Actual client-visible result tokenization; optional release tooling only.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const root=path.resolve('../..'),output=path.resolve(process.argv[2]);
const {getEncoding}=await import(pathToFileURL(path.join(root,'build/stage12/tokenizer/node_modules/js-tiktoken/dist/index.js')));const encoding=getEncoding('cl100k_base');
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'vela-api-tokens12-'));const config=path.join(workspace,'config.json');
await fs.writeFile(config,JSON.stringify({schema_version:1,workspace,toolchain:root}));
const client=new Client({name:'vela-api-tokens12',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js','--config',config],stderr:'pipe'});transport.stderr.resume();
try{
 await client.connect(transport);const results=[];
 for(const request of [{name:'std/directory:walk'},{query:'JSON ignored numbers'},{name:'std/http:curl_transfer'},{name:'missing_api'},{query:''}]){
  const response=await client.callTool({name:'vela_get_help',arguments:{topic:'api',...request}});
  const bytes=JSON.stringify(response);results.push({request,bytes:Buffer.byteLength(bytes),tokens:encoding.encode(bytes).length,response});
 }
 const report={schema_version:1,tokenizer:'js-tiktoken@1.0.21/cl100k_base',both_response_forms:true,results};
 await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(results.map(({request,bytes,tokens})=>({request,bytes,tokens}))));
}finally{await client.close();await transport.close();await fs.rm(workspace,{recursive:true,force:true});}
