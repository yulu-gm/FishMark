import { describe, expect, it } from "vitest";

import {
  createWorkspaceState,
  type DiskVersion,
  type WorkspaceDocumentData
} from "@fishmark/workspace-domain";

const diskVersion: DiskVersion = {
  normalizedPath: "C:/notes/document.md",
  mtimeMs: 1_700_000_000_000,
  size: 12,
  contentHash: "sha256:document"
};

function createDocument(
  name: string,
  content = `# ${name}\n`
): WorkspaceDocumentData {
  return {
    path: `C:/notes/${name}`,
    name,
    content,
    encoding: "utf-8"
  };
}

function tryMutation(mutate: () => void): void {
  try {
    mutate();
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
  }
}

describe("WorkspaceState window lifecycle", () => {
  it("starts each registered window empty and tracks the last focused window", () => {
    const workspace = createWorkspaceState();

    expect(workspace.registerWindow("window-1")).toEqual({
      windowId: "window-1",
      activeTabId: null,
      tabs: [],
      activeDocument: null
    });
    expect(workspace.getLastFocusedWindowId()).toBe("window-1");

    workspace.registerWindow("window-2");
    workspace.focusWindow("window-1");

    expect(workspace.getLastFocusedWindowId()).toBe("window-1");
    expect(() => workspace.focusWindow("missing-window")).toThrow(
      "Unknown workspace window 'missing-window'."
    );
    expect(workspace.getLastFocusedWindowId()).toBe("window-1");
  });

  it("keeps tabs when registering a duplicate window and refreshes focus", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const created = workspace.createUntitledTab("window-1");
    workspace.registerWindow("window-2");

    const duplicate = workspace.registerWindow("window-1");

    expect(duplicate).toEqual(created);
    expect(workspace.getLastFocusedWindowId()).toBe("window-1");
  });

  it("unregisters owned sessions and repairs focus without disturbing other windows", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const removedTabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.registerWindow("window-2");
    const remainingTabId = workspace.createUntitledTab("window-2").activeTabId!;

    workspace.unregisterWindow("window-1");

    expect(() => workspace.getWindowProjection("window-1")).toThrow(
      "Unknown workspace window 'window-1'."
    );
    expect(() => workspace.getTabSession(removedTabId)).toThrow(
      "Unknown workspace tab"
    );
    expect(workspace.getTabSession(remainingTabId).windowId).toBe("window-2");
    expect(workspace.getLastFocusedWindowId()).toBe("window-2");

    workspace.registerWindow("window-3");
    workspace.unregisterWindow("window-3");
    expect(workspace.getLastFocusedWindowId()).toBe("window-2");

    workspace.unregisterWindow("window-2");
    expect(workspace.getLastFocusedWindowId()).toBeNull();
    workspace.unregisterWindow("missing-window");
  });
});

describe("WorkspaceState tab lifecycle", () => {
  it("creates sequential untitled tabs and appends opened documents as active", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");

    const untitled = workspace.createUntitledTab("window-1");
    const opened = workspace.openDocument("window-1", createDocument("today.md", "# Today\n"));

    expect(untitled.activeDocument).toEqual({
      tabId: "tab-1",
      path: null,
      name: "Untitled.md",
      content: "",
      encoding: "utf-8",
      isDirty: false,
      saveState: "idle"
    });
    expect(opened.tabs.map((tab) => tab.name)).toEqual(["Untitled.md", "today.md"]);
    expect(opened.activeTabId).toBe("tab-2");
    expect(opened.activeDocument).toMatchObject({
      tabId: "tab-2",
      path: "C:/notes/today.md",
      content: "# Today\n",
      isDirty: false
    });
  });

  it("reactivates only tabs owned by the requested window and updates focus", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument(
      "window-1",
      createDocument("first.md", "# First\n")
    ).activeTabId!;
    const secondTabId = workspace.openDocument(
      "window-1",
      createDocument("second.md", "# Second\n")
    ).activeTabId!;
    workspace.registerWindow("window-2");
    const foreignTabId = workspace.createUntitledTab("window-2").activeTabId!;

    expect(() => workspace.activateTab("window-1", foreignTabId)).toThrow(
      `Unknown tab '${foreignTabId}' for window 'window-1'.`
    );
    expect(workspace.getWindowProjection("window-1").activeTabId).toBe(secondTabId);
    expect(workspace.getLastFocusedWindowId()).toBe("window-2");

    const activated = workspace.activateTab("window-1", firstTabId);

    expect(activated.activeTabId).toBe(firstTabId);
    expect(activated.activeDocument).toMatchObject({
      tabId: firstTabId,
      path: "C:/notes/first.md",
      content: "# First\n"
    });
    expect(workspace.getLastFocusedWindowId()).toBe("window-1");
  });

  it("updates revisions only for changed drafts and marks a restored draft clean", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", createDocument("draft.md", "saved")).activeTabId!;

    const noOp = workspace.updateTabDraft(tabId, "saved");
    expect(noOp.activeDocument).toMatchObject({ content: "saved", isDirty: false });
    expect(workspace.getTabSession(tabId)).toMatchObject({ revision: 0, savedRevision: 0 });

    workspace.updateTabDraft(tabId, "draft");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });

    workspace.updateTabDraft(tabId, "saved");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "saved",
      revision: 2,
      savedRevision: 2,
      isDirty: false
    });
  });

  it("closes an active tab and selects the next tab at its old index", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", createDocument("first.md"));
    const secondTabId = workspace.openDocument("window-1", createDocument("second.md")).activeTabId!;
    workspace.openDocument("window-1", createDocument("third.md"));
    workspace.activateTab("window-1", secondTabId);

    const closed = workspace.closeTab(secondTabId);

    expect(closed.tabs.map((tab) => tab.name)).toEqual(["first.md", "third.md"]);
    expect(closed.activeDocument?.name).toBe("third.md");
    expect(() => workspace.getTabSession(secondTabId)).toThrow("Unknown workspace tab");
  });

  it("closes an inactive tab without changing the active tab", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument("window-1", createDocument("first.md")).activeTabId!;
    const activeTabId = workspace.openDocument("window-1", createDocument("second.md")).activeTabId!;

    const closed = workspace.closeTab(firstTabId);

    expect(closed.activeTabId).toBe(activeTabId);
    expect(closed.activeDocument?.name).toBe("second.md");
  });
});

