import { describe, expect, it } from "vitest";

import type { ExternalMarkdownFileChangedEvent } from "../shared/external-file-change";
import type { WorkspaceDocumentSnapshot, WorkspaceWindowSnapshot } from "../shared/workspace";
import {
  applyEditorContentChanged,
  applyExternalMarkdownFileChanged,
  applySaveMarkdownResult,
  applyWorkspaceSnapshot,
  clearExternalMarkdownFileState,
  createInitialAppState,
  getActiveDocument,
  keepExternalMarkdownMemoryVersion,
  startAutosavingDocument,
  startManualSavingDocument,
  type AppState
} from "./document-state";

describe("applyWorkspaceSnapshot", () => {
  it("creates a second untitled tab without replacing the first one", () => {
    const firstState = applyWorkspaceSnapshot(
      createInitialAppState(),
      createWorkspaceSnapshot({
        tabs: [
          createWorkspaceDocument({
            tabId: "tab-1",
            path: null,
            name: "Untitled.md",
            content: ""
          })
        ],
        activeTabId: "tab-1"
      })
    );

    const nextState = applyWorkspaceSnapshot(
      firstState,
      createWorkspaceSnapshot({
        tabs: [
          createWorkspaceDocument({
            tabId: "tab-1",
            path: null,
            name: "Untitled.md",
            content: ""
          }),
          createWorkspaceDocument({
            tabId: "tab-2",
            path: null,
            name: "Untitled.md",
            content: ""
          })
        ],
        activeTabId: "tab-2"
      })
    );

    expect(nextState.workspace.tabs).toHaveLength(2);
    expect(nextState.workspace.tabs.map((tab) => tab.tabId)).toEqual(["tab-1", "tab-2"]);
    expect(nextState.workspace.activeTabId).toBe("tab-2");
    expect(getActiveDocument(nextState)).toMatchObject({
      tabId: "tab-2",
      path: null,
      name: "Untitled.md",
      content: "",
      isDirty: false
    });
    expect(nextState.editorLoadRevision).toBe(2);
  });

  it("keeps inactive tab payload intact when the active tab draft changes", () => {
    const firstState = applyWorkspaceSnapshot(
      createInitialAppState(),
      createWorkspaceSnapshot({
        tabs: [
          createWorkspaceDocument({
            tabId: "tab-1",
            path: "C:/notes/first.md",
            name: "first.md",
            content: "# First\n"
          })
        ],
        activeTabId: "tab-1"
      })
    );

    const state = applyWorkspaceSnapshot(
      firstState,
      createWorkspaceSnapshot({
        tabs: [
          createWorkspaceDocument({
            tabId: "tab-1",
            path: "C:/notes/first.md",
            name: "first.md",
            content: "# First\n"
          }),
          createWorkspaceDocument({
            tabId: "tab-2",
            path: "C:/notes/second.md",
            name: "second.md",
            content: "# Second\n"
          })
        ],
        activeTabId: "tab-2"
      })
    );

    const nextState = applyEditorContentChanged(state, "# Second updated\n");

    expect(nextState.workspace.tabs.find((tab) => tab.tabId === "tab-1")).toMatchObject({
      path: "C:/notes/first.md",
      name: "first.md",
      content: "# First\n",
      isDirty: false
    });
    expect(nextState.workspace.tabs.find((tab) => tab.tabId === "tab-2")).toMatchObject({
      path: "C:/notes/second.md",
      name: "second.md",
      content: "# Second updated\n",
      isDirty: true
    });
    expect(getActiveDocument(nextState)?.content).toBe("# Second updated\n");
  });
});

describe("save document state", () => {
  it("marks the active tab as manual-saving when a manual save starts", () => {
    const initialState = openWorkspaceDocument();

    const nextState = startManualSavingDocument(initialState);

    expect(getActiveDocument(nextState)?.saveState).toBe("manual-saving");
  });

  it("marks the active tab as autosaving when autosave starts", () => {
    const initialState = openWorkspaceDocument();

    const nextState = startAutosavingDocument(initialState);

    expect(getActiveDocument(nextState)?.saveState).toBe("autosaving");
  });

  it("updates the active tab path after save as succeeds", () => {
    const initialState = applyEditorContentChanged(
      applyWorkspaceSnapshot(
        createInitialAppState(),
        createWorkspaceSnapshot({
          tabs: [
            createWorkspaceDocument({
              tabId: "tab-1",
              path: null,
              name: "Untitled.md",
              content: ""
            })
          ],
          activeTabId: "tab-1"
        })
      ),
      "# Updated\n"
    );

    const nextState = applySaveMarkdownResult(initialState, {
      status: "success",
      document: {
        path: "C:/archive/renamed.md",
        name: "renamed.md",
        content: "# Updated\n",
        encoding: "utf-8"
      }
    });

    expect(getActiveDocument(nextState)).toMatchObject({
      path: "C:/archive/renamed.md",
      name: "renamed.md",
      content: "# Updated\n",
      isDirty: false,
      saveState: "idle"
    });
    expect(nextState.workspace.tabs[0]).toMatchObject({
      path: "C:/archive/renamed.md",
      name: "renamed.md",
      isDirty: false
    });
  });

  it("keeps the active tab dirty when save as is cancelled", () => {
    const initialState = applyEditorContentChanged(openWorkspaceDocument(), "# Updated\n");

    const nextState = applySaveMarkdownResult(initialState, { status: "cancelled" });

    expect(getActiveDocument(nextState)).toMatchObject({
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Updated\n",
      isDirty: true,
      saveState: "idle"
    });
  });

  it("clears external file conflict state after a successful save as", () => {
    const initialState = keepExternalMarkdownMemoryVersion(
      applyExternalMarkdownFileChanged(
        applyEditorContentChanged(openWorkspaceDocument(), "# Updated\n"),
        createExternalFileEvent("modified")
      )
    );

    const nextState = applySaveMarkdownResult(initialState, {
      status: "success",
      document: {
        path: "C:/archive/conflict-copy.md",
        name: "conflict-copy.md",
        content: "# Updated\n",
        encoding: "utf-8"
      }
    });

    expect(nextState.externalFileState).toEqual({ status: "idle" });
    expect(getActiveDocument(nextState)?.path).toBe("C:/archive/conflict-copy.md");
    expect(getActiveDocument(nextState)?.isDirty).toBe(false);
  });
});

