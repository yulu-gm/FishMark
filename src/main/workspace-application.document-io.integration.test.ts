import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import {
  createSaveDocument as createSaveDocumentForTest,
  createWorkspaceReload as createWorkspaceReloadWithPorts,
  createWorkspaceTabTransfer,
  createWorkspaceWindowClose,
  type DocumentReadResult,
  type KeyedOperationLease,
  type WorkspaceWindowCloseConfirmation,
  type WriteDocumentResult
} from "@fishmark/workspace-application";

import { createSuccessfulDiskRepository, createTestCloseWorkspace } from "./workspace-application.integration.test-helper";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createWorkspaceWindowCloseConfirmationHandler } from "./workspace-window-close-confirmation-handler";
import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";
import { openTestDocument } from "./workspace.test-helper";

const document = (content: string) => ({
  fileIdentity: fileIdentity("file:c:/notes/race.md"),
  path: "C:/notes/race.md",
  name: "race.md",
  content,
  encoding: "utf-8" as const
});

const diskVersion = () => ({
  normalizedPath: "C:/notes/race.md",
  mtimeMs: 1,
  size: 1,
  contentHash: "test-hash"
});

function createWorkspaceReloadForTest(
  dependencies: Omit<
    Parameters<typeof createWorkspaceReloadWithPorts>[0],
    "fileLocationOperations" | "fileObjectOperations" | "fileIdentity" | "file" | "recentFiles"
  > & {
    openMarkdownFileFromPath: (targetPath: string) => Promise<DocumentReadResult>;
    recordRecentFilePath: (targetPath: string) => Promise<void>;
  }
) {
  const { openMarkdownFileFromPath, recordRecentFilePath, ...rest } = dependencies;
  return createWorkspaceReloadWithPorts({
    ...rest,
    fileLocationOperations: createKeyedOperationCoordinator(),
    fileObjectOperations: createKeyedOperationCoordinator(),
    fileIdentity: { resolveExisting: async (targetPath) => resolvedTestFile(targetPath) },
    file: { read: openMarkdownFileFromPath },
    recentFiles: { record: recordRecentFilePath }
  });
}

function createSaveOperations(
  workspace: ReturnType<typeof createWorkspaceState>,
  documentOperations: ReturnType<
    typeof createKeyedOperationCoordinator
  >,
  writeDocument: (
    input: { readonly content: string; readonly path: string }
  ) => Promise<WriteDocumentResult>
) {
  return createSaveDocumentForTest({
    workspace,
    tabOperations: documentOperations,
    fileLocationOperations: createKeyedOperationCoordinator(),
    fileObjectOperations: createKeyedOperationCoordinator(),
    fileIdentity: {
      resolveExisting: async (targetPath) => resolvedTestFile(targetPath),
      resolveProspective: async (targetPath) => resolvedTestFile(targetPath)
    },
    disk: {
      readDiskVersion: async () => ({
        normalizedPath: "C:/notes/race.md",
        mtimeMs: 1,
        size: 1,
        contentHash: "test-hash"
      }),
      writeDocument
    },
    dialog: { chooseSavePath: vi.fn() },
    watcher: {
      beginInternalWrite: vi.fn(),
      completeInternalWrite: vi.fn(async () => undefined),
      syncWindowPaths: vi.fn(async () => undefined)
    },
    recentFiles: { record: vi.fn(async () => undefined) },
    cleanupReporter: { report: vi.fn() }
  });
}

function resolvedTestFile(targetPath: string) {
  const identity = fileIdentity(`file:${targetPath.toLowerCase()}`);
  return {
    canonicalPath: targetPath,
    identity,
    exists: true as const,
    pathKey: identity.location,
    physicalKey: identity.object
  };
}

const sender = { id: 1 };

