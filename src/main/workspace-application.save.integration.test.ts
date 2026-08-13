import type { Stats } from "node:fs";

import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import { createSaveDocument as createSaveDocumentWithPorts } from "@fishmark/workspace-application";

import { EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT } from "../shared/external-file-change";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createFileWatchRegistry } from "./infrastructure/file-watch-registry";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import type { SaveMarkdownPathDialogResult } from "./save-markdown-file";
import { openTestDocument } from "./workspace.test-helper";

function createSaveDocumentForTest<TSender>(
  dependencies: Omit<
    Parameters<typeof createSaveDocumentWithPorts<TSender>>[0],
    | "tabOperations"
    | "fileLocationOperations"
    | "fileObjectOperations"
    | "fileIdentity"
    | "file"
    | "dialog"
    | "watcher"
    | "recentFiles"
    | "cleanupReporter"
  > & {
    documentOperations?: ReturnType<typeof createKeyedOperationCoordinator>;
    saveMarkdownFileToPath: Parameters<
      typeof createSaveDocumentWithPorts<TSender>
    >[0]["file"]["write"];
    showSaveMarkdownPathDialog: (input: { currentPath: string | null }) => Promise<SaveMarkdownPathDialogResult>;
    beginInternalWrite: Parameters<typeof createSaveDocumentWithPorts<TSender>>[0]["watcher"]["beginInternalWrite"];
    completeInternalWrite: Parameters<typeof createSaveDocumentWithPorts<TSender>>[0]["watcher"]["completeInternalWrite"];
    syncWindowWatch: (sender: TSender, windowId: string) => Promise<void>;
    recordRecentFilePath: (targetPath: string) => Promise<void>;
    reportCleanupError: (error: unknown) => void;
  }
) {
  const {
    showSaveMarkdownPathDialog,
    saveMarkdownFileToPath,
    beginInternalWrite,
    completeInternalWrite,
    syncWindowWatch,
    recordRecentFilePath,
    reportCleanupError,
    documentOperations,
    ...rest
  } = dependencies;
  return createSaveDocumentWithPorts({
    ...rest,
    tabOperations: documentOperations ?? createKeyedOperationCoordinator(),
    fileLocationOperations: createKeyedOperationCoordinator(),
    fileObjectOperations: createKeyedOperationCoordinator(),
    fileIdentity: testFileIdentityResolver(),
    file: { write: saveMarkdownFileToPath },
    dialog: { chooseSavePath: showSaveMarkdownPathDialog },
    watcher: {
      beginInternalWrite,
      completeInternalWrite,
      syncWindowPaths: (sender) => syncWindowWatch(sender, "window-1")
    },
    recentFiles: { record: recordRecentFilePath },
    cleanupReporter: { report: reportCleanupError }
  });
}

function testFileIdentityResolver() {
  const resolve = async (targetPath: string) => {
    const normalized = targetPath.toLowerCase();
    const identity = fileIdentity(`file:${normalized}`);
    return {
      canonicalPath: targetPath,
      identity,
      exists: true as const,
      pathKey: identity.location,
      physicalKey: identity.object
    };
  };
  return { resolveExisting: resolve, resolveProspective: resolve };
}

const document = (name: string, content: string) => ({
  fileIdentity: fileIdentity(`file:c:/notes/${name.toLowerCase()}`),
  path: `C:/notes/${name}`,
  name,
  content,
  encoding: "utf-8" as const
});

