import {
  createWorkspaceState,
  type DocumentSessionProjection
} from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import type { OpenMarkdownDocument } from "../shared/open-markdown-file";
import { createWorkspaceCloseCoordinator as createWorkspaceCloseCoordinatorWithOperations } from "./workspace-close-coordinator";
import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";

function createWorkspaceCloseCoordinator(
  dependencies: Omit<
    Parameters<typeof createWorkspaceCloseCoordinatorWithOperations>[0],
    "documentOperations"
  >
) {
  return createWorkspaceCloseCoordinatorWithOperations({
    ...dependencies,
    documentOperations: createWorkspaceDocumentOperationCoordinator()
  });
}

function createDocument(
  name: string,
  content: string,
  path: string = `C:/notes/${name}`
): OpenMarkdownDocument {
  return { path, name, content, encoding: "utf-8" };
}

const windowCloseRequest = (
  windowId: string,
  isActive: () => boolean = () => true
) => ({ windowId, isActive });

describe("createWorkspaceCloseCoordinator", () => {
  it("closes only the requested tab after an unchanged discard decision", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument(
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    const secondTabId = workspace.openDocument(
      "window-1",
      createDocument("second.md", "second")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    workspace.updateTabDraft({ tabId: secondTabId, expectedWindowId: "window-1", content: "second dirty" });
    const prompt = vi.fn(async () => "discard" as const);
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: prompt,
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    const result = await coordinator.closeTab({
      tabId: firstTabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });

    expect(result).toMatchObject({
      status: "closed",
      snapshot: { windowId: "window-1", activeTabId: secondTabId }
    });
    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: firstTabId,
        revision: 1,
        savedRevision: 0,
        isDirty: true
      })
    );
    expect(workspace.getWindowProjection("window-1").tabs.map((tab) => tab.tabId)).toEqual([
      secondTabId
    ]);
  });

  it("confirms a window in tab order and commits the captured owner and revision", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument(
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    workspace.openDocument("window-1", createDocument("clean.md", "clean"));
    const thirdTabId = workspace.openDocument(
      "window-1",
      createDocument("third.md", "third")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    workspace.updateTabDraft({ tabId: thirdTabId, expectedWindowId: "window-1", content: "third dirty" });
    const prompt = vi
      .fn<
        (tab: DocumentSessionProjection) => Promise<"save" | "discard" | "cancel">
      >()
      .mockResolvedValueOnce("save")
      .mockResolvedValueOnce("discard");
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: prompt,
      saveMarkdownFileToPath: vi.fn(async ({ tabId, path, content }) => ({
        status: "success" as const,
        document: createDocument(path.split("/").at(-1) ?? `${tabId}.md`, content, path)
      })),
      showSaveMarkdownDialog: vi.fn()
    });

    const confirmation = await coordinator.confirmWindowClose(
      windowCloseRequest("window-1")
    );

    expect(confirmation).toEqual({
      windowId: "window-1",
      checkpoints: [
        {
          tabId: firstTabId,
          expectedWindowId: "window-1",
          expectedRevision: 1
        },
        {
          tabId: expect.any(String),
          expectedWindowId: "window-1",
          expectedRevision: 0
        },
        {
          tabId: thirdTabId,
          expectedWindowId: "window-1",
          expectedRevision: 1
        }
      ]
    });
    expect(Object.isFrozen(confirmation)).toBe(true);
    expect(Object.isFrozen(confirmation?.checkpoints)).toBe(true);
    expect(confirmation?.checkpoints.every(Object.isFrozen)).toBe(true);

    expect(prompt.mock.calls.map(([tab]) => tab.tabId)).toEqual([
      firstTabId,
      thirdTabId
    ]);
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId: firstTabId,
      expectedWindowId: "window-1",
      capturedRevision: 1,
      document: createDocument("first.md", "first dirty"),
      diskVersion: null
    });
    expect(workspace.getTabSession(firstTabId)).toMatchObject({
      revision: 1,
      savedRevision: 1,
      isDirty: false
    });
    expect(workspace.getTabSession(thirdTabId)).toMatchObject({
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("revalidates after cancel before returning the sender projection", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("cancel.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    const getTabSession = vi.spyOn(workspace, "getTabSession");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: async () => {
        workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "changed during cancel prompt" });
        return "cancel";
      },
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    const result = await coordinator.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });

    expect(result).toMatchObject({
      status: "cancelled",
      snapshot: {
        windowId: "window-1",
        activeDocument: { content: "changed during cancel prompt" }
      }
    });
    expect(getTabSession).toHaveBeenCalledTimes(2);
  });

  it("routes an unchanged untitled checkpoint through Save As before closing", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "untitled dirty" });
    const showSaveMarkdownDialog = vi.fn(async ({ content }) => ({
      status: "success" as const,
      document: createDocument("saved.md", content)
    }));
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog
    });

    await expect(
      coordinator.closeTab({
        tabId,
        expectedWindowId: "window-1",
        expectedRevision: 1
      })
    ).resolves.toMatchObject({ status: "closed" });

    expect(showSaveMarkdownDialog).toHaveBeenCalledWith({
      tabId,
      currentPath: null,
      content: "untitled dirty"
    });
    expect(saveTabDocument).toHaveBeenCalledWith({
      tabId,
      expectedWindowId: "window-1",
      capturedRevision: 1,
      document: createDocument("saved.md", "untitled dirty"),
      diskVersion: null
    });
  });

  it("rejects a close-save adapter path that differs from the canonical checkpoint", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("canonical.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      saveMarkdownFileToPath: vi.fn(async () => ({
        status: "success" as const,
        document: createDocument("other.md", "dirty")
      })),
      showSaveMarkdownDialog: vi.fn()
    });

    await expect(
      coordinator.closeTab({
        tabId,
        expectedWindowId: "window-1",
        expectedRevision: 1
      })
    ).rejects.toThrow("canonical close-save checkpoint");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: "C:/notes/canonical.md",
      name: "canonical.md",
      content: "dirty",
      isDirty: true
    });
  });

  it("rejects an untitled close Save As result without a persisted path", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn(async () =>
        JSON.parse(
          JSON.stringify({
            status: "success",
            document: {
              path: "",
              name: "saved.md",
              content: "dirty",
              encoding: "utf-8"
            }
          })
        )
      )
    });

    await expect(
      coordinator.closeTab({
        tabId,
        expectedWindowId: "window-1",
        expectedRevision: 1
      })
    ).rejects.toThrow("Close Save As adapter");
    expect(workspace.getTabSession(tabId)).toMatchObject({
      path: null,
      name: "Untitled.md",
      content: "dirty",
      isDirty: true
    });
  });

  it("cancels discard when the tab moves during the prompt", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("move-prompt.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    workspace.registerWindow("window-2");
    let resolvePrompt!: (choice: "discard") => void;
    const closeTab = vi.spyOn(workspace, "closeTab");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    const closePromise = coordinator.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolvePrompt("discard");

    await expect(closePromise).resolves.toMatchObject({
      status: "cancelled",
      snapshot: { windowId: "window-1", tabs: [] }
    });
    expect(closeTab).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      isDirty: true
    });
  });

  it("cancels close when an edit arrives during save", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("edit-save.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "captured dirty" });
    let resolveSave!: (value: {
      status: "success";
      document: OpenMarkdownDocument;
    }) => void;
    const closeTab = vi.spyOn(workspace, "closeTab");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      saveMarkdownFileToPath: () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
      showSaveMarkdownDialog: vi.fn()
    });

    const closePromise = coordinator.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });
    await vi.waitFor(() => expect(resolveSave).toBeTypeOf("function"));
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "newer dirty" });
    resolveSave({
      status: "success",
      document: createDocument("edit-save.md", "captured dirty")
    });

    await expect(closePromise).resolves.toMatchObject({
      status: "cancelled",
      snapshot: {
        windowId: "window-1",
        activeDocument: { content: "newer dirty", isDirty: true }
      }
    });
    expect(closeTab).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      revision: 2,
      savedRevision: 1,
      isDirty: true
    });
  });

  it("cancels close and leaves the target dirty when the tab moves during save", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("move-save.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "captured dirty" });
    workspace.registerWindow("window-2");
    let resolveSave!: (value: {
      status: "success";
      document: OpenMarkdownDocument;
    }) => void;
    const closeTab = vi.spyOn(workspace, "closeTab");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      saveMarkdownFileToPath: () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
      showSaveMarkdownDialog: vi.fn()
    });

    const closePromise = coordinator.closeTab({
      tabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });
    await vi.waitFor(() => expect(resolveSave).toBeTypeOf("function"));
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-2" });
    resolveSave({
      status: "success",
      document: createDocument("move-save.md", "captured dirty")
    });

    await expect(closePromise).resolves.toMatchObject({
      status: "cancelled",
      snapshot: { windowId: "window-1", tabs: [] }
    });
    expect(closeTab).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      windowId: "window-2",
      savedRevision: 0,
      isDirty: true
    });
  });

  it("revalidates earlier window checkpoints after later prompts", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument(
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    const secondTabId = workspace.openDocument(
      "window-1",
      createDocument("second.md", "second")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    workspace.updateTabDraft({ tabId: secondTabId, expectedWindowId: "window-1", content: "second dirty" });
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: vi
        .fn()
        .mockResolvedValueOnce("discard")
        .mockImplementationOnce(async () => {
          workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first changed again" });
          return "discard";
        }),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    await expect(
      coordinator.confirmWindowClose(windowCloseRequest("window-1"))
    ).resolves.toBeNull();
  });

  it("cancels an inactive window confirmation before prompting", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("inactive.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    const prompt = vi.fn(async () => "discard" as const);
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: prompt,
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    await expect(
      coordinator.confirmWindowClose(
        windowCloseRequest("window-1", () => false)
      )
    ).resolves.toBeNull();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not start a close save after confirmation becomes inactive during the prompt", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("prompt-timeout.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let active = true;
    let resolvePrompt!: (choice: "save") => void;
    const saveMarkdownFileToPath = vi.fn();
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      saveMarkdownFileToPath,
      showSaveMarkdownDialog: vi.fn()
    });

    const confirmation = coordinator.confirmWindowClose(
      windowCloseRequest("window-1", () => active)
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    active = false;
    resolvePrompt("save");

    await expect(confirmation).resolves.toBeNull();
    expect(saveMarkdownFileToPath).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({ isDirty: true });
  });

  it("does not commit a close save that returns after confirmation becomes inactive", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("write-timeout.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let active = true;
    let resolveWrite!: (result: {
      readonly status: "success";
      readonly document: OpenMarkdownDocument;
    }) => void;
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: vi.fn(async () => "save" as const),
      saveMarkdownFileToPath: () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      showSaveMarkdownDialog: vi.fn()
    });

    const confirmation = coordinator.confirmWindowClose(
      windowCloseRequest("window-1", () => active)
    );
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    active = false;
    resolveWrite({
      status: "success",
      document: createDocument("write-timeout.md", "dirty")
    });

    await expect(confirmation).resolves.toBeNull();
    expect(saveTabDocument).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({
      content: "dirty",
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("fails closed when a dirty tab is added while the first prompt is pending", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument(
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    const confirmPromise = coordinator.confirmWindowClose(
      windowCloseRequest("window-1")
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    const newTabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId: newTabId, expectedWindowId: "window-1", content: "new dirty tab" });
    resolvePrompt("discard");

    await expect(confirmPromise).resolves.toBeNull();
    expect(workspace.getWindowTabIds("window-1")).toEqual([
      firstTabId,
      newTabId
    ]);
    expect(workspace.getTabSession(newTabId)).toMatchObject({
      content: "new dirty tab",
      revision: 1,
      isDirty: true
    });
  });

  it("fails closed when the initial tab order changes during a prompt", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = workspace.openDocument(
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    const secondTabId = workspace.openDocument(
      "window-1",
      createDocument("second.md", "second")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    const confirmPromise = coordinator.confirmWindowClose(
      windowCloseRequest("window-1")
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    workspace.reorderTab({
      tabId: secondTabId,
      expectedWindowId: "window-1",
      targetIndex: 0
    });
    resolvePrompt("discard");

    await expect(confirmPromise).resolves.toBeNull();
    expect(workspace.getWindowTabIds("window-1")).toEqual([
      secondTabId,
      firstTabId
    ]);
  });

  it("explicitly rejects a stale close result without a sender projection", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = workspace.openDocument(
      "window-1",
      createDocument("clean.md", "clean")
    ).activeTabId!;
    const coordinator = createWorkspaceCloseCoordinator({
      workspace: {
        getTabSession: workspace.getTabSession.bind(workspace),
        getWindowProjection: workspace.getWindowProjection.bind(workspace),
        getWindowTabIds: workspace.getWindowTabIds.bind(workspace),
        saveTabDocument: workspace.saveTabDocument.bind(workspace),
        closeTab: vi.fn(() => ({
          kind: "stale" as const,
          reason: "window-missing" as const,
          projection: null
        }))
      },
      promptToSaveWorkspaceTab: vi.fn(),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    await expect(
      coordinator.closeTab({
        tabId,
        expectedWindowId: "window-1",
        expectedRevision: 0
      })
    ).rejects.toThrow("Workspace window 'window-1' no longer exists.");
  });

  it("fails closed when an initial dirty tab closes while its prompt is pending", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const closingTabId = workspace.openDocument(
      "window-1",
      createDocument("closing.md", "saved")
    ).activeTabId!;
    const remainingTabId = workspace.openDocument(
      "window-1",
      createDocument("remaining.md", "remaining")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: closingTabId, expectedWindowId: "window-1", content: "dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    const confirmPromise = coordinator.confirmWindowClose(
      windowCloseRequest("window-1")
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    workspace.closeTab({
      tabId: closingTabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });
    resolvePrompt("discard");

    await expect(confirmPromise).resolves.toBeNull();
    expect(() => workspace.getTabSession(closingTabId)).toThrow(
      `Unknown workspace tab '${closingTabId}'.`
    );
    expect(workspace.getWindowTabIds("window-1")).toEqual([remainingTabId]);
  });

  it("fails closed when an initial dirty tab moves while its prompt is pending", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const movingTabId = workspace.openDocument(
      "window-1",
      createDocument("moving.md", "saved")
    ).activeTabId!;
    const remainingTabId = workspace.openDocument(
      "window-1",
      createDocument("remaining.md", "remaining")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: movingTabId, expectedWindowId: "window-1", content: "dirty" });
    workspace.registerWindow("window-2");
    let resolvePrompt!: (choice: "discard") => void;
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      saveMarkdownFileToPath: vi.fn(),
      showSaveMarkdownDialog: vi.fn()
    });

    const confirmPromise = coordinator.confirmWindowClose(
      windowCloseRequest("window-1")
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    workspace.moveTabToWindow({
      tabId: movingTabId,
      targetWindowId: "window-2"
    });
    resolvePrompt("discard");

    await expect(confirmPromise).resolves.toBeNull();
    expect(workspace.getWindowTabIds("window-1")).toEqual([remainingTabId]);
    expect(workspace.getWindowTabIds("window-2")).toEqual([movingTabId]);
    expect(workspace.getTabSession(movingTabId)).toMatchObject({
      windowId: "window-2",
      content: "dirty",
      revision: 1,
      isDirty: true
    });
  });
});
