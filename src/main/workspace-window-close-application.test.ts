import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createWorkspaceApplication } from "./workspace-application";
import { createWorkspaceCloseCoordinator } from "./workspace-close-coordinator";
import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { createWorkspaceWindowCloseApplication } from "./workspace-window-close-application";

const document = (content: string) => ({
  path: "C:/notes/window-close.md",
  name: "window-close.md",
  content,
  encoding: "utf-8" as const
});

describe("createWorkspaceWindowCloseApplication", () => {
  it("holds every tab lease through confirmed discard until unregister", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft(tabId, "dirty");
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
        closeCoordinator.confirmWindowClose("window-1")
    });
    const write = vi.fn(async ({ content }: { readonly content: string }) => ({
      status: "success" as const,
      document: document(content)
    }));
    const save = createWorkspaceApplication({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write
    });
    const ownerWindow = { id: 1 };

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow
    });
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    const savePromise = save.saveTab({
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/window-close.md"
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
    workspace.updateTabDraft(tabId, "dirty");
    let resolveRequest!: (shouldClose: boolean) => void;
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
    const save = createWorkspaceApplication({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write
    });

    const closePromise = application.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    await vi.waitFor(() => expect(resolveRequest).toBeTypeOf("function"));
    const savePromise = save.saveTab({
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/window-close.md"
    });
    expect(write).not.toHaveBeenCalled();

    resolveRequest(false);
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
    const requestWorkspaceWindowClose = vi.fn(async () => true);
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
