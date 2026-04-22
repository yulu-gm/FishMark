import type { ExternalMarkdownFileChangedEvent } from "../shared/external-file-change";
import type { OpenMarkdownDocument } from "../shared/open-markdown-file";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import type { WorkspaceTabStripItem, WorkspaceWindowSnapshot } from "../shared/workspace";

export type OpenState = "idle" | "opening";
export type SaveState = "idle" | "manual-saving" | "autosaving";

export type ExternalMarkdownFileState =
  | { status: "idle" }
  | {
      status: "pending" | "keeping-memory";
      path: string;
      kind: ExternalMarkdownFileChangedEvent["kind"];
    };

export type WorkspaceTabState = OpenMarkdownDocument & {
  tabId: string;
  lastSavedContent: string | null;
  isDirty: boolean;
  saveState: SaveState;
};

export type WorkspaceState = {
  windowId: string | null;
  activeTabId: string | null;
  tabs: WorkspaceTabState[];
};

export type AppState = {
  workspace: WorkspaceState;
  editorLoadRevision: number;
  openState: OpenState;
  externalFileState: ExternalMarkdownFileState;
};

type ApplyWorkspaceSnapshotOptions = {
  clearExternalFileState?: boolean;
};

export function createInitialAppState(): AppState {
  return {
    workspace: {
      windowId: null,
      activeTabId: null,
      tabs: []
    },
    editorLoadRevision: 0,
    openState: "idle",
    externalFileState: { status: "idle" }
  };
}

export function getActiveDocument(state: AppState): WorkspaceTabState | null {
  if (state.workspace.activeTabId === null) {
    return null;
  }

  return state.workspace.tabs.find((tab) => tab.tabId === state.workspace.activeTabId) ?? null;
}

export function applyWorkspaceSnapshot(
  currentState: AppState,
  snapshot: WorkspaceWindowSnapshot,
  options: ApplyWorkspaceSnapshotOptions = {}
): AppState {
  const previousTabsById = new Map(
    currentState.workspace.tabs.map((tab) => [tab.tabId, tab] as const)
  );
  const nextTabs = snapshot.tabs.map((tab) =>
    mergeWorkspaceTab(tab, snapshot, previousTabsById.get(tab.tabId))
  );
  const currentActiveDocument = getActiveDocument(currentState);
  const nextActiveDocument =
    snapshot.activeTabId === null
      ? null
      : (nextTabs.find((tab) => tab.tabId === snapshot.activeTabId) ?? null);
  const activeDocumentChanged =
    currentActiveDocument?.tabId !== nextActiveDocument?.tabId ||
    currentActiveDocument?.content !== nextActiveDocument?.content;
  const shouldKeepExternalFileState =
    !options.clearExternalFileState &&
    currentState.externalFileState.status !== "idle" &&
    currentState.externalFileState.path === nextActiveDocument?.path;

  return {
    workspace: {
      windowId: snapshot.windowId,
      activeTabId: snapshot.activeTabId,
      tabs: nextTabs
    },
    editorLoadRevision: activeDocumentChanged
      ? currentState.editorLoadRevision + 1
      : currentState.editorLoadRevision,
    openState: currentState.openState,
    externalFileState: shouldKeepExternalFileState
      ? currentState.externalFileState
      : { status: "idle" }
  };
}

export function startOpeningMarkdownFile(currentState: AppState): AppState {
  return {
    ...currentState,
    openState: "opening"
  };
}

export function applyEditorContentChanged(currentState: AppState, nextContent: string): AppState {
  const activeDocument = getActiveDocument(currentState);

  if (!activeDocument) {
    return currentState;
  }

  return {
    ...currentState,
    workspace: {
      ...currentState.workspace,
      tabs: currentState.workspace.tabs.map((tab) =>
        tab.tabId === activeDocument.tabId
          ? {
              ...tab,
              content: nextContent,
              isDirty: isDirty(nextContent, tab.lastSavedContent)
            }
          : tab
      )
    }
  };
}

