import type { WorkspaceState } from "@fishmark/workspace-domain";
import type { WorkspaceMoveCommandResult, WorkspaceTabTransferInput } from "@fishmark/workspace-application";
import type { WorkspaceTabReceiptRequest, WorkspaceTabReceiptComplete } from "../shared/workspace-tab-transfer";
import { createWorkspaceOwnerTabActivationRequestBroker } from "./workspace-owner-tab-activation-request-broker";

export function createWorkspaceTabReceipts(input: {
  workspace: Pick<WorkspaceState, "getTabSession" | "getWindowProjection">;
  send: (windowId: string, request: WorkspaceTabReceiptRequest) => void;
  complete: (windowId: string, result: WorkspaceTabReceiptComplete) => void;
  bindAbort: (windowId: string, listener: () => void) => () => void;
  schedule?: (listener: () => void) => () => void;
  now?: () => number;
}) {
  const schedule = input.schedule ?? ((listener) => {
    const timer = setTimeout(listener, 15_000);
    return () => clearTimeout(timer);
  });
  const broker = createWorkspaceOwnerTabActivationRequestBroker({ scheduleTimeout: schedule });
  const pending = new Map<string, { sourceWindowId: string; targetWindowId: string; abort: () => void }>();
  return {
    confirm: broker.complete,
    abortWindow(windowId: string) {
      for (const request of pending.values()) {
        if (request.sourceWindowId === windowId || request.targetWindowId === windowId) request.abort();
      }
    },
    async move(request: {
      tabId: string; sourceWindowId: string; targetWindowId: string; targetIndex?: number;
      point?: Readonly<{ x: number; y: number }>;
      check: () => void;
    }, commit: (input: WorkspaceTabTransferInput) => Promise<WorkspaceMoveCommandResult>): Promise<WorkspaceMoveCommandResult> {
      request.check();
      if (request.sourceWindowId === request.targetWindowId || pending.has(request.tabId) ||
          [...pending.values()].some(entry => entry.targetWindowId === request.targetWindowId)) {
        throw new Error("A tab transfer is already pending or has the same source and target.");
      }
      const document = input.workspace.getTabSession(request.tabId);
      if (document.windowId !== request.sourceWindowId) throw new Error("The tab moved to another window.");
      const target = input.workspace.getWindowProjection(request.targetWindowId);
      if (target.tabs.some(tab => tab.tabId === document.tabId || (document.path !== null && tab.path === document.path))) {
        throw new Error("That document is already open in the target window.");
      }
      let active = true, committed = false;
      let cancelWait!: (error: Error) => void;
      const cancelled = new Promise<never>((_resolve, reject) => { cancelWait = reject; });
      // Cancellation can precede the first await (e.g. a destroyed renderer).
      void cancelled.catch(() => {});
      const abort = () => {
        if (!active) return;
        active = false;
        try { committed ||= input.workspace.getTabSession(request.tabId).windowId === request.targetWindowId; } catch { /* Closed windows may have unregistered. */ }
        broker.abortWindow(request.targetWindowId);
        if (!committed) cancelWait(new Error("The target did not receive the tab before the transfer was cancelled."));
      };
      pending.set(request.tabId, { ...request, abort });
      const disposers: (() => void)[] = [];
      let requestId: string | null = null;
      try {
        disposers.push(schedule(abort)); // Absolute deadline also covers waiting for the document lease after ACK.
        disposers.push(input.bindAbort(request.sourceWindowId, abort));
        disposers.push(input.bindAbort(request.targetWindowId, abort));
        if (!active) throw new Error("The transfer window is no longer available.");
        const handle = broker.request({
          windowId: request.targetWindowId,
          tabId: request.tabId,
          bindAbort: () => () => {}, // The transaction above owns both lifecycles through commit.
          sendRequest: ({ requestId: id }) => {
            requestId = id;
            input.send(request.targetWindowId, { requestId: id, tabId: request.tabId, targetWindowId: request.targetWindowId,
              expiresAt: (input.now ?? Date.now)() + 15_000, point: request.point,
              document: { tabId: document.tabId, path: document.path, name: document.name, content: document.content,
                encoding: document.encoding, revision: document.revision, savedRevision: document.savedRevision,
                isDirty: document.isDirty, saveState: document.saveState, externalChange: document.externalChange } });
          }
        });
        const received = await Promise.race([handle.result, cancelled]);
        if (!active) throw new Error("The target did not receive the tab before the transfer was cancelled.");
        if (!received) throw new Error("The target declined the tab transfer.");
        request.check();
        const result = await Promise.race([commit({ tabId: request.tabId, expectedWindowId: request.sourceWindowId,
          targetWindowId: request.targetWindowId, targetIndex: request.targetIndex, expectedRevision: document.revision,
          isActive: () => {
            if (!active) return false;
            try { request.check(); input.workspace.getWindowProjection(request.targetWindowId); return true; } catch { return false; }
          } }), cancelled]);
        committed = true; // Both success and watcher-error results follow an atomic ownership commit.
        return result;
      } finally {
        active = false;
        pending.delete(request.tabId);
        broker.abortWindow(request.targetWindowId);
        for (const dispose of disposers.reverse()) { try { dispose(); } catch { /* Settlement owns cleanup. */ } }
        if (requestId !== null) {
          try { input.complete(request.targetWindowId, { requestId, committed }); } catch { /* Receiver timeout reconciles a lost completion. */ }
        }
      }
    }
  };
}
