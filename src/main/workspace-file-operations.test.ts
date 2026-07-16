import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createWorkspaceApplication } from "./workspace-application";
import { createWorkspaceFileOperations } from "./workspace-file-operations";

const document = (name: string, content: string) => ({
  path: `C:/notes/${name}`,
  name,
  content,
  encoding: "utf-8" as const
});

describe("createWorkspaceFileOperations", () => {
  it("completes write tracking and rebinds the sender watch after a save-time move", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", document("source.md", "source"));
    const tabId = workspace.openDocument(
      "window-1",
      document("moved.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft(tabId, "captured dirty");
    workspace.registerWindow("window-2");
    let resolveWrite!: (result: SaveMarkdownFileResult) => void;
    const workspaceApplication = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        })
    });
    const sender = { id: 1 };
    const beginInternalWrite = vi.fn();
    const completeInternalWrite = vi.fn(async () => undefined);
    const syncDocumentPath = vi.fn(async () => undefined);
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveTab: workspaceApplication.saveTab,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite,
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath
    });

    const savePromise = operations.save({
      sender,
      expectedWindowId: "window-1",
      tabId,
      path: "C:/notes/moved.md"
    });
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveWrite({
      status: "success",
      document: document("moved.md", "captured dirty")
    });

    await expect(savePromise).resolves.toMatchObject({ status: "success" });
    expect(beginInternalWrite).toHaveBeenCalledWith(sender, "C:/notes/moved.md");
    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/moved.md"
    );
    expect(recordRecentFilePath).toHaveBeenCalledWith("C:/notes/moved.md");
    expect(syncDocumentPath).toHaveBeenCalledWith(sender, "C:/notes/source.md");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      savedRevision: 0,
      isDirty: true
    });
  });

  it("completes write tracking and watch sync when the write throws", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("throw.md", "saved")
    ).activeTabId!;
    const sender = { id: 2 };
    const completeInternalWrite = vi.fn(async () => undefined);
    const syncDocumentPath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveTab: vi.fn(async () => {
        throw new Error("write exploded");
      }),
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await expect(
      operations.save({
        sender,
        expectedWindowId: "window-1",
        tabId,
        path: "C:/notes/throw.md"
      })
    ).rejects.toThrow("write exploded");

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/throw.md"
    );
    expect(syncDocumentPath).toHaveBeenCalledWith(sender, "C:/notes/throw.md");
  });

  it("completes write tracking when the domain commit throws", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("commit-throw.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft(tabId, "current");
    const workspaceApplication = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => ({
        status: "success" as const,
        document: document("commit-throw.md", "mismatched")
      }))
    });
    const sender = { id: 3 };
    const completeInternalWrite = vi.fn(async () => undefined);
    const syncDocumentPath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveTab: workspaceApplication.saveTab,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await expect(
      operations.save({
        sender,
        expectedWindowId: "window-1",
        tabId,
        path: "C:/notes/commit-throw.md"
      })
    ).rejects.toThrow(
      "Saved document content must match the captured document revision."
    );

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/commit-throw.md"
    );
    expect(syncDocumentPath).toHaveBeenCalledWith(
      sender,
      "C:/notes/commit-throw.md"
    );
  });

  it("keeps a moved Save As tab dirty and rebinds the source watch", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", document("source.md", "source"));
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "untitled dirty");
    workspace.registerWindow("window-2");
    let resolveDialog!: (result: SaveMarkdownFileResult) => void;
    const sender = { id: 4 };
    const syncDocumentPath = vi.fn(async () => undefined);
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveTab: vi.fn(),
      showSaveMarkdownDialog: () =>
        new Promise((resolve) => {
          resolveDialog = resolve;
        }),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncDocumentPath,
      recordRecentFilePath
    });

    const savePromise = operations.saveAs({
      sender,
      expectedWindowId: "window-1",
      tabId,
      currentPath: null
    });
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveDialog({
      status: "success",
      document: document("saved-as.md", "untitled dirty")
    });

    await expect(savePromise).resolves.toMatchObject({ status: "success" });
    expect(recordRecentFilePath).toHaveBeenCalledWith("C:/notes/saved-as.md");
    expect(syncDocumentPath).toHaveBeenCalledWith(sender, "C:/notes/source.md");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      path: null,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("preserves an ordinary save window-missing error while completing and unbinding", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("closed-save.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft(tabId, "captured dirty");
    let resolveWrite!: (result: SaveMarkdownFileResult) => void;
    const workspaceApplication = createWorkspaceApplication({
      workspace,
      saveMarkdownFileToPath: () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        })
    });
    const sender = { id: 5 };
    const callOrder: string[] = [];
    const completeInternalWrite = vi.fn(async () => {
      callOrder.push("complete");
    });
    const syncDocumentPath = vi.fn(async (_sender, targetPath: string | null) => {
      callOrder.push(`sync:${String(targetPath)}`);
    });
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveTab: workspaceApplication.saveTab,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(() => {
        callOrder.push("begin");
      }),
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath
    });

    const savePromise = operations.save({
      sender,
      expectedWindowId: "window-1",
      tabId,
      path: "C:/notes/closed-save.md"
    });
    workspace.unregisterWindow("window-1");
    resolveWrite({
      status: "success",
      document: document("closed-save.md", "captured dirty")
    });

    await expect(savePromise).rejects.toThrow(
      "Workspace window 'window-1' no longer exists."
    );
    expect(callOrder).toEqual(["begin", "complete", "sync:null"]);
    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/closed-save.md"
    );
    expect(syncDocumentPath).toHaveBeenCalledWith(sender, null);
    expect(recordRecentFilePath).not.toHaveBeenCalled();
  });

  it("rejects a window-missing Save As commit before recording recent and safely unbinds", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "captured dirty");
    let resolveDialog!: (result: SaveMarkdownFileResult) => void;
    const sender = { id: 6 };
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const syncDocumentPath = vi.fn(async () => undefined);
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveTab: vi.fn(),
      showSaveMarkdownDialog: () =>
        new Promise((resolve) => {
          resolveDialog = resolve;
        }),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncDocumentPath,
      recordRecentFilePath
    });

    const savePromise = operations.saveAs({
      sender,
      expectedWindowId: "window-1",
      tabId,
      currentPath: null
    });
    workspace.unregisterWindow("window-1");
    resolveDialog({
      status: "success",
      document: document("closed-save-as.md", "captured dirty")
    });

    await expect(savePromise).rejects.toThrow(
      "Workspace window 'window-1' no longer exists."
    );
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId,
      expectedWindowId: "window-1",
      capturedRevision: 1,
      document: document("closed-save-as.md", "captured dirty"),
      diskVersion: null
    });
    expect(recordRecentFilePath).not.toHaveBeenCalled();
    expect(syncDocumentPath).toHaveBeenCalledWith(sender, null);
  });
});
