import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { createWorkspaceWindowClose, type KeyedOperationLease, type WorkspaceWindowCloseConfirmation } from "@fishmark/workspace-application";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceMutationCoordinator } from "../renderer/application/workspace-mutation-coordinator";
import { WorkspaceSaveScheduler } from "../renderer/application/workspace-save-scheduler";
import { createKeyedOperationCoordinator } from "../main/keyed-operation-coordinator";
import { openTestDocument } from "../main/workspace.test-helper";
import { createWorkspaceWindowCloseRequestBroker } from "../main/workspace-window-close-request-broker";
import { createWorkspaceWindowCloseConfirmationHandler } from "../main/workspace-window-close-confirmation-handler";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("window-1");
  const tabId = openTestDocument(workspace, "window-1", {
    fileIdentity: fileIdentity("file:c:/notes/close-save.md"), path: "C:/notes/close-save.md",
    name: "close-save.md", content: "exact draft", encoding: "utf-8"
  }).activeTabId!;
  const operations = createKeyedOperationCoordinator();
  const confirmation = () => ({ windowId: "window-1", checkpoints: [{
    tabId, expectedWindowId: "window-1", expectedRevision: workspace.getTabSession(tabId).revision
  }] });
  return { workspace, tabId, operations, confirmation };
}

