// Optional release evidence; no tokenizer dependency in the compiler or adapter.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const root=path.resolve('../..'),output=path.resolve(process.argv[2]);
const {getEncoding}=await import(pathToFileURL(path.join(root,'build/stage12/tokenizer/node_modules/js-tiktoken/dist/index.js')));
const encoding=getEncoding('cl100k_base');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'vela-context12-'));
const client=new Client({name:'vela-context12',version:'1'});
await fs.writeFile(path.join(work,'config.json'),JSON.stringify({schema_version:1,workspace:work,toolchain:root}));
const transport=new StdioClientTransport({command:process.execPath,args:['dist/index.js','--config',path.join(work,'config.json')],stderr:'pipe'});
transport.stderr.resume();
try {
 await client.connect(transport);
 const tools=await client.listTools(),context=await client.callTool({name:'vela_get_context',arguments:{}});
 const skill=await fs.readFile(path.join(root,'integrations/agent/vela-app/SKILL.md'),'utf8');
 const tokens=s=>encoding.encode(s).length;
 const definitions={tools:tools.tools.map(({name,description,inputSchema})=>({name,description,inputSchema}))};
 const parts={skill,tools:JSON.stringify(definitions),context:JSON.stringify(context)};
 const counts=Object.fromEntries(Object.entries(parts).map(([key,value])=>[key,tokens(value)]));
 const result={tokenizer:'js-tiktoken@1.0.21/cl100k_base',counts,total:tokens(Object.values(parts).join('\n')),wire_tools:tokens(JSON.stringify(tools)),wire_total:tokens([skill,JSON.stringify(tools),JSON.stringify(context)].join('\n')),parts};
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2));
 console.log(JSON.stringify({tokenizer:result.tokenizer,counts,total:result.total}));
 if(process.argv.includes('--gate')&&result.total>2000)throw Error('Startup exceeds 2000 tokens');
}finally{await client.close();await transport.close();await fs.rm(work,{recursive:true,force:true});}
