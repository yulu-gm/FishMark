import { createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type {
  OpenMarkdownDocument,
  OpenMarkdownFileResult
} from "../shared/open-markdown-file";
import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";
import { createWorkspaceReloadApplication as createWorkspaceReloadApplicationWithOperations } from "./workspace-reload-application";

function createWorkspaceReloadApplication(
  dependencies: Omit<
    Parameters<typeof createWorkspaceReloadApplicationWithOperations>[0],
    "documentOperations"
  >
) {
  return createWorkspaceReloadApplicationWithOperations({
    ...dependencies,
    documentOperations: createWorkspaceDocumentOperationCoordinator()
  });
}

function document(name: string, content: string): OpenMarkdownDocument {
  return {
    path: `C:/notes/${name}`,
    name,
    content,
    encoding: "utf-8"
  };
}

describe("createWorkspaceReloadApplication", () => {
  it.each([
    ["null", null],
    ["different", "C:/notes/other.md"]
  ])(
    "rejects a reload adapter result with a %s path without recording or mutating",
    async (_caseName, returnedPath) => {
      const workspace = createWorkspaceState();
      workspace.registerWindow("window-1");
      const tabId = workspace.openDocument(
        "window-1",
        document("canonical.md", "before")
      ).activeTabId!;
      const recordRecentFilePath = vi.fn(async () => undefined);
      const application = createWorkspaceReloadApplication({
        workspace,
        openMarkdownFileFromPath: vi.fn(async () => JSON.parse(JSON.stringify({
          status: "success" as const,
          document: {
            path: returnedPath,
            name: "adapter.md",
            content: "disk",
            encoding: "utf-8" as const
          }
        }))),
        recordRecentFilePath
      });

      await expect(
        application.reloadTab({ tabId, expectedWindowId: "window-1" })
      ).rejects.toThrow(/Reload adapter/);
      expect(workspace.getTabSession(tabId)).toMatchObject({
        path: "C:/notes/canonical.md",
        name: "canonical.md",
        content: "before",
        revision: 0,
        savedRevision: 0,
        isDirty: false
      });
      expect(recordRecentFilePath).not.toHaveBeenCalled();
    }
  );

  it("reads only the canonical path after Save As retargets the document", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("before.md", "before")
    ).activeTabId!;
    workspace.saveTabDocument({
      tabId,
      expectedWindowId: "window-1",
      capturedRevision: 0,
      document: document("after.md", "before"),
      diskVersion: null
    });
    const openMarkdownFileFromPath = vi.fn(async () => ({
      status: "success" as const,
      document: document("after.md", "disk")
    }));
    const application = createWorkspaceReloadApplication({
      workspace,
      openMarkdownFileFromPath,
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    await application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });

    expect(openMarkdownFileFromPath).toHaveBeenCalledWith("C:/notes/after.md");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/after.md",
      content: "disk"
    });
  });

  it("replaces an unchanged captured checkpoint after deferred IO", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("reload.md", "before")
    ).activeTabId!;
    const recordRecentFilePath = vi.fn(async () => undefined);
    const application = createWorkspaceReloadApplication({
      workspace,
      openMarkdownFileFromPath: vi.fn(async () => ({
        status: "success" as const,
        document: document("reload.md", "after")
      })),
      recordRecentFilePath
    });

    const result = await application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });

    expect(result).toMatchObject({
      kind: "success",
      projection: {
        windowId: "window-1",
        activeDocument: { content: "after", isDirty: false }
      }
    });
    expect(recordRecentFilePath).toHaveBeenCalledWith("C:/notes/reload.md");
  });

  it("returns an explicit revision-stale result without recording recent or overwriting an edit during IO", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("edit-race.md", "before")
    ).activeTabId!;
    let resolveRead!: (result: OpenMarkdownFileResult) => void;
    const recordRecentFilePath = vi.fn(async () => undefined);
    const application = createWorkspaceReloadApplication({
      workspace,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath
    });

    const reloadPromise = application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "new draft" });
    resolveRead({
      status: "success",
      document: document("edit-race.md", "disk after")
    });

    await expect(reloadPromise).resolves.toEqual({ kind: "revision-stale" });
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "new draft",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    expect(recordRecentFilePath).not.toHaveBeenCalled();
  });

  it("rejects a reload commit after an out-of-band owner change", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.openDocument("window-1", document("source.md", "source"));
    const tabId = workspace.openDocument(
      "window-1",
      document("move-race.md", "before")
    ).activeTabId!;
    workspace.registerWindow("window-2");
    let resolveRead!: (result: OpenMarkdownFileResult) => void;
    const application = createWorkspaceReloadApplication({
      workspace,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    const reloadPromise = application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveRead({
      status: "success",
      document: document("move-race.md", "disk after")
    });

    await expect(reloadPromise).rejects.toThrow(
      "Workspace reload rejected: tab owner changed."
    );
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      content: "before",
      revision: 0,
      savedRevision: 0,
      isDirty: false
    });
  });

  it("explicitly rejects a stale reload after the expected window closes", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      document("closed-window.md", "before")
    ).activeTabId!;
    let resolveRead!: (result: OpenMarkdownFileResult) => void;
    const application = createWorkspaceReloadApplication({
      workspace,
      openMarkdownFileFromPath: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      recordRecentFilePath: vi.fn(async () => undefined)
    });

    const reloadPromise = application.reloadTab({
      tabId,
      expectedWindowId: "window-1"
    });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    workspace.unregisterWindow("window-1");
    resolveRead({
      status: "success",
      document: document("closed-window.md", "disk after")
    });

    await expect(reloadPromise).rejects.toThrow(
      "Workspace reload rejected: owner window no longer exists."
    );
  });
});
