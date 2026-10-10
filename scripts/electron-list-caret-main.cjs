const { app, BrowserWindow } = require("electron"), fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const out = path.resolve(process.argv[2]);
fs.mkdirSync(path.join(out, "userData/session"), { recursive: true });
app.setPath("appData", path.join(out, "userData"));
app.setPath("userData", path.join(out, "userData"));
app.setPath("sessionData", path.join(out, "userData/session"));
let win;
const result = { samples: [], complete: false }, delay = ms => new Promise(d => setTimeout(d, ms)), js = code => win.webContents.executeJavaScript(code, true);
async function sample(label) { const state = await js("window.__listCaret.snapshot()"), name = String(result.samples.length + 1).padStart(3, "0"); fs.writeFileSync(path.join(out, name + "-page.png"), (await win.webContents.capturePage()).toPNG()); const handle = win.getNativeWindowHandle().readBigUInt64LE().toString(); const screenPath = path.join(out, name + "-screen.png"); const captureScript = fs.readFileSync(path.resolve("scripts/capture-owned-list-caret.ps1"), "utf8"); const capture = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "& {" + captureScript + "} -OwnedHandle " + handle + " -OutputPath '" + screenPath.replaceAll("'", "''") + "'"], { windowsHide: true, encoding: "utf8", timeout: 10000 }); result.samples.push({ name, label, state, foreground: win.isFocused(), screenCapture: { exit: capture.status, stderr: capture.stderr, stdout: capture.stdout } }); console.log(JSON.stringify({ name, label, selection: state.selection, parent: state.domSelection.parentClass, range: state.domSelection.range, screenExit: capture.status })); }
async function key(keyCode, modifiers = []) { win.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers }); win.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers }); await delay(180); }
app.whenReady().then(async () => {
    win = new BrowserWindow({ width: 900, height: 810, x: 50, y: 50, show: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.show();
    win.focus();
    await win.loadURL(process.env.FISHMARK_LIST_CARET_URL);
    win.focus();
    await delay(400);
    await js("window.__listCaret.prepare('Paragraph control.',5)");
    await sample("paragraph positive control");
    result.environment = { platform: process.platform, arch: process.arch, versions: process.versions,
        display: require("electron").screen.getPrimaryDisplay(), userData: app.getPath("userData"),
        url: process.env.FISHMARK_LIST_CARET_URL, nativeInput: "webContents.sendInputEvent" };
    const labels = process.env.FISHMARK_LIST_CARET_URL.includes("extra=1")
        ? ["Wide space list", "Tab list", "Bold list"]
        : ["Plain list", "Ordered list", "Task list", "Nested list", "Quoted list", "Quoted nested"];
    for (const label of labels) {
        await js(`window.__listCaret.prepare(${JSON.stringify(label)},1)`);
        await key("Left");
        await sample(label + " body start ArrowLeft");
        await key("Home");
        await sample(label + " Home");
        await key("Left");
        await sample(label + " source padding reveal");
        await key("Right");
        await sample(label + " body start source collapse");
        await key("Right", ["shift"]);
        await key("Left");
        await sample(label + " selection collapse");
        const point = await js(`window.__listCaret.point(${JSON.stringify(label)})`);
        win.webContents.sendInputEvent({ type: "mouseDown", x: point.x + 1, y: point.y, button: "left", clickCount: 1 });
        win.webContents.sendInputEvent({ type: "mouseUp", x: point.x + 1, y: point.y, button: "left", clickCount: 1 });
        await delay(180);
        await sample(label + " native body-start click");
        await js("window.__listCaret.sourceMode(true)");
        await js(`window.__listCaret.prepare(${JSON.stringify(label)},1)`);
        await key("Home");
        await sample(label + " source mode Home");
        await js("window.__listCaret.sourceMode(false)");
    }
    await js("window.__listCaret.prepare('Plain list',0)");
    win.webContents.insertText("X");
    await delay(180);
    await sample("plain insert");
    await key("z", ["control"]);
    await sample("plain native undo");
    await key("y", ["control"]);
    await sample("plain native redo");
    await key("z", ["control"]);
    result.events = await js("window.__listCaret.events");
    result.complete = true;
    fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(result, null, 2));
    win.close();
    app.exit(0);
}).catch(error => { result.error = String(error.stack ?? error); fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(result, null, 2)); app.exit(1); });