describe("workspace application document IO transactions", () => {
  it("commits an in-flight save before a queued move transfers the clean session", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("saved")
    ).activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    workspace.registerWindow("window-2");
    let resolveWrite!: (result: WriteDocumentResult) => void;
    const save = createSaveOperations(
      workspace,
      documentOperations,
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        })
    );
    const transfer = createWorkspaceTabTransfer({
      workspace,
      documentOperations
    });

    const savePromise = save.save({
      context: sender,
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    const movePromise = transfer.move({
      tabId,
      expectedWindowId: "window-1",
      targetWindowId: "window-2"
    });
    expect(workspace.getTabSession(tabId).windowId).toBe("window-1");

    resolveWrite({ status: "success", diskVersion: diskVersion(), document: document("dirty") });
    await savePromise;
    await movePromise;

    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      content: "dirty",
      savedRevision: 1,
      isDirty: false
    });
  });

  it("rejects an old-owner save before writing when a queued move wins the lease", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("saved")
    ).activeTabId!;
    workspace.registerWindow("window-2");
    const write = vi.fn(async () => ({
      status: "success" as const, diskVersion: diskVersion(),
      document: document("should not write")
    }));
    const save = createSaveOperations(workspace, documentOperations, write);
    const transfer = createWorkspaceTabTransfer({
      workspace,
      documentOperations
    });
    const held = await documentOperations.acquireExclusive([tabId]);
    const movePromise = transfer.move({
      tabId,
      expectedWindowId: "window-1",
      targetWindowId: "window-2"
    });
    const savePromise = save.save({
      context: sender,
      tabId,
      expectedWindowId: "window-1"
    });

    held.release();
    await movePromise;
    await expect(savePromise).resolves.toMatchObject({
      status: "error",
      error: { code: "window-changed" }
    });
    expect(write).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId).windowId).toBe("window-2");
  });

  it("commits an in-flight reload before a queued detach transfers disk content", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("before")
    ).activeTabId!;
    let resolveRead!: (result: DocumentReadResult) => void;
    const reload = createWorkspaceReloadForTest({
      workspace,
      tabOperations: documentOperations,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath: vi.fn(async () => undefined)
    });
    const transfer = createWorkspaceTabTransfer({
      workspace,
      documentOperations
    });

    const reloadPromise = reload.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    const detachPromise = transfer.detach({
      tabId,
      expectedWindowId: "window-1",
      targetWindowId: "window-2"
    });
    expect(workspace.getTabSession(tabId).windowId).toBe("window-1");

    resolveRead({ status: "success", diskVersion: diskVersion(), document: document("disk after") });
    await reloadPromise;
    await detachPromise;

    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      content: "disk after",
      isDirty: false
    });
  });

  it("rejects an old-owner reload before reading when a queued detach wins the lease", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("before")
    ).activeTabId!;
    const read = vi.fn(async () => ({
      status: "success" as const, diskVersion: diskVersion(),
      document: document("should not read")
    }));
    const reload = createWorkspaceReloadForTest({
      workspace,
      tabOperations: documentOperations,
      openMarkdownFileFromPath: read,
      recordRecentFilePath: vi.fn(async () => undefined)
    });
    const transfer = createWorkspaceTabTransfer({
      workspace,
      documentOperations
    });
    const held = await documentOperations.acquireExclusive([tabId]);
    const detachPromise = transfer.detach({
      tabId,
      expectedWindowId: "window-1",
      targetWindowId: "window-2"
    });
    const reloadPromise = reload.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });

    held.release();
    await detachPromise;
    await expect(reloadPromise).resolves.toMatchObject({
      kind: "stale",
      reason: "window-changed"
    });
    expect(read).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId).windowId).toBe("window-2");
  });

  it("does not let a save overtake an in-flight reload of the same tab", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace, "window-1", document("A")).activeTabId!;
    let resolveRead!: (result: DocumentReadResult) => void;
    const write = vi.fn(async ({ content }: { readonly content: string }) => ({
      status: "success" as const, diskVersion: diskVersion(),
      document: document(content)
    }));
    const reload = createWorkspaceReloadForTest({
      workspace,
      tabOperations: documentOperations,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath: vi.fn(async () => undefined)
    });
    const save = createSaveOperations(workspace, documentOperations, write);

    const reloadPromise = reload.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    const savePromise = save.save({
      context: sender,
      tabId,
      expectedWindowId: "window-1"
    });

    expect(write).not.toHaveBeenCalled();

    resolveRead({ status: "success", diskVersion: diskVersion(), document: document("B") });
    await reloadPromise;
    await savePromise;

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ content: "B" })
    );
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "B",
      isDirty: false
    });
  });

  it("does not let a reload overtake an in-flight save of the same tab", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace, "window-1", document("before")).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "A" });
    let diskContent = "before";
    let resolveWrite!: (result: WriteDocumentResult) => void;
    const write = vi.fn(
      ({ content }: { readonly content: string }) =>
        new Promise<WriteDocumentResult>((resolve) => {
          diskContent = content;
          resolveWrite = resolve;
        })
    );
    const read = vi.fn(async () => ({
      status: "success" as const, diskVersion: diskVersion(),
      document: document(diskContent)
    }));
    const save = createSaveOperations(workspace, documentOperations, write);
    const reload = createWorkspaceReloadForTest({
      workspace,
      tabOperations: documentOperations,
      openMarkdownFileFromPath: read,
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    const savePromise = save.save({
      context: sender,
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    const reloadPromise = reload.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });

    expect(read).not.toHaveBeenCalled();

    resolveWrite({ status: "success", diskVersion: diskVersion(), document: document("A") });
    await savePromise;
    await reloadPromise;

    expect(read).toHaveBeenCalledOnce();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "A",
      isDirty: false
    });
  });

  it("does not write a queued save after discard closes the tab", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace, "window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const write = vi.fn<
      (input: { readonly content: string }) => Promise<WriteDocumentResult>
    >(async ({ content }) => ({ status: "success", diskVersion: diskVersion(), document: document(content) }));
    const close = createTestCloseWorkspace({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      disk: { readDiskVersion: async () => ({ normalizedPath: "C:/notes/x.md", mtimeMs: 1, size: 1, contentHash: "test-hash" }), writeDocument: write },
    });
    const save = createSaveOperations(workspace, documentOperations, write);

    const closePromise = close.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    const savePromise = save.save({
      context: sender,
      tabId,
      expectedWindowId: "window-1"
    });

    expect(write).not.toHaveBeenCalled();

    resolvePrompt("discard");
    await expect(closePromise).resolves.toMatchObject({ status: "closed" });
    await expect(savePromise).resolves.toMatchObject({
      status: "error",
      error: { code: "tab-missing" }
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("waits for an in-flight save before closing the now-clean tab", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace, "window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let resolveWrite!: (result: WriteDocumentResult) => void;
    const write = vi.fn(
      () =>
        new Promise<WriteDocumentResult>((resolve) => {
          resolveWrite = resolve;
        })
    );
    const prompt = vi.fn(async () => "discard" as const);
    const save = createSaveOperations(workspace, documentOperations, write);
    const close = createTestCloseWorkspace({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: prompt,
      disk: { readDiskVersion: async () => ({ normalizedPath: "C:/notes/x.md", mtimeMs: 1, size: 1, contentHash: "test-hash" }), writeDocument: write },
    });

    const savePromise = save.save({
      context: sender,
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    const closePromise = close.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });

    expect(prompt).not.toHaveBeenCalled();
    resolveWrite({ status: "success", diskVersion: diskVersion(), document: document("dirty") });
    await savePromise;
    await expect(closePromise).resolves.toMatchObject({ status: "closed" });

    expect(prompt).not.toHaveBeenCalled();
    expect(() => workspace.getTabSession(tabId)).toThrow(
      `Unknown workspace tab '${tabId}'.`
    );
  });

  it.each([
    { lifecycle: "renderer-abort", choice: "save" },
    { lifecycle: "window-close", choice: "discard" }
  ] as const)(
    "holds the window lease until a $lifecycle confirmation prompt drains",
    async ({ lifecycle, choice }) => {
      const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
      const documentOperations = createKeyedOperationCoordinator();
      workspace.registerWindow("window-1");
      const tabId = openTestDocument(workspace,
        "window-1",
        document("saved")
      ).activeTabId!;
      workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
      let resolvePrompt!: (value: "save" | "discard") => void;
      const closeWrite = vi.fn();
      const closeUseCase = createTestCloseWorkspace({
        workspace,
        documentOperations,
        promptToSaveWorkspaceTab: () =>
          new Promise((resolve) => {
            resolvePrompt = resolve;
          }),
        disk: { readDiskVersion: async () => ({ normalizedPath: "C:/notes/x.md", mtimeMs: 1, size: 1, contentHash: "test-hash" }), writeDocument: closeWrite },
      });
      let abort!: () => void;
      const broker = createWorkspaceWindowCloseRequestBroker<
        WorkspaceWindowCloseConfirmation
      >({
        scheduleTimeout: () => vi.fn(),
        schedulePostConfirmationWatchdog: () => vi.fn()
      });
      let requestId = "";
      let closeLease!: KeyedOperationLease<string>;
      const windowClose = createWorkspaceWindowClose({
        workspace,
        documentOperations,
        requestWorkspaceWindowClose: async (_ownerWindow, tabLease) => {
          closeLease = tabLease;
          const handle = broker.request({
            windowId: "window-1",
            sendRequest: (id) => {
              requestId = id;
            },
            bindAbort: (listener) => {
              abort = listener;
              return vi.fn();
            }
          });
          try {
            return await handle.result;
          } finally {
            await handle.drained;
          }
        }
      });

      const closePromise = windowClose.requestWindowClose({
        windowId: "window-1",
        ownerWindow: { id: 1 }
      });
      await vi.waitFor(() => expect(requestId).not.toBe(""));
      const identity = { windowId: "window-1", requestId };
      const confirmationPromise =
        createWorkspaceWindowCloseConfirmationHandler({
          broker,
          closeWorkspace: {
            confirmWindowClose: (input) =>
              closeUseCase.confirmWindowClose(input, closeLease)
          }
        })(identity);
      await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
      const queuedWrite = vi.fn(async () => ({
        status: "success" as const, diskVersion: diskVersion(),
        document: document("dirty")
      }));
      const queuedSave = createSaveOperations(
        workspace,
        documentOperations,
        queuedWrite
      ).save({
        context: sender,
        tabId,
        expectedWindowId: "window-1"
      });
      let closeSettled = false;
      void closePromise.then(() => {
        closeSettled = true;
      });

      if (lifecycle === "renderer-abort") {
        abort();
      } else {
        broker.abortWindow("window-1");
      }
      await Promise.resolve();
      expect(closeSettled).toBe(false);
      expect(queuedWrite).not.toHaveBeenCalled();

      resolvePrompt(choice);
      await expect(confirmationPromise).resolves.toEqual({ status: "cancelled" });
      await expect(closePromise).resolves.toBeNull();
      await expect(queuedSave).resolves.toMatchObject({ status: "success" });
      expect(closeWrite).not.toHaveBeenCalled();
      expect(queuedWrite).toHaveBeenCalledOnce();
      expect(broker.complete(requestId, "window-1", true)).toBe(false);
    }
  );

  it("keeps queued IO blocked until an inactive close write returns and drains", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let resolveCloseWrite!: (result: WriteDocumentResult) => void;
    const closeWrite = vi.fn(
      () =>
        new Promise<WriteDocumentResult>((resolve) => {
          resolveCloseWrite = resolve;
        })
    );
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const closeUseCase = createTestCloseWorkspace({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: vi.fn(async () => "save" as const),
      disk: { readDiskVersion: async () => ({ normalizedPath: "C:/notes/x.md", mtimeMs: 1, size: 1, contentHash: "test-hash" }), writeDocument: closeWrite },
    });
    let abort!: () => void;
    const broker = createWorkspaceWindowCloseRequestBroker<
      WorkspaceWindowCloseConfirmation
    >({
      scheduleTimeout: () => vi.fn(),
      schedulePostConfirmationWatchdog: () => vi.fn()
    });
    let requestId = "";
    let closeLease!: KeyedOperationLease<string>;
    const windowClose = createWorkspaceWindowClose({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: async (_ownerWindow, tabLease) => {
        closeLease = tabLease;
        const handle = broker.request({
          windowId: "window-1",
          sendRequest: (id) => {
            requestId = id;
          },
          bindAbort: (listener) => {
            abort = listener;
            return vi.fn();
          }
        });
        try {
          return await handle.result;
        } finally {
          await handle.drained;
        }
      }
    });
    const closePromise = windowClose.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    await vi.waitFor(() => expect(requestId).not.toBe(""));
    const identity = { windowId: "window-1", requestId };
    const confirmationPromise =
      createWorkspaceWindowCloseConfirmationHandler({
        broker,
        closeWorkspace: {
          confirmWindowClose: (input) =>
            closeUseCase.confirmWindowClose(input, closeLease)
        }
      })(identity);
    await vi.waitFor(() => expect(resolveCloseWrite).toBeTypeOf("function"));
    let resolveQueuedWrite!: (result: WriteDocumentResult) => void;
    const queuedWrite = vi.fn(
      () =>
        new Promise<WriteDocumentResult>((resolve) => {
          resolveQueuedWrite = resolve;
        })
    );
    const queuedSave = createSaveOperations(
      workspace,
      documentOperations,
      queuedWrite
    ).save({
      context: sender,
      tabId,
      expectedWindowId: "window-1"
    });

    abort();
    expect(queuedWrite).not.toHaveBeenCalled();
    resolveCloseWrite({ status: "success", diskVersion: diskVersion(), document: document("dirty") });
    await expect(confirmationPromise).resolves.toEqual({ status: "cancelled" });
    await vi.waitFor(() => expect(resolveQueuedWrite).toBeTypeOf("function"));
    expect(saveTabDocument).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      savedRevision: 0,
      isDirty: true
    });

    resolveQueuedWrite({ status: "success", diskVersion: diskVersion(), document: document("dirty") });
    await expect(queuedSave).resolves.toMatchObject({ status: "success" });
    await expect(closePromise).resolves.toBeNull();
    expect(saveTabDocument).toHaveBeenCalledOnce();
    expect(closeWrite).toHaveBeenCalledOnce();
    expect(queuedWrite).toHaveBeenCalledOnce();
  });

  it("allows a native save confirmation to outlive the transport timeout", async () => {
    vi.useFakeTimers();
    try {
      const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
      const documentOperations = createKeyedOperationCoordinator();
      workspace.registerWindow("window-1");
      const tabId = openTestDocument(workspace,
        "window-1",
        document("saved")
      ).activeTabId!;
      workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
      let resolvePrompt!: (choice: "save") => void;
      const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
      const closeUseCase = createTestCloseWorkspace({
        workspace,
        documentOperations,
        promptToSaveWorkspaceTab: () =>
          new Promise((resolve) => {
            resolvePrompt = resolve;
          }),
        disk: createSuccessfulDiskRepository(),
      });
      const broker = createWorkspaceWindowCloseRequestBroker<
        WorkspaceWindowCloseConfirmation
      >({
        scheduleTimeout: (listener) => {
          const timeout = setTimeout(listener, 15_000);
          return () => clearTimeout(timeout);
        },
        schedulePostConfirmationWatchdog: () => vi.fn()
      });
      let requestId = "";
      let closeLease!: KeyedOperationLease<string>;
      const windowClose = createWorkspaceWindowClose({
        workspace,
        documentOperations,
        requestWorkspaceWindowClose: async (_ownerWindow, tabLease) => {
          closeLease = tabLease;
          const handle = broker.request({
            windowId: "window-1",
            sendRequest: (id) => {
              requestId = id;
            },
            bindAbort: () => vi.fn()
          });
          try {
            return await handle.result;
          } finally {
            await handle.drained;
          }
        }
      });
      const handleConfirmation =
        createWorkspaceWindowCloseConfirmationHandler({
          broker,
          closeWorkspace: {
            confirmWindowClose: (input) =>
              closeUseCase.confirmWindowClose(input, closeLease)
          }
        });

      const closePromise = windowClose.requestWindowClose({
        windowId: "window-1",
        ownerWindow: { id: 1 }
      });
      await vi.waitFor(() => expect(requestId).not.toBe(""));
      const confirmationPromise = handleConfirmation({
        windowId: "window-1",
        requestId
      });
      await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));

      await vi.advanceTimersByTimeAsync(60_000);
      expect(broker.hasPending("window-1")).toBe(true);
      resolvePrompt("save");

      await expect(confirmationPromise).resolves.toEqual({ status: "confirmed" });
      expect(broker.complete(requestId, "window-1", true)).toBe(true);
      const heldLease = await closePromise;
      expect(heldLease).not.toBeNull();
      expect(saveTabDocument).toHaveBeenCalledOnce();
      expect(workspace.getTabSession(tabId)).toMatchObject({
        savedRevision: 1,
        isDirty: false
      });

      workspace.unregisterWindow("window-1");
      heldLease?.release();
    } finally {
      vi.useRealTimers();
    }
  });
});
