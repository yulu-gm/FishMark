import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const require=createRequire(import.meta.url);
const {spawnTrackedProcess}=require("./process-tree.cjs");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const runId=process.argv[2]??`run-${Date.now()}`;
if(!/^[a-z0-9-]+$/i.test(runId))throw new Error("Invalid run id");
const output=path.join(root,".artifacts/table-transition",runId);
if(fs.existsSync(output))throw new Error("Run output already exists; choose a new run id.");
fs.mkdirSync(output,{recursive:true});
const matrix=[...([1200,900].flatMap(width=>["short","mixed","saturated","scrolled"].map(caseId=>({width,caseId,variant:"baseline"})))),{width:1200,caseId:"short",variant:"reserve-tabs"}];
const summary=[];
for(const scenario of matrix){
  const dir=path.join(output,`${scenario.caseId}-${scenario.width}-${scenario.variant}`);
  fs.mkdirSync(dir,{recursive:true});
  const tree=spawnTrackedProcess(require("electron"),[path.join(root,"scripts/electron-table-transition-main.cjs")],{cwd:root,env:{...process.env,FISHMARK_TABLE_TRANSITION_CASE:scenario.caseId,FISHMARK_TABLE_TRANSITION_WIDTH:String(scenario.width),FISHMARK_TABLE_TRANSITION_VARIANT:scenario.variant,FISHMARK_TABLE_TRANSITION_OUTPUT:dir},stdio:["ignore","pipe","pipe"]});
  const chunks=[];tree.child.stdout.on("data",c=>chunks.push(c));tree.child.stderr.on("data",c=>chunks.push(c));
  const timeout=setTimeout(()=>void tree.terminate(),45000);
  const code=await new Promise(resolve=>{tree.child.once("exit",resolve);tree.child.once("error",()=>resolve(1));});
  clearTimeout(timeout);await tree.terminate();fs.writeFileSync(path.join(dir,"process.log"),Buffer.concat(chunks));
  const resultPath=path.join(dir,"result.json");
  const result=fs.existsSync(resultPath)?JSON.parse(fs.readFileSync(resultPath,"utf8")):null;
  summary.push({...scenario,code,valid:result?.valid,delta:result?.delta,beforeFonts:result?.beforeFonts,afterFonts:result?.afterFonts,nativeUndo:result?.nativeUndo,error:result?.error});
  process.stdout.write(JSON.stringify(summary.at(-1))+"\n");
}
fs.writeFileSync(path.join(output,"summary.json"),JSON.stringify(summary,null,2));
process.exitCode=summary.every(r=>r.code===0&&r.valid)?0:1;
