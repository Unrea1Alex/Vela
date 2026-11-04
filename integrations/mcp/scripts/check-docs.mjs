import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'../..'),files=['README.md','AGENTS.md','integrations/mcp/README.md','integrations/agent/vela-app/SKILL.md'];
async function walk(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
 const rel=path.join(dir,e.name);if(e.isDirectory())await walk(rel);else if(e.name.endsWith('.md'))files.push(rel);
}}
await walk('docs');let links=0;const missing=[];
for(const rel of files){const text=await fs.readFile(path.join(root,rel),'utf8');
 for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
  const target=m[1].split('#')[0].replace(/^<|>$/g,'');if(!target||/^[a-z][a-z0-9+.-]*:/i.test(target))continue;
  ++links;if(!(await fs.stat(path.resolve(root,path.dirname(rel),decodeURIComponent(target))).catch(()=>null)))missing.push({source:rel,target});
 }
}
const report={schema_version:1,files:files.length,links,missing};
await fs.writeFile(path.join(root,'build/stage07/078-docs.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(missing.length)process.exitCode=1;
