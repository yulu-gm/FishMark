import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from "electron";
import { createIpcLifecycle, type IpcHandler } from "./ipc-lifecycle";
import { createIpcSenderAuthorization } from "./ipc-sender";
import { registerPreferencesHandlers } from "./register-preferences-handlers";
import { registerRecentFilesHandlers } from "./register-recent-files-handlers";
import { registerFontsHandlers } from "./register-fonts-handlers";
import { registerThemesHandlers } from "./register-themes-handlers";
import { registerUpdatesHandlers } from "./register-updates-handlers";
import { registerExportHandlers } from "./register-export-handlers";
import { registerClipboardHandlers } from "./register-clipboard-handlers";
import { registerExternalHandlers } from "./register-external-handlers";
import { registerTestHandlers } from "./register-test-handlers";
import type { PreloadBridgeMode } from "../../shared/preload-bridge-mode";

function fixture() {
  const handlers = new Map<string, IpcHandler>();
  const removeHandler = vi.fn((channel: string) => handlers.delete(channel));
  const ipc = createIpcLifecycle({
    handle(channel, handler) {
      if (handlers.has(channel)) throw new Error("Already registered");
      handlers.set(channel, handler);
    }, removeHandler
  });
  const frame = { url: "file:///app/index.html?mode=editor", detached: false };
  const sender = { isDestroyed: vi.fn(() => false), mainFrame: frame };
  const window = { isDestroyed: vi.fn(() => false), webContents: sender };
  const resolveWindow = vi.fn(() => window as unknown as BrowserWindow | null);
  let mode: PreloadBridgeMode = "product";
  const authorize = createIpcSenderAuthorization({
    resolveWindow,
    getWindowPolicy: () => ({ mode, entryUrl: "file:///app/index.html?mode=editor" })
  });
  const event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent;
  const effect = vi.fn(async () => undefined);
  const service = new Proxy({}, { get: () => effect });
  const common = { ipc, authorize, service };
  registerPreferencesHandlers({ ...common, selectTemporaryDirectory: effect } as unknown as Parameters<typeof registerPreferencesHandlers>[0]);
  registerRecentFilesHandlers(common as unknown as Parameters<typeof registerRecentFilesHandlers>[0]);
  registerFontsHandlers(common as unknown as Parameters<typeof registerFontsHandlers>[0]);
  registerThemesHandlers({ ...common, openDirectory: effect } as unknown as Parameters<typeof registerThemesHandlers>[0]);
  registerUpdatesHandlers({ ipc, authorize, checkForUpdates: effect });
  registerExportHandlers({ ipc, authorize, exportHtml: effect } as unknown as Parameters<typeof registerExportHandlers>[0]);
  registerClipboardHandlers({ ipc, authorize, importImage: effect } as unknown as Parameters<typeof registerClipboardHandlers>[0]);
  registerExternalHandlers({ ipc, authorize, openExternal: effect });
  const ownsSession = vi.fn(() => true);
  const testInput = {
    ipc, authorize, enabled: true,
    editorSessions: { ensureSession: effect, ownsSession, completeCommand: effect },
    runSessions: { startScenarioRun: effect, interruptScenarioRun: effect }
  } as unknown as Parameters<typeof registerTestHandlers>[0];
  registerTestHandlers(testInput);
  return { ipc, handlers, removeHandler, frame, sender, window, resolveWindow, event, effect,
    ownsSession, testInput, setMode: (next: PreloadBridgeMode) => { mode = next; },
    invoke: (channel: string, args: unknown[]) => Promise.resolve().then(() => handlers.get(channel)!(event, ...args)) };
}

const cases: { channel: string; args: unknown[]; mode?: PreloadBridgeMode }[] = [
  { channel: "get-preferences", args: [] },
  { channel: "update-preferences", args: [{ autosave: { idleDelayMs: 500 } }] },
  { channel: "select-temporary-image-directory", args: [] },
  { channel: "get-recent-files", args: [] },
  { channel: "clear-recent-file", args: [{ path: "/notes/a.md" }] },
  { channel: "list-font-families", args: [] },
  { channel: "list-theme-packages", args: [] },
  { channel: "refresh-theme-packages", args: [] },
  { channel: "open-themes-directory", args: [] },
  { channel: "check-for-app-updates", args: [] },
  { channel: "export-html-file", args: [{ tabId: "tab", currentPath: null, html: "<p>hello</p>" }] },
  { channel: "import-clipboard-image", args: [{ documentPath: null }] },
  { channel: "open-external-link", args: [{ href: "https://example.com" }] },
  { channel: "open-editor-test-window", args: [], mode: "test-workbench" },
  { channel: "start-scenario-run", args: [{ scenarioId: "scenario" }], mode: "test-workbench" },
  { channel: "interrupt-scenario-run", args: [{ runId: "run" }], mode: "test-workbench" },
  { channel: "complete-editor-test-command", args: [{ sessionId: "session", commandId: "command", result: { ok: true } }], mode: "editor-test" }
];

