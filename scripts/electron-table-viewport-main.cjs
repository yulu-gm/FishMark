// Real built application, isolated profile; observers never prevent input or scroll.
const { app, BrowserWindow, screen } = require("electron");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."), out = path.resolve(process.argv[2]);
const size = Number(process.argv[3]), width = Number(process.argv[4]), protocol = process.argv[5] ?? 'search';
if (!['search','navigation'].includes(protocol)) throw Error('Known navigation protocol required');
if (![5000, 20000].includes(size) || ![900, 1200].includes(width) || fs.existsSync(out)) throw new Error("Usage: FRESH_OUTPUT_DIR 5000|20000 900|1200");
fs.mkdirSync(path.join(out, "userData", "session"), { recursive: true });
app.setPath("appData", path.join(out, "userData")); app.setPath("userData", path.join(out, "userData")); app.setPath("sessionData", path.join(out, "userData", "session")); app.setAppLogsPath(path.join(out,"userData","logs"));
const { DEFAULT_PREFERENCES } = require(path.join(root, "dist-electron/shared/preferences.js"));
fs.writeFileSync(path.join(out, "userData/preferences.json"), JSON.stringify({ ...DEFAULT_PREFERENCES, autosave: { idleDelayMs: 60000 }, document: { fontFamily: "Georgia", cjkFontFamily: "Microsoft YaHei", fontSize: 18 }, theme: { ...DEFAULT_PREFERENCES.theme, mode: "light" } }));
function table(region) {
  const header = [`region-${region}`, "Long rich cell", "link", "unbroken", "multi wrap", "six", "seven", "eight"];
  return ["## " + region, "", "| " + header.join(" | ") + " |", "| " + header.map(() => "---").join(" | ") + " |", ...Array.from({length: 16}, (_, i) => "| " + [region + "-" + i, i === 0 ? "**中文 [nested](https://example.test)** " + "长单元格中的中文与 English prose。".repeat(50) : "短文 " + i, "[link **strong**](https://example.test)", "ABCDEFGHIJKLMNOP".repeat(i === 1 ? 30 : 1), "多行视觉换行内容。".repeat(i === 2 ? 25 : 1), "six", "seven", "eight"].join(" | ") + " |"), "", "After " + region + " paragraph.", ""].join("\n");
}
const paras = Array.from({length:size}, (_, i) => `Paragraph ${i}. 中文长文档用于检查表格进入与离开时的视口位置。 Ordinary text and stable scrolling.\n\n`);
const content = table("top") + paras.slice(0, size / 2).join("") + table("middle") + paras.slice(size / 2).join("") + table("bottom");
const fixture = path.join(out, "fixture.md"); fs.writeFileSync(fixture, content, { flag:"wx" }); process.argv.push(fixture);
const productFiles = ["packages/codemirror-adapter/src/viewport-reveal.ts", "packages/codemirror-adapter/src/extensions/markdown.ts", "packages/codemirror-adapter/src/decorations/table-widget.ts", "src/renderer/styles/markdown-render.css", "src/renderer/code-editor.ts"];
const result = { size, width, protocol, fixtureSha256: crypto.createHash("sha256").update(content).digest("hex"), steps: [], complete:false, startingCheckpoint:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",cwd:root}).trim(), tableHistoryCheckpoint:"8505074869c68554ddbc818fbaaffff6b72ff93c", productTransforms:0,
  sourceIdentity:productFiles.map(file=>({file,sha256:crypto.createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex")})) };
require(path.join(root, "dist-electron/main/main.js"));
let win, serial = 0, finished = false;
const delay = ms => new Promise(done => setTimeout(done, ms));
const js = code => win.webContents.executeJavaScript(code, true);
function install() {
  const rect = e => e ? Object.fromEntries(["top","bottom","left","right","width","height"].map(k => [k,e.getBoundingClientRect()[k]])) : null;
  const records = []; let action = "ready";
  const view = document.querySelector('.cm-content')?.cmTile?.root?.view;
  if (!view) throw Error('Missing live CodeMirror view for passive transaction observation');
  function sample() {
    const scroller = document.querySelector(".cm-scroller"), active = document.activeElement;
    const target = document.querySelector(window.__viewportTarget ?? '[data-table-cell="1:1"]');
    const sel = getSelection(); let caret = null;
    if(sel?.rangeCount) {const r = sel.getRangeAt(0).cloneRange(); r.collapse(false); caret = Object.fromEntries(["top","bottom","left","right","width","height"].map(k => [k,r.getBoundingClientRect()[k]])); }
    const workspace = document.querySelector(".app-workspace");
    return {at:performance.now(),hasFocus:document.hasFocus(),canonicalSelection:{anchor:view.state.selection.main.anchor,head:view.state.selection.main.head},docLength:view.state.doc.length,scrollTop:scroller?.scrollTop,scrollLeft:scroller?.scrollLeft,scrollHeight:scroller?.scrollHeight,scrollWidth:scroller?.scrollWidth,pageScrollY:scrollY,scroller:rect(scroller),target:rect(target),activeRect:rect(active),caret,focus:{tag:active?.tagName,className:active?.className,cell:active?.dataset?.tableCell},mode:target?.dataset?.tableCellRenderMode,cellText:target?.textContent?.slice(0,80),shellMode:workspace?.dataset?.fishmarkShellMode,selectionText:sel?.toString(),anchor:sel?.anchorOffset,head:sel?.focusOffset,overflowAnchor:scroller ? getComputedStyle(scroller).overflowAnchor : null};
  }
  const dispatch = view.dispatch;
  view.dispatch = function(...args) { records.push({kind:'dispatch',action,args:args.map(t=>({scrollIntoView:t.scrollIntoView,selection:t.selection,docChanged:t.docChanged})),stack:new Error().stack,sample:sample()}); return Reflect.apply(dispatch,this,args); };
  const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
  Object.defineProperty(view.scrollDOM,'scrollTop',{configurable:true,get(){return scrollDescriptor.get.call(this);},set(value){records.push({kind:'scroll-write',action,value,stack:new Error().stack,sample:sample()});scrollDescriptor.set.call(this,value);}});
  for(const type of ["mousedown","mouseup","click","keydown","keyup","focusin","focusout","beforeinput","input","scroll"]) document.addEventListener(type, event => records.push({kind:"event", action, type, trusted:event.isTrusted,key:event.key,inputType:event.inputType,target:{className:event.target?.className,cell:event.target?.dataset?.tableCell},sample:sample()}), true);
  for(const [proto, name] of [[HTMLElement.prototype,"focus"],[Element.prototype,"scrollIntoView"]]) {
    const original = proto[name]; proto[name] = function(...args) {records.push({kind:"native-call",action,name,args,target:{className:this.className,cell:this.dataset?.tableCell},stack:new Error().stack,sample:sample()}); return Reflect.apply(original,this,args);};
  }
  window.__viewport = {sample,records,action(label){action=label;const start=performance.now();function tick(){records.push({kind:"frame",action,sample:sample()});if(performance.now()-start<450)requestAnimationFrame(tick);}requestAnimationFrame(tick);},
    navigate(region){const pos=view.state.doc.toString().indexOf('region-'+region);if(pos<0)throw Error('Missing canonical region');view.dispatch({selection:{anchor:pos,head:pos},effects:view.constructor.scrollIntoView(pos,{y:'center',yMargin:24})});view.focus();},
    target(region,row,col){const widget=[...document.querySelectorAll('.cm-table-widget')].find(w=>w.querySelector('[data-table-cell="0:0"]')?.textContent===`region-${region}`);if(!widget)throw Error("Missing region "+region);window.__viewportTarget=`.cm-table-widget[data-table-start-offset="${widget.dataset.tableStartOffset}"] [data-table-cell="${row}:${col}"]`;return sample();},
    prepareVisible(){const s=document.querySelector('.cm-scroller'),e=document.querySelector(window.__viewportTarget);s.scrollTop+=e.getBoundingClientRect().top-s.getBoundingClientRect().top-150;},
    point(selector){const e=document.querySelector(selector),r=e?.getBoundingClientRect();if(!r)throw Error("Missing selector "+selector);const p={x:Math.round(r.left+Math.min(25,r.width/2)),y:Math.round(r.top+Math.min(25,r.height/2))};if(p.x<0||p.y<0||p.x>=innerWidth||p.y>=innerHeight)throw Error('Offscreen diagnostic click '+selector);return p;}
  };
}
async function key(keyCode, modifiers=[]) {win.webContents.sendInputEvent({type:"keyDown",keyCode,modifiers});win.webContents.sendInputEvent({type:"keyUp",keyCode,modifiers});}
async function click(selector) {const point=await js(`window.__viewport.point(${JSON.stringify(selector)})`);for(const type of ["mouseDown","mouseUp"])win.webContents.sendInputEvent({type,...point,button:"left",clickCount:1});}
async function step(label, perform) {
  const id=String(++serial).padStart(3,"0");await js(`window.__viewport.action(${JSON.stringify(label)})`);
  const before=await js("window.__viewport.sample()");fs.writeFileSync(path.join(out,id+"-before.png"),(await win.webContents.capturePage()).toPNG());
  await perform();await delay(550);
  const after=await js("window.__viewport.sample()");fs.writeFileSync(path.join(out,id+"-after.png"),(await win.webContents.capturePage()).toPNG());
  const value={id,label,before,after,delta:{scrollTop:after.scrollTop-before.scrollTop,scrollLeft:after.scrollLeft-before.scrollLeft,scrollerTop:after.scroller?.top-before.scroller?.top,targetTop:after.target?.top-before.target?.top}};result.steps.push(value);console.log(JSON.stringify({id,label,delta:value.delta,focus:after.focus}));
}
async function finish(error) {if(finished)return;finished=true;if(error)result.error=String(error.stack??error);if(win&&!win.isDestroyed())result.records=await js("window.__viewport?.records??[]").catch(()=>[]);result.complete=!error;fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(result,null,2));app.exit(error?1:0);}
app.whenReady().then(async()=>{
  for(let i=0;i<200;i++){win=BrowserWindow.getAllWindows()[0];if(win)break;await delay(100);}if(!win)throw Error("No owned app window");
  win.setSize(width,850);win.show();win.focus();
  for(let i=0;i<300;i++){if(!win.webContents.isLoading()&&await js("Boolean(document.querySelector('.cm-scroller'))"))break;await delay(100);}
  await js(`(${install.toString()})()`); await delay(700);
  result.environment={versions:process.versions,cpu:os.cpus()[0].model,ram:os.totalmem(),display:screen.getPrimaryDisplay(),userData:app.getPath("userData")};
  result.buttons=await js("[...document.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),title:b.title,text:b.textContent}))");
  for(const region of ["top","middle","bottom"]){
    if(protocol==='navigation') {
      await step(region+' public-offset fixture navigation',()=>js(`window.__viewport.navigate(${JSON.stringify(region)})`));
    } else {
    await step(region+" search open",async()=>{
      await click('[aria-label="Find and replace"]');await delay(350);
      if(!await js("Boolean(document.querySelector('[aria-label=\"Find text\"]'))")) {
        result.searchAcquisitionRetries=(result.searchAcquisitionRetries??0)+1;
        await click('[aria-label="Find and replace"]');
      }
    });
    await click('[aria-label="Find text"]');await key("a",["control"]);await win.webContents.insertText("region-"+region);await delay(800);
    await step(region+" search jump",()=>key("Enter"));await step(region+" search close",()=>key("Escape"));
    }
    await js(`window.__viewport.target(${JSON.stringify(region)},1,1);window.__viewport.prepareVisible()`);await delay(600);
    await step(region+" long visible cell click",()=>js("window.__viewportTarget").then(click));
    await js("window.__viewport.prepareVisible()");await delay(400);
    await step(region+" long repeated click",()=>js("window.__viewportTarget").then(click));
    await step(region+" tab",()=>key("Tab"));await step(region+" shift tab",()=>key("Tab",["shift"]));
    await step(region+" down",()=>key("Down"));await step(region+" up",()=>key("Up"));
  }
  await finish();
}).catch(finish);
