import type { OpenMarkdownDocument } from "../shared/open-markdown-file";
import type {
  MoveWorkspaceTabToWindowInput,
  WorkspaceMoveTabResult,
  WorkspaceDocumentSnapshot,
  WorkspaceTabSaveState,
  WorkspaceTabStripItem,
  WorkspaceWindowSnapshot
} from "../shared/workspace";

const UNTITLED_DOCUMENT_NAME = "Untitled.md";

export type WorkspaceTabSessionSnapshot = {
  tabId: string;
  windowId: string;
  path: string | null;
  name: string;
  content: string;
  lastSavedContent: string;
  encoding: "utf-8";
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
};

type TabSession = {
  tabId: string;
  path: string | null;
  name: string;
  draftContent: string;
  lastSavedContent: string;
  encoding: "utf-8";
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
};

type WindowSession = {
  windowId: string;
  tabIds: string[];
  activeTabId: string | null;
};

export function createWorkspaceService() {
  const windows = new Map<string, WindowSession>();
  const tabs = new Map<string, TabSession>();
  const tabToWindowId = new Map<string, string>();
  let nextTabId = 1;
  let lastFocusedWindowId: string | null = null;

  function registerWindow(windowId: string): WorkspaceWindowSnapshot {
    if (!windows.has(windowId)) {
      windows.set(windowId, {
        windowId,
        tabIds: [],
        activeTabId: null
      });
    }

    lastFocusedWindowId = windowId;
    return getWindowSnapshot(windowId);
  }

  function unregisterWindow(windowId: string): void {
    const window = windows.get(windowId);

    if (!window) {
      return;
    }

    for (const tabId of window.tabIds) {
      tabs.delete(tabId);
      tabToWindowId.delete(tabId);
    }

    windows.delete(windowId);

    if (lastFocusedWindowId === windowId) {
      lastFocusedWindowId = windows.keys().next().value ?? null;
    }
  }

  function getWindowSnapshot(windowId: string): WorkspaceWindowSnapshot {
    const window = getWindow(windowId);
    const tabItems = window.tabIds.map((tabId) => getTabStripItem(getTab(tabId)));
    const activeDocument =
      window.activeTabId === null ? null : getDocumentSnapshot(getTab(window.activeTabId));

    return {
      windowId: window.windowId,
      activeTabId: window.activeTabId,
      tabs: tabItems,
      activeDocument
    };
  }

  function createUntitledTab(windowId: string): WorkspaceWindowSnapshot {
    const session = createTabSession({
      path: null,
      name: UNTITLED_DOCUMENT_NAME,
      content: ""
    });

    return appendTab(windowId, session);
  }

  function openDocument(windowId: string, document: OpenMarkdownDocument): WorkspaceWindowSnapshot {
    const session = createTabSession(document);
    return appendTab(windowId, session);
  }

  function activateTab(windowId: string, tabId: string): WorkspaceWindowSnapshot {
    const window = getWindow(windowId);

    if (!window.tabIds.includes(tabId)) {
      throw new Error(`Unknown tab '${tabId}' for window '${windowId}'.`);
    }

    window.activeTabId = tabId;
    lastFocusedWindowId = windowId;
    return getWindowSnapshot(windowId);
  }

  function updateTabDraft(tabId: string, content: string): WorkspaceWindowSnapshot {
    const tab = getTab(tabId);
    tab.draftContent = content;
    tab.isDirty = content !== tab.lastSavedContent;
    return getWindowSnapshot(getWindowIdForTab(tabId));
  }

  function replaceTabDocument(
    tabId: string,
    document: OpenMarkdownDocument
  ): WorkspaceWindowSnapshot {
    const tab = getTab(tabId);
    tab.path = document.path;
    tab.name = document.name;
    tab.draftContent = document.content;
    tab.lastSavedContent = document.content;
    tab.encoding = document.encoding;
    tab.isDirty = false;
    tab.saveState = "idle";
    return getWindowSnapshot(getWindowIdForTab(tabId));
  }

  function saveTabDocument(tabId: string, document: OpenMarkdownDocument): WorkspaceWindowSnapshot {
    return replaceTabDocument(tabId, document);
  }

  function closeTab(tabId: string): WorkspaceWindowSnapshot {
    const windowId = getWindowIdForTab(tabId);
    const window = getWindow(windowId);
    const closeIndex = window.tabIds.indexOf(tabId);

    if (closeIndex < 0) {
      throw new Error(`Unknown tab '${tabId}' for window '${windowId}'.`);
    }

    window.tabIds.splice(closeIndex, 1);
    tabs.delete(tabId);
    tabToWindowId.delete(tabId);

    if (window.activeTabId === tabId) {
      window.activeTabId =
        window.tabIds.length === 0
          ? null
          : (window.tabIds[Math.min(closeIndex, window.tabIds.length - 1)] ?? null);
    }

    return getWindowSnapshot(windowId);
  }

  function reorderTab(tabId: string, toIndex: number): WorkspaceWindowSnapshot {
    const windowId = getWindowIdForTab(tabId);
    const window = getWindow(windowId);
    const fromIndex = window.tabIds.indexOf(tabId);

    if (fromIndex < 0) {
      throw new Error(`Unknown tab '${tabId}' for window '${windowId}'.`);
    }

    const clampedIndex = Math.max(0, Math.min(toIndex, window.tabIds.length - 1));

    if (fromIndex === clampedIndex) {
      return getWindowSnapshot(windowId);
    }

    window.tabIds.splice(fromIndex, 1);
    window.tabIds.splice(clampedIndex, 0, tabId);
    return getWindowSnapshot(windowId);
  }

  function moveTabToWindow(input: MoveWorkspaceTabToWindowInput): WorkspaceMoveTabResult {
    const sourceWindowId = getWindowIdForTab(input.tabId);
    const sourceWindow = getWindow(sourceWindowId);
    const targetWindow = getWindow(input.targetWindowId);
    const sourceIndex = sourceWindow.tabIds.indexOf(input.tabId);

    if (sourceIndex < 0) {
      throw new Error(`Unknown tab '${input.tabId}' for window '${sourceWindowId}'.`);
    }

    if (sourceWindowId === input.targetWindowId) {
      const sourceWindowSnapshot = reorderTab(input.tabId, input.targetIndex ?? sourceIndex);
      return {
        sourceWindowSnapshot,
        targetWindowSnapshot: sourceWindowSnapshot
      };
    }

    sourceWindow.tabIds.splice(sourceIndex, 1);
    if (sourceWindow.activeTabId === input.tabId) {
      sourceWindow.activeTabId =
        sourceWindow.tabIds.length === 0
          ? null
          : (sourceWindow.tabIds[Math.min(sourceIndex, sourceWindow.tabIds.length - 1)] ?? null);
    }

    const insertionIndex = Math.max(
      0,
      Math.min(input.targetIndex ?? targetWindow.tabIds.length, targetWindow.tabIds.length)
    );
    targetWindow.tabIds.splice(insertionIndex, 0, input.tabId);
    targetWindow.activeTabId = input.tabId;
    tabToWindowId.set(input.tabId, input.targetWindowId);
    lastFocusedWindowId = input.targetWindowId;

    return {
      sourceWindowSnapshot: getWindowSnapshot(sourceWindowId),
      targetWindowSnapshot: getWindowSnapshot(input.targetWindowId)
    };
  }

  function focusWindow(windowId: string): void {
    getWindow(windowId);
    lastFocusedWindowId = windowId;
  }

  function getWindowTabIds(windowId: string): string[] {
    return [...getWindow(windowId).tabIds];
  }

  function getTabSession(tabId: string): WorkspaceTabSessionSnapshot {
    const tab = getTab(tabId);
    const windowId = getWindowIdForTab(tabId);

    return {
      tabId: tab.tabId,
      windowId,
      path: tab.path,
      name: tab.name,
      content: tab.draftContent,
      lastSavedContent: tab.lastSavedContent,
      encoding: tab.encoding,
      isDirty: tab.isDirty,
      saveState: tab.saveState
    };
  }

  function getTabPath(tabId: string | null): string | null {
    if (tabId === null) {
      return null;
    }

    return getTab(tabId).path;
  }

  function getLastFocusedWindowId(): string | null {
    return lastFocusedWindowId;
  }

  function createTabSession(document: {
    path: string | null;
    name: string;
    content: string;
    encoding?: "utf-8";
  }): TabSession {
    const tabId = `tab-${nextTabId++}`;
    return {
      tabId,
      path: document.path,
      name: document.name,
      draftContent: document.content,
      lastSavedContent: document.content,
      encoding: document.encoding ?? "utf-8",
      isDirty: false,
      saveState: "idle"
    };
  }

  function appendTab(windowId: string, session: TabSession): WorkspaceWindowSnapshot {
    const window = getWindow(windowId);
    tabs.set(session.tabId, session);
    tabToWindowId.set(session.tabId, windowId);
    window.tabIds.push(session.tabId);
    window.activeTabId = session.tabId;
    return getWindowSnapshot(windowId);
  }

  function getTabStripItem(tab: TabSession): WorkspaceTabStripItem {
    return {
      tabId: tab.tabId,
      path: tab.path,
      name: tab.name,
      isDirty: tab.isDirty,
      saveState: tab.saveState
    };
  }

  function getDocumentSnapshot(tab: TabSession): WorkspaceDocumentSnapshot {
    return {
      tabId: tab.tabId,
      path: tab.path,
      name: tab.name,
      content: tab.draftContent,
      encoding: tab.encoding,
      isDirty: tab.isDirty,
      saveState: tab.saveState
    };
  }

  function getWindow(windowId: string): WindowSession {
    const window = windows.get(windowId);

    if (!window) {
      throw new Error(`Unknown workspace window '${windowId}'.`);
    }

    return window;
  }

  function getTab(tabId: string): TabSession {
    const tab = tabs.get(tabId);

    if (!tab) {
      throw new Error(`Unknown workspace tab '${tabId}'.`);
    }

    return tab;
  }

  function getWindowIdForTab(tabId: string): string {
    const windowId = tabToWindowId.get(tabId);

    if (!windowId) {
      throw new Error(`Workspace tab '${tabId}' is not attached to a window.`);
    }

    return windowId;
  }

  return {
    registerWindow,
    unregisterWindow,
    getWindowSnapshot,
    createUntitledTab,
    openDocument,
    activateTab,
    updateTabDraft,
    replaceTabDocument,
    saveTabDocument,
    closeTab,
    reorderTab,
    moveTabToWindow,
    focusWindow,
    getLastFocusedWindowId,
    getWindowTabIds,
    getTabSession,
    getTabPath
  };
}
