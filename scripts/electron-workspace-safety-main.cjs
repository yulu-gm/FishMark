// Drive the real built main/preload/renderer, not a replacement test BrowserWindow.
// Only OS chooser/prompt responses are substituted. Editing is native input;
// open/save use the actual application menu channel and close uses BrowserWindow.close.
const assert = require("node:assert/strict");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { app, BrowserWindow, dialog } = require("electron");
const temporaryDirectory = process.env.FISHMARK_SAFETY_TEMP;
const reportPath = process.env.FISHMARK_SAFETY_REPORT;
if (!temporaryDirectory || !reportPath) throw new Error("The isolated smoke launcher is required.");
const targetPath = join(temporaryDirectory, "smoke.md");
mkdirSync(join(temporaryDirectory, "user-data"), { recursive: true });
app.setPath("userData", join(temporaryDirectory, "user-data"));
app.disableHardwareAcceleration();
delete process.env.VITE_DEV_SERVER_URL;
delete process.env.FISHMARK_START_MODE;
let allowQuit = false;
app.on("before-quit", (event) => { if (!allowQuit) event.preventDefault(); });
const promptResponses = [2, 0]; // Cancel, then Save.
const prompts = [];
dialog.showMessageBox = async (...args) => {
  const options = args.at(-1);
  assert.equal(options.title, "Unsaved Changes", `Unexpected native dialog: ${JSON.stringify(options)}`);
  assert.ok(promptResponses.length > 0, "Unexpected repeated close prompt");
  const response = promptResponses.shift();
  prompts.push(response);
  return { response, checkboxChecked: false };
};
dialog.showErrorBox = (title, message) => { throw new Error(`${title}: ${message}`); };
writeFileSync(targetPath, "Smoke", "utf8");
process.argv.push(targetPath);
require(resolve(__dirname, "../dist-electron/main/main.js"));

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
async function until(label, check) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(20);
  }
  throw new Error(`Timed out: ${label}`);
}

(async () => {
  await app.whenReady();
  const window = await until("real application window", () => BrowserWindow.getAllWindows()[0]);
  const evaluate = (source) => window.webContents.executeJavaScript(source, true);
  await until("editor ready", () => evaluate('!!document.querySelector(".cm-content[contenteditable=true]")'));
  assert.equal(await evaluate("typeof window.fishmarkTest"), "undefined", "Product smoke must not use the privileged test bridge");
  await evaluate("window.fishmark.updatePreferences({autosave:{idleDelayMs:60000},theme:{effectsMode:'off'}})");
  const snapshot = () => evaluate("window.fishmark.getWorkspaceSnapshot()");
  await until("startup document", async () => (await snapshot()).activeDocument?.content === "Smoke");
  const initialTab = (await snapshot()).activeTabId;
  await evaluate(`
    window.__smokeErrors = [];
    window.addEventListener('error', e => window.__smokeErrors.push({message:e.message,stack:e.error?.stack}));
    window.addEventListener('unhandledrejection', e => window.__smokeErrors.push({message:String(e.reason),stack:e.reason?.stack}));
  `);
  async function append(text) {
    window.focus();
    await evaluate('document.querySelector(".cm-content").focus()');
    const modifiers = process.platform === "darwin" ? ["meta"] : ["control"];
    const keyCode = process.platform === "darwin" ? "ArrowDown" : "End";
    window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await until("caret at document end", () => evaluate(`(() => {
      const s = document.getSelection();
      const line = document.querySelector('.cm-content .cm-line:last-child');
      return !!s && !!line && line.contains(s.anchorNode) && s.isCollapsed &&
        s.anchorOffset === s.anchorNode.textContent.length;
    })()`));
    await window.webContents.insertText(text);
  }
  let expected = "Smoke";
  for (const text of [" first-save", " second-save"]) {
    await append(text);
    expected += text;
    window.webContents.send("fishmark:app-menu-command", "save-markdown-file");
    await until("ordinary atomic save", async () => {
      if (readFileSync(targetPath, "utf8") !== expected) return false;
      const current = (await snapshot()).activeDocument;
      return current?.content === expected && !current.isDirty;
    });
  }
  await append(" pending-close");
  expected += " pending-close";
  window.close();
  await until("cancel prompt", () => prompts.length === 1);
  await until("editing re-enabled after cancel", () => evaluate('!!document.querySelector(".cm-content[contenteditable=true]")'));
  assert.equal(window.isDestroyed(), false);
  assert.equal((await snapshot()).activeTabId, initialTab);
  // Blur autosave may legitimately run after cancellation; only close is cancelled.
  await append(" after-cancel");
  expected += " after-cancel";
  window.close();
  await until("window closes after pending edit drain and Save", () => window.isDestroyed());
  assert.deepEqual(prompts, [2, 0]);
  assert.equal(readFileSync(targetPath, "utf8"), expected);
  writeFileSync(reportPath, JSON.stringify({
    verdict: "PASS",
    platform: process.platform,
    electron: process.versions.electron,
    checks: ["built-product-startup", "test-bridge-absent", "two-atomic-saves", "dirty-close-cancel", "edit-after-cancel", "pending-close-save", "disk-content-exact"],
    promptResponses: prompts,
    finalContent: expected
  }, null, 2) + "\n");
  allowQuit = true;
  app.quit();
})().catch(async (error) => {
  const window = BrowserWindow.getAllWindows()[0];
  const runtimeErrors = window && !window.webContents.isDestroyed()
    ? await window.webContents.executeJavaScript("window.__smokeErrors ?? []").catch(() => [])
    : [];
  console.error(error);
  writeFileSync(reportPath, JSON.stringify({ verdict: "FAIL", error: error.stack ?? String(error), runtimeErrors, promptResponses: prompts }, null, 2) + "\n");
  app.exit(1);
});
