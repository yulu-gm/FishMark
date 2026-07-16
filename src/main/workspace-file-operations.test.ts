import type { Stats } from "node:fs";

import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT } from "../shared/external-file-change";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createExternalFileWatchService } from "./external-file-watch-service";
import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { createWorkspaceFileOperations as createWorkspaceFileOperationsWithOperations } from "./workspace-file-operations";

function createWorkspaceFileOperations<TSender>(
  dependencies: Omit<
    Parameters<typeof createWorkspaceFileOperationsWithOperations<TSender>>[0],
    "documentOperations"
  >
) {
  return createWorkspaceFileOperationsWithOperations({
    ...dependencies,
    documentOperations: createWorkspaceDocumentOperationCoordinator()
  });
}

const document = (name: string, content: string) => ({
  path: `C:/notes/${name}`,
  name,
  content,
  encoding: "utf-8" as const
});

describe("createWorkspaceFileOperations", () => {
  it("does not begin a second ordinary save before the first watcher transaction finishes", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("serial.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft(tabId, "dirty");
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    let resolveFirstSave!: (result: SaveMarkdownFileResult) => void;
    let resolveFirstCleanup!: () => void;
    const write = vi
      .fn<
        (input: {
          readonly tabId: string;
          readonly path: string;
          readonly content: string;
        }) => Promise<SaveMarkdownFileResult>
      >()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSave = resolve;
          })
      )
      .mockResolvedValue({
        status: "success",
        document: document("serial.md", "dirty")
      });
    const beginInternalWrite = vi.fn();
    const completeInternalWrite = vi
      .fn<(sender: { id: number }, targetPath: string) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstCleanup = resolve;
          })
      )
      .mockResolvedValue(undefined);
    const operations = createWorkspaceFileOperationsWithOperations({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite,
      completeInternalWrite,
      syncDocumentPath: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });
    const input = {
      sender: { id: 1 },
      expectedWindowId: "window-1",
      tabId,
      path: "C:/notes/serial.md"
    };

    const firstSave = operations.save(input);
    await vi.waitFor(() => expect(resolveFirstSave).toBeTypeOf("function"));
    const secondSave = operations.save(input);
    await Promise.resolve();

    expect(beginInternalWrite).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);

    resolveFirstSave({
      status: "success",
      document: document("serial.md", "dirty")
    });
    await vi.waitFor(() => expect(resolveFirstCleanup).toBeTypeOf("function"));
    expect(beginInternalWrite).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);

    resolveFirstCleanup();
    await Promise.all([firstSave, secondSave]);
    expect(beginInternalWrite).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(2);
    expect(completeInternalWrite).toHaveBeenCalledTimes(2);
  });

  it("keeps consecutive ordinary saves inside distinct real watcher transactions", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("watch.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft(tabId, "dirty");
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    const watchCallbacks = new Map<
      string,
      (eventType: "change" | "rename") => void
    >();
    let currentSnapshot = { mtimeMs: 1, size: 5 };
    const stat = vi.fn(async () => ({ ...currentSnapshot }) as Stats);
    const sender = {
      id: 2,
      send: vi.fn<(channel: string, payload: unknown) => void>(),
      once: vi.fn<(event: "destroyed", listener: () => void) => void>()
    };
    const watchService = createExternalFileWatchService({
      watch: vi.fn((targetPath, listener) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() };
      }),
      stat
    });
    await watchService.syncDocumentPath(sender, "C:/notes/watch.md");
    let writeCount = 0;
    let releaseFirstWrite!: () => void;
    const write = vi.fn(async () => {
      writeCount += 1;
      currentSnapshot = {
        mtimeMs: writeCount + 1,
        size: 5 + writeCount
      };
      await watchCallbacks.get("C:/notes/watch.md")?.("change");
      if (writeCount === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      }
      return {
        status: "success" as const,
        document: document("watch.md", "dirty")
      };
    });
    const beginInternalWrite = vi.fn(watchService.beginInternalWrite);
    const completeInternalWrite = vi.fn(watchService.completeInternalWrite);
    const operations = createWorkspaceFileOperationsWithOperations({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite,
      completeInternalWrite,
      syncDocumentPath: watchService.syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });
    const input = {
      sender,
      expectedWindowId: "window-1",
      tabId,
      path: "C:/notes/watch.md"
    };

    const firstSave = operations.save(input);
    await vi.waitFor(() => expect(releaseFirstWrite).toBeTypeOf("function"));
    const secondSave = operations.save(input);
    await Promise.resolve();

    expect(beginInternalWrite).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);

    releaseFirstWrite();
    await Promise.all([firstSave, secondSave]);

    expect(beginInternalWrite).toHaveBeenCalledTimes(2);
    expect(completeInternalWrite).toHaveBeenCalledTimes(2);
    expect(stat).toHaveBeenCalledTimes(7);
    expect(sender.send).not.toHaveBeenCalledWith(
      EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
      expect.anything()
    );
  });

  it("serializes Save As dialog, commit, and cleanup with other tab IO", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft(tabId, "draft");
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    const lease = await documentOperations.acquireExclusive([tabId]);
    const showSaveMarkdownDialog = vi.fn(async () => ({
      status: "success" as const,
      document: document("saved-as.md", "draft")
    }));
    const syncDocumentPath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperationsWithOperations({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog,
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    const saveAsPromise = operations.saveAs({
      sender: { id: 0 },
      expectedWindowId: "window-1",
      tabId,
      currentPath: null
    });
    await Promise.resolve();

    expect(showSaveMarkdownDialog).not.toHaveBeenCalled();
    expect(syncDocumentPath).not.toHaveBeenCalled();

    lease.release();
    await saveAsPromise;
    expect(showSaveMarkdownDialog).toHaveBeenCalledOnce();
    expect(syncDocumentPath).toHaveBeenCalledOnce();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/saved-as.md",
      content: "draft",
      isDirty: false
    });
  });

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
    const saveMarkdownFileToPath = vi.fn(
      () =>
        new Promise<SaveMarkdownFileResult>((resolve) => {
          resolveWrite = resolve;
        })
    );
    const sender = { id: 1 };
    const beginInternalWrite = vi.fn();
    const completeInternalWrite = vi.fn(async () => undefined);
    const syncDocumentPath = vi.fn(async () => undefined);
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite,
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.save({
      sender,
      expectedWindowId: "window-1",
      tabId,
      path: "C:/notes/moved.md"
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
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
      saveMarkdownFileToPath: vi.fn(async () => {
        throw new Error("write exploded");
      }),
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
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
    const saveMarkdownFileToPath = vi.fn(async () => ({
        status: "success" as const,
        document: document("commit-throw.md", "mismatched")
      }));
    const sender = { id: 3 };
    const completeInternalWrite = vi.fn(async () => undefined);
    const syncDocumentPath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
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
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: () =>
        new Promise((resolve) => {
          resolveDialog = resolve;
        }),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncDocumentPath,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.saveAs({
      sender,
      expectedWindowId: "window-1",
      tabId,
      currentPath: null
    });
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf("function"));
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
    const saveMarkdownFileToPath = vi.fn(
      () =>
        new Promise<SaveMarkdownFileResult>((resolve) => {
          resolveWrite = resolve;
        })
    );
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
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(() => {
        callOrder.push("begin");
      }),
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.save({
      sender,
      expectedWindowId: "window-1",
      tabId,
      path: "C:/notes/closed-save.md"
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
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
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: () =>
        new Promise((resolve) => {
          resolveDialog = resolve;
        }),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncDocumentPath,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.saveAs({
      sender,
      expectedWindowId: "window-1",
      tabId,
      currentPath: null
    });
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf("function"));
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

  it("preserves the primary save error while reporting every independent cleanup error", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const sender = { id: 7 };
    const primaryError = new Error("primary save failed");
    const completeError = new Error("complete failed");
    const syncError = new Error("watch sync failed");
    const completeInternalWrite = vi.fn(async () => {
      throw completeError;
    });
    const syncDocumentPath = vi.fn(async () => {
      throw syncError;
    });
    const reportCleanupError = vi.fn(() => {
      throw new Error("reporter failed");
    });
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => {
        throw primaryError;
      }),
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError
    });

    await expect(
      operations.save({
        sender,
        expectedWindowId: "window-1",
        tabId,
        path: "C:/notes/primary.md"
      })
    ).rejects.toBe(primaryError);

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/primary.md"
    );
    expect(syncDocumentPath).toHaveBeenCalledWith(sender, null);
    expect(reportCleanupError.mock.calls).toEqual([
      [completeError],
      [syncError]
    ]);
  });

  it("preserves the primary Save As error when watch cleanup and its reporter fail", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const sender = { id: 8 };
    const primaryError = new Error("dialog failed");
    const syncError = new Error("watch sync failed");
    const syncDocumentPath = vi.fn(async () => {
      throw syncError;
    });
    const reportCleanupError = vi.fn(() => {
      throw new Error("reporter failed");
    });
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn(async () => {
        throw primaryError;
      }),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError
    });

    await expect(
      operations.saveAs({
        sender,
        expectedWindowId: "window-1",
        tabId,
        currentPath: null
      })
    ).rejects.toBe(primaryError);

    expect(syncDocumentPath).toHaveBeenCalledWith(sender, null);
    expect(reportCleanupError).toHaveBeenCalledOnce();
    expect(reportCleanupError).toHaveBeenCalledWith(syncError);
  });

  it("aggregates every cleanup error after a successful save operation", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    const sender = { id: 9 };
    const completeError = new Error("complete failed");
    const syncError = new Error("watch sync failed");
    const completeInternalWrite = vi.fn(async () => {
      throw completeError;
    });
    const syncDocumentPath = vi.fn(async () => {
      throw syncError;
    });
    const reportCleanupError = vi.fn();
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => ({ status: "cancelled" as const })),
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncDocumentPath,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError
    });

    let caught: unknown;
    try {
      await operations.save({
        sender,
        expectedWindowId: "window-1",
        tabId,
        path: "C:/notes/success.md"
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      completeError,
      syncError
    ]);
    expect(completeInternalWrite).toHaveBeenCalledOnce();
    expect(syncDocumentPath).toHaveBeenCalledOnce();
    expect(reportCleanupError.mock.calls).toEqual([
      [completeError],
      [syncError]
    ]);
  });
});
