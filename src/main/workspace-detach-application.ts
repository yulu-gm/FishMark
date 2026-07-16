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
      const cleanup = createPostDetachCleanup({
        targetWindowId,
        tabId: input.tabId,
        sourceWindowId: input.expectedWindowId
      });
      try {
        const projection = dependencies.workspace.detachTabToWindow({
          tabId: input.tabId,
          targetWindowId
        });
        pendingRendererWindowIds.add(targetWindowId);
        bindEarlyCleanup(window, targetWindowId, cleanup);
        return projection;
      } catch (error) {
        cleanup("rollback");
        destroyWindowSafely(window);
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
    cleanup: (intent: "rollback" | "close") => void
  ): void {
    dependencies.lifecycle.bindClosed(window, () => {
      cleanup(
        pendingRendererWindowIds.has(targetWindowId) ? "rollback" : "close"
      );
    });
    dependencies.lifecycle.bindLoadFailure(window, () => {
      if (!pendingRendererWindowIds.has(targetWindowId)) {
        return;
      }
      cleanup("rollback");
      destroyWindowSafely(window);
    });
  }

  function createPostDetachCleanup(input: {
    readonly targetWindowId: string;
    readonly tabId: string;
    readonly sourceWindowId: string;
  }): (intent: "rollback" | "close") => void {
    let hasCleaned = false;

    return (intent) => {
      if (hasCleaned) {
        return;
      }
      hasCleaned = true;
      pendingRendererWindowIds.delete(input.targetWindowId);

      if (intent === "close") {
        unregisterWindowSafely(input.targetWindowId);
        return;
      }

      rollbackCanonicalOwnership(input);
    };
  }

  function rollbackCanonicalOwnership(input: {
    readonly targetWindowId: string;
    readonly tabId: string;
    readonly sourceWindowId: string;
  }): void {
    let currentWindowId: string;
    try {
      currentWindowId = dependencies.workspace.getTabSession(input.tabId).windowId;
    } catch {
      return;
    }

    if (currentWindowId === input.targetWindowId) {
      try {
        dependencies.workspace.moveTabToWindow({
          tabId: input.tabId,
          targetWindowId: input.sourceWindowId
        });
      } catch {
        return;
      }

      try {
        currentWindowId = dependencies.workspace.getTabSession(input.tabId).windowId;
      } catch {
        return;
      }
    }

    if (currentWindowId !== input.targetWindowId) {
      unregisterWindowSafely(input.targetWindowId);
    }
  }

  function unregisterWindowSafely(windowId: string): void {
    try {
      dependencies.workspace.unregisterWindow(windowId);
    } catch {
      // Lifecycle cleanup must never replace the detach/binding failure.
    }
  }

  function destroyWindowSafely(window: TWindow): void {
    try {
      dependencies.lifecycle.destroyWindow(window);
    } catch {
      // Preserve the original detach/binding failure and canonical workspace state.
    }
  }
}
