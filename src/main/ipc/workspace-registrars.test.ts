import { describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent, BrowserWindow } from "electron";
import { createApplyDocumentEdits, createFlushDocumentEdits } from "@fishmark/workspace-application";
import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { createKeyedOperationCoordinator } from "../keyed-operation-coordinator";
import { createIpcLifecycle, type IpcHandler } from "./ipc-lifecycle";
import { createIpcSenderAuthorization } from "./ipc-sender";
import { registerWorkspaceEditHandlers } from "./register-workspace-edit-handlers";
import { registerWorkspaceCommandHandlers } from "./register-workspace-command-handlers";

function boundary() {
  const handlers = new Map<string, IpcHandler>();
  const ipc = createIpcLifecycle({ handle: (channel, fn) => { handlers.set(channel, fn); }, removeHandler: (channel) => { handlers.delete(channel); } });
  const frame = { url: "file:///app/index.html", detached: false };
  const sender = { mainFrame: frame, isDestroyed: vi.fn(() => false), send: vi.fn() };
  const owner = { webContents: sender, isDestroyed: () => false };
  let mode = "product";
  const authorize = createIpcSenderAuthorization({
    resolveWindow: () => owner as unknown as BrowserWindow,
    getWindowPolicy: () => ({ mode: mode as "product", entryUrl: frame.url })
  });
  const event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent;
  return { ipc, handlers, frame, sender, authorize, event, setMode: (value: string) => { mode = value; },
    invoke: (channel: string, args: unknown[]) => Promise.resolve().then(() => handlers.get(`fishmark:${channel}`)!(event, ...args)) };
}
const commandRequests: [string, unknown[]][] = [
  ["get-workspace-snapshot", []], ["resolve-external-change", [{ tabId: "tab", command: "cancel" }]],
  ["confirm-workspace-owner-tab-activation", [{ requestId: "request", tabId: "tab", success: true }]],
  ["confirm-workspace-window-close", [{ requestId: "request" }]],
  ["complete-workspace-window-close", [{ requestId: "request", shouldClose: false }]],
  ["create-workspace-tab", [{ kind: "untitled" }]], ["open-workspace-file", []],
  ["open-workspace-file-from-path", [{ targetPath: "/notes/a.md" }]],
  ["reload-workspace-tab-from-path", [{ tabId: "tab" }]], ["activate-workspace-tab", [{ tabId: "tab" }]],
  ["close-workspace-tab", [{ tabId: "tab" }]], ["reorder-workspace-tab", [{ tabId: "tab", toIndex: 0 }]],
  ["move-workspace-tab-to-window", [{ tabId: "tab", targetWindowId: "target" }]],
  ["resolve-workspace-tab-drop", [{ tabId: "tab" }]],
  ["confirm-workspace-tab-receipt", [{ requestId: "receipt", tabId: "tab", success: true }]],
  ["detach-workspace-tab-to-new-window", [{ tabId: "tab" }]],
  ["handle-dropped-markdown-file", [{ targetPaths: ["/notes/a.md"] }]],
  ["save-markdown-file", [{ tabId: "tab" }]], ["save-markdown-file-as", [{ tabId: "tab" }]],
  ["sync-watched-markdown-file", []]
];
function commands() {
  const f = boundary();
  const projection = { windowId: "owner", activeTabId: null, tabs: [], activeDocument: null };
  const effect = vi.fn(async () => ({ kind: "success", projection }));
  const service = new Proxy({}, { get: () => effect });
  const ensureWindow = vi.fn(async () => "owner");
  const requireOpenPath = vi.fn();
  registerWorkspaceCommandHandlers({ ...f, ensureWindow, requireOpenPath, workspaceApplication: service, workspaceState: service,
    documentRepository: service, resolveExternalChange: service,
    workspaceOwnerTabActivationRequestBroker: service, workspaceWindowCloseRequestBroker: service,
    handleWorkspaceWindowCloseConfirmation: effect
  } as unknown as Parameters<typeof registerWorkspaceCommandHandlers>[0]);
  return { ...f, effect, ensureWindow, requireOpenPath };
}

describe.each(commandRequests)("workspace %s boundary", (channel, args) => {
  it("rejects malformed transport before touching workspace registration or services", async () => {
    const f = commands();
    await expect(f.invoke(channel, [null])).rejects.toThrow("Invalid IPC request");
    expect(f.ensureWindow).not.toHaveBeenCalled(); expect(f.effect).not.toHaveBeenCalled();
  });
  it("rejects non-editor runtime and destroyed senders before touching services", async () => {
    const f = commands(); f.setMode("test-workbench");
    await expect(f.invoke(channel, args)).rejects.toThrow("not permitted");
    f.setMode("product"); f.sender.isDestroyed.mockReturnValue(true);
    await expect(f.invoke(channel, args)).rejects.toThrow("Untrusted");
    expect(f.ensureWindow).not.toHaveBeenCalled(); expect(f.effect).not.toHaveBeenCalled();
  });
});

