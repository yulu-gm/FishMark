// Actual product probe. All files and preferences live under the supplied isolated output.
const {app,BrowserWindow,Menu,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.env.FISHMARK_MODE_OUTPUT);
if(fs.existsSync(output))throw Error('Choose a fresh output directory');
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'userData'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
const {DEFAULT_PREFERENCES}=require(path.join(root,'dist-electron/shared/preferences.js'));
fs.writeFileSync(path.join(app.getPath('userData'),'preferences.json'),JSON.stringify({...DEFAULT_PREFERENCES,theme:{...DEFAULT_PREFERENCES.theme,mode:process.env.FISHMARK_MODE_THEME??'system'},autosave:{idleDelayMs:60000},document:{fontFamily:'Georgia',cjkFontFamily:'Microsoft YaHei',fontSize:18}}));
const file=path.join(output,process.env.FISHMARK_MODE_RELOAD_CHECK==='1'?'中文 空格 Note.MD':'fixture.md');const source='# F11 mode\n\n| 项目 | Notes |\n| --- | --- |\n| 中文测试 ABC | Second cell |\n| next | row |\n\nEnd.\n';fs.writeFileSync(file,source);const otherFile=path.join(output,'Other 中文.md');if(process.env.FISHMARK_MODE_RELOAD_CHECK==='1'){fs.writeFileSync(otherFile,'# Other document\n\nUntouched.\n');process.argv.push(otherFile);}process.argv.push(file.replaceAll('\\','/'));
require(path.join(root,'dist-electron/main/main.js'));
const result={checks:[],versions:process.versions,width:Number(process.env.FISHMARK_MODE_WIDTH??1200)};let win,done=false;
const topSpace=process.env.FISHMARK_MODE_TOP_SPACE_CHECK==='1';
const geometry=()=>js(`(()=>{const s=document.querySelector('.cm-scroller'),c=document.querySelector('.workspace-canvas'),l=document.querySelector('.cm-line');return{canvas:c?.getBoundingClientRect().toJSON(),line:l?.getBoundingClientRect().toJSON(),scrollTop:s?.scrollTop,scrollHeight:s?.scrollHeight,clientHeight:s?.clientHeight}})()`);
function stable(name,before,after){check(name,Math.abs(before.canvas.top-after.canvas.top)<0.2&&Math.abs(before.canvas.height-after.canvas.height)<0.2&&Math.abs(before.scrollTop-after.scrollTop)<0.2,{before,after});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const watchdog=setTimeout(()=>finish(Error('Probe timeout')),topSpace?90000:60000);
function finish(error){if(done)return;done=true;clearTimeout(watchdog);if(error)result.error=String(error.stack??error);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));app.exit(error?1:0);}
function check(name,pass,detail){result.checks.push({name,pass,detail});if(!pass)throw Error(name);}
async function waitFor(fn){for(let i=0;i<140;i++){if(await fn())return;await delay(100);}throw Error('Readiness timeout');}
const js=source=>win.webContents.executeJavaScript(source);
const state=()=>js(`(()=>{const cell=document.querySelector('[data-table-cell="1:0"]'),table=document.querySelector('.cm-table-widget-table');return {mode:document.querySelector('.app-shell')?.dataset.fishmarkShellMode,active:document.activeElement?.outerHTML.slice(0,300),cell:cell?.textContent,tableTop:table?.getBoundingClientRect().top,settings:!!document.querySelector('[aria-modal="true"]'),searchFocused:document.activeElement?.getAttribute('aria-label')==='Find text'}})()`);
async function key(keyCode,modifiers=[]){win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await delay(250);}
async function click(selector){const point=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+Math.min(r.width/2,35)),y:Math.round(r.y+Math.min(r.height/2,20))}})()`);for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});await delay(350);}
async function screenshot(name){fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{
 await waitFor(()=>win=BrowserWindow.getAllWindows()[0]);win.setSize(result.width,850);win.show();win.focus();await waitFor(async()=>!win.webContents.isLoading()&&await js(`!!document.querySelector('[data-table-cell="1:0"]')`));await delay(500);
 if(process.env.FISHMARK_MODE_NORMALIZED_OPEN==='1') { result.normalizedOpen=await js('window.fishmark.openWorkspaceFileFromPath('+JSON.stringify(file.replaceAll('\\','/'))+')'); await delay(600); result.normalizedSnapshot=await js('window.fishmark.getWorkspaceSnapshot()'); }
 result.fullscreenEvents=[];win.on('enter-full-screen',()=>result.fullscreenEvents.push('enter'));win.on('leave-full-screen',()=>result.fullscreenEvents.push('leave'));
 const menuItems=items=>items.flatMap(i=>[{label:i.label,role:i.role,accelerator:i.accelerator},...menuItems(i.submenu?.items??[])]);result.menu=menuItems(Menu.getApplicationMenu()?.items??[]);
 const before=await state();check('initial reading',before.mode==='reading',before);await screenshot('reading');
 await click('[data-table-cell="1:0"]');const clicked=await state();check('table click keeps reading and geometry',clicked.mode==='reading'&&Math.abs(clicked.tableTop-before.tableTop)<0.1,clicked);
 const firstInputGeometry=topSpace?await geometry():null;const cellBeforeInput=(await state()).cell;await win.webContents.insertText('初X');await waitFor(async()=>(await state()).mode==='editing');
 if(topSpace)stable('first table input preserves viewport',firstInputGeometry,await geometry());
 const cellAfterInput=(await state()).cell;check('table first input enters editing once without losing text',cellAfterInput.replace('初X','')===cellBeforeInput,await state());
 await key('z',['control']);check('native table undo survives automatic entry',(await state()).cell===cellBeforeInput);
 await key('y',['control']);check('native table redo survives automatic entry',(await state()).cell===cellAfterInput);
 await key('z',['control']);await key('F11');check('explicit return after automatic entry',(await state()).mode==='reading');
 await key('F11');check('native F11 exits reading',(await state()).mode==='editing');
 await key('F11',['isautorepeat']);check('native repeated F11 ignored',(await state()).mode==='editing');
 const edit=await state();await click('[data-table-cell="1:0"]');check('table click keeps editing and geometry',(await state()).mode==='editing'&&Math.abs((await state()).tableTop-edit.tableTop)<0.1);
 await key('Escape');check('Escape does not switch',(await state()).mode==='editing');
 for(let i=0;i<4;i++){const beforeToggle=topSpace?await geometry():null;await key('F11');if(topSpace)stable('F11 viewport '+i,beforeToggle,await geometry());check('repeated toggle '+i,(await state()).mode===(i%2===0?'reading':'editing'));}
 check('F11 does not fullscreen',!win.isFullScreen()&&result.fullscreenEvents.length===0,result.fullscreenEvents);await screenshot('editing');
 await key('f',['control']);await waitFor(async()=>(await state()).searchFocused);await key('F11');check('search focus survives entering reading',(await state()).mode==='reading'&&(await state()).searchFocused);
 await key('F11');check('search focus survives exiting reading',(await state()).mode==='editing'&&(await state()).searchFocused);await key('Escape');check('search Escape leaves mode',(await state()).mode==='editing');await delay(250);
 // Deliberately focus the settings entry, rather than editing content, to test its restore owner.
 await js('document.querySelector(".settings-entry").focus()');await click('.settings-entry');await waitFor(async()=>(await state()).settings);await key('F11');check('settings blocks F11',(await state()).mode==='editing');await key('Escape');await waitFor(async()=>!(await state()).settings);await delay(350);check('settings entry focus restored',(await js('document.activeElement===document.querySelector(".settings-entry")'))===true,await state());
 await click('[data-fishmark-command="toggle-reading-mode"]');check('visible entry enters reading',(await state()).mode==='reading');await click('[data-fishmark-command="toggle-reading-mode"]');check('visible entry exits reading',(await state()).mode==='editing');
 await click('[data-table-cell="1:0"]');const original=(await state()).cell;await win.webContents.insertText('X');await delay(150);const typed=(await state()).cell;await key('F11');await key('F11');await key('z',['control']);check('native undo survives mode toggles',(await state()).cell===original);await key('y',['control']);check('native redo survives mode toggles',(await state()).cell===typed);await key('s',['control']);await waitFor(()=>fs.readFileSync(file,'utf8').includes(typed));check('manual save uses current text',true);
 await click('[data-table-cell="1:0"]');await win.webContents.insertText('dirty');await waitFor(async()=>(await state()).cell?.includes('dirty'));await delay(1000);result.preExternal=await state();result.workspaceBeforeExternal=await js("window.fishmark.getWorkspaceSnapshot()");await js('window.__externalEvents=[];window.fishmark.onExternalMarkdownFileChanged(event=>window.__externalEvents.push(event));undefined');fs.writeFileSync(file,source.replace('中文测试 ABC','磁盘版本'));await waitFor(async()=>await js('!!document.querySelector(".external-file-conflict-button")'));
 if(topSpace){const conflictBefore=await geometry(),snapshotBefore=await js('window.fishmark.getWorkspaceSnapshot()');await key('F11');stable('conflict banner reading geometry',conflictBefore,await geometry());await key('F11');stable('conflict banner editing geometry',conflictBefore,await geometry());check('conflict mode changes preserve unsaved source',(await js('window.fishmark.getWorkspaceSnapshot()')).activeDocument.content===snapshotBefore.activeDocument.content);}
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
 await key('F11');check('new blank can return to reading',(await state()).mode==='reading');
 const blankGeometry=topSpace?await geometry():null;await win.webContents.insertText('First字');await waitFor(async()=>(await state()).mode==='editing');
 if(topSpace)stable('blank first character preserves viewport',blankGeometry,await geometry());
 const text=()=>js("window.fishmark.getWorkspaceSnapshot().then(s=>s.activeDocument.content)");
 await waitFor(async()=>(await text())==='First字');check('paragraph first insertion is exact',true);
 await key('z',['control']);await waitFor(async()=>(await text())==='');if(topSpace)stable('blank undo preserves viewport',blankGeometry,await geometry());check('paragraph undo survives automatic entry',true);
 await key('y',['control']);await waitFor(async()=>(await text())==='First字');check('paragraph redo survives automatic entry',true);
 await key('F11');await key('Left');check('arrow movement keeps reading',(await state()).mode==='reading');await key('Right');
 await key('Enter');await waitFor(async()=>(await state()).mode==='editing');check('Enter enters editing',(await text()).startsWith('First字'),await text());
 await key('F11');await key('Backspace');await waitFor(async()=>(await state()).mode==='editing');check('Backspace enters editing',(await text()).startsWith('First字'));
 await key('F11');await key('f',['control']);await waitFor(async()=>(await state()).searchFocused);await win.webContents.insertText('First');await delay(300);
 check('search input keeps reading and focus',(await state()).mode==='reading'&&(await state()).searchFocused);await key('Escape');await delay(250);
 await screenshot('user-input-entry');
 await click('.cm-content');await key('a',['control']);await win.webContents.insertText('# Title');await waitFor(async()=>(await text())==='# Title');await key('Home');
 check('full shell heading hides prefix at visible start',!!(await js("document.querySelector('.cm-inactive-heading-marker')")));
 await key('F11');const headingBefore=await js("document.querySelector('.cm-line').getBoundingClientRect().toJSON()");await key('Backspace');await waitFor(async()=>(await state()).mode==='editing');
 check('full shell first heading Backspace reveals without deleting',(await text())==='# Title'&&!!(await js("document.querySelector('.cm-active-heading-marker')")));
 const headingAfter=await js("document.querySelector('.cm-line').getBoundingClientRect().toJSON()");check('full shell heading reveal preserves line geometry',Math.abs(headingBefore.top-headingAfter.top)<0.2&&Math.abs(headingBefore.left-headingAfter.left)<0.2,{headingBefore,headingAfter});await screenshot('heading-revealed');
 await key('Backspace');await waitFor(async()=>(await text())==='#Title');check('full shell next Backspace deletes prefix source',true);await key('z',['control']);await waitFor(async()=>(await text())==='# Title');check('full shell heading undo restores exact source',true);
 await key('F11');check('full shell explicit reading hides heading prefix',(await state()).mode==='reading'&&!!(await js("document.querySelector('.cm-inactive-heading-marker')")));await screenshot('heading-reading');
 check('no fullscreen across all input',!win.isFullScreen()&&result.fullscreenEvents.length===0);
 if(topSpace){
  result.nativeIme='UNMEASURED';result.theme=await js('({...document.documentElement.dataset})');
  // Reach each visible tab control using real Tab navigation, then hide it while focused.
  for(const region of ['workspace-tab','workspace-tab-close']){
   if((await state()).mode==='reading')await key('F11');await js("document.querySelector('.app-rail button').focus()");let found=false;const trail=[];
   for(let i=0;i<24;i++){await key('Tab');const current=await js("document.activeElement?.dataset.fishmarkRegion");trail.push(current);if(current===region){found=true;break;}}
   check('native Tab reaches visible '+region,found,trail);const before=await js('window.fishmark.getWorkspaceSnapshot()');await key('F11');
   const hidden=await js("(()=>{const n=document.querySelector('.workspace-tab-strip');return{visibility:getComputedStyle(n).visibility,pointerEvents:getComputedStyle(n).pointerEvents,focused:n.contains(document.activeElement),height:n.getBoundingClientRect().height,dirty:!!n.querySelector('[data-dirty=true]'),active:document.activeElement?.outerHTML.slice(0,250)}})()");
   check('hidden '+region+' releases focus and retains space',hidden.visibility==='hidden'&&hidden.pointerEvents==='none'&&!hidden.focused&&hidden.height>0&&hidden.dirty,hidden);
   const identities=snapshot=>JSON.stringify(snapshot.tabs.map(({tabId,path,name})=>({tabId,path,name})));
   for(const input of ['Enter','Space']){const owner=await js("({hidden:!!document.activeElement?.closest('.workspace-tab-strip'),editor:!!document.activeElement?.closest('.cm-editor')})");check('hidden '+region+' has no focus before '+input,!owner.hidden,owner);await key(input);const after=await js('window.fishmark.getWorkspaceSnapshot()');check('hidden '+region+' cannot activate or close via '+input,before.activeTabId===after.activeTabId&&identities(before)===identities(after)&&await js("!document.activeElement?.closest('.workspace-tab-strip')"),{before,after});
    if(after.activeDocument.content!==before.activeDocument.content){check('input after hidden '+region+' belongs to editor '+input,owner.editor&&(await state()).mode==='editing',await state());await key('z',['control']);check('editor Undo after hidden '+region+' restores source '+input,(await text())===before.activeDocument.content,await text());}if((await state()).mode==='editing')await key('F11');
   }
   await click('[data-fishmark-region="'+region+'"]');const afterClick=await js('window.fishmark.getWorkspaceSnapshot()');check('pointer cannot activate hidden '+region,before.activeTabId===afterClick.activeTabId&&JSON.stringify(before.tabs.map(t=>t.tabId))===JSON.stringify(afterClick.tabs.map(t=>t.tabId)),afterClick);
   const tabTrail=[];for(let i=0;i<12;i++){await key('Tab');tabTrail.push(await js("({region:document.activeElement?.dataset.fishmarkRegion,hiddenTab:!!document.activeElement?.closest('.workspace-tab-strip')})"));}for(let i=0;i<12;i++){await key('Tab',['shift']);tabTrail.push(await js("({region:document.activeElement?.dataset.fishmarkRegion,hiddenTab:!!document.activeElement?.closest('.workspace-tab-strip')})"));}check('Tab and ShiftTab skip hidden '+region,tabTrail.every(t=>!t.hiddenTab),tabTrail);
  }
  check('mode button remains discoverable',await js("(()=>{const b=document.querySelector('[data-fishmark-command=toggle-reading-mode]');const r=b.getBoundingClientRect();return getComputedStyle(b).visibility==='visible'&&r.width>0&&r.height>0&&!!b.title})()"));
  const longFile=path.join(output,'long-scroll.md'),longSource=Array.from({length:100},(_,i)=>'Paragraph '+i+' 中文 scroll sample.').join('\n\n');fs.writeFileSync(longFile,longSource);const originalOpen=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[longFile]});try{await key('o',['control']);await waitFor(async()=>(await text())===longSource&&await js("document.querySelector('.cm-content')?.textContent.includes('Paragraph 0')"));}finally{dialog.showOpenDialog=originalOpen;}
  await click('.cm-content');await key('End',['control']);await js("document.querySelector('.cm-scroller').scrollTop=document.querySelector('.cm-scroller').scrollHeight");await delay(150);const end=await geometry();check('long document reaches real scroll end',end.scrollHeight>end.clientHeight&&Math.abs(end.scrollHeight-end.clientHeight-end.scrollTop)<2,end);
  for(let i=0;i<4;i++){const before=await geometry();await key('F11');stable('scroll end F11 '+i,before,await geometry());}await screenshot('scroll-end');
  await js("document.querySelector('.cm-scroller').scrollTop=(document.querySelector('.cm-scroller').scrollHeight-document.querySelector('.cm-scroller').clientHeight)/2");await delay(150);const middle=await geometry();check('long document has intermediate scroll position',middle.scrollTop>50&&middle.scrollTop<middle.scrollHeight-middle.clientHeight-50,middle);
  for(let i=0;i<4;i++){const before=await geometry();await key('F11');stable('scroll middle F11 '+i,before,await geometry());}await screenshot('scroll-middle');
  await key('f',['control']);await waitFor(async()=>(await state()).searchFocused);const searching=await geometry();for(let i=0;i<2;i++){await key('F11');stable('search F11 geometry '+i,searching,await geometry());check('search F11 retains focus '+i,(await state()).searchFocused);}await key('Escape');check('long document source remains exact',(await text())===longSource);await screenshot('final-reading-space');
 }
 result.windowBounds=win.getBounds();result.dpr=await js('devicePixelRatio');finish();
}).catch(async error=>{if(win&&!win.isDestroyed()){result.failureState=await state().catch(()=>null);result.failureSnapshot=await js('window.fishmark.getWorkspaceSnapshot()').catch(()=>null);result.externalEvents=await js('window.__externalEvents').catch(()=>null);await screenshot('failed').catch(()=>{});}finish(error);});
