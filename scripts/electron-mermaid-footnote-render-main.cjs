const { mkdir, writeFile } = require("node:fs/promises");
const { dirname } = require("node:path");

const { app, BrowserWindow } = require("electron");

async function main() {
  const url = process.env.FISHMARK_MERMAID_FOOTNOTE_RENDER_PROBE_URL;
  const screenshotPath = process.env.FISHMARK_MERMAID_FOOTNOTE_RENDER_SCREENSHOT;
  if (!url) {
    throw new Error("FISHMARK_MERMAID_FOOTNOTE_RENDER_PROBE_URL is required.");
  }
  if (!screenshotPath) {
    throw new Error("FISHMARK_MERMAID_FOOTNOTE_RENDER_SCREENSHOT is required.");
  }

  await app.whenReady();

  const window = new BrowserWindow({
    width: 1187,
    height: 792,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await window.loadURL(url);
  const result = await window.webContents.executeJavaScript(
    "window.__runFishmarkMermaidFootnoteRenderProbe()",
    true
  );
  const screenshot = await window.webContents.capturePage();

  await mkdir(dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, screenshot.toPNG());

  const output = {
    ...result,
    screenshotPath
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  window.close();
  app.exit(result.pass ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  app.exit(1);
});
