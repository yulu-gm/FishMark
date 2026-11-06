import { createServer } from "vite";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const renderer = `
import "/styles/base.css";
import "/styles/primitives.css";
import "/styles/editor-source.css";
import "/styles/markdown-render.css";
import {createCodeEditorController} from "/code-editor.ts";
import {EditorView} from "/@id/@codemirror/view";

const root=document.querySelector('#root'); root.className='document-editor';
root.style.cssText='width:600px;height:500px;--fishmark-document-font-size:16px';
const source='![alt](http://127.0.0.1:5199/img.svg "caption")';
let editor=createCodeEditorController({parent:root,initialContent:source,onChange:()=>{}});
const view=()=>EditorView.findFromDOM(root.querySelector('.cm-content'));
window.probe={source, content:()=>editor.getContent(), focus:()=>view().focus(),
 readOnly:v=>editor.setReadOnly(v), appendElsewhere:()=>{
   window.originalPreview=root.querySelector('.cm-markdown-image-preview-image');
   view().dispatch({changes:{from:view().state.doc.length,insert:'\\n\\nTail'},userEvent:'input.type'});
 }, reused:()=>window.originalPreview===root.querySelector('.cm-markdown-image-preview-image'), insert:()=>{editor.setSelection(editor.getContent().length);editor.insertText("X")}, reopen:()=>{const content=editor.getContent();editor.destroy();editor=createCodeEditorController({parent:root,initialContent:content,onChange:()=>{}})},
 resizeRoot:w=>root.style.width=w+'px',
 geometry:()=>{const img=root.querySelector('.cm-markdown-image-preview-image'), handle=root.querySelector('.cm-markdown-image-resize-handle');
 return {img:img?.getBoundingClientRect().toJSON(),handle:handle?.getBoundingClientRect().toJSON(), natural:img?.naturalWidth,visible:handle&&getComputedStyle(handle).display!=='none'};}};
`;
const server=await createServer({root:path.resolve("src/renderer"),configFile:path.resolve("vite.config.ts"),plugins:[{name:"image-resize-probe",configureServer(s){s.middlewares.use((req,res,next)=>{
 if(req.url==="/__probe") {res.setHeader("Content-Type","text/html");res.end('<div id="root"></div><script type="module" src="/__probe.js"></script>');}
 else if(req.url==="/__probe.js") {res.setHeader("Content-Type","text/javascript");res.end(renderer);}
 else if(req.url==="/img.svg") {res.setHeader("Content-Type","image/svg+xml");res.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="coral"/></svg>');}
 else next();});}}],server:{host:"127.0.0.1",port:5199,strictPort:true},logLevel:"error"});
await server.listen();
try {const child=spawn(require("electron"),[path.resolve("scripts/image-resize-electron.cjs")],{stdio:"inherit"});process.exitCode=await new Promise(resolve=>{child.on("exit",code=>resolve(code??1));child.on("error",()=>resolve(1));});} finally {await server.close();}
