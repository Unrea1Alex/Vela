import * as fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('../..'),file=path.join(root,'docs/cold-start-evidence.json');
const report=JSON.parse(await fs.readFile(file,'utf8'));
await fs.copyFile(file,path.join(root,'build/stage06/cold-start-counting-before.json'));
for(const task of report.tasks){
 const stderr=await fs.readFile(path.join(root,'build/stage06/cold-start',task.name+'.log.stderr'),'utf8');
 task.check_calls=(stderr.match(/^mcp: vela\/vela_check \(completed\)/gm)??[]).length;
 task.help_calls=(stderr.match(/^mcp: vela\/vela_get_(?:context|help) \(completed\)/gm)??[]).length;
 task.passed=task.agent_exit===0&&task.check_calls>0&&task.help_calls>0&&task.build_exit===0&&task.cases.length>0&&task.cases.every(c=>c.passed);
 task.final_unknown_apis=task.build_exit===0?0:null;
 if(!task.passed)throw Error('Cold acceptance failed: '+task.name);
}
report.harness_correction='CLI 0.157 text telemetry uses mcp: vela/TOOL (completed); initial parser expected tool vela.TOOL. Counts corrected from retained logs, no agent output or behavior expectation changed.';
report.passed=report.tasks.every(t=>t.passed);
report.behavior_cases=report.tasks.reduce((n,t)=>n+t.cases.length,0);
await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');
console.log(report.tasks.length+' fresh tasks and '+report.behavior_cases+' behavior cases passed');
