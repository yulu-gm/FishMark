import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createWorkspaceApplication } from "./workspace-application";

describe("createWorkspaceApplication", () => {
  it("delegates draft updates to the canonical workspace state", () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const updateTabDraft = vi.spyOn(workspace, "updateTabDraft");
    const application = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: vi.fn()
    });

    const projection = application.updateDraft({ tabId, content: "# Canonical\n" });

    expect(updateTabDraft).toHaveBeenCalledWith(tabId, "# Canonical\n");
    expect(projection.activeDocument).toMatchObject({
      tabId,
      content: "# Canonical\n",
      isDirty: true
    });
  });

  it("saves the canonical draft and commits the captured revision", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "# Canonical\n");
    const getTabSession = vi.spyOn(workspace, "getTabSession");
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const application = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: async ({ content, path }) => ({
        status: "success",
        document: { path, name: "note.md", content, encoding: "utf-8" }
      })
    });

    await application.saveTab({
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/note.md"
    });

    expect(getTabSession).toHaveBeenCalledTimes(1);
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId,
      expectedWindowId: "window-1",
      capturedRevision: 1,
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Canonical\n",
        encoding: "utf-8"
      },
      diskVersion: null
    });
  });

  it("preserves a newer canonical revision when save completion races with another edit", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "# Saved draft\n");
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    let resolveSave!: (value: SaveMarkdownFileResult) => void;
    const application = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: ({ content, path }) =>
        new Promise<SaveMarkdownFileResult>((resolve) => {
          resolveSave = resolve;
          expect(content).toBe("# Saved draft\n");
          expect(path).toBe("C:/notes/note.md");
        })
    });

    const savePromise = application.saveTab({
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/note.md"
    });
    workspace.updateTabDraft(tabId, "# Newer draft\n");
    resolveSave({
      status: "success",
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Saved draft\n",
        encoding: "utf-8"
      }
    });

    await savePromise;

    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId,
      expectedWindowId: "window-1",
      capturedRevision: 1,
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Saved draft\n",
        encoding: "utf-8"
      },
      diskVersion: null
    });
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/note.md",
      name: "note.md",
      content: "# Newer draft\n",
      revision: 2,
      savedRevision: 1,
      isDirty: true
    });
  });

  it("rejects adapter content that does not match the captured current revision", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "# Current\n");
    const application = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: async ({ path }) => ({
        status: "success",
        document: {
          path,
          name: "note.md",
          content: "# Mismatched\n",
          encoding: "utf-8"
        }
      })
    });

    await expect(
      application.saveTab({
        tabId,
        expectedWindowId: "window-1",
        path: "C:/notes/note.md"
      })
    ).rejects.toThrow(
      "Saved document content must match the captured document revision."
    );
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "# Current\n",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("returns disk success but leaves a tab dirty when it moves during save", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", {
      path: "C:/notes/move.md",
      name: "move.md",
      content: "saved",
      encoding: "utf-8"
    }).activeTabId!;
    workspace.updateTabDraft(tabId, "captured dirty");
    workspace.registerWindow("window-2");
    let resolveSave!: (value: SaveMarkdownFileResult) => void;
    const application = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    });

    const savePromise = application.saveTab({
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/move.md"
    });
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveSave({
      status: "success",
      document: {
        path: "C:/notes/move.md",
        name: "move.md",
        content: "captured dirty",
        encoding: "utf-8"
      }
    });

    await expect(savePromise).resolves.toMatchObject({ status: "success" });
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      content: "captured dirty",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("explicitly rejects a save commit after the expected window closes", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "captured dirty");
    let resolveSave!: (value: SaveMarkdownFileResult) => void;
    const application = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    });

    const savePromise = application.saveTab({
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/closed-window.md"
    });
    workspace.unregisterWindow("window-1");
    resolveSave({
      status: "success",
      document: {
        path: "C:/notes/closed-window.md",
        name: "closed-window.md",
        content: "captured dirty",
        encoding: "utf-8"
      }
    });

    await expect(savePromise).rejects.toThrow(
      "Workspace window 'window-1' no longer exists."
    );
  });
});