describe("workspace save use case", () => {
  it.each([
    ["null", null],
    ["different", "C:/notes/other.md"]
  ])(
    "rejects an ordinary save whose adapter returns a %s path without mutating canonical state",
    async (_caseName, returnedPath) => {
      const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
      workspace.registerWindow("window-1");
      const tabId = openTestDocument(workspace,
        "window-1",
        document("canonical.md", "saved")
      ).activeTabId!;
      workspace.updateTabDraft({
        tabId,
        expectedWindowId: "window-1",
        content: "captured"
      });
      const recordRecentFilePath = vi.fn(async () => undefined);
      const operations = createSaveDocumentForTest({
        workspace,
        saveMarkdownFileToPath: vi.fn(async () => JSON.parse(JSON.stringify({
          status: "success" as const,
          document: {
            path: returnedPath,
            name: "adapter.md",
            content: "captured",
            encoding: "utf-8" as const
          }
        }))),
        showSaveMarkdownPathDialog: vi.fn(),
        beginInternalWrite: vi.fn(),
        completeInternalWrite: vi.fn(async () => undefined),
        syncWindowWatch: vi.fn(async () => undefined),
        recordRecentFilePath,
        reportCleanupError: vi.fn()
      });

      await expect(
        operations.save({ context: { id: 1 }, expectedWindowId: "window-1", tabId })
      ).rejects.toThrow(/Ordinary save adapter/);
      expect(workspace.getTabSession(tabId)).toMatchObject({
        path: "C:/notes/canonical.md",
        name: "canonical.md",
        content: "captured",
        revision: 1,
        savedRevision: 0,
        isDirty: true
      });
      expect(recordRecentFilePath).not.toHaveBeenCalled();
    }
  );

  it("rejects adapter content that differs from the captured ordinary-save checkpoint after a newer edit", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("race.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId, expectedWindowId: "window-1", content: "captured" });
    let resolveWrite!: (result: SaveMarkdownFileResult) => void;
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(async () => undefined),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    const save = operations.save({
      context: { id: 1 },
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    workspace.updateTabDraft({ tabId, expectedWindowId: "window-1", content: "newer" });
    resolveWrite({
      status: "success",
      document: document("race.md", "adapter mismatch")
    });

    await expect(save).rejects.toThrow("captured save content");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/race.md",
      content: "newer",
      revision: 2,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("rejects a Save As identity collision before writing", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    openTestDocument(workspace, "window-1", document("existing.md", "disk"));
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId, expectedWindowId: "window-1", content: "captured" });
    const write = vi.fn();
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: vi.fn(async () => ({
        status: "success" as const,
        path: "C:/notes/existing.md"
      })),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncWindowWatch: vi.fn(),
      recordRecentFilePath: vi.fn(),
      reportCleanupError: vi.fn()
    });

    await expect(
      operations.saveAs({ context: { id: 1 }, expectedWindowId: "window-1", tabId })
    ).resolves.toMatchObject({ status: "error", error: { code: "file-identity-conflict" } });
    expect(write).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({ path: null, isDirty: true });
  });

  it("rejects a Save As adapter path that differs from the confirmed canonical path", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "captured"
    });
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => ({
        status: "success" as const,
        document: document("adapter-other.md", "captured")
      })),
      showSaveMarkdownPathDialog: vi.fn(async () => ({
        status: "success" as const,
        path: "C:/notes/confirmed.md"
      })),
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(async () => undefined),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    await expect(
      operations.saveAs({ context: { id: 1 }, expectedWindowId: "window-1", tabId })
    ).rejects.toThrow(/Save As adapter path/);
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: null,
      content: "captured",
      isDirty: true
    });
    expect(recordRecentFilePath).not.toHaveBeenCalled();
  });

  it("uses the canonical Save As path for an ordinary save that was queued while the dialog was open", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("before.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    const documentOperations = createKeyedOperationCoordinator();
    let resolveDialog!: (result: SaveMarkdownPathDialogResult) => void;
    const write = vi.fn(async ({ path, content }: { path: string; content: string }) => ({
      status: "success" as const,
      document: {
        path,
        name: path.split("/").at(-1)!,
        content,
        encoding: "utf-8" as const
      }
    }));
    const operations = createSaveDocumentForTest({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: () =>
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
      context: { id: 1 },
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf("function"));
    const queuedSave = operations.save({
      context: { id: 1 },
      expectedWindowId: "window-1",
      tabId
    });
    resolveDialog({
      status: "success",
      path: "C:/notes/after.md"
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
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("serial.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    const documentOperations = createKeyedOperationCoordinator();
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
    const operations = createSaveDocumentForTest({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite,
      completeInternalWrite,
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });
    const input = {
      context: { id: 1 },
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

  it("awaits watcher write admission before invoking the filesystem adapter", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("admission.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    let releaseAdmission!: () => void;
    const saveMarkdownFileToPath = vi.fn(async () => ({
      status: "success" as const,
      document: document("admission.md", "dirty")
    }));
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath,
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseAdmission = resolve;
          })
      ),
      completeInternalWrite: vi.fn(async () => undefined),
      syncWindowWatch: vi.fn(async () => undefined),
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    const save = operations.save({
      context: { id: 1 },
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(releaseAdmission).toBeTypeOf("function"));
    expect(saveMarkdownFileToPath).not.toHaveBeenCalled();

    releaseAdmission();
    await save;
    expect(saveMarkdownFileToPath).toHaveBeenCalledOnce();
  });

  it("keeps consecutive ordinary saves inside distinct real watcher transactions", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("watch.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    const documentOperations = createKeyedOperationCoordinator();
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
    const watchService = createFileWatchRegistry({
      watch: vi.fn((targetPath, listener) => {
        watchCallbacks.set(targetPath, listener);
        return { close: vi.fn() };
      }),
      stat
    });
    await watchService.syncWindowPaths(sender, ["C:/notes/watch.md"]);
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
    const operations = createSaveDocumentForTest({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write,
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite,
      completeInternalWrite,
      syncWindowWatch: async (candidate, windowId) => {
        const projection = workspace.getWindowProjectionOrNull(windowId);
        await watchService.syncWindowPaths(candidate, [
          projection?.activeDocument?.path ?? null
        ]);
      },
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });
    const input = {
      context: sender,
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
    expect(stat).toHaveBeenCalledTimes(3);
    expect(sender.send).not.toHaveBeenCalledWith(
      EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
      expect.anything()
    );
  });

  it("keeps the Save As dialog outside the tab lease and serializes the write", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "draft" });
    const documentOperations = createKeyedOperationCoordinator();
    const lease = await documentOperations.acquireExclusive([tabId]);
    const showSaveMarkdownPathDialog = vi.fn(async () => ({
      status: "success" as const,
      path: "C:/notes/saved-as.md"
    }));
    const syncWindowWatch = vi.fn(async () => undefined);
    const operations = createSaveDocumentForTest({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: vi.fn(async ({ path, content }) => ({
        status: "success" as const,
        document: { path, name: "saved-as.md", content, encoding: "utf-8" as const }
      })),
      showSaveMarkdownPathDialog,
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(),
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    const saveAsPromise = operations.saveAs({
      context: { id: 0 },
      expectedWindowId: "window-1",
      tabId
    });
    await Promise.resolve();

    expect(showSaveMarkdownPathDialog).toHaveBeenCalledOnce();
    expect(syncWindowWatch).not.toHaveBeenCalled();

    lease.release();
    await saveAsPromise;
    expect(syncWindowWatch).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/saved-as.md",
      content: "draft",
      isDirty: false
    });
    await expect(
      operations.saveWithHeldTabLease({
        context: { id: 0 },
        expectedWindowId: "window-1",
        tabId
      }, lease)
    ).rejects.toThrow("requires an active operation lease");
  });

  it("rejects a save commit after an out-of-band owner change and still completes cleanup", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    openTestDocument(workspace, "window-1", document("source.md", "source"));
    const tabId = openTestDocument(workspace,
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
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath,
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite,
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.save({
      context: sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveWrite({
      status: "success",
      document: document("moved.md", "captured dirty")
    });

    await expect(savePromise).resolves.toMatchObject({
      status: "error",
      error: { code: "window-changed" }
    });
    expect(beginInternalWrite).toHaveBeenCalledWith(sender, "C:/notes/moved.md");
    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/moved.md"
    );
    expect(recordRecentFilePath).not.toHaveBeenCalled();
    expect(syncWindowWatch).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      savedRevision: 0,
      isDirty: true
    });
  });

  it("completes write tracking when the write throws", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("throw.md", "saved")
    ).activeTabId!;
    const sender = { id: 2 };
    const completeInternalWrite = vi.fn(async () => undefined);
    const syncWindowWatch = vi.fn(async () => undefined);
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => {
        throw new Error("write exploded");
      }),
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    await expect(
      operations.save({
        context: sender,
        expectedWindowId: "window-1",
        tabId
      })
    ).rejects.toThrow("write exploded");

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/throw.md"
    );
    expect(syncWindowWatch).not.toHaveBeenCalled();
  });

  it("completes write tracking when the adapter returns mismatched content", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
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
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath,
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError: vi.fn()
    });

    await expect(
      operations.save({
        context: sender,
        expectedWindowId: "window-1",
        tabId
      })
    ).rejects.toThrow(
      "Ordinary save adapter content does not match the captured save content."
    );

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/commit-throw.md"
    );
    expect(syncWindowWatch).not.toHaveBeenCalled();
  });

  it("rejects a Save As commit after an out-of-band owner change", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    openTestDocument(workspace, "window-1", document("source.md", "source"));
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "untitled dirty" });
    workspace.registerWindow("window-2");
    let resolveDialog!: (result: SaveMarkdownPathDialogResult) => void;
    const sender = { id: 4 };
    const syncWindowWatch = vi.fn(async () => undefined);
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownPathDialog: () =>
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
      context: sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf("function"));
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveDialog({
      status: "success",
      path: "C:/notes/saved-as.md"
    });

    await expect(savePromise).resolves.toMatchObject({
      status: "error",
      error: { code: "window-changed" }
    });
    expect(recordRecentFilePath).not.toHaveBeenCalled();
    expect(syncWindowWatch).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      path: null,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("preserves an ordinary save window-missing error while completing and unbinding", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
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
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath,
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite: vi.fn(async () => {
        callOrder.push("begin");
      }),
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath,
      reportCleanupError: vi.fn()
    });

    const savePromise = operations.save({
      context: sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    workspace.unregisterWindow("window-1");
    resolveWrite({
      status: "success",
      document: document("closed-save.md", "captured dirty")
    });

    await expect(savePromise).resolves.toMatchObject({
      status: "error",
      error: { code: "window-missing" }
    });
    expect(callOrder).toEqual(["begin", "complete"]);
    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/closed-save.md"
    );
    expect(syncWindowWatch).not.toHaveBeenCalled();
    expect(recordRecentFilePath).not.toHaveBeenCalled();
  });

  it("rejects a window-missing Save As commit before recording recent and safely unbinds", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "captured dirty" });
    let resolveDialog!: (result: SaveMarkdownPathDialogResult) => void;
    const sender = { id: 6 };
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const syncWindowWatch = vi.fn(async () => undefined);
    const recordRecentFilePath = vi.fn(async () => undefined);
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownPathDialog: () =>
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
      context: sender,
      expectedWindowId: "window-1",
      tabId
    });
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf("function"));
    workspace.unregisterWindow("window-1");
    resolveDialog({
      status: "success",
      path: "C:/notes/closed-save-as.md"
    });

    await expect(savePromise).resolves.toMatchObject({
      status: "error",
      error: { code: "tab-missing" }
    });
    expect(saveTabDocument).not.toHaveBeenCalled();
    expect(recordRecentFilePath).not.toHaveBeenCalled();
    expect(syncWindowWatch).not.toHaveBeenCalled();
  });

  it("preserves the primary save error while reporting write cleanup failure", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
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
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => {
        throw primaryError;
      }),
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError
    });

    await expect(
      operations.save({
        context: sender,
        expectedWindowId: "window-1",
        tabId
      })
    ).rejects.toBe(primaryError);

    expect(completeInternalWrite).toHaveBeenCalledWith(
      sender,
      "C:/notes/primary.md"
    );
    expect(syncWindowWatch).not.toHaveBeenCalled();
    expect(reportCleanupError.mock.calls).toEqual([[completeError]]);
  });

  it("preserves the primary Save As dialog error without starting watcher cleanup", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
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
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownPathDialog: vi.fn(async () => {
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
        context: sender,
        expectedWindowId: "window-1",
        tabId
      })
    ).rejects.toBe(primaryError);

    expect(syncWindowWatch).not.toHaveBeenCalled();
    expect(reportCleanupError).not.toHaveBeenCalled();
  });

  it("aggregates write cleanup errors after a successful save operation", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
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
    const operations = createSaveDocumentForTest({
      workspace,
      saveMarkdownFileToPath: vi.fn(async () => ({ status: "cancelled" as const })),
      showSaveMarkdownPathDialog: vi.fn(),
      beginInternalWrite: vi.fn(),
      completeInternalWrite,
      syncWindowWatch,
      recordRecentFilePath: vi.fn(async () => undefined),
      reportCleanupError
    });

    let caught: unknown;
    try {
      await operations.save({
        context: sender,
        expectedWindowId: "window-1",
        tabId
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([completeError]);
    expect(completeInternalWrite).toHaveBeenCalledOnce();
    expect(syncWindowWatch).not.toHaveBeenCalled();
    expect(reportCleanupError.mock.calls).toEqual([[completeError]]);
  });
});
