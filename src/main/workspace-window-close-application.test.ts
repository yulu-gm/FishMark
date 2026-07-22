import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import {
  createWorkspaceCloseCoordinator,
  type WorkspaceWindowCloseConfirmation
} from "./workspace-close-coordinator";
import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { createWorkspaceFileOperations } from "./workspace-file-operations";
import { createWorkspaceWindowCloseApplication } from "./workspace-window-close-application";

const document = (content: string) => ({
  path: "C:/notes/window-close.md",
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
    typeof createWorkspaceDocumentOperationCoordinator
  >,
  saveMarkdownFileToPath: (
    input: { readonly content: string; readonly tabId: string; readonly path: string }
  ) => Promise<SaveMarkdownFileResult>
) {
  return createWorkspaceFileOperations({
    workspace,
    documentOperations,
    saveMarkdownFileToPath,
    showSaveMarkdownDialog: vi.fn(),
    beginInternalWrite: vi.fn(),
    completeInternalWrite: vi.fn(async () => undefined),
    syncWindowWatch: vi.fn(async () => undefined),
    recordRecentFilePath: vi.fn(async () => undefined),
    reportCleanupError: vi.fn()
  });
}

describe("createWorkspaceWindowCloseApplication", () => {
  it("holds every tab lease through confirmed discard until unregister", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });
    const application = createWorkspaceWindowCloseApplication({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: () =>
        closeCoordinator.confirmWindowClose({
          windowId: "window-1",
          isActive: () => true
        })
    });
    const write = vi.fn(async ({ content }: { readonly content: string }) => ({
      status: "success" as const,
      document: document(content)
    }));
    const save = createSaveOperations(workspace, documentOperations, write);
    const ownerWindow = { id: 1 };

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow
    });
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    const savePromise = save.save({
      sender: { id: 1 },
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
    await expect(savePromise).rejects.toThrow(`Unknown workspace tab '${tabId}'.`);
    expect(write).not.toHaveBeenCalled();
  });

  it("releases all tab leases when native close confirmation is cancelled", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let resolveRequest!: (
      confirmation: WorkspaceWindowCloseConfirmation | null
    ) => void;
    const application = createWorkspaceWindowCloseApplication({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    });
    const write = vi.fn<
      (input: { readonly content: string }) => Promise<SaveMarkdownFileResult>
    >(async ({ content }) => ({ status: "success", document: document(content) }));
    const save = createSaveOperations(workspace, documentOperations, write);

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    await vi.waitFor(() => expect(resolveRequest).toBeTypeOf("function"));
    const savePromise = save.save({
      sender: { id: 1 },
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
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("first")).activeTabId!;
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
    const application = createWorkspaceWindowCloseApplication({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose
    });

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    workspace.openDocument("window-1", {
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
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument(
      "window-1",
      document("first")
    ).activeTabId!;
    let resolveRequest!: (
      confirmation: WorkspaceWindowCloseConfirmation | null
    ) => void;
    const application = createWorkspaceWindowCloseApplication({
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
    const secondTabId = workspace.openDocument("window-1", {
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
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
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
    const application = createWorkspaceWindowCloseApplication({
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
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("saved")
    ).activeTabId!;
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: vi.fn(async () => "discard" as const),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });
    const application = createWorkspaceWindowCloseApplication({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: async () => {
        workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "flushed before confirm" });
        return closeCoordinator.confirmWindowClose({
          windowId: "window-1",
          isActive: () => true
        });
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
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("saved")).activeTabId!;
    const failure = new Error("renderer handshake failed");
    const application = createWorkspaceWindowCloseApplication({
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
