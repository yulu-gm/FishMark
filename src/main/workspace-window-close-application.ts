import type { WorkspaceState } from "@fishmark/workspace-domain";

import type {
  WorkspaceDocumentOperationCoordinator,
  WorkspaceDocumentOperationLease
} from "./workspace-document-operation-coordinator";

type WorkspaceWindowCloseApplicationDependencies<TOwnerWindow> = {
  workspace: Pick<WorkspaceState, "getWindowTabIds">;
  documentOperations: Pick<
    WorkspaceDocumentOperationCoordinator,
    "acquireExclusive"
  >;
  requestWorkspaceWindowClose: (ownerWindow: TOwnerWindow) => Promise<boolean>;
};

export interface HeldWorkspaceWindowCloseLease {
  release(): void;
}

export function createWorkspaceWindowCloseApplication<TOwnerWindow>(
  dependencies: WorkspaceWindowCloseApplicationDependencies<TOwnerWindow>
) {
  return {
    async requestWindowClose(input: {
      readonly windowId: string;
      readonly ownerWindow: TOwnerWindow;
    }): Promise<HeldWorkspaceWindowCloseLease | null> {
      let initialTabIds: readonly string[];
      try {
        initialTabIds = dependencies.workspace.getWindowTabIds(input.windowId);
      } catch {
        return null;
      }

      const lease = await dependencies.documentOperations.acquireExclusive(
        initialTabIds
      );
      if (!hasSameOrderedTabs(input.windowId, initialTabIds)) {
        lease.release();
        return null;
      }

      try {
        const shouldClose = await dependencies.requestWorkspaceWindowClose(
          input.ownerWindow
        );
        if (!shouldClose) {
          lease.release();
          return null;
        }
        if (!hasSameOrderedTabs(input.windowId, initialTabIds)) {
          lease.release();
          return null;
        }
        return keepHeld(lease);
      } catch (error) {
        lease.release();
        throw error;
      }
    }
  };

  function hasSameOrderedTabs(
    windowId: string,
    expectedTabIds: readonly string[]
  ): boolean {
    let currentTabIds: readonly string[];
    try {
      currentTabIds = dependencies.workspace.getWindowTabIds(windowId);
    } catch {
      return false;
    }
    return currentTabIds.length === expectedTabIds.length &&
      currentTabIds.every((tabId, index) => tabId === expectedTabIds[index]);
  }
}

function keepHeld(
  lease: WorkspaceDocumentOperationLease
): HeldWorkspaceWindowCloseLease {
  return { release: () => lease.release() };
}