describe("external markdown file state", () => {
  it("enters a pending conflict state when the active file changes externally", () => {
    const nextState = applyExternalMarkdownFileChanged(
      openWorkspaceDocument(),
      createExternalFileEvent("modified")
    );

    expect(nextState.externalFileState).toEqual({
      status: "pending",
      path: "C:/notes/today.md",
      kind: "modified"
    });
  });

  it("keeps the conflict state idle when the changed path is not the active document", () => {
    const nextState = applyExternalMarkdownFileChanged(openWorkspaceDocument(), {
      path: "C:/notes/other.md",
      kind: "modified"
    });

    expect(nextState.externalFileState).toEqual({ status: "idle" });
  });

  it("keeps the in-memory version when the user chooses to preserve current edits", () => {
    const initialState = applyExternalMarkdownFileChanged(
      openWorkspaceDocument(),
      createExternalFileEvent("deleted")
    );

    const nextState = keepExternalMarkdownMemoryVersion(initialState);

    expect(nextState.externalFileState).toEqual({
      status: "keeping-memory",
      path: "C:/notes/today.md",
      kind: "deleted"
    });
  });

  it("clears the conflict state when explicitly dismissed", () => {
    const initialState = keepExternalMarkdownMemoryVersion(
      applyExternalMarkdownFileChanged(openWorkspaceDocument(), createExternalFileEvent("modified"))
    );

    const nextState = clearExternalMarkdownFileState(initialState);

    expect(nextState.externalFileState).toEqual({ status: "idle" });
  });

  it("clears the conflict state when a same-path snapshot is explicitly applied as a reload", () => {
    const conflictedState = applyExternalMarkdownFileChanged(
      openWorkspaceDocument(),
      createExternalFileEvent("modified")
    );

    const nextState = applyWorkspaceSnapshot(
      conflictedState,
      createWorkspaceSnapshot({
        tabs: [
          createWorkspaceDocument({
            tabId: "tab-1",
            path: "C:/notes/today.md",
            name: "today.md",
            content: "# Disk update\n"
          })
        ],
        activeTabId: "tab-1"
      }),
      {
        clearExternalFileState: true
      }
    );

    expect(nextState.externalFileState).toEqual({ status: "idle" });
    expect(getActiveDocument(nextState)?.content).toBe("# Disk update\n");
  });
});

function openWorkspaceDocument(): AppState {
  return applyWorkspaceSnapshot(
    createInitialAppState(),
    createWorkspaceSnapshot({
      tabs: [
        createWorkspaceDocument({
          tabId: "tab-1",
          path: "C:/notes/today.md",
          name: "today.md",
          content: "# Today\n"
        })
      ],
      activeTabId: "tab-1"
    })
  );
}

function createWorkspaceSnapshot(input: {
  tabs: WorkspaceDocumentSnapshot[];
  activeTabId: string | null;
}): WorkspaceWindowSnapshot {
  const activeDocument =
    input.activeTabId === null
      ? null
      : (input.tabs.find((tab) => tab.tabId === input.activeTabId) ?? null);

  return {
    windowId: "window-1",
    activeTabId: input.activeTabId,
    tabs: input.tabs.map((tab) => ({
      tabId: tab.tabId,
      path: tab.path,
      name: tab.name,
      isDirty: tab.isDirty,
      saveState: tab.saveState
    })),
    activeDocument
  };
}

function createWorkspaceDocument(input: {
  tabId: string;
  path: string | null;
  name: string;
  content: string;
  isDirty?: boolean;
}): WorkspaceDocumentSnapshot {
  return {
    tabId: input.tabId,
    path: input.path,
    name: input.name,
    content: input.content,
    encoding: "utf-8",
    isDirty: input.isDirty ?? false,
    saveState: "idle"
  };
}

function createExternalFileEvent(
  kind: ExternalMarkdownFileChangedEvent["kind"]
): ExternalMarkdownFileChangedEvent {
  return {
    path: "C:/notes/today.md",
    kind
  };
}
