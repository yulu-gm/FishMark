const { app, BrowserWindow } = require("electron");
const {
  configurePaintableOffscreenTestApp,
  createPaintableOffscreenTestWindow
} = require("./electron-test-window.cjs");

configurePaintableOffscreenTestApp(app);

async function main() {
  const url = process.env.FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_URL;
  if (!url) {
    throw new Error("FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_URL is required.");
  }

  await app.whenReady();

  const window = createPaintableOffscreenTestWindow(BrowserWindow);

  await window.loadURL(url);
  const result = await window.webContents.executeJavaScript(
    "window.__runFishmarkMarkdownEditingExperienceProbe()",
    true
  );

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  window.close();
  app.exit(result.pass ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  app.exit(1);
});
