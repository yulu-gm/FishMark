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
  it("uses the canonical Save As path for an ordinary save that was queued while the dialog was open", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("before.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    let resolveDialog!: (result: SaveMarkdownFileResult) => void;
    const write = vi.fn(async ({ path, content }: { path: string; content: string }) => ({
      status: "success" as const,
      document: {
        path,
        name: path.split("/").at(-1)!,
        content,
        encoding: "utf-8" as const
      }
    }));
    const operations = createWorkspaceFileOperationsWithOperations({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write,
      showSaveMarkdownDialog: () =>
        new Promise((resolve) => {
          resolveDialog = resolve;
        }),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(async () => undefined),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    const saveAs = operations.saveAs({
      sender: { id: 1 },
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf("function"));
    const queuedSave = operations.save({
      sender: { id: 1 },
      expectedWindowId: "window-1",
      tabId
    });
    resolveDialog({
      status: "success",
      document: document("after.md", "dirty")
    });

    await Promise.all([saveAs, queuedSave]);

    expect(write).toHaveBeenCalledWith({
      tabId,
      path: "C:/notes/after.md",
      content: "dirty"
    });
    expect(workspace.getTabSession(tabId).path).toBe("C:/notes/after.md");
  });

  it("does not begin a second ordinary save before the first watcher transaction finishes", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("serial.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
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
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });
    const input = {
      sender: { id: 1 },
      expectedWindowId: "window-1",
      tabId
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
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
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
      syncWindowWatch: async (candidate, windowId) => {
        const projection = workspace.getWindowProjectionOrNull(windowId);
        await watchService.syncDocumentPath(
          candidate,
          projection?.activeDocument?.path ?? null
        );
      },
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });
    const input = {
      sender,
      expectedWindowId: "window-1",
      tabId
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
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "draft" });
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    const lease = await documentOperations.acquireExclusive([tabId]);
    const showSaveMarkdownDialog = vi.fn(async () => ({
      status: "success" as const,
      document: document("saved-as.md", "draft")
    }));
    const syncWindowWatch = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperationsWithOperations({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog,
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    const saveAsPromise = operations.saveAs({
      sender: { id: 0 },
      expectedWindowId: "window-1",
      tabId
    });
    await Promise.resolve();

    expect(showSaveMarkdownDialog).not.toHaveBeenCalled();
    expect(syncWindowWatch).not.toHaveBeenCalled();

    lease.release();
    await saveAsPromise;
    expect(showSaveMarkdownDialog).toHaveBeenCalledOnce();
    expect(syncWindowWatch).toHaveBeenCalledOnce();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/saved-as.md",
      content: "draft",
      isDirty: false
    });
  });

  it("rejects a save commit after an out-of-band owner change and still completes cleanup", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", document("source.md", "source"));
    const tabId = workspace.openDocument(
      "window-1",
      document("moved.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "captured dirty" });
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
    const syncWindowWatch = vi.fn(async () => undefined);
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite,
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.save({
      sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveWrite({
      status: "success",
      document: document("moved.md", "captured dirty")
    });

    await expect(savePromise).rejects.toThrow(
      "Workspace save rejected: tab owner changed."
    );
    expect(beginInternalWrite).toHaveBeenCalledWith(sender, "C:/notes/moved.md");
    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/moved.md"
    );
    expect(recordRecentFilePath).not.toHaveBeenCalled();
    expect(syncWindowWatch).toHaveBeenCalledWith(sender, "window-1");
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
    const syncWindowWatch = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => {
        throw new Error("write exploded");
      }),
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    await expect(
      operations.save({
        sender,
        expectedWindowId: "window-1",
        tabId
      })
    ).rejects.toThrow("write exploded");

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/throw.md"
    );
    expect(syncWindowWatch).toHaveBeenCalledWith(sender, "window-1");
  });

  it("completes write tracking when the domain commit throws", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("commit-throw.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "current" });
    const saveMarkdownFileToPath = vi.fn(async () => ({
        status: "success" as const,
        document: document("commit-throw.md", "mismatched")
      }));
    const sender = { id: 3 };
    const completeInternalWrite = vi.fn(async () => undefined);
    const syncWindowWatch = vi.fn(async () => undefined);
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    await expect(
      operations.save({
        sender,
        expectedWindowId: "window-1",
        tabId
      })
    ).rejects.toThrow(
      "Saved document content must match the captured document revision."
    );

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/commit-throw.md"
    );
    expect(syncWindowWatch).toHaveBeenCalledWith(sender, "window-1");
  });

  it("rejects a Save As commit after an out-of-band owner change", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", document("source.md", "source"));
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "untitled dirty" });
    workspace.registerWindow("window-2");
    let resolveDialog!: (result: SaveMarkdownFileResult) => void;
    const sender = { id: 4 };
    const syncWindowWatch = vi.fn(async () => undefined);
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
      syncWindowWatch,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.saveAs({
      sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf("function"));
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveDialog({
      status: "success",
      document: document("saved-as.md", "untitled dirty")
    });

    await expect(savePromise).rejects.toThrow(
      "Workspace Save As rejected: tab owner changed."
    );
    expect(recordRecentFilePath).not.toHaveBeenCalled();
    expect(syncWindowWatch).toHaveBeenCalledWith(sender, "window-1");
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
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "captured dirty" });
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
    const syncWindowWatch = vi.fn(async (_sender, windowId: string) => {
      callOrder.push(`sync:${windowId}`);
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
      syncWindowWatch,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.save({
      sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    workspace.unregisterWindow("window-1");
    resolveWrite({
      status: "success",
      document: document("closed-save.md", "captured dirty")
    });

    await expect(savePromise).rejects.toThrow(
      "Workspace save rejected: owner window no longer exists."
    );
    expect(callOrder).toEqual(["begin", "complete", "sync:window-1"]);
    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/closed-save.md"
    );
    expect(syncWindowWatch).toHaveBeenCalledWith(sender, "window-1");
    expect(recordRecentFilePath).not.toHaveBeenCalled();
  });

  it("rejects a window-missing Save As commit before recording recent and safely unbinds", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "captured dirty" });
    let resolveDialog!: (result: SaveMarkdownFileResult) => void;
    const sender = { id: 6 };
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const syncWindowWatch = vi.fn(async () => undefined);
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
      syncWindowWatch,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.saveAs({
      sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf("function"));
    workspace.unregisterWindow("window-1");
    resolveDialog({
      status: "success",
      document: document("closed-save-as.md", "captured dirty")
    });

    await expect(savePromise).rejects.toThrow(
      "Workspace Save As rejected: owner window no longer exists."
    );
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId,
      expectedWindowId: "window-1",
      capturedRevision: 1,
      document: document("closed-save-as.md", "captured dirty"),
      diskVersion: null
    });
    expect(recordRecentFilePath).not.toHaveBeenCalled();
    expect(syncWindowWatch).toHaveBeenCalledWith(sender, "window-1");
  });

  it("preserves the primary save error while reporting every independent cleanup error", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("primary.md", "saved")
    ).activeTabId!;
    const sender = { id: 7 };
    const primaryError = new Error("primary save failed");
    const completeError = new Error("complete failed");
    const syncError = new Error("watch sync failed");
    const completeInternalWrite = vi.fn(async () => {
      throw completeError;
    });
    const syncWindowWatch = vi.fn(async () => {
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
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError
    });

    await expect(
      operations.save({
        sender,
        expectedWindowId: "window-1",
        tabId
      })
    ).rejects.toBe(primaryError);

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/primary.md"
    );
    expect(syncWindowWatch).toHaveBeenCalledWith(sender, "window-1");
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
    const syncWindowWatch = vi.fn(async () => {
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
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError
    });

    await expect(
      operations.saveAs({
        sender,
        expectedWindowId: "window-1",
        tabId
      })
    ).rejects.toBe(primaryError);

    expect(syncWindowWatch).toHaveBeenCalledWith(sender, "window-1");
    expect(reportCleanupError).toHaveBeenCalledOnce();
    expect(reportCleanupError).toHaveBeenCalledWith(syncError);
  });

  it("aggregates every cleanup error after a successful save operation", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("success.md", "saved")
    ).activeTabId!;
    const sender = { id: 9 };
    const completeError = new Error("complete failed");
    const syncError = new Error("watch sync failed");
    const completeInternalWrite = vi.fn(async () => {
      throw completeError;
    });
    const syncWindowWatch = vi.fn(async () => {
      throw syncError;
    });
    const reportCleanupError = vi.fn();
    const operations = createWorkspaceFileOperations({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => ({ status: "cancelled" as const })),
      showSaveMarkdownDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError
    });

    let caught: unknown;
    try {
      await operations.save({
        sender,
        expectedWindowId: "window-1",
        tabId
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
    expect(syncWindowWatch).toHaveBeenCalledOnce();
    expect(reportCleanupError.mock.calls).toEqual([
      [completeError],
      [syncError]
    ]);
  });
});
