// Diagnostic wrapper around the actual built product; no editor DOM rewriting.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const caseId = process.env.FISHMARK_TABLE_TRANSITION_CASE ?? "short";
const width = Number(process.env.FISHMARK_TABLE_TRANSITION_WIDTH ?? 1200);
const variant = process.env.FISHMARK_TABLE_TRANSITION_VARIANT ?? "baseline";
const output = path.resolve(process.env.FISHMARK_TABLE_TRANSITION_OUTPUT);
const fixtures = {
  short: "# 中文表格\n\n| 项目 | 说明 |\n| --- | --- |\n| 中文测试 | 中文字号变化测试 |\n| 第二行 | 对照文本 |\n\n表格之后的正文。\n",
  mixed: "# Mixed table\n\n| Name 名称 | Notes 说明 |\n| --- | --- |\n| 中文测试 ABC 123，标点。 | English 中文 mixed content |\n| plain ASCII | 中文对照 |\n\nAfter table.\n",
  saturated: "# Long cells\n\n| prose | unbroken |\n| --- | --- |\n| " + "这是一段用于观察自动换行的中文散文。".repeat(9) + " | " + "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(9) + " |\n\nAfter table.\n",
  scrolled: "# Scrolled table\n\n" + Array.from({length:16},(_,i)=>`前置段落 ${i+1}。\n\n`).join("") + "| 项目 | 说明 |\n| --- | --- |\n| 中文测试 | 中文字号变化测试 |\n| 第二行 | 对照文本 |\n\n" + Array.from({length:12},(_,i)=>`后置段落 ${i+1}。\n\n`).join("")
};
fixtures.header=fixtures.mixed;
if (!(caseId in fixtures) || ![900,1200].includes(width) || !["baseline","reserve-tabs","anchor-scroll"].includes(variant)) throw new Error("Invalid diagnostic scenario.");
fs.mkdirSync(output, {recursive:true});
const userData = path.join(output,"userData");
fs.mkdirSync(userData,{recursive:true});
app.setPath("userData",userData);
const { DEFAULT_PREFERENCES } = require(path.join(root,"dist-electron/shared/preferences.js"));
fs.writeFileSync(path.join(userData,"preferences.json"),JSON.stringify({...DEFAULT_PREFERENCES,autosave:{idleDelayMs:60000},document:{fontFamily:"Georgia",cjkFontFamily:"Microsoft YaHei",fontSize:18},theme:{...DEFAULT_PREFERENCES.theme,mode:"light"}}));
const fixturePath = path.join(output,"fixture.md");
fs.writeFileSync(fixturePath,fixtures[caseId]);
process.argv.push(fixturePath);
require(path.join(root,"dist-electron/main/main.js"));

