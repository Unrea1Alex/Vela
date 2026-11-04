import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Host, configSchema, limits, topics, HostError } from './host.js';
import {Execution,executionLimits} from './execution.js';

const outputSchema = z.object({
  schema_version: z.literal(1), status: z.enum(['ok','rejected','toolchain_error','invalid_input','source_changed','cancelled','timeout','limit','incompatible']),
  compiler_id: z.string(), snapshot_id: z.string(), data: z.record(z.string(),z.json()), message: z.string()
}).strict();
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--config') throw new Error('Usage: node dist/index.js --config ABSOLUTE_CONFIG');
const host = new Host(configSchema.parse(JSON.parse(await readFile(args[1], 'utf8'))));
try { await host.init(fileURLToPath(new URL('../compatibility.json', import.meta.url))); }
catch (e) { await host.close(); console.error(String(e)); process.exit(2); }
const execution=host.config.execution?new Execution(host):undefined;
if(execution)await execution.init();
const wrap = (input: unknown) => {
  const value=outputSchema.parse(input);
  return {content:[{type:'text' as const,text:JSON.stringify(value)}],structuredContent:value,isError:value.status!=='ok'};
};
const basic = async (data: () => Record<string,unknown>) => {
  try {
    await host.verify();
    return wrap({schema_version:1,status:'ok',compiler_id:host.compilerId,snapshot_id:'',data:data(),message:''});
  } catch (e) { return wrap({schema_version:1,status:'incompatible',compiler_id:host.compilerId,snapshot_id:'',data:{},message:String(e)}); }
};
function createServer() {
  const server = new McpServer({ name: 'vela', version: '0.7.0' });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool('vela_get_context', {
    description: 'Read this before writing Vela. Current compiler, syntax, limits and first working example.',
    inputSchema: z.object({}).strict(), outputSchema, annotations
  }, async () => basic(() => ({version:'0.7.0',quickstart:host.docs.get('quickstart'),limits,
    aliases:host.config.aliases,topics:Object.keys(topics),capabilities:['check','format','symbols','help',...(execution?.sandbox.ready?['build','test','run']:[])],
    execution:execution?.sandbox.ready??false,execution_reason:execution?.reason??'Execution backend is not configured.',
    execution_limits:executionLimits})));
  server.registerTool('vela_get_help', {
    description: 'Version-matched Vela language/project help or exact builtin catalog. Never guess APIs.',
    inputSchema: z.object({topic:z.enum(['quickstart','language','projects','modules','memory','builtins','idioms','numbers','stdlib','testing','ffi'])}).strict(),
    outputSchema, annotations
  }, async ({topic}) => basic(() => ({topic,text:host.docs.get(topic)})));
  for (const [tool,kind] of [['vela_check','check'],['vela_format','fmt'],['vela_symbols','symbols']] as const) {
    server.registerTool(tool, {
      description: kind === 'fmt' ? 'Return formatted Vela source without writing files.' :
        kind === 'check' ? 'Check Vela source or manifest using the native compiler on a bounded snapshot.' : 'Get native declared symbol/type/module information.',
      inputSchema:z.object({path:z.string().min(1).max(1024),text:z.string().max(2*1024*1024).optional().describe('Optional unsaved source text, analyzed only in the snapshot; never written to the workspace.'),overlay_path:z.string().min(1).max(1024).optional().describe('Source path for text when analyzing a project manifest; defaults to path.')}).strict(),outputSchema,annotations
    }, async ({path,text,overlay_path},ctx) => {
      const promise=host.analyze(kind,path,ctx.mcpReq.signal,text,overlay_path);
      host.pending.add(promise);
      try { return wrap(await promise); } finally {host.pending.delete(promise);}
    });
  }
  if(execution?.sandbox.ready){
    for(const kind of ['build','test','run'] as const){
      const sourceSchema=z.object({path:z.string().min(1).max(1024),text:z.string().max(2*1024*1024).optional(),overlay_path:z.string().min(1).max(1024).optional()}).strict();
      const runSchema=z.object({artifact_id:z.string().regex(/^[a-f0-9]{64}$/),args:z.array(z.string()).max(64).optional(),timeout_ms:z.number().int().min(1).max(30000).optional()}).strict();
      server.registerTool('vela_'+kind,{
        description:kind==='build'?'Build an isolated snapshot; return an opaque artifact_id without writing to the workspace.':
          kind==='test'?'Compile and execute native tests in the OS sandbox.':'Run an artifact_id from vela_build in the OS sandbox, with no network access.',
        inputSchema:kind==='run'?runSchema:sourceSchema,outputSchema,
        annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}
      },async(input:unknown,ctx:{mcpReq:{signal:AbortSignal}})=>{
        const value=input as {path?:string;artifact_id?:string;text?:string;overlay_path?:string;args?:string[];timeout_ms?:number};
        const pending=execution.request(kind,(kind==='run'?value.artifact_id:value.path)!,ctx.mcpReq.signal,value);
        host.pending.add(pending);try{return wrap(await pending);}finally{host.pending.delete(pending);}
      });
    }
  }
  for (const topic of Object.keys(topics)) {
    const uri='vela://help/'+topic;
    server.registerResource(topic,uri,{mimeType:'text/plain',description:'Vela 0.7 '+topic},async () => {
      await host.verify();
      return {contents:[{uri,mimeType:'text/plain',text:host.docs.get(topic)!}]};
    });
  }
  return server;
}
// Bound and validate transport bytes before handing them to the official SDK.
let buffered=Buffer.alloc(0);
const input=new Transform({transform(chunk:Buffer,_encoding,callback){
  buffered=Buffer.concat([buffered,chunk]);
  let offset:number;
  while((offset=buffered.indexOf(10))>=0) {
    if(offset>limits.lineBytes) return callback(new Error('MCP line limit exceeded.'));
    const line=buffered.subarray(0,offset+1);buffered=buffered.subarray(offset+1);
    let decoded:string;
    try {decoded=new TextDecoder('utf-8',{fatal:true}).decode(line);} catch {return callback(new Error('Invalid MCP UTF-8.'));}
    try {JSON.parse(decoded);} catch {
      console.error('Invalid MCP JSON.');
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}})+'\n');
      continue;
    }
    this.push(line);
  }
  if(buffered.length>limits.lineBytes) return callback(new Error('MCP line limit exceeded.'));
  callback();
}});
process.stdin.pipe(input);
const handle=serveStdio(createServer,{transport:new StdioServerTransport(input,process.stdout),onerror:e=>{
  console.error(e.message);
  if(e instanceof SyntaxError) process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}})+'\n');
}});
let closing:Promise<void>|undefined;
const close=()=>closing??=(async()=>{host.controller.abort(new HostError('cancelled','Client disconnected.'));await handle.close();await host.close();await execution?.close();})();
input.on('error',e=>{console.error(e.message);void close();process.stdin.destroy();});
process.stdin.on('end',()=>void close());
process.stdin.on('close',()=>void close());
process.on('beforeExit',()=>void close());
process.on('SIGINT',()=>void close());
process.on('SIGTERM',()=>void close());
if(process.stdin.readableEnded || process.stdin.destroyed) void close();
