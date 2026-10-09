import { createServer } from "vite";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = process.argv[2];
if (!runId || !/^[a-z0-9-]+$/i.test(runId)) throw Error("Supply a fresh run id");
const output = path.join(root, ".artifacts/heading-markers", runId);
if (fs.existsSync(output)) throw Error("Output already exists");
fs.mkdirSync(output, { recursive: true });
const html = `<!doctype html><meta charset="utf-8"><title>Heading marker input boundary</title>
<style>body{margin:80px;background:#fafafa;color:#222}.document-editor{height:450px;--fishmark-document-font-family:Georgia;--fishmark-document-cjk-font-family:'Microsoft YaHei',serif;--fishmark-document-font-size:18px}.cm-editor{height:100%}</style><div id="heading" class="document-editor"></div>
<script type="module">
import '/styles/base.css';import '/styles/primitives.css';import '/styles/editor-source.css';import '/styles/markdown-render.css';
import {createCodeEditorController} from '/code-editor.ts';import {EditorView} from '@codemirror/view';import {undoDepth,redoDepth} from '@codemirror/commands';import {readCompositionState} from '@fishmark/codemirror-adapter';
window.EditorView=EditorView;window.proof={events:[],controller:null,mode:'editing',setup(source,mode='editing'){this.controller?.destroy();this.mode=mode;this.events=[];const host=document.getElementById('heading');host.replaceChildren();this.controller=createCodeEditorController({parent:host,initialContent:source,headingPresentationMode:mode,onChange:()=>{},onUserDocumentEdit:()=>{this.events.push('user-edit');this.mode='editing';queueMicrotask(()=>this.controller.setHeadingPresentationMode('editing'));}});this.controller.focus();},sample(){const root=document.querySelector('.cm-editor'),view=EditorView.findFromDOM(root),line=root.querySelector('.cm-line');const selection=view.state.selection.main;const native=getSelection();return {source:this.controller.getContent(),selection:{anchor:selection.anchor,head:selection.head},nativeSelection:{anchor:native.anchorNode?view.posAtDOM(native.anchorNode,native.anchorOffset):null,head:native.focusNode?view.posAtDOM(native.focusNode,native.focusOffset):null},hidden:!!root.querySelector('.cm-inactive-heading-marker'),marker:root.querySelector('.cm-active-heading-marker')?.getBoundingClientRect().toJSON(),scroller:{...root.querySelector('.cm-scroller').getBoundingClientRect().toJSON(),scrollWidth:root.querySelector('.cm-scroller').scrollWidth,clientWidth:root.querySelector('.cm-scroller').clientWidth},listMarkers:[...root.querySelectorAll('.cm-active-list-marker,.cm-inactive-list-marker')].map(e=>e.getBoundingClientRect().toJSON()),containerContentStart:line?line.getBoundingClientRect().left+parseFloat(getComputedStyle(line).paddingLeft)+parseFloat(getComputedStyle(line).borderLeftWidth)-(parseFloat(getComputedStyle(line).getPropertyValue('--fishmark-heading-marker-gutter'))||0)*parseFloat(getComputedStyle(document.documentElement).fontSize):null,mode:this.mode,undo:undoDepth(view.state),redo:redoDepth(view.state),caret:view.coordsAtPos(selection.head),line:line?.getBoundingClientRect().toJSON(),composing:readCompositionState(view.state).active,events:[...this.events]};}};
</script>`;
const server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 5198, strictPort: true, hmr: false, watch: null }, plugins: [{ name: 'heading-input-proof', configureServer(server) { server.middlewares.use('/__heading-proof', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/__heading-proof', html)); }); } }], logLevel: 'error' });
try {
  await server.listen();
  const { spawnTrackedProcess } = require('./process-tree.cjs');
  const tree = spawnTrackedProcess(require('electron'), [path.join(root, 'scripts/electron-heading-markers-main.cjs')], { cwd: root, env: { ...process.env, FISHMARK_HEADING_PROOF_OUTPUT: output }, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = []; tree.child.stdout.on('data', c => chunks.push(c)); tree.child.stderr.on('data', c => chunks.push(c));
  const timer = setTimeout(() => void tree.terminate(), 90000);
  const code = await new Promise(resolve => { tree.child.once('exit', resolve); tree.child.once('error', () => resolve(1)); });
  clearTimeout(timer); await tree.terminate(); fs.writeFileSync(path.join(output, 'process.log'), Buffer.concat(chunks)); process.exitCode = code ?? 1;
} finally { await server.close(); }
