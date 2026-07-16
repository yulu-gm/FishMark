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
  workspace: Pick<
    WorkspaceState,
    | "getTabSession"
    | "detachTabToWindow"
    | "moveTabToWindow"
    | "unregisterWindow"
  >;
  openWindow: () => TWindow;
  lifecycle: DetachedWindowLifecycle<TWindow>;
};

export function createWorkspaceDetachApplication<TWindow>(
  dependencies: WorkspaceDetachApplicationDependencies<TWindow>
) {
  const pendingRendererWindowIds = new Set<string>();

  return {
    detachTab(input: {
      readonly tabId: string;
      readonly expectedWindowId: string;
    }): WorkspaceMoveProjection {
      const checkpoint = dependencies.workspace.getTabSession(input.tabId);
      if (checkpoint.windowId !== input.expectedWindowId) {
        throw new Error(
          `Workspace tab '${input.tabId}' does not belong to window '${input.expectedWindowId}'.`
        );
      }

      const window = dependencies.openWindow();
      const targetWindowId = dependencies.lifecycle.getWindowId(window);
      try {
        const projection = dependencies.workspace.detachTabToWindow({
          tabId: input.tabId,
          targetWindowId
        });
        pendingRendererWindowIds.add(targetWindowId);
        bindEarlyCleanup(
          window,
          targetWindowId,
          input.tabId,
          input.expectedWindowId
        );
        return projection;
      } catch (error) {
        dependencies.workspace.unregisterWindow(targetWindowId);
        dependencies.lifecycle.destroyWindow(window);
        throw error;
      }
    },
    markWindowReady(windowId: string): void {
      pendingRendererWindowIds.delete(windowId);
    }
  };

  function bindEarlyCleanup(
    window: TWindow,
    targetWindowId: string,
    tabId: string,
    sourceWindowId: string
  ): void {
    let hasCleaned = false;
    const cleanup = () => {
      if (hasCleaned) {
        return;
      }
      hasCleaned = true;
      const shouldRestore = pendingRendererWindowIds.delete(targetWindowId);
      try {
        if (
          shouldRestore &&
          dependencies.workspace.getTabSession(tabId).windowId === targetWindowId
        ) {
          dependencies.workspace.moveTabToWindow({
            tabId,
            targetWindowId: sourceWindowId
          });
        }
      } catch {
        // The target cleanup below remains the fail-closed fallback.
      } finally {
        dependencies.workspace.unregisterWindow(targetWindowId);
      }
    };

    dependencies.lifecycle.bindClosed(window, cleanup);
    dependencies.lifecycle.bindLoadFailure(window, () => {
      if (!pendingRendererWindowIds.has(targetWindowId)) {
        return;
      }
      cleanup();
      dependencies.lifecycle.destroyWindow(window);
    });
  }
}
