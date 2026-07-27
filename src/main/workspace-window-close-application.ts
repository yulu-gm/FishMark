import type { WorkspaceState } from "@fishmark/workspace-domain";

import type { WorkspaceWindowCloseConfirmation } from "./workspace-close-coordinator";
import type {
  KeyedOperationCoordinator,
  KeyedOperationLease
} from "./keyed-operation-coordinator";

type WorkspaceWindowCloseApplicationDependencies<TOwnerWindow> = {
  workspace: Pick<WorkspaceState, "getTabSession" | "getWindowTabIds">;
  documentOperations: Pick<
    KeyedOperationCoordinator<string>,
    "acquireExclusive"
  >;
  requestWorkspaceWindowClose: (
    ownerWindow: TOwnerWindow
  ) => Promise<WorkspaceWindowCloseConfirmation | null>;
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
        const confirmation = await dependencies.requestWorkspaceWindowClose(
          input.ownerWindow
        );
        if (confirmation === null) {
          lease.release();
          return null;
        }
        if (!hasSameOrderedTabs(input.windowId, initialTabIds)) {
          lease.release();
          return null;
        }
        if (
          !matchesConfirmation(
            input.windowId,
            initialTabIds,
            confirmation
          )
        ) {
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

  function matchesConfirmation(
    windowId: string,
    expectedTabIds: readonly string[],
    confirmation: WorkspaceWindowCloseConfirmation
  ): boolean {
    if (
      confirmation.windowId !== windowId ||
      confirmation.checkpoints.length !== expectedTabIds.length
    ) {
      return false;
    }

    return confirmation.checkpoints.every((checkpoint, index) => {
      if (
        checkpoint.tabId !== expectedTabIds[index] ||
        checkpoint.expectedWindowId !== windowId
      ) {
        return false;
      }

      try {
        const tab = dependencies.workspace.getTabSession(checkpoint.tabId);
        return tab.windowId === checkpoint.expectedWindowId &&
          tab.revision === checkpoint.expectedRevision;
      } catch {
        return false;
      }
    });
  }
}

function keepHeld(
  lease: KeyedOperationLease
): HeldWorkspaceWindowCloseLease {
  return { release: () => lease.release() };
}
