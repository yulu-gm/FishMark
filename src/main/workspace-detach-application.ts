import type {
  WorkspaceMoveProjection,
  WorkspaceState
} from "@fishmark/workspace-domain";

type DetachedWindowLifecycle<TWindow> = {
  getWindowId: (window: TWindow) => string;
  destroyWindow: (window: TWindow) => void;
  bindClosed: (window: TWindow, listener: () => void) => void;
  bindLoadFailure: (window: TWindow, listener: () => void) => void;
};

type WorkspaceDetachApplicationDependencies<TWindow> = {
  workspace: Pick<WorkspaceState, "getTabSession" | "detachTabToWindow">;
  openWindow: () => TWindow;
  lifecycle: DetachedWindowLifecycle<TWindow>;
};

type PendingWorkspaceDetach<TWindow> = {
  readonly tabId: string;
  readonly sourceWindowId: string;
  readonly targetWindowId: string;
  readonly window: TWindow;
  readonly resolve: (projection: WorkspaceMoveProjection) => void;
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
        reject
      };
      pendingDetaches.set(targetWindowId, pending);

      try {
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

  function markWindowReady(windowId: string): void {
    const pending = pendingDetaches.get(windowId);
    if (pending === undefined) {
      return;
    }

    try {
      const checkpoint = dependencies.workspace.getTabSession(pending.tabId);
      if (checkpoint.windowId !== pending.sourceWindowId) {
        throw new Error(
          `Workspace tab '${pending.tabId}' does not belong to window '${pending.sourceWindowId}'.`
        );
      }
      const projection = dependencies.workspace.detachTabToWindow({
        tabId: pending.tabId,
        targetWindowId: pending.targetWindowId
      });
      pendingDetaches.delete(windowId);
      pending.resolve(projection);
    } catch (error) {
      pendingDetaches.delete(windowId);
      destroyWindowSafely(pending.window);
      pending.reject(error);
      throw error;
    }
  }

  function rejectPending(windowId: string, error: unknown): void {
    const pending = pendingDetaches.get(windowId);
    if (pending === undefined) {
      return;
    }

    pendingDetaches.delete(windowId);
    destroyWindowSafely(pending.window);
    pending.reject(error);
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