export function startManualSavingDocument(currentState: AppState): AppState {
  return updateActiveTab(currentState, (tab) => ({
    ...tab,
    saveState: "manual-saving"
  }));
}

export function startAutosavingDocument(currentState: AppState): AppState {
  return updateActiveTab(currentState, (tab) => ({
    ...tab,
    saveState: "autosaving"
  }));
}

export function applySaveMarkdownResult(
  currentState: AppState,
  result: SaveMarkdownFileResult
): AppState {
  if (result.status !== "success") {
    return updateActiveTab(currentState, (tab) => ({
      ...tab,
      saveState: "idle"
    }));
  }

  return {
    ...updateActiveTab(currentState, (tab) => ({
      ...tab,
      path: result.document.path,
      name: result.document.name,
      content: result.document.content,
      encoding: result.document.encoding,
      lastSavedContent: result.document.content,
      isDirty: false,
      saveState: "idle"
    })),
    externalFileState: { status: "idle" }
  };
}

export function applyExternalMarkdownFileChanged(
  currentState: AppState,
  event: ExternalMarkdownFileChangedEvent
): AppState {
  const activeDocument = getActiveDocument(currentState);

  if (!activeDocument?.path || activeDocument.path !== event.path) {
    return currentState;
  }

  return {
    ...currentState,
    externalFileState: {
      status: "pending",
      path: event.path,
      kind: event.kind
    }
  };
}

export function keepExternalMarkdownMemoryVersion(currentState: AppState): AppState {
  if (currentState.externalFileState.status !== "pending") {
    return currentState;
  }

  return {
    ...currentState,
    externalFileState: {
      ...currentState.externalFileState,
      status: "keeping-memory"
    }
  };
}

export function clearExternalMarkdownFileState(currentState: AppState): AppState {
  if (currentState.externalFileState.status === "idle") {
    return currentState;
  }

  return {
    ...currentState,
    externalFileState: { status: "idle" }
  };
}

function mergeWorkspaceTab(
  tab: WorkspaceTabStripItem,
  snapshot: WorkspaceWindowSnapshot,
  previousTab: WorkspaceTabState | undefined
): WorkspaceTabState {
  const activeDocument =
    snapshot.activeDocument?.tabId === tab.tabId ? snapshot.activeDocument : null;
  const content = activeDocument?.content ?? previousTab?.content ?? "";
  const lastSavedContent = resolveLastSavedContent({
    activeDocument,
    previousTab,
    isDirty: tab.isDirty,
    content
  });

  return {
    tabId: tab.tabId,
    path: activeDocument?.path ?? tab.path ?? null,
    name: activeDocument?.name ?? tab.name,
    content,
    encoding: activeDocument?.encoding ?? previousTab?.encoding ?? "utf-8",
    lastSavedContent,
    isDirty: activeDocument?.isDirty ?? tab.isDirty,
    saveState: activeDocument?.saveState ?? tab.saveState
  };
}

function updateActiveTab(
  currentState: AppState,
  updater: (tab: WorkspaceTabState) => WorkspaceTabState
): AppState {
  const activeDocument = getActiveDocument(currentState);

  if (!activeDocument) {
    return currentState;
  }

  return {
    ...currentState,
    workspace: {
      ...currentState.workspace,
      tabs: currentState.workspace.tabs.map((tab) =>
        tab.tabId === activeDocument.tabId ? updater(tab) : tab
      )
    }
  };
}

function isDirty(content: string, lastSavedContent: string | null): boolean {
  return lastSavedContent === null ? true : content !== lastSavedContent;
}

function resolveLastSavedContent(input: {
  activeDocument: WorkspaceWindowSnapshot["activeDocument"];
  previousTab: WorkspaceTabState | undefined;
  isDirty: boolean;
  content: string;
}): string | null {
  if (input.activeDocument) {
    if (!input.activeDocument.isDirty) {
      return input.activeDocument.content;
    }

    return input.previousTab?.lastSavedContent ?? null;
  }

  if (input.previousTab?.lastSavedContent !== undefined) {
    return input.previousTab.lastSavedContent;
  }

  return input.isDirty ? null : input.content;
}
