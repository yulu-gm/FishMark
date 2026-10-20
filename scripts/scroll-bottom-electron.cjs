const {app,BrowserWindow}=require("electron");
const {mkdirSync,writeFileSync}=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const out=path.resolve(process.env.FISHMARK_SCROLL_OUT || ".artifacts/scroll-bottom");
mkdirSync(out,{recursive:true});
app.setPath("userData",path.join(out,"user-data"));
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-smooth-scrolling");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const snapshots=[];
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:760,height:600,show:false,webPreferences:{backgroundThrottling:false,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const js=source=>win.webContents.executeJavaScript(source);
  const dwell=async ms=>{for(let t=0;t<ms;t+=100){await win.webContents.capturePage();await pause(100);}};
  const sample=async name=>{
    const value=await js(`bottomProbe.sample(${JSON.stringify(name)})`);
    snapshots.push(value);
    writeFileSync(path.join(out,"result.json"),JSON.stringify(snapshots,null,2));
    console.log(JSON.stringify(value));
    await win.webContents.capturePage().then(image=>writeFileSync(path.join(out,name+".png"),image.toPNG()));
    assert.equal(value.unchanged,true,"scrolling must not change Markdown");
    return value;
  };
  const bottom=async name=>{
    const value=await sample(name);
    assert.ok(value.distance<=2&&value.endVisible&&value.endInViewport,`${name}: true end must remain visible at bottom`);
    return value;
  };
  const load=async()=>{await win.loadURL("http://127.0.0.1:5198/__scroll_probe");for(let i=0;i<100;i++){if(await js('typeof bottomProbe !== "undefined"'))break;await pause(20);}await pause(150);await dwell(100);};
  await load();

  if(process.env.FISHMARK_SCROLL_EDIT_ONLY !== "1") {
  const initial=await sample("cold-initial");
  async function drag(toBottom,name) {
    const g=await js("bottomProbe.geometry()");
    const x=Math.round(g.thumb.x+g.thumb.width/2),y=Math.round(g.thumb.y+g.thumb.height/2);
    const end=Math.round(toBottom?g.track.bottom-1:g.track.top+1);
    win.webContents.sendInputEvent({type:"mouseMove",x,y});
    win.webContents.sendInputEvent({type:"mouseDown",x,y,button:"left",clickCount:1});
    await pause(30);
    win.webContents.sendInputEvent({type:"mouseMove",x,y:end,modifiers:["leftButtonDown"]});
    await dwell(400);
    if(toBottom)await bottom(name+"-held");
    win.webContents.sendInputEvent({type:"mouseUp",x,y:end,button:"left",clickCount:1});
    await dwell(500);
    if(toBottom)await bottom(name+"-released");
    else assert.ok((await sample(name)).scrollTop<=2,"reverse drag must reach top");
  }
  await drag(true,"cold-drag");
  await dwell(5000);
  const settled=await bottom("cold-drag-settled");
  assert.ok(Math.abs(settled.lineHeight-initial.lineHeight)<1,"code must not change default prose metrics");
  for(let i=1;i<=3;i++){
    await drag(false,"repeat-"+i+"-top");
    await drag(true,"repeat-"+i+"-bottom");
    await dwell(1000);await bottom("repeat-"+i+"-settled");
  }
  await load();
  const wheel=async delta=>{
    win.webContents.sendInputEvent({type:"mouseWheel",x:300,y:250,deltaY:delta,deltaX:0,canScroll:true});
    await dwell(100);
  };
  let reached=false;
  for(let i=0;i<160;i++){
    await wheel(-1200);
    const s=await js('bottomProbe.sample("wheel-check")');
    if(s.distance<=2&&s.endVisible){reached=true;break;}
  }
  assert.ok(reached,"wheel must reach true end");
  await bottom("wheel-end");await dwell(5000);await bottom("wheel-settled");
  await wheel(600);
  assert.ok((await sample("reverse")).distance>100,"upward wheel must leave bottom");
  await js("bottomProbe.focus()");
  win.webContents.sendInputEvent({type:"keyDown",keyCode:"End",modifiers:["control"]});
  win.webContents.sendInputEvent({type:"keyUp",keyCode:"End",modifiers:["control"]});
  await dwell(1200);assert.ok((await sample("keyboard-end")).endVisible,"keyboard navigation must reveal document end"); await wheel(-1200);await bottom("before-height-change");
  await js("bottomProbe.grow()");await dwell(1200);
  await sample("height-change");
  for(let i=0;i<20;i++){await wheel(-1200);const s=await js('bottomProbe.sample("growth-check")');if(s.distance<=2&&s.endVisible)break;}
  await bottom("height-change-end");await dwell(5000);await bottom("height-change-settled");
  }
  // Editing checks use a new public synthetic fixture, never the private source.
  await load();
  const fixture=await js("bottomProbe.editSetup()");
  await dwell(600);
  const before=await js("bottomProbe.editSnapshot()");
  const position=fixture.indexOf("value");
  assert.equal(before.head,position);
  await win.webContents.insertText("new_");
  await dwell(200);
  const inserted=await js("bottomProbe.editSnapshot()");
  assert.equal(inserted.text,fixture.slice(0,position)+"new_"+fixture.slice(position));
  assert.equal(inserted.head,position+4);
  const key=async(keyCode,modifiers=[])=>{
    win.webContents.sendInputEvent({type:"keyDown",keyCode,modifiers});
    win.webContents.sendInputEvent({type:"keyUp",keyCode,modifiers});
    await dwell(100);
  };
  await key("Left");
  const moved=await js("bottomProbe.editSnapshot()");
  assert.equal(moved.head,position+3);assert.equal(moved.anchor,moved.head);
  await key("Right",["shift"]);await key("Right",["shift"]);
  const selected=await js("bottomProbe.editSnapshot()");
  assert.equal(selected.anchor,position+3);assert.equal(selected.head,position+5);
  await win.webContents.insertText("X");await dwell(200);
  const replaced=await js("bottomProbe.editSnapshot()");
  assert.equal(replaced.text,inserted.text.slice(0,position+3)+"X"+inserted.text.slice(position+5));
  assert.equal(replaced.head,position+4);
  await key("z",["control"]);
  const undone=await js("bottomProbe.editSnapshot()");
  assert.equal(undone.text,inserted.text);
  // Restore exactly, then compare active code-block pixels with baseline.
  await js("bottomProbe.editSetup()");await dwell(500);
  const restored=await js("bottomProbe.editSnapshot()");
  assert.equal(restored.text,fixture);
  const edit={passed:true,before,inserted,moved,selected,replaced,undone,restored};
  writeFileSync(path.join(out,"editing.json"),JSON.stringify(edit,null,2));
  writeFileSync(path.join(out,"code-appearance.png"),(await win.webContents.capturePage()).toPNG());
  await js("bottomProbe.editInactive()");await dwell(500);
  writeFileSync(path.join(out,"code-inactive.json"),JSON.stringify(await js("bottomProbe.editSnapshot()"),null,2));
  writeFileSync(path.join(out,"code-inactive.png"),(await win.webContents.capturePage()).toPNG());
  console.log("Code input, caret movement, selection replacement and undo: PASS");
  win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
