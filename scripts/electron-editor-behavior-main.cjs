const { mkdirSync, renameSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");
const { app, BrowserWindow } = require("electron");
const {
  configurePaintableOffscreenTestApp,
  createPaintableOffscreenTestWindow
} = require("./electron-test-window.cjs");

const DEFAULT_HARD_TIMEOUT_MS = 180_000;

configurePaintableOffscreenTestApp(app);

function writeReportAtomically(reportPath, report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, reportPath);
}

async function main() {
  const url = process.env.FISHMARK_EDITOR_BEHAVIOR_PROBE_URL;
  const reportPath = process.env.FISHMARK_EDITOR_BEHAVIOR_REPORT_PATH;
  if (!url || !reportPath) {
    throw new Error(
      "FISHMARK_EDITOR_BEHAVIOR_PROBE_URL and FISHMARK_EDITOR_BEHAVIOR_REPORT_PATH are required."
    );
  }
  const hardTimeoutMs = Number(
    process.env.FISHMARK_EDITOR_BEHAVIOR_HARD_TIMEOUT_MS ?? DEFAULT_HARD_TIMEOUT_MS
  );

  await app.whenReady();
  const window = createPaintableOffscreenTestWindow(BrowserWindow);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const watchdog = setTimeout(() => {
    process.stderr.write(
      `Electron editor behavior run exceeded hard limit ${hardTimeoutMs}ms.\n`
    );
    window.destroy();
    app.exit(2);
  }, hardTimeoutMs);

  try {
    await window.loadURL(url);
    const report = await window.webContents.executeJavaScript(
      "window.__runFishmarkEditorBehaviorManifest()",
      true
    );
    const windowCount = BrowserWindow.getAllWindows().length;
    if (windowCount !== 1 || report.execution.windowCount !== windowCount) {
      throw new Error(
        `Editor behavior runner requires exactly one BrowserWindow; observed ${windowCount}.`
      );
    }
    writeReportAtomically(reportPath, report);
    const counts = report.comparison.counts;
    process.stdout.write(
      [
        `editor-behavior ${report.pass ? "passed" : "failed"}`,
        `cases=${report.execution.completedCases}/${report.execution.selectedCases}`,
        `targets=${report.comparison.verdicts.length}`,
        `verified-existing=${counts["verified-existing"]}`,
        `verified-runner=${counts["verified-runner"]}`,
        `known-defect=${counts["known-defect-observed"]}`,
        `unexpected=${counts["unexpected-mismatch"]}`,
        `not-run=${counts["not-run"]}`,
        `duration=${report.timing.durationMs}ms`
      ].join(" ") + "\n"
    );
    window.close();
    app.exit(report.pass ? 0 : 1);
  } finally {
    clearTimeout(watchdog);
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
  );
  app.exit(1);
});
