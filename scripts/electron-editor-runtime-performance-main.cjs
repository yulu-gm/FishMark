const { app, BrowserWindow } = require("electron");
const { writeFileSync, mkdirSync } = require("node:fs");
const { dirname } = require("node:path");
const { cpus, totalmem, platform, release } = require("node:os");
const { configurePaintableOffscreenTestApp, createPaintableOffscreenTestWindow } = require("./electron-test-window.cjs");
configurePaintableOffscreenTestApp(app);
async function main() {
  const url = process.env.FISHMARK_RUNTIME_PERF_URL;
  const reportPath = process.env.FISHMARK_RUNTIME_PERF_REPORT;
  if (!url || !reportPath) throw new Error("Runtime probe URL and report path required");
  await app.whenReady();
  const window = createPaintableOffscreenTestWindow(BrowserWindow);
  window.webContents.on("console-message", ({ message }) => {
    if (typeof message === "string" && message.startsWith("runtime-perf:")) process.stdout.write(`${message}\n`);
  });
  await window.loadURL(url);
  const result = await window.webContents.executeJavaScript("window.__runEditorRuntimePerformanceProbe()", true);
  result.environment = {
    measuredAt: new Date().toISOString(), platform: platform(), release: release(),
    cpu: cpus()[0]?.model ?? "unknown", logicalCpus: cpus().length, memoryBytes: totalmem(),
    electron: process.versions.electron, chrome: process.versions.chrome,
    mode: "paintable-offscreen"
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  window.close();
  app.exit(result.fixtures.every((fixture) => fixture.sourcePreserved && fixture.emittedFrames === 30) ? 0 : 1);
}
main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); app.exit(1); });
