import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createWorkspaceCloseCoordinator } from "./workspace-close-coordinator";
import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { createWorkspaceFileOperations } from "./workspace-file-operations";
import { createWorkspaceReloadApplication } from "./workspace-reload-application";
import { createWorkspaceWindowCloseApplication } from "./workspace-window-close-application";
import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";

const document = (content: string) => ({
  path: "C:/notes/race.md",
  name: "race.md",
  content,
  encoding: "utf-8" as const
});

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
    syncDocumentPath: vi.fn(async () => undefined),
    recordRecentFilePath: vi.fn(async () => undefined),
    reportCleanupError: vi.fn()
  });
}

const sender = { id: 1 };

describe("workspace document IO transactions", () => {
  it("does not let a save overtake an in-flight reload of the same tab", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("A")).activeTabId!;
    let resolveRead!: (result: OpenMarkdownFileResult) => void;
    const write = vi.fn(async ({ content }: { readonly content: string }) => ({
      status: "success" as const,
      document: document(content)
    }));
    const reload = createWorkspaceReloadApplication({
      workspace,
      documentOperations,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath: vi.fn(async () => undefined)
    });
    const save = createSaveOperations(workspace, documentOperations, write);

    const reloadPromise = reload.reloadTab({
      tabId,
      expectedWindowId: "window-1",
      targetPath: "C:/notes/race.md"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    const savePromise = save.save({
      sender,
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/race.md"
    });

    expect(write).not.toHaveBeenCalled();

    resolveRead({ status: "success", document: document("B") });
    await reloadPromise;
    await savePromise;

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ tabId, content: "B" })
    );
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "B",
      isDirty: false
    });
  });

  it("does not let a reload overtake an in-flight save of the same tab", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("before")).activeTabId!;
    workspace.updateTabDraft(tabId, "A");
    let diskContent = "before";
    let resolveWrite!: (result: SaveMarkdownFileResult) => void;
    const write = vi.fn(
      ({ content }: { readonly content: string }) =>
        new Promise<SaveMarkdownFileResult>((resolve) => {
          diskContent = content;
          resolveWrite = resolve;
        })
    );
    const read = vi.fn(async () => ({
      status: "success" as const,
      document: document(diskContent)
    }));
    const save = createSaveOperations(workspace, documentOperations, write);
    const reload = createWorkspaceReloadApplication({
      workspace,
      documentOperations,
      openMarkdownFileFromPath: read,
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    const savePromise = save.save({
      sender,
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/race.md"
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    const reloadPromise = reload.reloadTab({
      tabId,
      expectedWindowId: "window-1",
      targetPath: "C:/notes/race.md"
    });

    expect(read).not.toHaveBeenCalled();

    resolveWrite({ status: "success", document: document("A") });
    await savePromise;
    await reloadPromise;

    expect(read).toHaveBeenCalledOnce();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "A",
      isDirty: false
    });
  });

  it("does not write a queued save after discard closes the tab", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft(tabId, "dirty");
    let resolvePrompt!: (choice: "discard") => void;
    const write = vi.fn<
      (input: { readonly content: string }) => Promise<SaveMarkdownFileResult>
    >(async ({ content }) => ({ status: "success", document: document(content) }));
    const close = createWorkspaceCloseCoordinator({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      saveMarkdownFileToPath: write,
      showSaveMarkdownDialog: vi.fn()
    });
    const save = createSaveOperations(workspace, documentOperations, write);

    const closePromise = close.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    const savePromise = save.save({
      sender,
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/race.md"
    });

    expect(write).not.toHaveBeenCalled();

    resolvePrompt("discard");
    await expect(closePromise).resolves.toMatchObject({ status: "closed" });
    await expect(savePromise).rejects.toThrow(`Unknown workspace tab '${tabId}'.`);
    expect(write).not.toHaveBeenCalled();
  });

  it("waits for an in-flight save before closing the now-clean tab", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument("window-1", document("saved")).activeTabId!;
    workspace.updateTabDraft(tabId, "dirty");
    let resolveWrite!: (result: SaveMarkdownFileResult) => void;
    const write = vi.fn(
      () =>
        new Promise<SaveMarkdownFileResult>((resolve) => {
          resolveWrite = resolve;
        })
    );
    const prompt = vi.fn(async () => "discard" as const);
    const save = createSaveOperations(workspace, documentOperations, write);
    const close = createWorkspaceCloseCoordinator({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: prompt,
      saveMarkdownFileToPath: write,
      showSaveMarkdownDialog: vi.fn()
    });

    const savePromise = save.save({
      sender,
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/race.md"
    });
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    const closePromise = close.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });

    expect(prompt).not.toHaveBeenCalled();
    resolveWrite({ status: "success", document: document("dirty") });
    await savePromise;
    await expect(closePromise).resolves.toMatchObject({ status: "closed" });

    expect(prompt).not.toHaveBeenCalled();
    expect(() => workspace.getTabSession(tabId)).toThrow(
      `Unknown workspace tab '${tabId}'.`
    );
  });

  it.each([
    { lifecycle: "timeout", choice: "save" },
    { lifecycle: "abort", choice: "discard" }
  ] as const)(
    "holds the window lease until a $lifecycle confirmation prompt drains",
    async ({ lifecycle, choice }) => {
      const workspace = createWorkspaceState();
      const documentOperations = createWorkspaceDocumentOperationCoordinator();
      workspace.registerWindow("window-1");
      const tabId = workspace.openDocument(
        "window-1",
        document("saved")
      ).activeTabId!;
      workspace.updateTabDraft(tabId, "dirty");
      let resolvePrompt!: (value: "save" | "discard") => void;
      const closeWrite = vi.fn();
      const closeCoordinator = createWorkspaceCloseCoordinator({
        workspace,
        documentOperations,
        promptToSaveWorkspaceTab: () =>
          new Promise((resolve) => {
            resolvePrompt = resolve;
          }),
        saveMarkdownFileToPath: closeWrite,
        showSaveMarkdownDialog: vi.fn()
      });
      let timeout!: () => void;
      let abort!: () => void;
      const broker = createWorkspaceWindowCloseRequestBroker<
        NonNullable<
          Awaited<ReturnType<typeof closeCoordinator.confirmWindowClose>>
        >
      >({
        scheduleTimeout: (listener) => {
          timeout = listener;
          return vi.fn();
        }
      });
      let requestId = "";
      const windowClose = createWorkspaceWindowCloseApplication({
        workspace,
        documentOperations,
        requestWorkspaceWindowClose: async () => {
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
      const identity = broker.getPendingIdentity("window-1")!;
      const scope = broker.beginConfirmation(identity)!;
      const confirmationPromise = (async () => {
        try {
          const confirmation = await closeCoordinator.confirmWindowClose({
            windowId: "window-1",
            isActive: scope.isActive
          });
          return confirmation !== null &&
            broker.setConfirmation({ ...identity, confirmation });
        } finally {
          scope.finish();
        }
      })();
      await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
      const queuedWrite = vi.fn(async () => ({
        status: "success" as const,
        document: document("dirty")
      }));
      const queuedSave = createSaveOperations(
        workspace,
        documentOperations,
        queuedWrite
      ).save({
        sender,
        tabId,
        expectedWindowId: "window-1",
        path: "C:/notes/race.md"
      });
      let closeSettled = false;
      void closePromise.then(() => {
        closeSettled = true;
      });

      if (lifecycle === "timeout") {
        timeout();
      } else {
        abort();
      }
      await Promise.resolve();
      expect(closeSettled).toBe(false);
      expect(queuedWrite).not.toHaveBeenCalled();

      resolvePrompt(choice);
      await expect(confirmationPromise).resolves.toBe(false);
      await expect(closePromise).resolves.toBeNull();
      await expect(queuedSave).resolves.toMatchObject({ status: "success" });
      expect(closeWrite).not.toHaveBeenCalled();
      expect(queuedWrite).toHaveBeenCalledOnce();
      expect(broker.complete(requestId, "window-1", true)).toBe(false);
    }
  );

  it("keeps queued IO blocked until an inactive close write returns and drains", async () => {
    const workspace = createWorkspaceState();
    const documentOperations = createWorkspaceDocumentOperationCoordinator();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("saved")
    ).activeTabId!;
    workspace.updateTabDraft(tabId, "dirty");
    let resolveCloseWrite!: (result: SaveMarkdownFileResult) => void;
    const closeWrite = vi.fn(
      () =>
        new Promise<SaveMarkdownFileResult>((resolve) => {
          resolveCloseWrite = resolve;
        })
    );
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: vi.fn(async () => "save" as const),
      saveMarkdownFileToPath: closeWrite,
      showSaveMarkdownDialog: vi.fn()
    });
    let timeout!: () => void;
    const broker = createWorkspaceWindowCloseRequestBroker<
      NonNullable<Awaited<ReturnType<typeof closeCoordinator.confirmWindowClose>>>
    >({
      scheduleTimeout: (listener) => {
        timeout = listener;
        return vi.fn();
      }
    });
    let requestId = "";
    const windowClose = createWorkspaceWindowCloseApplication({
      workspace,
      documentOperations,
      requestWorkspaceWindowClose: async () => {
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
    const closePromise = windowClose.requestWindowClose({
      windowId: "window-1",
      ownerWindow: { id: 1 }
    });
    await vi.waitFor(() => expect(requestId).not.toBe(""));
    const identity = broker.getPendingIdentity("window-1")!;
    const scope = broker.beginConfirmation(identity)!;
    const confirmationPromise = (async () => {
      try {
        const confirmation = await closeCoordinator.confirmWindowClose({
          windowId: "window-1",
          isActive: scope.isActive
        });
        return confirmation !== null &&
          broker.setConfirmation({ ...identity, confirmation });
      } finally {
        scope.finish();
      }
    })();
    await vi.waitFor(() => expect(resolveCloseWrite).toBeTypeOf("function"));
    let resolveQueuedWrite!: (result: SaveMarkdownFileResult) => void;
    const queuedWrite = vi.fn(
      () =>
        new Promise<SaveMarkdownFileResult>((resolve) => {
          resolveQueuedWrite = resolve;
        })
    );
    const queuedSave = createSaveOperations(
      workspace,
      documentOperations,
      queuedWrite
    ).save({
      sender,
      tabId,
      expectedWindowId: "window-1",
      path: "C:/notes/race.md"
    });

    timeout();
    expect(queuedWrite).not.toHaveBeenCalled();
    resolveCloseWrite({ status: "success", document: document("dirty") });
    await expect(confirmationPromise).resolves.toBe(false);
    await vi.waitFor(() => expect(resolveQueuedWrite).toBeTypeOf("function"));
    expect(saveTabDocument).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      savedRevision: 0,
      isDirty: true
    });

    resolveQueuedWrite({ status: "success", document: document("dirty") });
    await expect(queuedSave).resolves.toMatchObject({ status: "success" });
    await expect(closePromise).resolves.toBeNull();
    expect(saveTabDocument).toHaveBeenCalledOnce();
    expect(closeWrite).toHaveBeenCalledOnce();
    expect(queuedWrite).toHaveBeenCalledOnce();
  });
});
