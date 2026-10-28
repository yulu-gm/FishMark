const { app, Menu, dialog, nativeTheme, ipcMain } = require("electron");
const { dirname, resolve } = require("node:path");
const { writeFileSync } = require("node:fs");

// 仅由隔离产品测试入口加载；使用生产 main/preload/renderer，不插桩解析器。
module.exports.install = function install(documentPath) {
  nativeTheme.themeSource = "light";
  let window;
  let profileStarted;
  let finishCold, failCold;
  const cold = new Promise((resolve, reject) => { finishCold = resolve; failCold = reject; });
  cold.catch(() => {});
  const samples = [];
  const timeline = [];
  const diagnosticPath = process.env.FISHMARK_E2E_OPEN_TIMELINE;
  if (diagnosticPath && process.env.FISHMARK_E2E_OPEN_PROFILE) throw new Error("Timeline and CPU profiling must run separately");
  const mark = (event, detail = {}) => timeline.push({ event, ms: performance.now() - started, ...detail });
  if (diagnosticPath) {
    // 诊断只包裹真实 handler，不修改参数、结果或授权，也不把记录写盘放入计时区间。
    const originalHandle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = (channel, listener) => originalHandle(channel, async (...args) => {
      const startMs = performance.now() - started;
      try { return await listener(...args); }
      finally { mark("ipc", { channel, startMs }); }
    });
    app.once("ready", () => mark("app-ready"));
  }
  async function measure(targetPath, started, kind) {
    await window.webContents.executeJavaScript(`(${async function (target) {
      const deadline = performance.now() + 20000;
      while (true) {
        const tab = document.querySelector('[data-fishmark-region="workspace-tab"][data-active="true"]');
        const content = document.querySelector('.cm-content[contenteditable="true"]');
        if (tab?.getAttribute("title") === target && content?.textContent.length) return;
        if (performance.now() > deadline) throw new Error("Editor DOM readiness timed out");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }.toString()})(${JSON.stringify(targetPath)})`);
    const domMs = performance.now() - started;
    const presentation = await window.webContents.executeJavaScript(`(${async function () {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const style = getComputedStyle(document.querySelector(".cm-content"));
      return { dpr: devicePixelRatio, width: innerWidth, height: innerHeight,
        fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight };
    }.toString()})()`);
    const sample = { kind, targetPath, domMs, readyMs: performance.now() - started, presentation };
    if (kind === "fresh-process" && diagnosticPath) {
      mark("editor-ready");
      writeFileSync(diagnosticPath, JSON.stringify(timeline, null, 2), { flag: "wx" });
      window.webContents.debugger.detach();
    }
    if (kind === "fresh-process" && profileStarted) {
      await profileStarted;
      const { profile } = await window.webContents.debugger.sendCommand("Profiler.stop");
      writeFileSync(process.env.FISHMARK_E2E_OPEN_PROFILE, JSON.stringify(profile), { flag: "wx" });
      const navigation = await window.webContents.executeJavaScript("JSON.stringify({ navigation: performance.getEntriesByType('navigation'), resources: performance.getEntriesByType('resource') })");
      writeFileSync(`${process.env.FISHMARK_E2E_OPEN_PROFILE}.navigation.json`, navigation, { flag: "wx" });
      window.webContents.debugger.detach();
    }
    samples.push(sample);
    return sample;
  }
  app.once("browser-window-created", (_event, created) => {
    window = created;
    if (diagnosticPath) {
      mark("window-created");
      for (const event of ["did-start-loading", "dom-ready", "did-finish-load"]) window.webContents.once(event, () => mark(event));
      window.webContents.debugger.attach("1.3");
      window.webContents.debugger.on("message", (_event, method, params) => {
        if (method === "Debugger.scriptParsed" && params.url.startsWith("file:")) mark("script-parsed", { url: params.url });
      });
      void window.webContents.debugger.sendCommand("Debugger.enable").catch(failCold);
    }
    window.setSize(1280, 900);
    if (process.env.FISHMARK_E2E_OPEN_PROFILE) {
      window.webContents.debugger.attach("1.3");
      profileStarted = window.webContents.debugger.sendCommand("Profiler.enable")
        .then(() => window.webContents.debugger.sendCommand("Profiler.start"));
      profileStarted.catch(failCold);
    }
    window.webContents.once("dom-ready", () => measure(documentPath, started, "fresh-process").then(finishCold, failCold));
  });
  const started = performance.now();
  return {
    cold, samples, mark,
    async open(targetPath) {
      if (dirname(resolve(targetPath)) !== dirname(resolve(documentPath))) throw new Error("Warm fixture must share the owned document directory");
      const item = Menu.getApplicationMenu()?.items.find(entry => entry.label === "File")?.submenu?.items.find(entry => entry.label === "Open...");
      if (!item?.click) throw new Error("Missing File > Open menu");
      const original = dialog.showOpenDialog;
      let selected = false;
      dialog.showOpenDialog = async () => { selected = true; return { canceled: false, filePaths: [targetPath] }; };
      try {
        const start = performance.now();
        item.click();
        const sample = await measure(targetPath, start, "warm-open");
        if (!selected) throw new Error("The real file chooser was not invoked");
        return sample;
      } finally { dialog.showOpenDialog = original; }
    }
  };
};
