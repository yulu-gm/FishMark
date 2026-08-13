import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import {
  createSaveDocument,
  createWorkspaceWindowClose,
  type WorkspaceWindowCloseConfirmation,
  type WriteDocumentResult
} from "@fishmark/workspace-application";

import { createSuccessfulDiskRepository, createTestCloseWorkspace } from "./workspace-application.integration.test-helper";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { openTestDocument } from "./workspace.test-helper";

const document = (content: string) => ({
  fileIdentity: fileIdentity(`file:c:/notes/window-close-${content}.md`),
  path: `C:/notes/window-close-${content}.md`,
  name: "window-close.md",
  content,
  encoding: "utf-8" as const
});

function closeConfirmation(
  windowId: string,
  checkpoints: WorkspaceWindowCloseConfirmation["checkpoints"]
): WorkspaceWindowCloseConfirmation {
  return Object.freeze({
    windowId,
    checkpoints: Object.freeze(
      checkpoints.map((checkpoint) => Object.freeze({ ...checkpoint }))
    )
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
  return createSaveDocument({
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
        normalizedPath: "C:/notes/window-close.md",
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

describe("workspace window close use case", () => {
  it("holds every tab lease through confirmed discard until unregister", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace, "window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const closeUseCase = createTestCloseWorkspace({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      disk: createSuccessfulDiskRepository(),
    });
    const application = createWorkspaceWindowClose({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: async (_ownerWindow, tabLease) => {
        const result = await closeUseCase.confirmWindowClose({
          windowId: "window-1",
          isActive: () => true
        }, tabLease);
        return result.status === "confirmed" ? result.confirmation : null;
      }
    });
    const write = vi.fn(async ({ content, path }: { readonly content: string; readonly path: string }) => ({
      status: "success" as const,
      diskVersion: {
        normalizedPath: path,
        mtimeMs: 1,
        size: content.length,
        contentHash: "test-hash"
      },
      document: {
        path,
        name: path.split("/").at(-1)!,
        content,
        encoding: "utf-8" as const
      }
    }));
    const save = createSaveOperations(workspace, documentOperations, write);
    const ownerWindow = { id: 1 };

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow
    });
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    const savePromise = save.save({
      context: { id: 1 },
      tabId,
      expectedWindowId: "window-1"
    });
    expect(write).not.toHaveBeenCalled();

    resolvePrompt("discard");
    const heldLease = await closePromise;
    expect(heldLease).not.toBeNull();
    expect(write).not.toHaveBeenCalled();

    workspace.unregisterWindow("window-1");
    heldLease?.release();
    await expect(savePromise).resolves.toMatchObject({
      status: "error",
      error: { code: "tab-missing" }
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("releases all tab leases when native close confirmation is cancelled", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace, "window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let resolveRequest!: (
      confirmation: WorkspaceWindowCloseConfirmation | null
    ) => void;
    const application = createWorkspaceWindowClose({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    });
    const write = vi.fn<
      (input: { readonly content: string; readonly path: string }) => Promise<WriteDocumentResult>
    >(async ({ content, path }) => ({
      status: "success",
      diskVersion: {
        normalizedPath: path,
        mtimeMs: 1,
        size: content.length,
        contentHash: "test-hash"
      },
      document: {
        path,
        name: path.split("/").at(-1)!,
        content,
        encoding: "utf-8"
      }
    }));
    const save = createSaveOperations(workspace, documentOperations, write);

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    await vi.waitFor(() => expect(resolveRequest).toBeTypeOf("function"));
    const savePromise = save.save({
      context: { id: 1 },
      tabId,
      expectedWindowId: "window-1"
    });
    expect(write).not.toHaveBeenCalled();

    resolveRequest(null);
    await expect(closePromise).resolves.toBeNull();
    await expect(savePromise).resolves.toMatchObject({ status: "success" });
    expect(write).toHaveBeenCalledOnce();
    expect(workspace.getTabSession(tabId)).toMatchObject({ isDirty: false });
  });

  it("cancels before the renderer handshake when the tab set changes during acquisition", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace, "window-1", document("first")).activeTabId!;
    const blocker = await documentOperations.acquireExclusive([tabId]);
    const requestWorkspaceWindowClose = vi.fn(async () =>
      closeConfirmation("window-1", [
        {
          tabId,
          expectedWindowId: "window-1",
          expectedRevision: 0
        }
      ])
    );
    const application = createWorkspaceWindowClose({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose
    });

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    openTestDocument(workspace, "window-1", {
      ...document("second"),
      path: "C:/notes/second.md",
      name: "second.md"
    });
    blocker.release();

    await expect(closePromise).resolves.toBeNull();
    expect(requestWorkspaceWindowClose).not.toHaveBeenCalled();
    await expect(
      documentOperations.runExclusive(tabId, async () => "released")
    ).resolves.toBe("released");
  });

  it("cancels after a successful handshake when a tab is added while confirmation is pending", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const firstTabId = openTestDocument(workspace,
      "window-1",
      document("first")
    ).activeTabId!;
    let resolveRequest!: (
      confirmation: WorkspaceWindowCloseConfirmation | null
    ) => void;
    const application = createWorkspaceWindowClose({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    });

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    await vi.waitFor(() => expect(resolveRequest).toBeTypeOf("function"));
    const secondTabId = openTestDocument(workspace, "window-1", {
      ...document("second"),
      path: "C:/notes/second.md",
      name: "second.md"
    }).activeTabId!;
    const queuedOperation = vi.fn(async () => "continued");
    const queuedPromise = documentOperations.runExclusive(
      firstTabId,
      queuedOperation
    );
    expect(queuedOperation).not.toHaveBeenCalled();

    resolveRequest(
      closeConfirmation("window-1", [
        {
          tabId: firstTabId,
          expectedWindowId: "window-1",
          expectedRevision: 0
        }
      ])
    );

    await expect(closePromise).resolves.toBeNull();
    await expect(queuedPromise).resolves.toBe("continued");
    expect(queuedOperation).toHaveBeenCalledOnce();
    expect(workspace.getWindowTabIds("window-1")).toEqual([
      firstTabId,
      secondTabId
    ]);
  });

  it("cancels when a confirmed tab revision changes before the handshake completes", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "confirmed revision" });
    const confirmation = closeConfirmation("window-1", [
      {
          tabId,
          expectedWindowId: "window-1",
          expectedRevision: 1
      }
    ]);
    let resolveRequest!: (
      value: WorkspaceWindowCloseConfirmation | null
    ) => void;
    const application = createWorkspaceWindowClose({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    });

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    await vi.waitFor(() => expect(resolveRequest).toBeTypeOf("function"));
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "late revision" });
    const queuedOperation = vi.fn(async () => "continued");
    const queuedPromise = documentOperations.runExclusive(
      tabId,
      queuedOperation
    );
    expect(queuedOperation).not.toHaveBeenCalled();

    resolveRequest(confirmation);

    await expect(closePromise).resolves.toBeNull();
    await expect(queuedPromise).resolves.toBe("continued");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "late revision",
      revision: 2,
      isDirty: true
    });
  });

  it("accepts a draft revision flushed before close confirmation", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("saved")
    ).activeTabId!;
    const closeUseCase = createTestCloseWorkspace({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: vi.fn(async () => "discard" as const),
      disk: createSuccessfulDiskRepository(),
    });
    const application = createWorkspaceWindowClose({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: async (_ownerWindow, tabLease) => {
        workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "flushed before confirm" });
        const result = await closeUseCase.confirmWindowClose({
          windowId: "window-1",
          isActive: () => true
        }, tabLease);
        return result.status === "confirmed" ? result.confirmation : null;
      }
    });

    const heldLease = await application.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });

    expect(heldLease).not.toBeNull();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "flushed before confirm",
      revision: 1
    });
    heldLease?.release();
  });

  it("releases every lease when the renderer handshake rejects", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    const documentOperations = createKeyedOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace, "window-1", document("saved")).activeTabId!;
    const failure = new Error("renderer handshake failed");
    const application = createWorkspaceWindowClose({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: vi.fn(async () => {
        throw failure;
      })
    });

    await expect(
      application.requestWindowClose({
        windowId: "window-1",
        ownerWindow: { id: 1 }
      })
    ).rejects.toBe(failure);
    await expect(
      documentOperations.runExclusive(tabId, async () => "released")
    ).resolves.toBe("released");
  });
});