describe("WorkspaceState save and reload transitions", () => {
  it("commits a current save with Save As metadata and disk evidence", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "# Saved\n");

    const saved = workspace.saveTabDocument({
      tabId,
      capturedRevision: 1,
      document: createDocument("saved.md", "# Saved\n"),
      diskVersion
    });

    expect(saved.activeDocument).toEqual({
      tabId,
      ...createDocument("saved.md", "# Saved\n"),
      isDirty: false,
      saveState: "idle"
    });
    expect(workspace.getTabSession(tabId)).toMatchObject({
      revision: 1,
      savedRevision: 1,
      isDirty: false,
      diskVersion
    });
    expect(workspace.getTabPath(tabId)).toBe("C:/notes/saved.md");
    expect(workspace.getTabPath(null)).toBeNull();
  });

  it("keeps a newer draft dirty when an older captured revision finishes saving", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", createDocument("race.md", "saved")).activeTabId!;
    workspace.updateTabDraft(tabId, "captured");
    workspace.updateTabDraft(tabId, "newer draft");

    workspace.saveTabDocument({
      tabId,
      capturedRevision: 1,
      document: createDocument("race.md", "captured"),
      diskVersion
    });

    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "newer draft",
      revision: 2,
      savedRevision: 1,
      isDirty: true,
      diskVersion
    });
  });

  it("rejects mismatched current save content without changing the session", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", createDocument("current.md", "saved")).activeTabId!;
    workspace.updateTabDraft(tabId, "current");
    const before = workspace.getTabSession(tabId);

    expect(() =>
      workspace.saveTabDocument({
        tabId,
        capturedRevision: 1,
        document: createDocument("current.md", "different"),
        diskVersion
      })
    ).toThrow("Saved document content must match the captured document revision.");
    expect(workspace.getTabSession(tabId)).toEqual(before);
  });

  it("reloads equal text without advancing and changed text with one clean revision", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", createDocument("reload.md", "saved")).activeTabId!;
    workspace.updateTabDraft(tabId, "draft");

    workspace.replaceTabDocument(tabId, createDocument("reload.md", "draft"));
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "draft",
      revision: 1,
      savedRevision: 1,
      isDirty: false,
      diskVersion: null
    });

    workspace.replaceTabDocument(tabId, createDocument("changed.md", "disk change"));
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/changed.md",
      content: "disk change",
      revision: 2,
      savedRevision: 2,
      isDirty: false,
      diskVersion: null
    });
  });
});