function sample() {
  const rect = e => e ? Object.fromEntries(["x","y","top","left","width","height","bottom","right"].map(k=>[k,e.getBoundingClientRect()[k]])) : null;
  const styles = e => {
    if(!e) return null;
    const c=getComputedStyle(e);
    return Object.fromEntries(["fontFamily","fontSize","fontWeight","lineHeight","letterSpacing","paddingTop","paddingBottom","marginTop","marginBottom","rowGap","gridTemplateRows","gridRow","position","display","transform","overflowAnchor"].map(k=>[k,c[k]]));
  };
  const selectors={workspace:".app-workspace",tabs:".workspace-tab-strip",canvas:".workspace-canvas",editor:".document-editor",scroller:".cm-scroller",content:".cm-content",table:".cm-table-widget-table",widget:".cm-table-widget",toolbar:".app-rail-mode-group-table",cell:window.__tableProbeTarget??'[data-table-cell="1:0"]'};
  const nodes=Object.fromEntries(Object.entries(selectors).map(([k,s])=>[k,document.querySelector(s)]));
  const cell=nodes.cell;
  const glyphs=[];
  if(cell){
    const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode()) && glyphs.length<28){
      for(let i=0;i<node.textContent.length && glyphs.length<28;i++){
        const r=document.createRange();r.setStart(node,i);r.setEnd(node,i+1);
        glyphs.push({text:node.textContent[i],rects:Array.from(r.getClientRects()).map(x=>({x:x.x,y:x.y,width:x.width,height:x.height})),parentClass:node.parentElement.className,font:getComputedStyle(node.parentElement).fontFamily});
      }
    }
  }
  const selection=window.getSelection();
  const scroller=nodes.scroller;
  return {at:performance.now(),shellMode:nodes.workspace?.dataset.fishmarkShellMode,active:document.activeElement?.className,cellMode:cell?.dataset.tableCellRenderMode,cellText:cell?.textContent,cellHtml:cell?.innerHTML,scrollTop:scroller?.scrollTop,scrollHeight:scroller?.scrollHeight,pageScrollY:scrollY,rects:Object.fromEntries(Object.entries(nodes).map(([k,e])=>[k,rect(e)])),styles:Object.fromEntries(Object.entries(nodes).map(([k,e])=>[k,styles(e)])),columns:Array.from(document.querySelectorAll(".cm-table-widget-column")).map(e=>({style:e.style.width,width:e.getBoundingClientRect().width})),rows:Array.from(document.querySelectorAll(".cm-table-widget-row")).map(rect),glyphs,selection:{text:selection?.toString(),anchor:selection?.anchorOffset,focus:selection?.focusOffset},documentTableY:nodes.table && scroller ? nodes.table.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop:null};
}
const result={caseId,width,variant,fixturePath,userData,versions:process.versions};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let finished=false;
const watchdog=setTimeout(()=>finish(new Error("Diagnostic timeout")),35000);
function finish(error){
  if(finished)return;finished=true;clearTimeout(watchdog);
  if(error)result.error=String(error.stack??error);
  fs.writeFileSync(path.join(output,"result.json"),JSON.stringify(result,null,2));
  app.exit(error?1:0);
}
async function waitFor(read){for(let i=0;i<120;i++){if(await read())return;await delay(100);}throw new Error("Readiness timeout");}
app.whenReady().then(async()=>{
  let win;
  await waitFor(()=>win=BrowserWindow.getAllWindows()[0]);
  win.setSize(width,850);win.show();win.focus();
  await waitFor(async()=>!win.webContents.isLoading() && await win.webContents.executeJavaScript('Boolean(document.querySelector(\'[data-table-cell="1:0"]\'))'));
  await win.webContents.executeJavaScript(`window.__sampleTableTransition=${sample.toString()}; undefined`);
  if(caseId==="header") await win.webContents.executeJavaScript(`window.__tableProbeTarget='[data-table-cell="0:0"]'; undefined`);
  if(variant==="reserve-tabs"){
    // Counterfactual only: keep the existing editing grid in reading mode.
    result.counterfactualCss='.app-workspace.app-workspace[data-fishmark-layout="workspace"][data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"]{grid-template-rows:auto auto minmax(0,1fr)!important}.app-workspace[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"]>.workspace-tab-strip[data-fishmark-region="workspace-tab-strip"]{grid-row:2!important;grid-column:auto!important;max-height:44px!important;transform:none!important}.workspace-canvas[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"]{grid-row:3!important;grid-column:auto!important}';
    await win.webContents.insertCSS(result.counterfactualCss);
  }
  await delay(650);
  if(caseId==="scrolled"){
    await win.webContents.executeJavaScript('(()=>{const s=document.querySelector(".cm-scroller"),t=document.querySelector(".cm-table-widget-table");s.scrollTop+=t.getBoundingClientRect().top-s.getBoundingClientRect().top-160})()');
    await delay(250);
  }
  const measure=()=>win.webContents.executeJavaScript("window.__sampleTableTransition()");
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("DOM.enable");await win.webContents.debugger.sendCommand("CSS.enable");
  async function fonts(){
    const doc=await win.webContents.debugger.sendCommand("DOM.getDocument");
    const {nodeId}=await win.webContents.debugger.sendCommand("DOM.querySelector",{nodeId:doc.root.nodeId,selector:caseId==="header"?'[data-table-cell="0:0"]':'[data-table-cell="1:0"]'});
    return win.webContents.debugger.sendCommand("CSS.getPlatformFontsForNode",{nodeId});
  }
  result.before=await measure();result.beforeFonts=await fonts();
  fs.writeFileSync(path.join(output,"before.png"),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript('window.__transitionFrames=[];(()=>{const start=performance.now();function tick(){window.__transitionFrames.push(window.__sampleTableTransition());if(performance.now()-start<400)requestAnimationFrame(tick)}requestAnimationFrame(tick)})()');
  const r=result.before.rects.cell;
  const x=Math.round(r.left+Math.min(r.width/2,55)),y=Math.round(r.top+20);
  result.click={x,y};
  win.webContents.sendInputEvent({type:"mouseDown",x,y,button:"left",clickCount:1});win.webContents.sendInputEvent({type:"mouseUp",x,y,button:"left",clickCount:1});
  await delay(600);
  if(variant==="anchor-scroll") {
    const current=await measure();result.anchorRequestedScrollTop=result.before.scrollTop+current.rects.scroller.top-result.before.rects.scroller.top;
    await win.webContents.executeJavaScript('document.querySelector(".cm-scroller").scrollTop='+result.anchorRequestedScrollTop);await delay(100);
  }
  result.after=await measure();result.afterFonts=await fonts();
  result.frames=await win.webContents.executeJavaScript("window.__transitionFrames");
  fs.writeFileSync(path.join(output,"after.png"),(await win.webContents.capturePage()).toPNG());
  result.delta={tableTop:result.after.rects.table.top-result.before.rects.table.top,scrollerTop:result.after.rects.scroller.top-result.before.rects.scroller.top,scrollTop:result.after.scrollTop-result.before.scrollTop,documentTableY:result.after.documentTableY-result.before.documentTableY,tableHeight:result.after.rects.table.height-result.before.rects.table.height,cellHeight:result.after.rects.cell.height-result.before.rects.cell.height};
  if(caseId==="mixed" && variant==="baseline"){
    const oldText=result.after.cellText;
    await win.webContents.insertText("X");await delay(120);
    const typed=(await measure()).cellText;
    for(const [key,label] of [["z","undo"],["y","redo"]]){
      win.webContents.sendInputEvent({type:"keyDown",keyCode:key,modifiers:["control"]});win.webContents.sendInputEvent({type:"keyUp",keyCode:key,modifiers:["control"]});await delay(120);
      result[label]=(await measure()).cellText;
    }
    result.nativeUndo={oldText,typed,undoRestored:result.undo===oldText,redoRestored:result.redo===typed};
  }

  const glyphShape = m => m.glyphs.map(g=>({text:g.text,rects:g.rects.map(r=>({x:r.x-m.rects.cell.x,y:r.y-m.rects.cell.y,width:r.width,height:r.height}))}));
  const maxGlyphDelta=(a,b)=>{
    const left=glyphShape(a),right=glyphShape(b);let max=0;
    if(left.length!==right.length)return Infinity;
    for(let i=0;i<left.length;i++){if(left[i].text!==right[i].text||left[i].rects.length!==right[i].rects.length)return Infinity;for(let j=0;j<left[i].rects.length;j++)for(const key of ["x","y","width","height"])max=Math.max(max,Math.abs(left[i].rects[j][key]-right[i].rects[j][key]));}return max;
  };
  result.maxGlyphDelta=maxGlyphDelta(result.before,result.after);
  // 0.05px permits Chromium's 1/64px text-run boundary quantization, not 1px font shifts.
  result.fontGeometryStable=result.maxGlyphDelta<=0.05;
  if(caseId==="mixed" && variant==="baseline") {
    const key=async(keyCode,modifiers=[])=>{win.webContents.sendInputEvent({type:"keyDown",keyCode,modifiers});win.webContents.sendInputEvent({type:"keyUp",keyCode,modifiers});await delay(80);};
    // Return to the unchanged sample, then select four Han characters using native keys.
    await key("z",["control"]);
    await key("Home"); for(let i=0;i<4;i++)await key("Right",["shift"]);
    result.selected=(await measure()).selection.text;
    await win.webContents.insertText("替换 X");await delay(120);const replaced=(await measure()).cellText;
    await key("z",["control"]);const undone=(await measure()).cellText;
    await key("y",["control"]);const redone=(await measure()).cellText;
    result.selectionReplacement={selected:result.selected,replaced,undoRestored:undone===result.after.cellText,redoRestored:redone===replaced};
    await key("z",["control"]);
    result.reentry=[];
    for(let i=0;i<3;i++){
      // Native mouse focus to another cell and back; measure fresh coordinates each time.
      const other=await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('[data-table-cell="2:0"]').getBoundingClientRect();return {x:Math.round(r.x+30),y:Math.round(r.y+20)}})()`);
      for(const type of ["mouseDown","mouseUp"])win.webContents.sendInputEvent({type,...other,button:"left",clickCount:1});await delay(120);
      const preview=await measure();const r=preview.rects.cell;const point={x:Math.round(r.x+30),y:Math.round(r.y+20)};
      for(const type of ["mouseDown","mouseUp"])win.webContents.sendInputEvent({type,...point,button:"left",clickCount:1});await delay(120);
      const active=await measure();result.reentry.push({previewMode:preview.cellMode,activeMode:active.cellMode,textStable:active.cellText===result.after.cellText,geometryStable:maxGlyphDelta(preview,active)<=0.05,maxGlyphDelta:maxGlyphDelta(preview,active),fonts:await fonts()});
    }
  }
  result.dpr=await win.webContents.executeJavaScript("devicePixelRatio");
  result.valid=result.before.shellMode==="reading" && result.after.shellMode==="editing" && result.after.cellMode==="plain";
  win.webContents.debugger.detach();
  if(process.env.FISHMARK_EXPECT_FONT_STABLE==="1") result.valid=result.valid && result.fontGeometryStable && (!result.nativeUndo || (result.nativeUndo.undoRestored && result.nativeUndo.redoRestored)) && (!result.selectionReplacement || (result.selectionReplacement.selected==="中文测试" && result.selectionReplacement.undoRestored && result.selectionReplacement.redoRestored)) && (!result.reentry || result.reentry.every(r=>r.previewMode==="preview" && r.activeMode==="plain" && r.textStable && r.geometryStable));
  finish(result.valid?null:new Error("Did not observe reading-to-editing table transition"));
}).catch(finish);
