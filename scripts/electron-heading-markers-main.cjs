const {app,BrowserWindow,Menu}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(process.env.FISHMARK_HEADING_PROOF_OUTPUT);app.setPath('userData',path.join(output,'userData'));fs.mkdirSync(app.getPath('userData'),{recursive:true});
const result={versions:process.versions,checks:[],cases:[],kind:'existing-product-controller',nativeIme:'UNMEASURED'};let win,done=false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));const js=s=>win.webContents.executeJavaScript(s);
function finish(error){if(done)return;done=true;if(error)result.error=String(error.stack??error);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));app.exit(error?1:0);}
function check(name,pass,detail){result.checks.push({name,pass,detail});if(!pass)throw Error(name);}
async function key(keyCode,modifiers=[]){win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await delay(70);}
const sample=()=>js('proof.sample()');
async function setup(source,mode,offset){await js('proof.setup('+JSON.stringify(source)+','+JSON.stringify(mode)+');proof.controller.setSelection('+offset+');undefined');await delay(100);}
app.whenReady().then(async()=>{
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{role:'copy'},{role:'paste'}]}]));
 win=new BrowserWindow({width:1200,height:800,show:true,webPreferences:{contextIsolation:true,nodeIntegration:false}});await win.loadURL('http://127.0.0.1:5198/__heading-proof');win.show();win.focus();win.webContents.focus();
 for(let i=0;i<100;i++){if(await js('!!window.proof'))break;await delay(100);}
 const fixtures=[...Array.from({length:6},(_,i)=>({name:'h'+(i+1),prefix:'#'.repeat(i+1)+' ',title:'Title中文'})),{name:'empty',prefix:'###',title:''},{name:'empty-padding',prefix:'## ',title:''},{name:'quote',prefix:'> ## ',title:'Title中文'},{name:'list',prefix:'- ### ',title:'Title中文'}];
 for(const fixture of fixtures){
  const source=fixture.prefix+fixture.title+'\n\nTail';const end=fixture.prefix.length;
  await setup(source,'editing',end);const before=await sample();check(fixture.name+' hidden at visible start',before.hidden&&before.selection.head===end,before);
  await key('Left');const left=await sample();check(fixture.name+' Left enters prefix exactly',!left.hidden&&left.selection.head===end-1&&left.nativeSelection.head===end-1&&left.source===source,left);
  await key('Right');const right=await sample();check(fixture.name+' Right returns without history or selection jump',right.hidden&&right.selection.head===end&&right.nativeSelection.head===end&&right.undo===0,right);
  await setup(source,'editing',end);await key('Backspace');const reveal=await sample();check(fixture.name+' reveal preserves caret geometry',!!before.caret&&!!reveal.caret&&Math.abs(reveal.caret.left-before.caret.left)<0.2&&Math.abs(reveal.caret.top-before.caret.top)<0.2,{before,reveal});check(fixture.name+' first Backspace only reveals',!reveal.hidden&&reveal.selection.head===end&&reveal.nativeSelection.head===end&&reveal.source===source&&reveal.undo===0,reveal);
  await key('Backspace');const deleted=await sample();const expected=source.slice(0,end-1)+source.slice(end);check(fixture.name+' next Backspace edits explicit source',deleted.source===expected&&deleted.undo===1,deleted);
  await key('z',['control']);const undone=await sample();check(fixture.name+' Undo restores text once',undone.source===source&&undone.redo===1,undone);
  await key('y',['control']);const redone=await sample();check(fixture.name+' Redo restores explicit deletion',redone.source===expected,redone);
  await setup(source,'reading',end);await key('Backspace');const readingReveal=await sample();check(fixture.name+' reading Backspace enters editing without deleting',readingReveal.mode==='editing'&&!readingReveal.hidden&&readingReveal.source===source&&readingReveal.selection.head===end,readingReveal);
  await setup(source,'editing',end);await key('Backspace');fs.writeFileSync(path.join(output,fixture.name+'-revealed.png'),(await win.webContents.capturePage()).toPNG());
  result.cases.push({fixture,before,left,right,reveal,deleted,undone,redone,readingReveal,geometry:{leftCaretDelta:left.caret&&before.caret?left.caret.left-before.caret.left:null,revealCaretDelta:reveal.caret&&before.caret?reveal.caret.left-before.caret.left:null}});
 }
 await setup('# Title中文\n\nTail','editing',5);const middle=await sample();check('middle of heading stays hidden',middle.hidden,middle);await key('Home');const home=await sample();result.home=home;check('Home exposes a deterministic source position',home.selection.head===2&&home.hidden&&home.nativeSelection.head===2,home);
 await js('proof.controller.setSelection(1,14);undefined');await delay(80);check('selection across prefix remains visible',!(await sample()).hidden,await sample());await js('proof.controller.setSelection(14,1);undefined');await delay(80);check('reversed selection across prefix remains visible',!(await sample()).hidden,await sample());await js('proof.controller.setSelection(5);undefined');await delay(80);check('leaving prefix hides it with exact selection',(await sample()).hidden&&(await sample()).selection.head===5,await sample());
 await setup('#Title\n======','editing',1);check('Setext text is not an opening marker',!(await sample()).hidden,await sample());await key('Backspace');check('Setext Backspace deletes actual text',(await sample()).source==='Title\n======',await sample());
 win.setSize(550,800);await setup('###### Title中文\n\nTail','editing',7);await key('Backspace');const narrow=await sample();result.narrow=narrow;fs.writeFileSync(path.join(output,'narrow.png'),(await win.webContents.capturePage()).toPNG());
 check('narrow H6 marker remains inside scroller',narrow.marker.left>=narrow.scroller.left&&narrow.marker.right<=narrow.scroller.right,narrow);
 for(const prefix of ['######  ','######\t','######'+' '.repeat(40)]) {
  const source=prefix+'Title';await setup(source,'reading',prefix.length);const before=await sample();check('long prefix starts as visible source '+JSON.stringify(prefix),!before.hidden&&!before.marker,before);
  await key('Backspace');check('fallback Backspace deletes normally '+JSON.stringify(prefix),(await sample()).source===source.slice(0,prefix.length-1)+source.slice(prefix.length),await sample());
 }
 await setup('# Title','editing',2);await key('Left');await js("proof.controller.setHeadingPresentationMode('reading');proof.mode='reading';undefined");await delay(70);await key('Backspace');check('reading from a preserved prefix caret reveals before deletion',(await sample()).source==='# Title'&&(await sample()).selection.head===1&&!(await sample()).hidden,await sample());
 const layouts=[];for(const layout of [{width:550,zoom:1,rootSize:16},{width:900,zoom:1.25,rootSize:16},{width:900,zoom:1,rootSize:24}]) {
  win.setSize(layout.width,800);win.webContents.setZoomFactor(layout.zoom);await js('document.documentElement.style.fontSize='+JSON.stringify(layout.rootSize+'px'));
  for(const prefix of ['###### ','> ###### ','- ###### ','> - ###### ']) {
   const source=prefix+'Title中文\n\nTail';await setup(source,'editing',prefix.length);const before=await sample();await key('Backspace');const after=await sample();
   check('layout marker uncut '+JSON.stringify({layout,prefix}),after.marker.left>=after.scroller.left&&after.marker.right<=after.scroller.right,after);
   check('layout caret stable '+JSON.stringify({layout,prefix}),Math.abs(after.caret.left-before.caret.left)<0.2&&Math.abs(after.caret.top-before.caret.top)<0.2,{before,after});
   check('layout no horizontal overflow '+JSON.stringify({layout,prefix}),after.scroller.scrollWidth<=after.scroller.clientWidth,after.scroller);
   check('layout clear of container rail '+JSON.stringify({layout,prefix}),prefix.startsWith('#')||after.marker.left>=after.containerContentStart-0.2,after);
   check('layout clear of list markers '+JSON.stringify({layout,prefix}),after.listMarkers.every(r=>r.right<=after.marker.left||r.left>=after.marker.right||r.bottom<=after.marker.top||r.top>=after.marker.bottom),after);
   layouts.push({layout,prefix,before,after});fs.writeFileSync(path.join(output,'layout-'+layouts.length+'.png'),(await win.webContents.capturePage()).toPNG());
  }
 }
 result.layouts=layouts;win.setSize(1200,800);win.webContents.setZoomFactor(1);await js("document.documentElement.style.fontSize='16px'");
 await setup('# Title','editing',2);await key('Backspace');await key('Home');const exposedHome=await sample();check('Home reaches prefix when revealed',exposedHome.selection.head===0&&exposedHome.nativeSelection.head===0&&!exposedHome.hidden,exposedHome);
 await key('Right',['shift']);check('native selection crosses prefix',!(await sample()).hidden&&(await sample()).selection.anchor===0&&(await sample()).selection.head===1,await sample());
 await win.webContents.insertText('##');const edited=await sample();check('native replacement edits selected prefix',edited.source==='## Title',edited);await key('z',['control']);check('native undo restores prefix replacement',(await sample()).source==='# Title',await sample());
 await setup('# Title','editing',2);await js('proof.controller.setReadOnly(true);undefined');await key('Backspace');check('native read-only blocks reveal and deletion',(await sample()).source==='# Title'&&(await sample()).hidden&&(await sample()).events.length===0,await sample());
 await js("proof.controller.setReadOnly(false);proof.controller.setViewMode('source');proof.controller.focus();proof.controller.setSelection(2);undefined");await key('Backspace');check('native source deletes without reveal',(await sample()).source==='#Title'&&!(await sample()).marker,await sample());
 await setup('###### Title','editing',7);await key('Backspace');
 const positions=await js("(()=>{const view=EditorView.findFromDOM(document.querySelector('.cm-editor'));return Array.from({length:7},(_,i)=>({offset:i,rect:view.coordsAtPos(i)}));})()");
 for(const {offset,rect} of positions) {if(!rect)throw Error('missing prefix coordinates '+offset);win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:Math.round(rect.left),y:Math.round((rect.top+rect.bottom)/2)});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:Math.round(rect.left),y:Math.round((rect.top+rect.bottom)/2)});await delay(80);const hit=await sample();check('native mouse hit at heading prefix '+offset,hit.selection.head===offset&&hit.nativeSelection.head===offset,hit);}
 fs.writeFileSync(path.join(output,'matrix.png'),(await win.webContents.capturePage()).toPNG());result.dpr=await js('devicePixelRatio');finish();
}).catch(finish);