describe("WorkspaceState tab ordering and movement", () => {
  it("clamps reorder targets and returns a fresh projection for a no-op", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument("window-1", createDocument("first.md")).activeTabId!;
    const secondTabId = workspace.openDocument("window-1", createDocument("second.md")).activeTabId!;
    const thirdTabId = workspace.openDocument(
      "window-1",
      createDocument("third.md", "# Third\n")
    ).activeTabId!;

    const movedToEnd = workspace.reorderTab(firstTabId, 100);

    expect(movedToEnd.tabs.map((tab) => tab.name)).toEqual([
      "second.md",
      "third.md",
      "first.md"
    ]);
    expect(movedToEnd.activeTabId).toBe(thirdTabId);
    expect(movedToEnd.activeDocument).toMatchObject({
      tabId: thirdTabId,
      path: "C:/notes/third.md",
      content: "# Third\n"
    });
    expect(workspace.reorderTab(firstTabId, -100).tabs.map((tab) => tab.name)).toEqual([
      "first.md",
      "second.md",
      "third.md"
    ]);

    const firstNoOp = workspace.reorderTab(secondTabId, 1);
    const secondNoOp = workspace.reorderTab(secondTabId, 1);
    expect(secondNoOp).toEqual(firstNoOp);
    expect(secondNoOp).not.toBe(firstNoOp);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects non-finite-integer reorder index %s without mutation",
    (targetIndex) => {
      const workspace = createWorkspaceState();
      workspace.registerWindow("window-1");
      const tabId = workspace.createUntitledTab("window-1").activeTabId!;
      const before = workspace.getWindowProjection("window-1");

      expect(() => workspace.reorderTab(tabId, targetIndex)).toThrow(
        "Workspace tab index must be a finite integer."
      );
      expect(workspace.getWindowProjection("window-1")).toEqual(before);
    }
  );

  it("uses reorder semantics when moving within the same window", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument("window-1", createDocument("first.md")).activeTabId!;
    workspace.openDocument("window-1", createDocument("second.md"));

    const moved = workspace.moveTabToWindow({
      tabId: firstTabId,
      targetWindowId: "window-1",
      targetIndex: 1
    });

    expect(moved.sourceWindowSnapshot.tabs.map((tab) => tab.name)).toEqual([
      "second.md",
      "first.md"
    ]);
    expect(moved.targetWindowSnapshot).toEqual(moved.sourceWindowSnapshot);
    expect(workspace.getTabSession(firstTabId).windowId).toBe("window-1");
  });

  it("moves a dirty tab across windows without losing text or revisions", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument(
      "window-1",
      createDocument("first.md", "# First\n")
    ).activeTabId!;
    const movedTabId = workspace.openDocument("window-1", createDocument("second.md", "saved")).activeTabId!;
    workspace.updateTabDraft(movedTabId, "dirty draft");
    workspace.registerWindow("window-2");
    workspace.openDocument("window-2", createDocument("other.md"));

    const moved = workspace.moveTabToWindow({
      tabId: movedTabId,
      targetWindowId: "window-2",
      targetIndex: 0
    });

    expect(moved.sourceWindowSnapshot.tabs.map((tab) => tab.name)).toEqual(["first.md"]);
    expect(moved.sourceWindowSnapshot.activeTabId).toBe(firstTabId);
    expect(moved.sourceWindowSnapshot.activeDocument).toMatchObject({
      tabId: firstTabId,
      path: "C:/notes/first.md",
      content: "# First\n"
    });
    expect(moved.targetWindowSnapshot.tabs.map((tab) => tab.name)).toEqual([
      "second.md",
      "other.md"
    ]);
    expect(moved.targetWindowSnapshot.activeTabId).toBe(movedTabId);
    expect(moved.targetWindowSnapshot.activeDocument).toMatchObject({
      tabId: movedTabId,
      path: "C:/notes/second.md",
      content: "dirty draft",
      isDirty: true
    });
    expect(workspace.getTabSession(movedTabId)).toMatchObject({
      windowId: "window-2",
      content: "dirty draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    expect(workspace.getLastFocusedWindowId()).toBe("window-2");
  });

  it("rejects an unknown move target before mutating the source", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const before = workspace.getWindowProjection("window-1");

    expect(() =>
      workspace.moveTabToWindow({ tabId, targetWindowId: "missing-window" })
    ).toThrow("Unknown workspace window 'missing-window'.");
    expect(workspace.getWindowProjection("window-1")).toEqual(before);
    expect(workspace.getTabSession(tabId).windowId).toBe("window-1");
    expect(workspace.getLastFocusedWindowId()).toBe("window-1");
  });

  it("rejects an invalid cross-window move index before mutating either window", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.registerWindow("window-2");
    const sourceBefore = workspace.getWindowProjection("window-1");
    const targetBefore = workspace.getWindowProjection("window-2");

    expect(() =>
      workspace.moveTabToWindow({
        tabId,
        targetWindowId: "window-2",
        targetIndex: 0.25
      })
    ).toThrow("Workspace tab index must be a finite integer.");
    expect(workspace.getWindowProjection("window-1")).toEqual(sourceBefore);
    expect(workspace.getWindowProjection("window-2")).toEqual(targetBefore);
  });
});

