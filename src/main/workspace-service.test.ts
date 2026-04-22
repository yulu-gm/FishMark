import { describe, expect, it } from "vitest";

import type { OpenMarkdownDocument } from "../shared/open-markdown-file";
import { createWorkspaceService } from "./workspace-service";

function createDocument(input: {
  path: string;
  name: string;
  content: string;
}): OpenMarkdownDocument {
  return {
    path: input.path,
    name: input.name,
    content: input.content,
    encoding: "utf-8"
  };
}

describe("createWorkspaceService", () => {
  it("starts each registered window as an empty workspace", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");

    expect(workspace.getWindowSnapshot("window-1")).toEqual({
      windowId: "window-1",
      activeTabId: null,
      tabs: [],
      activeDocument: null
    });
  });

  it("creates an untitled tab in the current window and marks it active", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");
    const snapshot = workspace.createUntitledTab("window-1");

    expect(snapshot.tabs).toHaveLength(1);
    expect(snapshot.activeTabId).toBe(snapshot.tabs[0]?.tabId);
    expect(snapshot.activeDocument).toMatchObject({
      tabId: snapshot.tabs[0]?.tabId,
      path: null,
      name: "Untitled.md",
      content: "",
      isDirty: false,
      saveState: "idle"
    });
  });

  it("appends an opened document as a new tab without replacing existing tabs", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");
    const untitledSnapshot = workspace.createUntitledTab("window-1");
    const nextSnapshot = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n"
      })
    );

    expect(nextSnapshot.tabs).toHaveLength(2);
    expect(nextSnapshot.tabs.map((tab) => tab.name)).toEqual(["Untitled.md", "today.md"]);
    expect(nextSnapshot.activeTabId).not.toBe(untitledSnapshot.activeTabId);
    expect(nextSnapshot.activeDocument).toMatchObject({
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Today\n",
      isDirty: false
    });
  });

  it("marks a tab dirty after draft updates and lets the window reactivate older tabs", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");
    const first = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      })
    );
    const second = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      })
    );

    const dirtySnapshot = workspace.updateTabDraft(second.activeTabId!, "# Second updated\n");

    expect(dirtySnapshot.activeDocument).toMatchObject({
      tabId: second.activeTabId,
      content: "# Second updated\n",
      isDirty: true
    });
    expect(dirtySnapshot.tabs.find((tab) => tab.tabId === second.activeTabId)).toMatchObject({
      name: "second.md",
      isDirty: true
    });

    const reactivatedSnapshot = workspace.activateTab("window-1", first.activeTabId!);

    expect(reactivatedSnapshot.activeTabId).toBe(first.activeTabId);
    expect(reactivatedSnapshot.activeDocument).toMatchObject({
      tabId: first.activeTabId,
      path: "C:/notes/first.md",
      content: "# First\n",
      isDirty: false
    });
  });

  it("reorders tabs within a window without dropping the active tab payload", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");
    const first = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      })
    );
    workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      })
    );
    const third = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/third.md",
        name: "third.md",
        content: "# Third\n"
      })
    );

    const reordered = workspace.reorderTab(first.activeTabId!, 2);

    expect(reordered.tabs.map((tab) => tab.name)).toEqual(["second.md", "third.md", "first.md"]);
    expect(reordered.activeTabId).toBe(third.activeTabId);
    expect(reordered.activeDocument).toMatchObject({
      tabId: third.activeTabId,
      path: "C:/notes/third.md",
      content: "# Third\n"
    });
  });

  it("moves a dirty tab into another window and preserves its draft state", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      })
    );
    const second = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      })
    );
    workspace.openDocument(
      "window-2",
      createDocument({
        path: "C:/notes/other.md",
        name: "other.md",
        content: "# Other\n"
      })
    );
    workspace.updateTabDraft(second.activeTabId!, "# Second dirty\n");

    const moved = workspace.moveTabToWindow({
      tabId: second.activeTabId!,
      targetWindowId: "window-2",
      targetIndex: 0
    });

    expect(moved.sourceWindowSnapshot.tabs.map((tab) => tab.name)).toEqual(["first.md"]);
    expect(moved.targetWindowSnapshot.tabs.map((tab) => tab.name)).toEqual(["second.md", "other.md"]);
    expect(moved.targetWindowSnapshot.activeDocument).toMatchObject({
      tabId: second.activeTabId,
      path: "C:/notes/second.md",
      content: "# Second dirty\n",
      isDirty: true
    });
  });

  it("closes a tab and reactivates the nearest remaining tab", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");
    workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      })
    );
    const second = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      })
    );

    const closed = workspace.closeTab(second.activeTabId!);

    expect(closed.tabs.map((tab) => tab.name)).toEqual(["first.md"]);
    expect(closed.activeDocument).toMatchObject({
      path: "C:/notes/first.md",
      name: "first.md",
      content: "# First\n"
    });
  });

  it("commits a saved document back into the matching tab session", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");
    const opened = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/draft.md",
        name: "draft.md",
        content: "# Draft\n"
      })
    );

    workspace.updateTabDraft(opened.activeTabId!, "# Draft updated\n");

    const saved = workspace.saveTabDocument(
      opened.activeTabId!,
      createDocument({
        path: "C:/archive/final.md",
        name: "final.md",
        content: "# Draft updated\n"
      })
    );

    expect(saved.activeDocument).toMatchObject({
      tabId: opened.activeTabId,
      path: "C:/archive/final.md",
      name: "final.md",
      content: "# Draft updated\n",
      isDirty: false,
      saveState: "idle"
    });
    expect(saved.tabs[0]).toMatchObject({
      tabId: opened.activeTabId,
      path: "C:/archive/final.md",
      name: "final.md",
      isDirty: false,
      saveState: "idle"
    });
  });

  it("replaces the current tab document in place when reloading from disk", () => {
    const workspace = createWorkspaceService();

    workspace.registerWindow("window-1");
    const opened = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n"
      })
    );

    workspace.updateTabDraft(opened.activeTabId!, "# Unsaved change\n");

    const reloaded = workspace.replaceTabDocument(
      opened.activeTabId!,
      createDocument({
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Disk version\n"
      })
    );

    expect(reloaded.tabs).toHaveLength(1);
    expect(reloaded.activeTabId).toBe(opened.activeTabId);
    expect(reloaded.activeDocument).toMatchObject({
      tabId: opened.activeTabId,
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Disk version\n",
      isDirty: false,
      saveState: "idle"
    });
  });
});