describe("external reload result mapping", () => {
  it.each([
    { kind: "success", projection: { windowId: "owner", activeTabId: null, tabs: [], activeDocument: null } },
    { kind: "error", error: { code: "read-failed", message: "Read failed." } },
    { kind: "watch-error", error: { message: "Watch failed." } },
    { kind: "revision-stale" },
    { kind: "stale", reason: "window-changed", projection: null }
  ])("only maps a successful reload as resolved: $kind", async outcome => {
    const f = boundary();
    const service = new Proxy({}, { get: () => vi.fn() });
    registerWorkspaceCommandHandlers({ ...f, ensureWindow: async () => "owner", requireOpenPath: vi.fn(),
      workspaceApplication: service, workspaceState: { getTabSession: () => ({ windowId: "owner" }) },
      documentRepository: service, resolveExternalChange: { resolve: async () => ({ kind: "reloaded", outcome }) },
      workspaceOwnerTabActivationRequestBroker: service, workspaceWindowCloseRequestBroker: service,
      handleWorkspaceWindowCloseConfirmation: vi.fn()
    } as unknown as Parameters<typeof registerWorkspaceCommandHandlers>[0]);
    const result = await f.invoke("resolve-external-change", [{ tabId: "tab", command: "reload" }]);
    expect(result).toMatchObject({ kind: outcome.kind === "success" ? "resolved" : "error" });
    if ("error" in outcome) expect(result).toEqual({ kind: "error", message: outcome.error!.message });
  });
});

describe("workspace authorization after awaits", () => {
  it.each(["open-workspace-file-from-path", "handle-dropped-markdown-file"])("rejects unknown %s authority before window registration or workspace I/O", async (channel) => {
    const f = commands();
    f.requireOpenPath.mockImplementation(() => { throw new Error("Path authority denied."); });
    await expect(f.invoke(channel, [channel === "handle-dropped-markdown-file" ? { targetPaths: ["/untrusted/a.md"] } : { targetPath: "/untrusted/a.md" }])).rejects.toThrow("Path authority denied");
    expect(f.ensureWindow).not.toHaveBeenCalled(); expect(f.effect).not.toHaveBeenCalled();
  });
  it("revalidates after window readiness before invoking the command", async () => {
    const f = commands();
    f.ensureWindow.mockImplementation(async () => { f.sender.isDestroyed.mockReturnValue(true); return "owner"; });
    await expect(f.invoke("create-workspace-tab", [{ kind: "untitled" }])).rejects.toThrow("Untrusted");
    expect(f.effect).not.toHaveBeenCalled();
  });
  it("allows the authorized native-close completion to destroy its sender", async () => {
    const f = commands();
    f.effect.mockImplementation(async () => {
      f.sender.isDestroyed.mockReturnValue(true);
      return { kind: "success", projection: { windowId: "owner", activeTabId: null, tabs: [], activeDocument: null } };
    });
    await expect(f.invoke("complete-workspace-window-close", [{ requestId: "request", shouldClose: true }])).resolves.toBeUndefined();
    expect(f.effect).toHaveBeenCalledWith("request", "owner", true);
  });
  it("derives the actual window identity regardless of extra caller ownership claims", async () => {
    const f = commands();
    await f.invoke("create-workspace-tab", [{ kind: "untitled", windowId: "foreign", runtimeMode: "test-workbench" }]);
    expect(f.effect).toHaveBeenCalledWith({ context: f.event.sender, windowId: "owner", kind: "untitled" });
  });
  it.each(["apply-document-edits", "flush-document-edits"])("preserves queued authorization for %s across main-frame changes", async (channel) => {
    const f = boundary();
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("owner");
    const tabId = workspace.createUntitledTab("owner").activeTabId!;
    const documentOperations = createKeyedOperationCoordinator<string>();
    const edits = createApplyDocumentEdits({ workspace, documentOperations });
    const flush = createFlushDocumentEdits({ workspace, documentOperations });
    registerWorkspaceEditHandlers({ ipc: f.ipc, authorize: f.authorize, ensureWindow: async () => "owner",
      getWindowId: () => "owner", application: { applyDocumentEdits: edits.apply, flushDocumentEdits: flush.flush } });
    const held = await documentOperations.acquireExclusive([tabId]);
    const args = channel === "apply-document-edits"
      ? { tabId, clientId: "client-a", clientSequence: 1, baseRevision: 0, changes: [{ from: 0, to: 0, insert: "must not commit" }] }
      : { tabId, clientId: "client-a", throughSequence: 0 };
    const pending = f.invoke(channel, [args]);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    f.sender.mainFrame = { ...f.frame };
    held.release();
    await expect(pending).rejects.toThrow("no longer current");
    expect(workspace.getTabSession(tabId).content).toBe("");
    expect(f.sender.send).not.toHaveBeenCalled();
  });
});
