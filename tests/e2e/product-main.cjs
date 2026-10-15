// Observability and isolation only. The real built main creates every window,
// registers every IPC handler, and executes the unchanged close protocol.
const { appendFileSync, mkdirSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");

const profile = process.env.FISHMARK_E2E_PROFILE;
const telemetryPath = process.env.FISHMARK_E2E_TELEMETRY;
const documentPath = process.env.FISHMARK_E2E_DOCUMENT;
const stderrTeePath = process.env.FISHMARK_E2E_STDERR_TEE;
const openDocument = process.env.FISHMARK_E2E_OPEN_DOCUMENT !== "0";
if (!profile || !telemetryPath || !documentPath || !stderrTeePath) throw new Error("Use the isolated RF902 fixture to launch this helper.");
mkdirSync(profile, { recursive: true });
mkdirSync(dirname(telemetryPath), { recursive: true });
require("./product-stderr-tee.cjs").installStderrTee(process.stderr, stderrTeePath);
app.setPath("appData", dirname(profile));
app.setPath("userData", profile);
delete process.env.VITE_DEV_SERVER_URL;
delete process.env.FISHMARK_START_MODE;

function record(event, detail) {
  appendFileSync(telemetryPath, `${JSON.stringify({ epochMs: Date.now(), event, detail })}\n`, "utf8");
}
const nativePopup = Menu.prototype.popup;
Menu.prototype.popup = function (options) {
  record("context-menu:show", { windowId: options.window.id, items: this.items.map(item => ({ label: item.label, role: item.role, accelerator: item.accelerator, enabled: item.enabled })) });
  return nativePopup.call(this, options);
};
const showErrorBox = dialog.showErrorBox.bind(dialog);
const showMessageBox = dialog.showMessageBox.bind(dialog);
dialog.showMessageBox = async (...args) => {
  const options = args.at(-1);
  record("dialog:message-box", { pid: process.pid, options });
  const result = await showMessageBox(...args);
  record("dialog:message-box-returned", { pid: process.pid, options, result });
  return result;
};
dialog.showErrorBox = (title, content) => {
  record("dialog:error-box", { pid: process.pid, title, content });
  const result = showErrorBox(title, content);
  record("dialog:error-box-returned", { pid: process.pid, title });
  return result;
};
const describe = (value) => value instanceof Error ? value.stack ?? value.message : String(value);
const nativeMouseEvents = [];
let nativeMouseSequence = 0;
let nativeDropped = 0, nativeFlushScheduled = false, nativeStallSequence = 0;
const nativeStallEvents = [], nativeStalls = new Map();
function flushNativeEvidence() {
  nativeFlushScheduled = false;
  const events = nativeMouseEvents.splice(0), dropped = nativeDropped; nativeDropped = 0;
  if (events.length || dropped) record("native:input-batch", { fromSequence: events[0]?.sequence, throughSequence: events.at(-1)?.sequence, dropped, events });
  for (const detail of nativeStallEvents.splice(0)) record("native:stall", detail);
}
function scheduleNativeEvidence() {
  if (nativeFlushScheduled) return;
  nativeFlushScheduled = true;
  setImmediate(flushNativeEvidence);
}
function queueNativeStall(detail) {
  nativeStallEvents.push(detail);
  if (nativeStallEvents.length > 128) { nativeStallEvents.shift(); nativeDropped++; }
  scheduleNativeEvidence();
}
function cancelNativeStall(windowId) {
  const stall = nativeStalls.get(windowId);
  if (!stall) return;
  nativeStalls.delete(windowId); stall.contents.removeListener("before-mouse-event", stall.listener);
  record("native:stall", { id: stall.id, windowId, phase: "cancelled", epochMs: Date.now() });
}
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
  const windowId = window.id, webContentsId = contents.id;
  // Bounded in-memory input evidence; never perform I/O or native queries from
  // this native callback. Only fixture-owned product windows are observed.
  contents.on("before-mouse-event", (_event, input) => {
    nativeMouseEvents.push({ sequence: ++nativeMouseSequence, epochMs: Date.now(), windowId, webContentsId,
      type: input.type, button: input.button, x: input.x, y: input.y, globalX: input.globalX, globalY: input.globalY });
    if (nativeMouseEvents.length > 128) { nativeMouseEvents.shift(); nativeDropped++; }
    scheduleNativeEvidence();
  });
  record("window:created", { windowId: window.id, webContentsId: contents.id, preferences: contents.getLastWebPreferences() });
  for (const event of ["focus", "blur", "close", "closed"]) {
    window.on(event, () => { if (event === "closed") cancelNativeStall(windowId); record(`window:${event}`, { windowId }); });
  }
  contents.on("console-message", (event) => record("renderer:console", {
    webContentsId: contents.id, level: event.level, message: event.message, lineNumber: event.lineNumber, sourceId: event.sourceId
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
    if (channel === "fishmark:external-markdown-file-changed") record("external:changed", { webContentsId: contents.id, payload: args[0] });
    if (channel === "fishmark:request-workspace-tab-receipt") record("receipt:request", { webContentsId: contents.id, requestId: args[0].requestId, tabId: args[0].tabId, revision: args[0].document.revision, contentLength: args[0].document.content.length });
    if (channel === "fishmark:complete-workspace-tab-receipt") record("receipt:complete", { webContentsId: contents.id, ...args[0] });
    return send(channel, ...args);
  };
});
const originalHandle = ipcMain.handle.bind(ipcMain);
// Opt-in runner controls hold one original handler boundary. They never return
// fabricated protocol results and are available only in this test main process.
let barrier = null;
globalThis.__rf902Control = {
  armNativeReleaseStall(windowId, milliseconds) {
    if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > 400 || nativeStalls.has(windowId)) throw new Error("Invalid owned release stall");
    const window = BrowserWindow.fromId(windowId);
    if (!window) throw new Error("Missing owned stall window");
    const contents = window.webContents, id = ++nativeStallSequence;
    const listener = (_event, input) => {
      if (input.type !== "mouseUp" || input.button !== "left") return;
      contents.removeListener("before-mouse-event", listener); nativeStalls.delete(windowId);
      const started = performance.now();
      queueNativeStall({ id, windowId, phase: "fired", epochMs: Date.now() });
      while (performance.now() - started < milliseconds) { /* Bounded fault injection after production's release observer. */ }
      queueNativeStall({ id, windowId, phase: "finished", epochMs: Date.now(), durationMs: performance.now() - started });
    };
    nativeStalls.set(windowId, { id, contents, listener }); contents.on("before-mouse-event", listener);
    record("native:stall", { id, windowId, phase: "armed", milliseconds, epochMs: Date.now() });
    return id;
  },
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
  if (kind === "clipboard-response" && (detail.webContentsId !== current.webContentsId || detail.tabId !== current.tabId)) return;
  if (kind === "plain-text-response" && (detail.webContentsId !== current.webContentsId || detail.tabId !== current.tabId)) return;
  if (kind === "tab-receipt" && detail.webContentsId !== current.webContentsId) return;
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
    : channel === "fishmark:request-plain-text-paste" ? "plain-text"
    : channel === "fishmark:flush-document-edits" ? "flush"
      : channel === "fishmark:detach-workspace-tab-to-new-window" ? "detach"
      : channel === "fishmark:move-workspace-tab-to-window" ? "move"
      : channel === "fishmark:resolve-workspace-tab-drop" ? "drop"
      : channel === "fishmark:confirm-workspace-tab-receipt" ? "receipt"
        : channel === "fishmark:get-workspace-snapshot" ? "snapshot"
          : channel === "fishmark:sync-watched-markdown-file" ? "watch"
          : ["fishmark:close-workspace-tab", "fishmark:confirm-workspace-window-close", "fishmark:complete-workspace-window-close"].includes(channel) ? "close"
          : channel === "fishmark:resolve-external-change" ? "resolve"
          : ["fishmark:save-markdown-file", "fishmark:save-markdown-file-as"].includes(channel) ? "save"
            : ["fishmark:open-workspace-file-from-path", "fishmark:handle-dropped-markdown-file", "fishmark:import-clipboard-image", "fishmark:update-preferences"].includes(channel) ? "authority" : null;
  if (prefix === null) return originalHandle(channel, listener);
  return originalHandle(channel, async (...args) => {
    const detail = { channel, webContentsId: args[0].sender.id, tabId: args[1]?.tabId,
      ...(prefix === "edit" ? { clientId: args[1]?.clientId, clientSequence: args[1]?.clientSequence, baseRevision: args[1]?.baseRevision } : {}),
      ...(prefix === "flush" ? { clientId: args[1]?.clientId, throughSequence: args[1]?.throughSequence } : {}) };
    record(`${prefix}:start`, detail);
    try {
      if (["snapshot", "watch"].includes(prefix)) await holdBoundary("target-ready", detail);
      if (prefix === "receipt") await holdBoundary("tab-receipt", detail);
      const result = await listener(...args);
      if (prefix === "edit") {
        record("edit:handled", { ...detail, result });
        await holdBoundary("edit-ack", detail);
      }
      if (channel === "fishmark:import-clipboard-image") await holdBoundary("clipboard-response", detail);
      if (channel === "fishmark:request-plain-text-paste") await holdBoundary("plain-text-response", detail);
      record(`${prefix}:end`, { ...detail, status: result?.status,
        ...(["save", "close"].includes(prefix) && result?.status === "error" ? { error: result.error } : {}),
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
app.on("quit", (_event, exitCode) => { flushNativeEvidence(); record("app:quit", { exitCode }); });
// A runner failure cannot leave this owned product instance alive indefinitely.
const watchdog = setTimeout(() => {
  record("main:watchdog", { timeoutMs: 90_000 });
  app.exit(124);
}, 90_000);
watchdog.unref();
if (openDocument) process.argv.push(documentPath);
record("launch", { pid: process.pid, argv: process.argv, profile, documentPath, openDocument, versions: process.versions });
require(resolve(__dirname, "../../dist-electron/main/main.js"));
