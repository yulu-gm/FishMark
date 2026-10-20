// Real Electron regression; an optional private fixture stays outside the repository.
import {createServer} from "vite";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const content = process.env.FISHMARK_SCROLL_SAMPLE
  ? readFileSync(process.env.FISHMARK_SCROLL_SAMPLE, "utf8")
  : [
    ...Array.from({length:85}, (_, i) => `## 示例章节 ${i}\n\n${"这是一段用于验证滚动稳定性的示例正文，不包含任何用户数据。".repeat(7)}\n`),
    "```text", ...Array.from({length:12}, () => "{\n  example\n}"), "```", "",
    "文档结束标记，用于确认真实末尾已经进入可见区域。"
  ].join("\n");
const renderer = `
import "/styles/base.css";
import "/styles/primitives.css";
import "/styles/editor-source.css";
import "/styles/markdown-render.css";
import {createCodeEditorController} from "/code-editor.ts";
import {EditorView} from "@codemirror/view";
document.body.style.cssText="margin:0;overflow:hidden";
const root=document.getElementById("root");
root.className="document-editor";
root.style.cssText="width:720px;height:520px;--fishmark-document-font-size:16px";
const content=await (await fetch("/__scroll_sample")).text();
createCodeEditorController({parent:root,initialContent:content,onChange:()=>{}});
const view=EditorView.findFromDOM(root.querySelector(".cm-content"));
const scroll=view.scrollDOM;
window.bottomProbe={
  sample(event) {
    const end=view.coordsAtPos(view.state.doc.length);
    const rect=scroll.getBoundingClientRect();
    return {event,scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,
      clientHeight:scroll.clientHeight,distance:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop,
      endVisible:!!end&&end.bottom>=rect.top&&end.top<=rect.bottom,
      endInViewport:view.viewport.to===view.state.doc.length,
      lineHeight:view.defaultLineHeight,unchanged:view.state.doc.toString()===content};
  },
  geometry() {
    const track=root.querySelector('[data-editor-scrollbar-axis="vertical"]');
    return {track:track.getBoundingClientRect().toJSON(),thumb:track.firstElementChild.getBoundingClientRect().toJSON()};
  },
  focus(){view.focus();},
  editSetup() {
    const fence=String.fromCharCode(96).repeat(3);
    const fixture=["Intro","",""+fence+"csharp","{","  int value = 1;","}",fence,"","Tail"].join(String.fromCharCode(10));
    view.dispatch({changes:{from:0,to:view.state.doc.length,insert:fixture},selection:{anchor:fixture.indexOf("value")}});
    view.focus();
    return fixture;
  },
  editInactive(){view.dispatch({selection:{anchor:view.state.doc.length}});view.contentDOM.blur();},
  editSnapshot() {
    const selection=view.state.selection.main;
    return {text:view.state.doc.toString(),anchor:selection.anchor,head:selection.head,
      code:Array.from(root.querySelectorAll(".cm-inactive-code-block")).map(el=>{
        const style=getComputedStyle(el),r=el.getBoundingClientRect();
        return {text:el.textContent,x:r.x,y:r.y,width:r.width,height:r.height,font:style.fontFamily,
          fontSize:style.fontSize,lineHeight:style.lineHeight,color:style.color,background:style.backgroundColor,
          padding:style.padding,border:style.border};
      })};
  },
  grow() {
    const style=document.createElement("style");
    style.textContent=".cm-inactive-code-block{line-height:38px!important}";
    document.head.append(style);view.requestMeasure();
  }
};
`;
const server=await createServer({
  root:path.resolve("src/renderer"), configFile:path.resolve("vite.config.ts"),
  plugins:[{
    name:"scroll-bottom-regression",
    configureServer(s) {
      s.middlewares.use((req,res,next)=>{
        if(req.url==="/__scroll_probe") {res.setHeader("Content-Type","text/html");res.end('<div id="root"></div><script type="module" src="/__scroll_probe.js"></script>');}
        else if(req.url==="/__scroll_probe.js") {res.setHeader("Content-Type","application/javascript");res.end(renderer.replace('"@codemirror/view"', '"/@id/@codemirror/view"'));}
        else if(req.url==="/__scroll_sample") {res.setHeader("Content-Type","text/plain; charset=utf-8");res.end(content);}
        else next();
      });
    }
  }],
  server:{host:"127.0.0.1",port:5198,strictPort:true},logLevel:"error"
});
await server.listen();
try {
  const child=spawn(require("electron"),[path.resolve("scripts/scroll-bottom-electron.cjs")],{stdio:"inherit",windowsHide:true});
  process.exitCode=await new Promise(resolve=>{child.on("exit",code=>resolve(code??1));child.on("error",error=>{console.error(error);resolve(1);});});
} finally {await server.close();}
