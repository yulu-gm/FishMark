const { app, Menu, dialog, nativeTheme } = require("electron");
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
    cold, samples,
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