describe("WorkspaceState detach operations", () => {
  it("creates a missing target window and moves the tab into it", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;

    const detached = workspace.detachTabToWindow({
      tabId,
      targetWindowId: "window-2"
    });

    expect(detached.sourceWindowSnapshot.tabs).toEqual([]);
    expect(detached.sourceWindowSnapshot.activeTabId).toBeNull();
    expect(detached.targetWindowSnapshot.activeTabId).toBe(tabId);
    expect(workspace.getTabSession(tabId).windowId).toBe("window-2");
    expect(workspace.getLastFocusedWindowId()).toBe("window-2");
  });

  it("preserves existing target tabs when detaching", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", createDocument("moved.md")).activeTabId!;
    workspace.registerWindow("window-2");
    workspace.openDocument("window-2", createDocument("existing-first.md"));
    workspace.openDocument("window-2", createDocument("existing-second.md"));

    const detached = workspace.detachTabToWindow({
      tabId,
      targetWindowId: "window-2",
      targetIndex: 1
    });

    expect(detached.targetWindowSnapshot.tabs.map((tab) => tab.name)).toEqual([
      "existing-first.md",
      "moved.md",
      "existing-second.md"
    ]);
    expect(detached.targetWindowSnapshot.activeTabId).toBe(tabId);
    expect(detached.targetWindowSnapshot.activeDocument).toMatchObject({
      tabId,
      path: "C:/notes/moved.md",
      content: "# moved.md\n"
    });
  });

  it("does not leave a target window behind for an invalid source or index", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;

    expect(() =>
      workspace.detachTabToWindow({
        tabId: "missing-tab",
        targetWindowId: "window-invalid-source"
      })
    ).toThrow("Unknown workspace tab 'missing-tab'.");
    expect(() => workspace.getWindowProjection("window-invalid-source")).toThrow(
      "Unknown workspace window 'window-invalid-source'."
    );

    expect(() =>
      workspace.detachTabToWindow({
        tabId,
        targetWindowId: "window-invalid-index",
        targetIndex: Number.NaN
      })
    ).toThrow("Workspace tab index must be a finite integer.");
    expect(() => workspace.getWindowProjection("window-invalid-index")).toThrow(
      "Unknown workspace window 'window-invalid-index'."
    );
    expect(workspace.getWindowTabIds("window-1")).toEqual([tabId]);
  });
});

describe("WorkspaceState projection isolation", () => {
  it("returns fresh tab-id arrays that cannot pollute ownership", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;

    const first = workspace.getWindowTabIds("window-1");
    const second = workspace.getWindowTabIds("window-1");
    expect(second).toEqual([tabId]);
    expect(second).not.toBe(first);

    tryMutation(() => (first as string[]).push("injected-tab"));
    expect(workspace.getWindowTabIds("window-1")).toEqual([tabId]);
  });

  it("returns fresh deeply isolated window and tab-session projections", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", createDocument("safe.md", "safe")).activeTabId!;

    const firstWindow = workspace.getWindowProjection("window-1");
    const mutableWindow = firstWindow as unknown as {
      activeTabId: string | null;
      tabs: Array<{ name: string }>;
      activeDocument: { content: string } | null;
    };
    tryMutation(() => {
      mutableWindow.activeTabId = null;
    });
    tryMutation(() => {
      mutableWindow.tabs.push({ name: "injected.md" });
    });
    tryMutation(() => {
      mutableWindow.tabs[0]!.name = "mutated.md";
    });
    tryMutation(() => {
      if (mutableWindow.activeDocument) {
        mutableWindow.activeDocument.content = "mutated";
      }
    });

    const firstSession = workspace.getTabSession(tabId);
    tryMutation(() => {
      (firstSession as unknown as { content: string }).content = "mutated";
    });

    const nextWindow = workspace.getWindowProjection("window-1");
    const nextSession = workspace.getTabSession(tabId);
    expect(nextWindow).not.toBe(firstWindow);
    expect(nextWindow.tabs).not.toBe(firstWindow.tabs);
    expect(nextWindow.tabs[0]).not.toBe(firstWindow.tabs[0]);
    expect(nextWindow.activeDocument).not.toBe(firstWindow.activeDocument);
    expect(nextWindow).toMatchObject({
      activeTabId: tabId,
      tabs: [{ name: "safe.md" }],
      activeDocument: { content: "safe" }
    });
    expect(nextSession).not.toBe(firstSession);
    expect(nextSession.content).toBe("safe");
  });
});
