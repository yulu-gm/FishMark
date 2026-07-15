import {
  createWorkspaceState,
  type DocumentSessionProjection,
  type WorkspaceDocumentData
} from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createWorkspaceCloseCoordinator } from "./workspace-close-coordinator";

function createDocument(input: {
  path: string;
  name: string;
  content: string;
}): WorkspaceDocumentData {
  return {
    path: input.path,
    name: input.name,
    content: input.content,
    encoding: "utf-8"
  };
}

describe("createWorkspaceCloseCoordinator", () => {
  it("only prompts for the target dirty tab when closing a single tab", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const first = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      })
    );
    const second = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      })
    );
    workspace.updateTabDraft(first.activeTabId!, "# First dirty\n");
    workspace.updateTabDraft(second.activeTabId!, "# Second dirty\n");
    const promptToSaveWorkspaceTab = vi
      .fn<
        (tab: DocumentSessionProjection) => Promise<"save" | "discard" | "cancel">
      >()
      .mockResolvedValue("discard");
    const saveMarkdownFileToPath = vi.fn();
    const showSaveMarkdownDialog = vi.fn();
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog
    });

    const result = await closeCoordinator.closeTab(first.activeTabId!);

    expect(result).toMatchObject({ status: "closed" });
    expect(promptToSaveWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(promptToSaveWorkspaceTab).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: first.activeTabId,
        name: "first.md",
        content: "# First dirty\n",
        revision: 1,
        savedRevision: 0,
        isDirty: true
      })
    );
    expect(saveMarkdownFileToPath).not.toHaveBeenCalled();
    expect(showSaveMarkdownDialog).not.toHaveBeenCalled();
    expect(
      workspace.getWindowProjection("window-1").tabs.map((tab) => tab.tabId)
    ).toEqual([second.activeTabId]);
    expect(workspace.getTabSession(second.activeTabId!)).toMatchObject({
      content: "# Second dirty\n",
      revision: 1,
      isDirty: true
    });
  });

  it("iterates dirty tabs in window order before allowing the window to close", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const first = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      })
    );
    const second = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      })
    );
    const third = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/third.md",
        name: "third.md",
        content: "# Third\n"
      })
    );
    workspace.updateTabDraft(first.activeTabId!, "# First dirty\n");
    workspace.updateTabDraft(third.activeTabId!, "# Third dirty\n");
    const promptToSaveWorkspaceTab = vi
      .fn<
        (tab: DocumentSessionProjection) => Promise<"save" | "discard" | "cancel">
      >()
      .mockResolvedValueOnce("save")
      .mockResolvedValueOnce("discard");
    const saveMarkdownFileToPath = vi.fn(
      async (input: { tabId: string; path: string; content: string }) => ({
        status: "success" as const,
        document: {
          path: input.path,
          name: input.path.split("/").at(-1) ?? "saved.md",
          content: input.content,
          encoding: "utf-8" as const
        }
      })
    );
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn()
    });

    await expect(closeCoordinator.confirmWindowClose("window-1")).resolves.toBe(
      true
    );

    expect(promptToSaveWorkspaceTab.mock.calls.map((call) => call[0]?.tabId)).toEqual([
      first.activeTabId,
      third.activeTabId
    ]);
    expect(saveMarkdownFileToPath).toHaveBeenCalledWith({
      tabId: first.activeTabId,
      path: "C:/notes/first.md",
      content: "# First dirty\n"
    });
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId: first.activeTabId,
      capturedRevision: 1,
      document: createDocument({
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First dirty\n"
      }),
      diskVersion: null
    });
    expect(workspace.getTabSession(first.activeTabId!)).toMatchObject({
      revision: 1,
      savedRevision: 1,
      isDirty: false
    });
    expect(workspace.getTabSession(second.activeTabId!)).toMatchObject({
      revision: 0,
      savedRevision: 0,
      isDirty: false
    });
    expect(workspace.getTabSession(third.activeTabId!)).toMatchObject({
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("cancels window close when a dirty tab save prompt is aborted", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const first = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      })
    );
    const second = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      })
    );
    workspace.updateTabDraft(first.activeTabId!, "# First dirty\n");
    workspace.updateTabDraft(second.activeTabId!, "# Second dirty\n");
    const promptToSaveWorkspaceTab = vi
      .fn<
        (tab: DocumentSessionProjection) => Promise<"save" | "discard" | "cancel">
      >()
      .mockResolvedValueOnce("save")
      .mockResolvedValueOnce("cancel");
    const saveMarkdownFileToPath = vi.fn(
      async (input: { tabId: string; path: string; content: string }) => ({
        status: "success" as const,
        document: {
          path: input.path,
          name: input.path.split("/").at(-1) ?? "saved.md",
          content: input.content,
          encoding: "utf-8" as const
        }
      })
    );
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn()
    });

    await expect(closeCoordinator.confirmWindowClose("window-1")).resolves.toBe(
      false
    );

    expect(promptToSaveWorkspaceTab.mock.calls.map((call) => call[0]?.tabId)).toEqual([
      first.activeTabId,
      second.activeTabId
    ]);
    expect(saveMarkdownFileToPath).toHaveBeenCalledTimes(1);
    expect(
      workspace.getWindowProjection("window-1").tabs.map((tab) => tab.tabId)
    ).toEqual([first.activeTabId, second.activeTabId]);
    expect(workspace.getTabSession(second.activeTabId!)).toMatchObject({
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("routes untitled dirty tabs through Save As before closing them", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const untitled = workspace.createUntitledTab("window-1");
    const tabId = untitled.activeTabId!;
    workspace.updateTabDraft(tabId, "# Untitled dirty\n");
    const showSaveMarkdownDialog = vi.fn(
      async (input: {
        tabId: string;
        currentPath: string | null;
        content: string;
      }) => ({
        status: "success" as const,
        document: {
          path: "C:/notes/untitled-saved.md",
          name: "untitled-saved.md",
          content: input.content,
          encoding: "utf-8" as const
        }
      })
    );
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: vi.fn(async () => "save" as const),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog
    });

    const result = await closeCoordinator.closeTab(tabId);

    expect(result).toMatchObject({ status: "closed" });
    expect(showSaveMarkdownDialog).toHaveBeenCalledWith({
      tabId,
      currentPath: null,
      content: "# Untitled dirty\n"
    });
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId,
      capturedRevision: 1,
      document: createDocument({
        path: "C:/notes/untitled-saved.md",
        name: "untitled-saved.md",
        content: "# Untitled dirty\n"
      }),
      diskVersion: null
    });
    expect(workspace.getWindowProjection("window-1").tabs).toHaveLength(0);
  });

  it("re-reads and saves the latest canonical checkpoint after the prompt", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Saved\n"
      })
    ).activeTabId!;
    workspace.updateTabDraft(tabId, "# Dirty from main\n");
    const saveMarkdownFileToPath = vi.fn(
      async (input: { tabId: string; path: string; content: string }) => ({
        status: "success" as const,
        document: {
          path: input.path,
          name: "note.md",
          content: input.content,
          encoding: "utf-8" as const
        }
      })
    );
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: async () => {
        workspace.updateTabDraft(tabId, "# Dirty from main, latest\n");
        return "save";
      },
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn()
    });

    await coordinator.closeTab(tabId);

    expect(saveMarkdownFileToPath).toHaveBeenCalledWith({
      tabId,
      path: "C:/notes/note.md",
      content: "# Dirty from main, latest\n"
    });
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId,
      capturedRevision: 2,
      document: createDocument({
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Dirty from main, latest\n"
      }),
      diskVersion: null
    });
  });

  it("does not close when a newer canonical revision arrives during save-on-close", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument({
        path: "C:/notes/race.md",
        name: "race.md",
        content: "# Saved\n"
      })
    ).activeTabId!;
    workspace.updateTabDraft(tabId, "# Dirty before close\n");
    let resolveSave!: (value: {
      status: "success";
      document: WorkspaceDocumentData;
    }) => void;
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const closeTab = vi.spyOn(workspace, "closeTab");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      saveMarkdownFileToPath: ({ content, path }) =>
        new Promise((resolve) => {
          resolveSave = resolve;
          expect(content).toBe("# Dirty before close\n");
          expect(path).toBe("C:/notes/race.md");
        }),
      showSaveMarkdownDialog: vi.fn()
    });

    const closePromise = coordinator.closeTab(tabId);
    await Promise.resolve();
    workspace.updateTabDraft(tabId, "# Dirty after save started\n");
    resolveSave({
      status: "success",
      document: createDocument({
        path: "C:/notes/race.md",
        name: "race.md",
        content: "# Dirty before close\n"
      })
    });

    await expect(closePromise).resolves.toEqual({ status: "cancelled" });
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId,
      capturedRevision: 1,
      document: createDocument({
        path: "C:/notes/race.md",
        name: "race.md",
        content: "# Dirty before close\n"
      }),
      diskVersion: null
    });
    expect(closeTab).not.toHaveBeenCalled();
    expect(workspace.getWindowProjection("window-1").tabs.map((tab) => tab.tabId)).toEqual([
      tabId
    ]);
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "# Dirty after save started\n",
      revision: 2,
      savedRevision: 1,
      isDirty: true
    });
  });
});
