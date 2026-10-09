// Actual product probe. All files and preferences live under the supplied isolated output.
const {app,BrowserWindow,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.env.FISHMARK_MODE_OUTPUT);
if(fs.existsSync(output))throw Error('Choose a fresh output directory');
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'userData'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
const {DEFAULT_PREFERENCES}=require(path.join(root,'dist-electron/shared/preferences.js'));
fs.writeFileSync(path.join(app.getPath('userData'),'preferences.json'),JSON.stringify({...DEFAULT_PREFERENCES,autosave:{idleDelayMs:60000},document:{fontFamily:'Georgia',cjkFontFamily:'Microsoft YaHei',fontSize:18}}));
const file=path.join(output,process.env.FISHMARK_MODE_RELOAD_CHECK==='1'?'中文 空格 Note.MD':'fixture.md');const source='# F11 mode\n\n| 项目 | Notes |\n| --- | --- |\n| 中文测试 ABC | Second cell |\n| next | row |\n\nEnd.\n';fs.writeFileSync(file,source);const otherFile=path.join(output,'Other 中文.md');if(process.env.FISHMARK_MODE_RELOAD_CHECK==='1'){fs.writeFileSync(otherFile,'# Other document\n\nUntouched.\n');process.argv.push(otherFile);}process.argv.push(file.replaceAll('\\','/'));
require(path.join(root,'dist-electron/main/main.js'));
const result={checks:[],versions:process.versions,width:Number(process.env.FISHMARK_MODE_WIDTH??1200)};let win,done=false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const watchdog=setTimeout(()=>finish(Error('Probe timeout')),60000);
function finish(error){if(done)return;done=true;clearTimeout(watchdog);if(error)result.error=String(error.stack??error);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));app.exit(error?1:0);}
function check(name,pass,detail){result.checks.push({name,pass,detail});if(!pass)throw Error(name);}
async function waitFor(fn){for(let i=0;i<140;i++){if(await fn())return;await delay(100);}throw Error('Readiness timeout');}
const js=source=>win.webContents.executeJavaScript(source);
const state=()=>js(`(()=>{const cell=document.querySelector('[data-table-cell="1:0"]'),table=document.querySelector('.cm-table-widget-table');return {mode:document.querySelector('.app-shell')?.dataset.fishmarkShellMode,active:document.activeElement?.outerHTML.slice(0,300),cell:cell?.textContent,tableTop:table?.getBoundingClientRect().top,settings:!!document.querySelector('[aria-modal="true"]'),searchFocused:document.activeElement?.getAttribute('aria-label')==='Find text'}})()`);
async function key(keyCode,modifiers=[]){win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await delay(250);}
async function click(selector){const point=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+Math.min(r.width/2,35)),y:Math.round(r.y+Math.min(r.height/2,20))}})()`);for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});await delay(350);}
async function screenshot(name){fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 await waitFor(()=>win=BrowserWindow.getAllWindows()[0]);win.setSize(result.width,850);win.show();win.focus();await waitFor(async()=>!win.webContents.isLoading()&&await js(`!!document.querySelector('[data-table-cell="1:0"]')`));await delay(500);
 if(process.env.FISHMARK_MODE_NORMALIZED_OPEN==='1') { result.normalizedOpen=await js('window.fishmark.openWorkspaceFileFromPath('+JSON.stringify(file.replaceAll('\\','/'))+')'); await delay(600); result.normalizedSnapshot=await js('window.fishmark.getWorkspaceSnapshot()'); }
 result.fullscreenEvents=[];win.on('enter-full-screen',()=>result.fullscreenEvents.push('enter'));win.on('leave-full-screen',()=>result.fullscreenEvents.push('leave'));
 const menuItems=items=>items.flatMap(i=>[{label:i.label,role:i.role,accelerator:i.accelerator},...menuItems(i.submenu?.items??[])]);result.menu=menuItems(Menu.getApplicationMenu()?.items??[]);
 const before=await state();check('initial reading',before.mode==='reading',before);await screenshot('reading');
 await click('[data-table-cell="1:0"]');const clicked=await state();check('table click keeps reading and geometry',clicked.mode==='reading'&&Math.abs(clicked.tableTop-before.tableTop)<0.1,clicked);
 await key('F11');check('native F11 exits reading',(await state()).mode==='editing');
 await key('F11',['isautorepeat']);check('native repeated F11 ignored',(await state()).mode==='editing');
 const edit=await state();await click('[data-table-cell="1:0"]');check('table click keeps editing and geometry',(await state()).mode==='editing'&&Math.abs((await state()).tableTop-edit.tableTop)<0.1);
 await key('Escape');check('Escape does not switch',(await state()).mode==='editing');
 for(let i=0;i<4;i++){await key('F11');check('repeated toggle '+i,(await state()).mode===(i%2===0?'reading':'editing'));}
 check('F11 does not fullscreen',!win.isFullScreen()&&result.fullscreenEvents.length===0,result.fullscreenEvents);await screenshot('editing');
 await key('f',['control']);await waitFor(async()=>(await state()).searchFocused);await key('F11');check('search focus survives entering reading',(await state()).mode==='reading'&&(await state()).searchFocused);
 await key('F11');check('search focus survives exiting reading',(await state()).mode==='editing'&&(await state()).searchFocused);await key('Escape');check('search Escape leaves mode',(await state()).mode==='editing');await delay(250);
 // Deliberately focus the settings entry, rather than editing content, to test its restore owner.
 await js('document.querySelector(".settings-entry").focus()');await click('.settings-entry');await waitFor(async()=>(await state()).settings);await key('F11');check('settings blocks F11',(await state()).mode==='editing');await key('Escape');await waitFor(async()=>!(await state()).settings);await delay(350);check('settings entry focus restored',(await js('document.activeElement===document.querySelector(".settings-entry")'))===true,await state());
 await click('[data-fishmark-command="toggle-reading-mode"]');check('visible entry enters reading',(await state()).mode==='reading');await click('[data-fishmark-command="toggle-reading-mode"]');check('visible entry exits reading',(await state()).mode==='editing');
 await click('[data-table-cell="1:0"]');const original=(await state()).cell;await win.webContents.insertText('X');await delay(150);const typed=(await state()).cell;await key('F11');await key('F11');await key('z',['control']);check('native undo survives mode toggles',(await state()).cell===original);await key('y',['control']);check('native redo survives mode toggles',(await state()).cell===typed);await key('s',['control']);await waitFor(()=>fs.readFileSync(file,'utf8').includes(typed));check('manual save uses current text',true);
 await click('[data-table-cell="1:0"]');await win.webContents.insertText('dirty');await waitFor(async()=>(await state()).cell?.includes('dirty'));await delay(1000);result.preExternal=await state();result.workspaceBeforeExternal=await js("window.fishmark.getWorkspaceSnapshot()");await js('window.__externalEvents=[];window.fishmark.onExternalMarkdownFileChanged(event=>window.__externalEvents.push(event));undefined');fs.writeFileSync(file,source.replace('中文测试 ABC','磁盘版本'));await waitFor(async()=>await js('!!document.querySelector(".external-file-conflict-button")'));
 if(process.env.FISHMARK_MODE_RELOAD_CHECK==='1') {
   result.conflictSnapshot=await js('window.fishmark.getWorkspaceSnapshot()');
   check('dirty conflict preserves unsaved text',result.conflictSnapshot.activeDocument.isDirty&&result.conflictSnapshot.activeDocument.content.includes('dirty')&&(await state()).cell.includes('dirty'),result.conflictSnapshot);
   check('multiple documents remain distinct',result.conflictSnapshot.tabs.length===2&&result.conflictSnapshot.tabs.filter(t=>t.isDirty).length===1);
   await screenshot('dirty-conflict');
   const diskBeforeKeep=fs.readFileSync(file,'utf8');const memoryBeforeKeep=(await state()).cell;
   await click('.external-file-conflict-button:nth-child(2)');await waitFor(async()=>!(await js('window.fishmark.getWorkspaceSnapshot()')).activeDocument.externalChange);
   check('keep-memory retains dirty text and does not write disk',(await state()).cell===memoryBeforeKeep&&(await js('window.fishmark.getWorkspaceSnapshot()')).activeDocument.isDirty&&fs.readFileSync(file,'utf8')===diskBeforeKeep);
   await delay(500);fs.writeFileSync(file,source.replace('中文测试 ABC','再次磁盘版本'));await waitFor(async()=>await js('!!document.querySelector(".external-file-conflict-button")'));
   check('later external change still asks for a choice',(await state()).cell===memoryBeforeKeep);
 }
 await click('.external-file-conflict-button');await waitFor(async()=>(await state()).cell===(process.env.FISHMARK_MODE_RELOAD_CHECK==='1'?'再次磁盘版本':'磁盘版本'));check('external reload preserves editing',(await state()).mode==='editing');await screenshot('reloaded');
 if(process.env.FISHMARK_MODE_RELOAD_CHECK==='1') {
   result.reloadedSnapshot=await js('window.fishmark.getWorkspaceSnapshot()');check('explicit reload resolves conflict and clears dirty',!result.reloadedSnapshot.activeDocument.isDirty&&!result.reloadedSnapshot.activeDocument.externalChange);
   check('other document remains unchanged',fs.readFileSync(otherFile,'utf8')==='# Other document\n\nUntouched.\n');
   await click('[data-fishmark-region="workspace-tab"]');await waitFor(async()=>(await js('window.fishmark.getWorkspaceSnapshot()')).activeDocument.name==='Other 中文.md');
   check('switching to other document retains its clean content',(await js('window.fishmark.getWorkspaceSnapshot()')).activeDocument.content==='# Other document\n\nUntouched.\n'&&!(await js('window.fishmark.getWorkspaceSnapshot()')).activeDocument.externalChange);
 }
 await key('n',['control']);await waitFor(async()=>await js('!document.querySelector(".cm-table-widget-table")'));check('new document preserves editing',(await state()).mode==='editing');
 check('no fullscreen across all input',!win.isFullScreen()&&result.fullscreenEvents.length===0);
 result.windowBounds=win.getBounds();result.dpr=await js('devicePixelRatio');finish();
}).catch(async error=>{if(win&&!win.isDestroyed()){result.failureState=await state().catch(()=>null);result.failureSnapshot=await js('window.fishmark.getWorkspaceSnapshot()').catch(()=>null);result.externalEvents=await js('window.__externalEvents').catch(()=>null);await screenshot('failed').catch(()=>{});}finish(error);});
