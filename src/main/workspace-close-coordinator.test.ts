import { describe, expect, it, vi } from "vitest";

import { createWorkspaceCloseCoordinator } from "./workspace-close-coordinator";
import { createWorkspaceService, type WorkspaceTabSessionSnapshot } from "./workspace-service";

function createDocument(input: {
  path: string;
  name: string;
  content: string;
}): {
  path: string;
  name: string;
  content: string;
  encoding: "utf-8";
} {
  return {
    path: input.path,
    name: input.name,
    content: input.content,
    encoding: "utf-8"
  };
}

describe("createWorkspaceCloseCoordinator", () => {
  it("only prompts for the target dirty tab when closing a single tab", async () => {
    const workspace = createWorkspaceService();
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
      .fn<(tab: WorkspaceTabSessionSnapshot) => Promise<"save" | "discard" | "cancel">>()
      .mockResolvedValue("discard");
    const saveMarkdownFileToPath = vi.fn();
    const showSaveMarkdownDialog = vi.fn();
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspaceService: workspace,
      promptToSaveWorkspaceTab,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog
    });

    const result = await closeCoordinator.closeTab(first.activeTabId!);

    expect(result).toMatchObject({
      status: "closed"
    });
    expect(promptToSaveWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(promptToSaveWorkspaceTab).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: first.activeTabId,
        name: "first.md",
        content: "# First dirty\n",
        isDirty: true
      })
    );
    expect(saveMarkdownFileToPath).not.toHaveBeenCalled();
    expect(showSaveMarkdownDialog).not.toHaveBeenCalled();
    expect(workspace.getWindowSnapshot("window-1").tabs.map((tab) => tab.tabId)).toEqual([
      second.activeTabId
    ]);
    expect(workspace.getTabSession(second.activeTabId!)).toMatchObject({
      content: "# Second dirty\n",
      isDirty: true
    });
  });

  it("iterates dirty tabs in window order before allowing the window to close", async () => {
    const workspace = createWorkspaceService();
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
      .fn<(tab: WorkspaceTabSessionSnapshot) => Promise<"save" | "discard" | "cancel">>()
      .mockResolvedValueOnce("save")
      .mockResolvedValueOnce("discard");
    const saveMarkdownFileToPath = vi.fn(async (input: { tabId: string; path: string; content: string }) => ({
      status: "success" as const,
      document: {
        path: input.path,
        name: input.path.split("/").at(-1) ?? "saved.md",
        content: input.content,
        encoding: "utf-8" as const
      }
    }));
    const showSaveMarkdownDialog = vi.fn();
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspaceService: workspace,
      promptToSaveWorkspaceTab,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog
    });

    await expect(closeCoordinator.confirmWindowClose("window-1")).resolves.toBe(true);

    expect(promptToSaveWorkspaceTab.mock.calls.map((call) => call[0]?.tabId)).toEqual([
      first.activeTabId,
      third.activeTabId
    ]);
    expect(saveMarkdownFileToPath).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFileToPath).toHaveBeenCalledWith({
      tabId: first.activeTabId,
      path: "C:/notes/first.md",
      content: "# First dirty\n"
    });
    expect(showSaveMarkdownDialog).not.toHaveBeenCalled();
    expect(workspace.getTabSession(first.activeTabId!)).toMatchObject({
      content: "# First dirty\n",
      isDirty: false
    });
    expect(workspace.getTabSession(second.activeTabId!)).toMatchObject({
      content: "# Second\n",
      isDirty: false
    });
    expect(workspace.getTabSession(third.activeTabId!)).toMatchObject({
      content: "# Third dirty\n",
      isDirty: true
    });
  });

  it("cancels window close when a dirty tab save prompt is aborted", async () => {
    const workspace = createWorkspaceService();
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
      .fn<(tab: WorkspaceTabSessionSnapshot) => Promise<"save" | "discard" | "cancel">>()
      .mockResolvedValueOnce("save")
      .mockResolvedValueOnce("cancel");
    const saveMarkdownFileToPath = vi.fn(async (input: { tabId: string; path: string; content: string }) => ({
      status: "success" as const,
      document: {
        path: input.path,
        name: input.path.split("/").at(-1) ?? "saved.md",
        content: input.content,
        encoding: "utf-8" as const
      }
    }));
    const showSaveMarkdownDialog = vi.fn();
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspaceService: workspace,
      promptToSaveWorkspaceTab,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog
    });

    await expect(closeCoordinator.confirmWindowClose("window-1")).resolves.toBe(false);

    expect(promptToSaveWorkspaceTab.mock.calls.map((call) => call[0]?.tabId)).toEqual([
      first.activeTabId,
      second.activeTabId
    ]);
    expect(saveMarkdownFileToPath).toHaveBeenCalledTimes(1);
    expect(workspace.getWindowSnapshot("window-1").tabs.map((tab) => tab.tabId)).toEqual([
      first.activeTabId,
      second.activeTabId
    ]);
    expect(workspace.getTabSession(second.activeTabId!)).toMatchObject({
      content: "# Second dirty\n",
      isDirty: true
    });
  });

  it("routes untitled dirty tabs through Save As before closing them", async () => {
    const workspace = createWorkspaceService();
    workspace.registerWindow("window-1");

    const untitled = workspace.createUntitledTab("window-1");
    workspace.updateTabDraft(untitled.activeTabId!, "# Untitled dirty\n");

    const promptToSaveWorkspaceTab = vi
      .fn<(tab: WorkspaceTabSessionSnapshot) => Promise<"save" | "discard" | "cancel">>()
      .mockResolvedValue("save");
    const saveMarkdownFileToPath = vi.fn();
    const showSaveMarkdownDialog = vi.fn(async (input: {
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
    }));
    const closeCoordinator = createWorkspaceCloseCoordinator({
      workspaceService: workspace,
      promptToSaveWorkspaceTab,
      saveMarkdownFileToPath,
      showSaveMarkdownDialog
    });

    const result = await closeCoordinator.closeTab(untitled.activeTabId!);

    expect(result).toMatchObject({
      status: "closed"
    });
    expect(saveMarkdownFileToPath).not.toHaveBeenCalled();
    expect(showSaveMarkdownDialog).toHaveBeenCalledWith({
      tabId: untitled.activeTabId,
      currentPath: null,
      content: "# Untitled dirty\n"
    });
    expect(workspace.getWindowSnapshot("window-1").tabs).toHaveLength(0);
  });
});
