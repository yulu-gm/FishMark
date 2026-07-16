import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createWorkspaceApplication } from "./workspace-application";
import { createWorkspaceCloseCoordinator } from "./workspace-close-coordinator";
import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { createWorkspaceReloadApplication } from "./workspace-reload-application";

const document = (content: string) => ({
  path: "C:/notes/race.md",
  name: "race.md",
  content,
  encoding: "utf-8" as const
});

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
    const save = createWorkspaceApplication({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write
    });

    const reloadPromise = reload.reloadTab({
      tabId,
      expectedWindowId: "window-1",
      targetPath: "C:/notes/race.md"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    const savePromise = save.saveTab({
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
    const save = createWorkspaceApplication({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write
    });
    const reload = createWorkspaceReloadApplication({
      workspace,
      documentOperations,
      openMarkdownFileFromPath: read,
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    const savePromise = save.saveTab({
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
    const save = createWorkspaceApplication({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write
    });

    const closePromise = close.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    const savePromise = save.saveTab({
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
    const save = createWorkspaceApplication({
      workspace,
      documentOperations,
      saveMarkdownFileToPath: write
    });
    const close = createWorkspaceCloseCoordinator({
      workspace,
      documentOperations,
      promptToSaveWorkspaceTab: prompt,
      saveMarkdownFileToPath: write,
      showSaveMarkdownDialog: vi.fn()
    });

    const savePromise = save.saveTab({
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
});
