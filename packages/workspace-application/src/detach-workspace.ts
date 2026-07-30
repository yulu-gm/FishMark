import type {
  WorkspaceMoveProjection,
  WorkspaceState
} from "@fishmark/workspace-domain";

import type {
  WorkspaceWindowLifecyclePort
} from "./ports";
import type { WorkspaceTabTransfer } from "./tab-transfer";

type PendingWorkspaceReady = {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
};

type PendingWorkspaceDetach<TWindow> = {
  readonly tabId: string;
  readonly sourceWindowId: string;
  readonly targetWindowId: string;
  readonly window: TWindow;
  readonly resolve: (projection: WorkspaceMoveProjection) => void;
  readonly reject: (error: unknown) => void;
  cancelReadyTimeout: () => void;
  ready: PendingWorkspaceReady | null;
};

export function createWorkspaceDetach<TWindow>(dependencies: {
  workspace: Pick<WorkspaceState, "getTabSession">;
  tabTransfer: Pick<WorkspaceTabTransfer, "detach">;
  windowLifecycle: WorkspaceWindowLifecyclePort<TWindow>;
}) {
  const pendingDetaches = new Map<string, PendingWorkspaceDetach<TWindow>>();

  async function detachTab(input: {
    readonly tabId: string;
    readonly expectedWindowId: string;
  }): Promise<WorkspaceMoveProjection> {
    const checkpoint = dependencies.workspace.getTabSession(input.tabId);
    if (checkpoint.windowId !== input.expectedWindowId) {
      throw new Error(
        `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
      );
    }
    const window = dependencies.windowLifecycle.openWindow();
    let targetWindowId: string;
    try {
      targetWindowId = dependencies.windowLifecycle.getWindowId(window);
    } catch (error) {
      destroyWindowSafely(window);
      throw error;
    }
    return new Promise<WorkspaceMoveProjection>((resolve, reject) => {
      const pending: PendingWorkspaceDetach<TWindow> = {
        tabId: input.tabId,
        sourceWindowId: input.expectedWindowId,
        targetWindowId,
        window,
        resolve,
        reject,
        cancelReadyTimeout: () => undefined,
        ready: null
      };
      pendingDetaches.set(targetWindowId, pending);
      try {
        const cancelReadyTimeout = dependencies.windowLifecycle.scheduleReadyTimeout(() => {
          rejectPending(targetWindowId, new Error(
            `Detached workspace window '${targetWindowId}' did not become ready before the timeout.`
          ));
        });
        if (pendingDetaches.get(targetWindowId) !== pending) {
          cancelReadyTimeoutSafely(cancelReadyTimeout);
          return;
        }
        pending.cancelReadyTimeout = cancelReadyTimeout;
        dependencies.windowLifecycle.bindClosed(window, () => {
          rejectPending(targetWindowId, new Error(
            `Detached workspace window '${targetWindowId}' closed before it became ready.`
          ));
        });
        if (!pendingDetaches.has(targetWindowId)) return;
        dependencies.windowLifecycle.bindLoadFailure(window, () => {
          rejectPending(targetWindowId, new Error(
            `Detached workspace window '${targetWindowId}' failed to load before it became ready.`
          ));
        });
      } catch (error) {
        rejectPending(targetWindowId, error);
      }
    });
  }

  function markWindowReady(windowId: string): Promise<void> {
    const pending = pendingDetaches.get(windowId);
    if (pending === undefined) return Promise.resolve();
    if (pending.ready !== null) return pending.ready.promise;
    let resolveReady!: () => void;
    let rejectReady!: (error: unknown) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    pending.ready = { promise, resolve: resolveReady, reject: rejectReady };
    void transferPending(pending);
    return promise;
  }

  async function transferPending(pending: PendingWorkspaceDetach<TWindow>): Promise<void> {
    try {
      const projection = await dependencies.tabTransfer.detach({
        tabId: pending.tabId,
        expectedWindowId: pending.sourceWindowId,
        targetWindowId: pending.targetWindowId,
        isActive: () => pendingDetaches.get(pending.targetWindowId) === pending
      });
      const completed = takePending(pending.targetWindowId, pending);
      if (completed !== undefined) {
        completed.resolve(projection);
        completed.ready?.resolve();
      }
    } catch (error) {
      const rejected = takePending(pending.targetWindowId, pending);
      if (rejected !== undefined) {
        destroyWindowSafely(rejected.window);
        rejected.reject(error);
        rejected.ready?.reject(error);
      }
    }
  }

  function rejectPending(windowId: string, error: unknown): void {
    const pending = takePending(windowId);
    if (pending === undefined) return;
    destroyWindowSafely(pending.window);
    pending.reject(error);
    pending.ready?.reject(error);
  }

  function takePending(
    windowId: string,
    expected?: PendingWorkspaceDetach<TWindow>
  ): PendingWorkspaceDetach<TWindow> | undefined {
    const pending = pendingDetaches.get(windowId);
    if (pending === undefined || (expected !== undefined && pending !== expected)) {
      return undefined;
    }
    pendingDetaches.delete(windowId);
    cancelReadyTimeoutSafely(pending.cancelReadyTimeout);
    return pending;
  }

  function cancelReadyTimeoutSafely(cancel: () => void): void {
    try { cancel(); } catch { /* settlement remains authoritative */ }
  }

  function destroyWindowSafely(window: TWindow): void {
    try { dependencies.windowLifecycle.destroyWindow(window); } catch {
      // Preserve the original adapter/domain error and canonical source state.
    }
  }

  return { detachTab, markWindowReady };
}