describe.each(cases)("$channel privileged boundary", ({ channel: suffix, args, mode }) => {
  const channel = `fishmark:${suffix}`;
  it("runs the service only for a live main-owned sender and valid request", async () => {
    const f = fixture(); f.setMode(mode ?? "product");
    await f.invoke(channel, args);
    expect(f.effect).toHaveBeenCalledOnce();
  });
  it.each(["destroyed", "foreign-window", "destroyed-window", "subframe", "detached-frame", "foreign-url"])("rejects %s before side effects", async (reason) => {
    const f = fixture(); f.setMode(mode ?? "product");
    if (reason === "destroyed") f.sender.isDestroyed.mockReturnValue(true);
    if (reason === "foreign-window") f.resolveWindow.mockReturnValue(null);
    if (reason === "destroyed-window") f.window.isDestroyed.mockReturnValue(true);
    if (reason === "subframe") f.sender.mainFrame = { ...f.frame };
    if (reason === "detached-frame") f.frame.detached = true;
    if (reason === "foreign-url") f.frame.url = "https://foreign.invalid";
    await expect(f.invoke(channel, args)).rejects.toThrow();
    expect(f.effect).not.toHaveBeenCalled();
  });
  it("rejects an unrecognized main-owned runtime even if the payload claims product", async () => {
    const f = fixture(); f.setMode("foreign" as PreloadBridgeMode);
    await expect(f.invoke(channel, args)).rejects.toThrow();
    expect(f.effect).not.toHaveBeenCalled();
  });
  it("rejects malformed requests", async () => {
    const f = fixture(); f.setMode(mode ?? "product");
    await expect(f.invoke(channel, [null])).rejects.toThrow("Invalid IPC request");
    expect(f.effect).not.toHaveBeenCalled();
  });
});

describe("registrar lifecycle and async authorization", () => {
  it("rejects duplicate registration without replacing the original and disposes only owned channels", () => {
    const f = fixture();
    const original = f.handlers.get("fishmark:get-preferences")!;
    expect(() => f.ipc.handle("fishmark:get-preferences", vi.fn())).toThrow("Duplicate");
    expect(f.handlers.get("fishmark:get-preferences")).toBe(original);
    f.ipc.dispose(); f.ipc.dispose();
    expect(f.removeHandler).toHaveBeenCalledTimes(cases.length);
    expect(f.handlers.size).toBe(0);
    expect(() => original(f.event)).toThrow("disposed");
    expect(() => f.ipc.handle("another", vi.fn())).toThrow("disposed");
  });
  it("does not claim or remove an externally registered channel on a failed install", () => {
    const f = fixture();
    f.handlers.set("external", vi.fn());
    expect(() => f.ipc.handle("external", vi.fn())).toThrow("Already registered");
    f.ipc.dispose();
    expect(f.handlers.has("external")).toBe(true);
  });
  it("rejects a response after the sender frame has changed during a service await", async () => {
    const f = fixture();
    f.effect.mockImplementation(async () => { f.sender.mainFrame = { ...f.frame }; });
    await expect(f.invoke("fishmark:get-preferences", [])).rejects.toThrow("Untrusted");
  });
  it("does not register tests in product mode", () => {
    const f = fixture(); f.ipc.dispose();
    const handle = vi.fn();
    registerTestHandlers({ ...f.testInput, ipc: { handle }, enabled: false });
    expect(handle).not.toHaveBeenCalled();
  });
  it("rejects product-window access to every test handler and cross-session completion", async () => {
    const f = fixture();
    for (const testCase of cases.filter((entry) => entry.mode)) {
      await expect(f.invoke(`fishmark:${testCase.channel}`, testCase.args)).rejects.toThrow();
    }
    f.setMode("editor-test"); f.ownsSession.mockReturnValue(false);
    await expect(f.invoke("fishmark:complete-editor-test-command", cases.at(-1)!.args)).rejects.toThrow("Foreign editor test session");
    expect(f.effect).not.toHaveBeenCalled();
  });
  it.each(["file:///secret", "javascript:alert(1)", "data:text/html,hello", "not a url"])("rejects unsafe external destination %s", async (href) => {
    const f = fixture();
    await expect(f.invoke("fishmark:open-external-link", [{ href }])).rejects.toThrow();
    expect(f.effect).not.toHaveBeenCalled();
  });
  it.each([{ autosave: null }, { ui: { fontSize: "huge" } }, { theme: { mode: "bad" } }, { theme: { parameters: { theme: { x: Infinity } } } }, { runtimeMode: "product" }])("rejects malformed preference patch %j", async (patch) => {
    const f = fixture();
    await expect(f.invoke("fishmark:update-preferences", [patch])).rejects.toThrow();
    expect(f.effect).not.toHaveBeenCalled();
  });
  it("rejects a different webContents owned by the same apparent window", () => {
    const f = fixture();
    const authorize = createIpcSenderAuthorization({
      resolveWindow: () => f.window as unknown as BrowserWindow,
      getWindowPolicy: () => ({ mode: "product", entryUrl: f.frame.url })
    });
    expect(() => authorize({ ...f.event, sender: { ...f.sender } as unknown as WebContents }, ["product"])).toThrow();
  });
});
