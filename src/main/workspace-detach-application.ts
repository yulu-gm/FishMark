import type {
  WorkspaceMoveProjection,
  WorkspaceState
} from "@fishmark/workspace-domain";
import type { WorkspaceTabTransferApplication } from "./workspace-tab-transfer-application";

type DetachedWindowLifecycle<TWindow> = {
  getWindowId: (window: TWindow) => string;
  destroyWindow: (window: TWindow) => void;
  bindClosed: (window: TWindow, listener: () => void) => void;
  bindLoadFailure: (window: TWindow, listener: () => void) => void;
};

type WorkspaceDetachApplicationDependencies<TWindow> = {
  workspace: Pick<WorkspaceState, "getTabSession">;
  tabTransfer: Pick<WorkspaceTabTransferApplication, "detach">;
  openWindow: () => TWindow;
  scheduleReadyTimeout: (listener: () => void) => () => void;
  lifecycle: DetachedWindowLifecycle<TWindow>;
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
  cancellationError: unknown | null;
};

type PendingWorkspaceReady = {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
};

export function createWorkspaceDetachApplication<TWindow>(
  dependencies: WorkspaceDetachApplicationDependencies<TWindow>
) {
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

    const window = dependencies.openWindow();
    let targetWindowId: string;
    try {
      targetWindowId = dependencies.lifecycle.getWindowId(window);
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
        ready: null,
        cancellationError: null
      };
      pendingDetaches.set(targetWindowId, pending);

      try {
        const cancelReadyTimeout = dependencies.scheduleReadyTimeout(() => {
          rejectPending(
            targetWindowId,
            new Error(
              `Detached workspace window '${targetWindowId}' did not become ready before the timeout.`
            )
          );
        });
        if (pendingDetaches.get(targetWindowId) !== pending) {
          cancelReadyTimeoutSafely(cancelReadyTimeout);
          return;
        }
        pending.cancelReadyTimeout = cancelReadyTimeout;
        dependencies.lifecycle.bindClosed(window, () => {
          rejectPending(
            targetWindowId,
            new Error(
              `Detached workspace window '${targetWindowId}' closed before it became ready.`
            )
          );
        });
        if (!pendingDetaches.has(targetWindowId)) {
          return;
        }
        dependencies.lifecycle.bindLoadFailure(window, () => {
          rejectPending(
            targetWindowId,
            new Error(
              `Detached workspace window '${targetWindowId}' failed to load before it became ready.`
            )
          );
        });
      } catch (error) {
        rejectPending(targetWindowId, error);
      }
    });
  }

  function markWindowReady(windowId: string): Promise<void> {
    const pending = pendingDetaches.get(windowId);
    if (pending === undefined) {
      return Promise.resolve();
    }
    if (pending.ready !== null) {
      return pending.ready.promise;
    }

    let resolveReady!: () => void;
    let rejectReady!: (error: unknown) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    pending.ready = {
      promise: readyPromise,
      resolve: resolveReady,
      reject: rejectReady
    };
    void transferPending(pending);
    return readyPromise;
  }

  async function transferPending(
    pending: PendingWorkspaceDetach<TWindow>
  ): Promise<void> {
    try {
      const projection = await dependencies.tabTransfer.detach({
        tabId: pending.tabId,
        expectedWindowId: pending.sourceWindowId,
        targetWindowId: pending.targetWindowId,
        isActive: () =>
          pendingDetaches.get(pending.targetWindowId) === pending
      });
      const completedPending = takePending(pending.targetWindowId, pending);
      if (completedPending !== undefined) {
        completedPending.resolve(projection);
        completedPending.ready?.resolve();
      }
    } catch (error) {
      const rejectedPending = takePending(pending.targetWindowId, pending);
      if (rejectedPending !== undefined) {
        const rejection = rejectedPending.cancellationError ?? error;
        destroyWindowSafely(rejectedPending.window);
        rejectedPending.reject(rejection);
        rejectedPending.ready?.reject(rejection);
      }
    }
  }

  function rejectPending(windowId: string, error: unknown): void {
    const pending = takePending(windowId);
    if (pending === undefined) {
      return;
    }

    pending.cancellationError = error;

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

  function cancelReadyTimeoutSafely(cancelReadyTimeout: () => void): void {
    try {
      cancelReadyTimeout();
    } catch {
      // Settlement already has an authoritative result; cancellation is best effort.
    }
  }

  function destroyWindowSafely(window: TWindow): void {
    try {
      dependencies.lifecycle.destroyWindow(window);
    } catch {
      // Preserve the original adapter/domain error and canonical source state.
    }
  }

  return { detachTab, markWindowReady };
}
