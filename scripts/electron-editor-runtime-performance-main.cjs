const { app, BrowserWindow, screen } = require("electron");
const { createHash } = require("node:crypto");
const { writeFileSync, mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { cpus, totalmem, platform, release } = require("node:os");
const { configurePaintableOffscreenTestApp, createPaintableOffscreenTestWindow } = require("./electron-test-window.cjs");
configurePaintableOffscreenTestApp(app);
let window;
function environment() {
  return {
    measuredAt: new Date().toISOString(), platform: platform(), release: release(),
    cpu: cpus()[0]?.model ?? "unknown", logicalCpus: cpus().length, memoryBytes: totalmem(),
    electron: process.versions.electron, chrome: process.versions.chrome,
    mode: "paintable-offscreen", rendererBuild: "vite-development-server",
    pid: process.pid, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"),
    display: screen.getPrimaryDisplay(), gpu: app.getGPUFeatureStatus()
  };
}
function persistReport(result, reportPath) {
  for (const fixture of result.fixtures ?? []) {
    if (typeof fixture.source !== "string") continue;
    const bytes = Buffer.from(fixture.source, "utf8");
    fixture.fixtureIdentity = {
      sha256: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length,
      logicalLines: fixture.source.split("\n").length, encoding: "utf-8",
      profile: "published heading/plain-paragraph generator; not the canonical mixed fixture"
    };
  }
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(result, null, 2), { flag: "wx" });
}
async function main() {
  const url = process.env.FISHMARK_RUNTIME_PERF_URL;
  const reportPath = process.env.FISHMARK_RUNTIME_PERF_REPORT;
  const userDataPath = process.env.FISHMARK_RUNTIME_PERF_USER_DATA;
  if (!url || !reportPath || !userDataPath) throw new Error("Runtime probe URL, fresh report and isolated userData required");
  const sessionDataPath = join(userDataPath, "session");
  mkdirSync(sessionDataPath, { recursive: true });
  app.setPath("appData", userDataPath);
  app.setPath("userData", userDataPath);
  app.setPath("sessionData", sessionDataPath);
  app.setAppLogsPath(join(userDataPath, "logs"));
  await app.whenReady();
  window = createPaintableOffscreenTestWindow(BrowserWindow);
  window.webContents.on("console-message", ({ message }) => {
    if (typeof message === "string" && message.startsWith("runtime-perf:")) process.stdout.write(`${message}\n`);
  });
  await window.loadURL(url);
  const result = await window.webContents.executeJavaScript("window.__runEditorRuntimePerformanceProbe()", true);
  result.environment = environment();
  persistReport(result, reportPath);
  process.stdout.write(`${JSON.stringify({ reportPath, fixtures: result.fixtures.map(({ source, raw, ...fixture }) => fixture) })}\n`);
  window.close();
  app.exit(result.fixtures.every((fixture) => fixture.sourcePreserved && fixture.emittedFrames === 30) ? 0 : 1);
}
main().catch(async (error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  try {
    const partial = window && !window.isDestroyed()
      ? await window.webContents.executeJavaScript("window.__editorRuntimePerformancePartial")
      : null;
    persistReport({ ...(partial ?? { fixtures: [] }), complete: false, error: String(error.stack ?? error),
      environment: app.isReady() ? environment() : null }, process.env.FISHMARK_RUNTIME_PERF_REPORT);
  } catch (reportError) { process.stderr.write(`Partial report unavailable: ${reportError.stack ?? reportError}\n`); }
  app.exit(1);
});
