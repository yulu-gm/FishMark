import type {
  DocumentRevision,
  DocumentSessionProjection,
  WorkspaceState,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type {
  KeyedOperationCoordinator,
  KeyedOperationLease,
  SaveDocumentResult
} from "./ports";

export type CloseWorkspaceTabRequest = {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly expectedRevision: DocumentRevision;
};

export type WorkspaceWindowCloseConfirmation = Readonly<{
  windowId: string;
  checkpoints: readonly CloseWorkspaceTabRequest[];
}>;

export type ConfirmWorkspaceWindowCloseRequest = Readonly<{
  windowId: string;
  isActive: () => boolean;
}>;

export type CloseWorkspaceError =
  Extract<SaveDocumentResult, { readonly status: "error" }>["error"];

export type ConfirmWorkspaceWindowCloseResult =
  | {
      readonly status: "confirmed";
      readonly confirmation: WorkspaceWindowCloseConfirmation;
    }
  | { readonly status: "cancelled" }
  | {
      readonly status: "error";
      readonly error: CloseWorkspaceError;
    };

export type CloseWorkspaceTabResult = {
  readonly status: "closed" | "cancelled";
  readonly snapshot: WorkspaceWindowProjection;
} | {
  readonly status: "error";
  readonly snapshot: WorkspaceWindowProjection | null;
  readonly error: CloseWorkspaceError;
};

export type CloseWorkspaceDependencies<TContext> = {
  workspace: Pick<
    WorkspaceState,
    "getTabSession" | "getWindowProjection" | "getWindowTabIds" | "closeTab"
  >;
  documentOperations: Pick<
    KeyedOperationCoordinator<string>,
    "acquireExclusive" | "runExclusiveWithLease"
  >;
  chooseDirtyTab: (
    tab: DocumentSessionProjection
  ) => Promise<"save" | "discard" | "cancel">;
  resolveContext?: (windowId: string) => TContext | null;
  saveDocument: {
    saveWithHeldTabLease(input: {
      readonly context: TContext;
      readonly expectedWindowId: string;
      readonly tabId: string;
      readonly commitGuard?: () => boolean;
    }, tabLease: KeyedOperationLease<string>): Promise<SaveDocumentResult>;
    saveAsWithHeldTabLease(input: {
      readonly context: TContext;
      readonly expectedWindowId: string;
      readonly tabId: string;
      readonly commitGuard?: () => boolean;
    }, tabLease: KeyedOperationLease<string>): Promise<SaveDocumentResult>;
  };
};

export function createCloseWorkspace<TContext>(dependencies: CloseWorkspaceDependencies<TContext>) {
  async function closeTab(
    input: CloseWorkspaceTabRequest & { readonly context?: TContext }
  ): Promise<CloseWorkspaceTabResult> {
    return dependencies.documentOperations.runExclusiveWithLease(input.tabId, async (lease) => {
      const confirmation = await confirmTabCheckpoint(
        input,
        () => true,
        lease,
        input.context
      );
      if (confirmation.kind === "error") {
        return {
          status: "error",
          snapshot: getWindowProjectionOrNull(input.expectedWindowId),
          error: confirmation.error
        };
      }
      if (confirmation.kind === "cancelled" || getMatchingCheckpoint(input) === null) {
        return cancelledResult(input.expectedWindowId);
      }

      const result = dependencies.workspace.closeTab(input);
      if (result.kind === "applied") {
        return { status: "closed", snapshot: result.projection };
      }
      if (result.projection === null) {
        return workspaceError(input.expectedWindowId, "window-missing");
      }
      return { status: "cancelled", snapshot: result.projection };
    });
  }

  async function closeOwnedTab(input: {
    readonly tabId: string;
    readonly expectedWindowId: string;
    readonly context?: TContext;
  }): Promise<CloseWorkspaceTabResult> {
    let checkpoint: DocumentSessionProjection;
    try {
      checkpoint = dependencies.workspace.getTabSession(input.tabId);
    } catch {
      return workspaceError(input.expectedWindowId, "tab-missing");
    }
    if (checkpoint.windowId !== input.expectedWindowId) {
      return workspaceError(input.expectedWindowId, "window-changed");
    }
    return closeTab({ ...input, expectedRevision: checkpoint.revision });
  }

  async function confirmWindowClose(
    input: ConfirmWorkspaceWindowCloseRequest,
    tabLease?: KeyedOperationLease<string>
  ): Promise<ConfirmWorkspaceWindowCloseResult> {
    if (tabLease !== undefined) {
      return confirmWindowCloseWithLease(input, tabLease);
    }
    let tabIds: readonly string[];
    try {
      tabIds = dependencies.workspace.getWindowTabIds(input.windowId);
    } catch {
      return { status: "cancelled" };
    }
    const acquired = await dependencies.documentOperations.acquireExclusive(tabIds);
    try {
      return await confirmWindowCloseWithLease(input, acquired);
    } finally {
      acquired.release();
    }
  }

  async function confirmWindowCloseWithLease(
    input: ConfirmWorkspaceWindowCloseRequest,
    tabLease: KeyedOperationLease<string>
  ): Promise<ConfirmWorkspaceWindowCloseResult> {
    if (!input.isActive()) return { status: "cancelled" };
    let initialTabIds: readonly string[];
    try {
      initialTabIds = dependencies.workspace.getWindowTabIds(input.windowId);
    } catch {
      return { status: "cancelled" };
    }
    const checkpoints: CloseWorkspaceTabRequest[] = [];
    for (const tabId of initialTabIds) {
      if (!input.isActive()) return { status: "cancelled" };
      let tab: DocumentSessionProjection;
      try {
        tab = dependencies.workspace.getTabSession(tabId);
      } catch {
        return { status: "cancelled" };
      }
      if (tab.windowId !== input.windowId) return { status: "cancelled" };
      checkpoints.push({
        tabId,
        expectedWindowId: input.windowId,
        expectedRevision: tab.revision
      });
    }

    for (const checkpoint of checkpoints) {
      if (!input.isActive()) return { status: "cancelled" };
      const result = await confirmTabCheckpoint(checkpoint, input.isActive, tabLease);
      if (result.kind === "error") {
        return { status: "error", error: result.error };
      }
      if (result.kind === "cancelled" || !input.isActive()) {
        return { status: "cancelled" };
      }
    }

    if (!input.isActive() || !hasSameOrderedTabs(input.windowId, initialTabIds)) {
      return { status: "cancelled" };
    }
    if (!checkpoints.every((checkpoint) => getMatchingCheckpoint(checkpoint) !== null)) {
      return { status: "cancelled" };
    }
    if (!input.isActive()) return { status: "cancelled" };

    return {
      status: "confirmed",
      confirmation: Object.freeze({
        windowId: input.windowId,
        checkpoints: Object.freeze(
          checkpoints.map((checkpoint) => Object.freeze({ ...checkpoint }))
        )
      })
    };
  }

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

  async function confirmTabCheckpoint(
    input: CloseWorkspaceTabRequest,
    isActive: () => boolean,
    tabLease: KeyedOperationLease<string>,
    suppliedContext?: TContext
  ): Promise<
    | { readonly kind: "confirmed" }
    | { readonly kind: "cancelled" }
    | {
        readonly kind: "error";
        readonly error: CloseWorkspaceError;
      }
  > {
    if (!isActive()) return { kind: "cancelled" };
    const initial = getMatchingCheckpoint(input);
    if (initial === null) return { kind: "cancelled" };
    if (!initial.isDirty) {
      return isActive() ? { kind: "confirmed" } : { kind: "cancelled" };
    }

    const choice = await dependencies.chooseDirtyTab(initial);
    if (!isActive()) return { kind: "cancelled" };
    const checkpoint = getMatchingCheckpoint(input);
    if (checkpoint === null || choice === "cancel") return { kind: "cancelled" };
    if (choice === "discard") {
      return isActive() ? { kind: "confirmed" } : { kind: "cancelled" };
    }
    if (!isActive()) return { kind: "cancelled" };

    const context = suppliedContext ?? dependencies.resolveContext?.(checkpoint.windowId);
    if (context === null) {
      return {
        kind: "error",
        error: {
          code: "runtime-context-unavailable",
          message: "The owner window is no longer available."
        }
      };
    }
    const saveInput = {
      context: context as TContext,
      expectedWindowId: checkpoint.windowId,
      tabId: checkpoint.tabId,
      commitGuard: isActive
    };
    const result = checkpoint.path === null
      ? await dependencies.saveDocument.saveAsWithHeldTabLease(saveInput, tabLease)
      : await dependencies.saveDocument.saveWithHeldTabLease(saveInput, tabLease);
    if (!isActive() || result.status === "cancelled") return { kind: "cancelled" };
    if (result.status === "error") return { kind: "error", error: result.error };

    const finalCheckpoint = getMatchingCheckpoint(input);
    return isActive() && finalCheckpoint !== null && !finalCheckpoint.isDirty
      ? { kind: "confirmed" }
      : { kind: "cancelled" };
  }

  function getMatchingCheckpoint(
    input: CloseWorkspaceTabRequest
  ): DocumentSessionProjection | null {
    let tab: DocumentSessionProjection;
    try {
      tab = dependencies.workspace.getTabSession(input.tabId);
    } catch {
      return null;
    }
    return tab.windowId === input.expectedWindowId &&
      tab.revision === input.expectedRevision
      ? tab
      : null;
  }

  function getWindowProjectionOrNull(windowId: string): WorkspaceWindowProjection | null {
    try {
      return dependencies.workspace.getWindowProjection(windowId);
    } catch {
      return null;
    }
  }

  function workspaceError(
    expectedWindowId: string,
    code: "tab-missing" | "window-missing" | "window-changed"
  ): Extract<CloseWorkspaceTabResult, { readonly status: "error" }> {
    const messages = {
      "tab-missing": "The tab no longer exists.",
      "window-missing": "The owner window no longer exists.",
      "window-changed": "The tab moved to another window."
    } as const;
    return {
      status: "error",
      snapshot: getWindowProjectionOrNull(expectedWindowId),
      error: { code, message: messages[code] }
    };
  }

  function cancelledResult(expectedWindowId: string): CloseWorkspaceTabResult {
    const snapshot = getWindowProjectionOrNull(expectedWindowId);
    if (snapshot === null) return workspaceError(expectedWindowId, "window-missing");
    return {
      status: "cancelled",
      snapshot
    };
  }

  return { closeOwnedTab, closeTab, confirmWindowClose };
}

export interface HeldWorkspaceWindowCloseLease {
  release(): void;
}

export function createWorkspaceWindowClose<TOwnerWindow>(dependencies: {
  workspace: Pick<WorkspaceState, "getTabSession" | "getWindowTabIds">;
  documentOperations: Pick<KeyedOperationCoordinator<string>, "acquireExclusive">;
  requestWorkspaceWindowClose: (
    ownerWindow: TOwnerWindow,
    tabLease: KeyedOperationLease<string>
  ) => Promise<WorkspaceWindowCloseConfirmation | null>;
}) {
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

      const lease = await dependencies.documentOperations.acquireExclusive(initialTabIds);
      if (!hasSameOrderedTabs(input.windowId, initialTabIds)) {
        lease.release();
        return null;
      }

      try {
        const confirmation = await dependencies.requestWorkspaceWindowClose(
          input.ownerWindow,
          lease
        );
        if (
          confirmation === null ||
          !hasSameOrderedTabs(input.windowId, initialTabIds) ||
          !matchesConfirmation(input.windowId, initialTabIds, confirmation)
        ) {
          lease.release();
          return null;
        }
        return { release: () => lease.release() };
      } catch (error) {
        lease.release();
        throw error;
      }
    }
  };

  function hasSameOrderedTabs(windowId: string, expectedTabIds: readonly string[]): boolean {
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
