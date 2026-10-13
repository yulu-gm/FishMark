// Observability and isolation only. The real built main creates every window,
// registers every IPC handler, and executes the unchanged close protocol.
const { appendFileSync, mkdirSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");

const profile = process.env.FISHMARK_E2E_PROFILE;
const telemetryPath = process.env.FISHMARK_E2E_TELEMETRY;
const documentPath = process.env.FISHMARK_E2E_DOCUMENT;
const openDocument = process.env.FISHMARK_E2E_OPEN_DOCUMENT !== "0";
if (!profile || !telemetryPath || !documentPath) throw new Error("Use the isolated RF902 fixture to launch this helper.");
mkdirSync(profile, { recursive: true });
mkdirSync(dirname(telemetryPath), { recursive: true });
app.setPath("userData", profile);
delete process.env.VITE_DEV_SERVER_URL;
delete process.env.FISHMARK_START_MODE;

function record(event, detail) {
  appendFileSync(telemetryPath, `${JSON.stringify({ epochMs: Date.now(), event, detail })}\n`, "utf8");
}
const showErrorBox = dialog.showErrorBox.bind(dialog);
dialog.showErrorBox = (title, content) => {
  record("dialog:error-box", { pid: process.pid, title, content });
  const result = showErrorBox(title, content);
  record("dialog:error-box-returned", { pid: process.pid, title });
  return result;
};
const describe = (value) => value instanceof Error ? value.stack ?? value.message : String(value);
const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);
console.warn = (...args) => {
  record("console:warn", { messages: args.map(describe) });
  originalWarn(...args);
};
let currentWarningId = null;
let warningSequence = 0;
process.prependListener("warning", (warning) => {
  currentWarningId = ++warningSequence;
  record("process:warning", { warningId: currentWarningId, name: warning.name, code: warning.code, message: warning.message, stack: warning.stack });
});
console.error = (...args) => {
  const sourceStack = new Error().stack;
  // Node's native warning listener prints through console.error. Classify by
  // its internal caller, never by a warning message or known-failure allowlist.
  const directCaller = sourceStack.split("\n")[2] ?? "";
  const nativeWarningOutput = currentWarningId !== null && /^\s*at writeOut \(node:internal\/process\/warning:/.test(directCaller);
  record(nativeWarningOutput ? "process:warning-output" : "main:error", { warningId: nativeWarningOutput ? currentWarningId : null, messages: args.map(describe), sourceStack });
  originalError(...args);
};
process.on("warning", () => { currentWarningId = null; });
process.on("uncaughtExceptionMonitor", (error) => record("main:uncaughtException", describe(error)));
process.on("unhandledRejection", (error) => {
  record("main:unhandledRejection", describe(error));
  originalError(error);
  app.exit(1);
});
app.on("browser-window-created", (_event, window) => {
  const contents = window.webContents;
  record("window:created", { windowId: window.id, webContentsId: contents.id, preferences: contents.getLastWebPreferences() });
  for (const event of ["focus", "blur", "close", "closed"]) {
    window.on(event, () => record(`window:${event}`, { windowId: window.id }));
  }
  contents.on("console-message", (event) => record("renderer:console", {
    level: event.level, message: event.message, lineNumber: event.lineNumber, sourceId: event.sourceId
  }));
  contents.on("preload-error", (_event, preloadPath, error) => record("renderer:preload-error", { preloadPath, error: describe(error) }));
  contents.on("render-process-gone", (_event, detail) => record("renderer:process-gone", detail));
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => record("renderer:load-failed", { code, description, url, isMainFrame }));
  contents.on("before-input-event", (_event, input) => {
    if (input.key === "Escape") record("input:before", { windowId: window.id, webContentsId: contents.id, ...input });
  });
  const send = contents.send.bind(contents);
  contents.send = (channel, ...args) => {
    if (channel === "fishmark:app-menu-command") record("menu:command", args);
    return send(channel, ...args);
  };
});
const originalHandle = ipcMain.handle.bind(ipcMain);
// Opt-in runner controls hold one original handler boundary. They never return
// fabricated protocol results and are available only in this test main process.
let barrier = null;
globalThis.__rf902Control = {
  arm(input) {
    if (barrier) throw new Error("A response barrier is already armed.");
    barrier = { ...input, phase: "armed" };
  },
  read() { return barrier ? { kind: barrier.kind, phase: barrier.phase, detail: barrier.detail } : null; },
  release() {
    if (!barrier?.resume) throw new Error("No held response barrier.");
    barrier.resume();
  }
};
async function holdBoundary(kind, detail) {
  const current = barrier;
  if (!current || current.kind !== kind || !["armed", "held"].includes(current.phase)) return;
  if (kind === "edit-ack" && (detail.webContentsId !== current.webContentsId || detail.tabId !== current.tabId || detail.clientSequence !== current.clientSequence)) return;
  if (kind === "target-ready" && detail.webContentsId === current.sourceWebContentsId) return;
  if (current.phase === "held") {
    if (kind === "target-ready" && detail.webContentsId === current.detail.webContentsId) {
      record("barrier:joined", { kind, ...detail });
      await current.promise;
    }
    return;
  }
  current.phase = "held";
  current.detail = detail;
  record("barrier:held", { kind, ...detail });
  current.promise = new Promise((resolve) => { current.resume = resolve; });
  await current.promise;
  current.phase = "released";
  record("barrier:released", { kind, ...detail });
  barrier = null;
}
ipcMain.handle = (channel, listener) => {
  const prefix = channel === "fishmark:apply-document-edits" ? "edit"
    : channel === "fishmark:flush-document-edits" ? "flush"
      : channel === "fishmark:detach-workspace-tab-to-new-window" ? "detach"
        : channel === "fishmark:get-workspace-snapshot" ? "snapshot"
          : channel === "fishmark:sync-watched-markdown-file" ? "watch"
          : ["fishmark:save-markdown-file", "fishmark:save-markdown-file-as"].includes(channel) ? "save" : null;
  if (prefix === null) return originalHandle(channel, listener);
  return originalHandle(channel, async (...args) => {
    const detail = { channel, webContentsId: args[0].sender.id, tabId: args[1]?.tabId,
      ...(prefix === "edit" ? { clientId: args[1]?.clientId, clientSequence: args[1]?.clientSequence, baseRevision: args[1]?.baseRevision } : {}),
      ...(prefix === "flush" ? { clientId: args[1]?.clientId, throughSequence: args[1]?.throughSequence } : {}) };
    record(`${prefix}:start`, detail);
    try {
      if (["snapshot", "watch"].includes(prefix)) await holdBoundary("target-ready", detail);
      const result = await listener(...args);
      if (prefix === "edit") {
        record("edit:handled", { ...detail, result });
        await holdBoundary("edit-ack", detail);
      }
      record(`${prefix}:end`, { ...detail, status: result?.status,
        ...(prefix === "save" && result?.status === "error" ? { error: result.error } : {}),
        ...(["edit", "flush"].includes(prefix) ? { kind: result?.kind, acknowledgedSequence: result?.acknowledgedSequence, revision: result?.revision, isDirty: result?.isDirty } : {}),
        ...(prefix === "detach" ? { windowId: result?.windowId, tabs: result?.tabs } : {}) });
      return result;
    } catch (error) {
      record(`${prefix}:error`, { ...detail, error: describe(error) });
      throw error;
    }
  });
};
app.on("before-quit", () => record("app:before-quit"));
app.on("will-quit", () => record("app:will-quit"));
app.on("quit", (_event, exitCode) => record("app:quit", { exitCode }));
// A runner failure cannot leave this owned product instance alive indefinitely.
const watchdog = setTimeout(() => {
  record("main:watchdog", { timeoutMs: 90_000 });
  app.exit(124);
}, 90_000);
watchdog.unref();
if (openDocument) process.argv.push(documentPath);
record("launch", { pid: process.pid, argv: process.argv, profile, documentPath, openDocument, versions: process.versions });
require(resolve(__dirname, "../../dist-electron/main/main.js"));