describe("deferred window close lease", () => {
  it("lets an autosave at the renderer FIFO head finish before close takes its tab lease", async () => {
    const f = fixture(), queue = new WorkspaceMutationCoordinator();
    const saveEntered = deferred<void>(), releaseSave = deferred<void>(), requested = deferred<void>();
    const order: string[] = [];
    const scheduler = new WorkspaceSaveScheduler({
      getActiveDocument: () => ({ tabId: f.tabId, path: "C:/notes/close-save.md", name: "close-save.md",
        content: "exact draft", encoding: "utf-8", revision: 0, savedRevision: 0, isDirty: true, saveState: "idle" }),
      autosaveDelayMs: 60000, hasExternalFileConflict: () => false, showNotification: vi.fn(),
      runSaveTransaction: () => queue.enqueue(async () => {
        saveEntered.resolve(); await releaseSave.promise;
        await f.operations.runExclusive(f.tabId, async () => { order.push("saved:exact draft"); });
        return { kind: "committed", tabId: f.tabId, value: { status: "success", document: {
          path: "C:/notes/close-save.md", name: "close-save.md", content: "exact draft", encoding: "utf-8"
        } } };
      })
    });
    const saving = scheduler.runAutosave(); await saveEntered.promise;
    const application = createWorkspaceWindowClose({
      workspace: f.workspace, documentOperations: f.operations,
      requestWorkspaceWindowClose: (_owner, acquire) => {
        requested.resolve();
        return queue.enqueue(async () => {
          expect(await acquire()).not.toBeNull(); order.push("confirmed"); return f.confirmation();
        });
      }
    });
    const closing = application.requestWindowClose({ windowId: "window-1", ownerWindow: {} });
    await requested.promise; releaseSave.resolve();
    await saving; const held = await closing;
    expect(order).toEqual(["saved:exact draft", "confirmed"]); expect(held).not.toBeNull();
    const mutation = vi.fn(async () => undefined), waiting = f.operations.runExclusive(f.tabId, mutation);
    await Promise.resolve(); expect(mutation).not.toHaveBeenCalled();
    held!.release(); await waiting; scheduler.dispose();
  });

  it("memoizes acquisition and keeps the confirmed lease held until explicit release", async () => {
    const f = fixture(), acquireExclusive = vi.spyOn(f.operations, "acquireExclusive");
    const application = createWorkspaceWindowClose({ workspace: f.workspace, documentOperations: f.operations,
      requestWorkspaceWindowClose: async (_owner, acquire) => {
        const first = acquire(); expect(acquire()).toBe(first);
        expect(await first).not.toBeNull(); return f.confirmation();
      }
    });
    const held = await application.requestWindowClose({ windowId: "window-1", ownerWindow: {} });
    expect(acquireExclusive).toHaveBeenCalledTimes(1); expect(held).not.toBeNull(); held!.release();
  });

  it("releases a lease that arrives after the request was cancelled and refuses late acquisition", async () => {
    const f = fixture(), blocker = await f.operations.acquireExclusive([f.tabId]);
    let acquire!: () => Promise<KeyedOperationLease<string> | null>;
    let pending!: Promise<KeyedOperationLease<string> | null>;
    const application = createWorkspaceWindowClose({ workspace: f.workspace, documentOperations: f.operations,
      requestWorkspaceWindowClose: async (_owner, getLease) => { acquire = getLease; pending = acquire(); return null; }
    });
    await expect(application.requestWindowClose({ windowId: "window-1", ownerWindow: {} })).resolves.toBeNull();
    blocker.release(); await expect(pending).resolves.toBeNull(); await expect(acquire()).resolves.toBeNull();
    await expect(f.operations.runExclusive(f.tabId, async () => "released")).resolves.toBe("released");
  });

  it("fails closed if confirmation returns without acquiring the request lease", async () => {
    const f = fixture();
    const application = createWorkspaceWindowClose({ workspace: f.workspace, documentOperations: f.operations,
      requestWorkspaceWindowClose: async () => f.confirmation()
    });
    await expect(application.requestWindowClose({ windowId: "window-1", ownerWindow: {} })).resolves.toBeNull();
  });

  it("drains an aborted confirmation waiting for its lease, releases it, and accepts a later request", async () => {
    const f = fixture(), blocker = await f.operations.acquireExclusive([f.tabId]);
    const broker = createWorkspaceWindowCloseRequestBroker<WorkspaceWindowCloseConfirmation>({
      scheduleTimeout: () => vi.fn(), schedulePostConfirmationWatchdog: () => vi.fn()
    });
    let acquire!: () => Promise<KeyedOperationLease<string> | null>;
    let requestId = "";
    const application = createWorkspaceWindowClose({ workspace: f.workspace, documentOperations: f.operations,
      requestWorkspaceWindowClose: async (_owner, getLease) => {
        acquire = getLease;
        const handle = broker.request({ windowId: "window-1", bindAbort: () => vi.fn(),
          sendRequest: (id) => { requestId = id; } });
        try { return await handle.result; } finally { await handle.drained; }
      }
    });
    const attempted = deferred<void>();
    const confirm = createWorkspaceWindowCloseConfirmationHandler({ broker, closeWorkspace: {
      confirmWindowClose: async (input) => {
        if (!input.isActive()) return { status: "cancelled" };
        attempted.resolve();
        const lease = await acquire();
        if (lease === null || !input.isActive()) return { status: "cancelled" };
        return { status: "confirmed", confirmation: f.confirmation() };
      }
    } });
    let completed = false;
    const closing = application.requestWindowClose({ windowId: "window-1", ownerWindow: {} });
    void closing.then(() => { completed = true; });
    const staleIdentity = { windowId: "window-1", requestId };
    const confirming = confirm(staleIdentity); await attempted.promise;
    broker.abortWindow("window-1"); await Promise.resolve(); expect(completed).toBe(false);
    blocker.release(); await expect(confirming).resolves.toEqual({ status: "cancelled" });
    await expect(closing).resolves.toBeNull();
    await expect(f.operations.runExclusive(f.tabId, async () => "released")).resolves.toBe("released");
    const next = application.requestWindowClose({ windowId: "window-1", ownerWindow: {} });
    await expect(confirm(staleIdentity)).resolves.toEqual({ status: "cancelled" });
    const identity = { windowId: "window-1", requestId };
    await expect(confirm(identity)).resolves.toEqual({ status: "confirmed" });
    expect(broker.complete(identity.requestId, identity.windowId, true)).toBe(true);
    const held = await next; expect(held).not.toBeNull(); held!.release();
  });
});
