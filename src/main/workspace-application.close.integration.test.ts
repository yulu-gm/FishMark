import {
  createWorkspaceState,
  fileIdentity,
  type DocumentSessionProjection
} from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import { createCloseWorkspace as createCloseWorkspaceWithPorts } from "@fishmark/workspace-application";

import type { OpenMarkdownDocument } from "../shared/open-markdown-file";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { openTestDocument } from "./workspace.test-helper";

function createWorkspaceCloseUseCase(
  dependencies: Omit<
    Parameters<typeof createCloseWorkspaceWithPorts>[0],
    "workspace" | "documentOperations" | "saveDocument" | "chooseDirtyTab"
  > & {
    workspace: Parameters<typeof createCloseWorkspaceWithPorts>[0]["workspace"] &
      Pick<ReturnType<typeof createWorkspaceState>, "saveTabDocument">;
    persistSavedWorkspaceTab: (
      tab: DocumentSessionProjection
    ) => Promise<SaveMarkdownFileResult>;
    persistUntitledWorkspaceTab: (
      tab: DocumentSessionProjection
    ) => Promise<SaveMarkdownFileResult>;
    promptToSaveWorkspaceTab: Parameters<
      typeof createCloseWorkspaceWithPorts
    >[0]["chooseDirtyTab"];
  }
) {
  const {
    persistSavedWorkspaceTab,
    persistUntitledWorkspaceTab,
    promptToSaveWorkspaceTab,
    workspace,
    ...rest
  } = dependencies;
  return createCloseWorkspaceWithPorts({
    ...rest,
    workspace,
    documentOperations: createKeyedOperationCoordinator(),
    chooseDirtyTab: promptToSaveWorkspaceTab,
    saveDocument: {
      saveWithHeldTabLease: async (input) => persist(input, persistSavedWorkspaceTab),
      saveAsWithHeldTabLease: async (input) => persist(input, persistUntitledWorkspaceTab)
    }
  });

  async function persist(
    input: {
      readonly tabId: string;
      readonly expectedWindowId: string;
      readonly commitGuard?: () => boolean;
    },
    write: (tab: DocumentSessionProjection) => Promise<SaveMarkdownFileResult>
  ): Promise<SaveMarkdownFileResult> {
      const tab = workspace.getTabSession(input.tabId);
      const result = await write(tab);
      if (result.status === "success") {
        if (input.commitGuard?.() === false) {
          return { status: "cancelled" };
        }
        if (!result.document.path || result.document.content !== tab.content) {
          throw new Error("Close Save As adapter returned invalid document data.");
        }
        if (tab.path !== null && result.document.path !== tab.path) {
          throw new Error("Close save adapter path does not match the canonical close-save checkpoint.");
        }
        const identity = (result.document as OpenMarkdownDocument & { fileIdentity?: ReturnType<typeof fileIdentity> }).fileIdentity
          ?? tab.fileIdentity;
        workspace.saveTabDocument({
          tabId: tab.tabId,
          expectedWindowId: tab.windowId,
          capturedRevision: tab.revision,
          document: { fileIdentity: identity, ...result.document },
          diskVersion: null
        });
      }
      return result;
  }
}

function createDocument(
  name: string,
  content: string,
  path: string = `C:/notes/${name}`
): OpenMarkdownDocument & { fileIdentity: ReturnType<typeof fileIdentity> } {
  return { fileIdentity: fileIdentity(`file:${path.toLowerCase()}`), path, name, content, encoding: "utf-8" };
}

const windowCloseRequest = (
  windowId: string,
  isActive: () => boolean = () => true
) => ({ windowId, isActive });

describe("workspace close use case", () => {
  it("closes only the requested tab after an unchanged discard decision", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const firstTabId = openTestDocument(workspace,
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    const secondTabId = openTestDocument(workspace,
      "window-1",
      createDocument("second.md", "second")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    workspace.updateTabDraft({ tabId: secondTabId, expectedWindowId: "window-1", content: "second dirty" });
    const prompt = vi.fn(async () => "discard" as const);
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: prompt,
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const result = await closeUseCase.closeTab({
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
    const firstTabId = openTestDocument(workspace,
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    openTestDocument(workspace, "window-1", createDocument("clean.md", "clean"));
    const thirdTabId = openTestDocument(workspace,
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
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: prompt,
      persistSavedWorkspaceTab: vi.fn(async ({ tabId, path, content }) => ({
        status: "success" as const,
        document: createDocument(path.split("/").at(-1) ?? `${tabId}.md`, content, path)
      })),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const confirmation = await closeUseCase.confirmWindowClose(
      windowCloseRequest("window-1")
    );

    expect(confirmation).toEqual({
      status: "confirmed",
      confirmation: {
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
      }
    });
    expect(confirmation.status).toBe("confirmed");
    if (confirmation.status !== "confirmed") throw new Error("Expected confirmation.");
    expect(Object.isFrozen(confirmation.confirmation)).toBe(true);
    expect(Object.isFrozen(confirmation.confirmation.checkpoints)).toBe(true);
    expect(confirmation.confirmation.checkpoints.every(Object.isFrozen)).toBe(true);

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
    const tabId = openTestDocument(workspace,
      "window-1",
      createDocument("cancel.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    const getTabSession = vi.spyOn(workspace, "getTabSession");
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: async () => {
        workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "changed during cancel prompt" });
        return "cancel";
      },
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const result = await closeUseCase.closeTab({
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
    const persistUntitledWorkspaceTab = vi.fn(async ({ content }) => ({
      status: "success" as const,
      document: createDocument("saved.md", content)
    }));
    const saveTabDocument = vi.spyOn(workspace, "saveTabDocument");
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab
    });

    await expect(
      closeUseCase.closeTab({
        tabId,
        expectedWindowId: "window-1",
        expectedRevision: 1
      })
    ).resolves.toMatchObject({ status: "closed" });

    expect(persistUntitledWorkspaceTab).toHaveBeenCalledWith(expect.objectContaining({
      tabId,
      path: null,
      content: "untitled dirty"
    }));
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
    const tabId = openTestDocument(workspace,
      "window-1",
      createDocument("canonical.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({
      tabId,
      expectedWindowId: "window-1",
      content: "dirty"
    });
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      persistSavedWorkspaceTab: vi.fn(async () => ({
        status: "success" as const,
        document: createDocument("other.md", "dirty")
      })),
      persistUntitledWorkspaceTab: vi.fn()
    });

    await expect(
      closeUseCase.closeTab({
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
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn(async () =>
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
      closeUseCase.closeTab({
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
    const tabId = openTestDocument(workspace,
      "window-1",
      createDocument("move-prompt.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    workspace.registerWindow("window-2");
    let resolvePrompt!: (choice: "discard") => void;
    const closeTab = vi.spyOn(workspace, "closeTab");
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const closePromise = closeUseCase.closeTab({
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
    const tabId = openTestDocument(workspace,
      "window-1",
      createDocument("edit-save.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "captured dirty" });
    let resolveSave!: (value: {
      status: "success";
      document: OpenMarkdownDocument;
    }) => void;
    const closeTab = vi.spyOn(workspace, "closeTab");
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      persistSavedWorkspaceTab: () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const closePromise = closeUseCase.closeTab({
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
    const tabId = openTestDocument(workspace,
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
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: async () => "save",
      persistSavedWorkspaceTab: () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const closePromise = closeUseCase.closeTab({
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
    const firstTabId = openTestDocument(workspace,
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    const secondTabId = openTestDocument(workspace,
      "window-1",
      createDocument("second.md", "second")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    workspace.updateTabDraft({ tabId: secondTabId, expectedWindowId: "window-1", content: "second dirty" });
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: vi
        .fn()
        .mockResolvedValueOnce("discard")
        .mockImplementationOnce(async () => {
          workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first changed again" });
          return "discard";
        }),
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    await expect(
      closeUseCase.confirmWindowClose(windowCloseRequest("window-1"))
    ).resolves.toEqual({ status: "cancelled" });
  });

  it("cancels an inactive window confirmation before prompting", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      createDocument("inactive.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    const prompt = vi.fn(async () => "discard" as const);
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: prompt,
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    await expect(
      closeUseCase.confirmWindowClose(
        windowCloseRequest("window-1", () => false)
      )
    ).resolves.toEqual({ status: "cancelled" });
    expect(prompt).not.toHaveBeenCalled();
  });

  it("does not start a close save after confirmation becomes inactive during the prompt", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      createDocument("prompt-timeout.md", "saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let active = true;
    let resolvePrompt!: (choice: "save") => void;
    const persistSavedWorkspaceTab = vi.fn();
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      persistSavedWorkspaceTab,
      persistUntitledWorkspaceTab: vi.fn()
    });

    const confirmation = closeUseCase.confirmWindowClose(
      windowCloseRequest("window-1", () => active)
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    active = false;
    resolvePrompt("save");

    await expect(confirmation).resolves.toEqual({ status: "cancelled" });
    expect(persistSavedWorkspaceTab).not.toHaveBeenCalled();
    expect(workspace.getTabSession(tabId)).toMatchObject({ isDirty: true });
  });

  it("does not commit a close save that returns after confirmation becomes inactive", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
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
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: vi.fn(async () => "save" as const),
      persistSavedWorkspaceTab: () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const confirmation = closeUseCase.confirmWindowClose(
      windowCloseRequest("window-1", () => active)
    );
    await vi.waitFor(() => expect(resolveWrite).toBeTypeOf("function"));
    active = false;
    resolveWrite({
      status: "success",
      document: createDocument("write-timeout.md", "dirty")
    });

    await expect(confirmation).resolves.toEqual({ status: "cancelled" });
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
    const firstTabId = openTestDocument(workspace,
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const confirmPromise = closeUseCase.confirmWindowClose(
      windowCloseRequest("window-1")
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    const newTabId = workspace.createUntitledTab("window-1").activeTabId!;
    workspace.updateTabDraft({ tabId: newTabId, expectedWindowId: "window-1", content: "new dirty tab" });
    resolvePrompt("discard");

    await expect(confirmPromise).resolves.toEqual({ status: "cancelled" });
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
    const firstTabId = openTestDocument(workspace,
      "window-1",
      createDocument("first.md", "first")
    ).activeTabId!;
    const secondTabId = openTestDocument(workspace,
      "window-1",
      createDocument("second.md", "second")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: firstTabId, expectedWindowId: "window-1", content: "first dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const confirmPromise = closeUseCase.confirmWindowClose(
      windowCloseRequest("window-1")
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    workspace.reorderTab({
      tabId: secondTabId,
      expectedWindowId: "window-1",
      targetIndex: 0
    });
    resolvePrompt("discard");

    await expect(confirmPromise).resolves.toEqual({ status: "cancelled" });
    expect(workspace.getWindowTabIds("window-1")).toEqual([
      secondTabId,
      firstTabId
    ]);
  });

  it("explicitly rejects a stale close result without a sender projection", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      createDocument("clean.md", "clean")
    ).activeTabId!;
    const closeUseCase = createWorkspaceCloseUseCase({
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
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    await expect(
      closeUseCase.closeTab({
        tabId,
        expectedWindowId: "window-1",
        expectedRevision: 0
      })
    ).resolves.toMatchObject({
      status: "error",
      error: { code: "window-missing" }
    });
  });

  it("fails closed when an initial dirty tab closes while its prompt is pending", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const closingTabId = openTestDocument(workspace,
      "window-1",
      createDocument("closing.md", "saved")
    ).activeTabId!;
    const remainingTabId = openTestDocument(workspace,
      "window-1",
      createDocument("remaining.md", "remaining")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: closingTabId, expectedWindowId: "window-1", content: "dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const confirmPromise = closeUseCase.confirmWindowClose(
      windowCloseRequest("window-1")
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    workspace.closeTab({
      tabId: closingTabId,
      expectedWindowId: "window-1",
      expectedRevision: 1
    });
    resolvePrompt("discard");

    await expect(confirmPromise).resolves.toEqual({ status: "cancelled" });
    expect(() => workspace.getTabSession(closingTabId)).toThrow(
      `Unknown workspace tab '${closingTabId}'.`
    );
    expect(workspace.getWindowTabIds("window-1")).toEqual([remainingTabId]);
  });

  it("fails closed when an initial dirty tab moves while its prompt is pending", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const movingTabId = openTestDocument(workspace,
      "window-1",
      createDocument("moving.md", "saved")
    ).activeTabId!;
    const remainingTabId = openTestDocument(workspace,
      "window-1",
      createDocument("remaining.md", "remaining")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: movingTabId, expectedWindowId: "window-1", content: "dirty" });
    workspace.registerWindow("window-2");
    let resolvePrompt!: (choice: "discard") => void;
    const closeUseCase = createWorkspaceCloseUseCase({
      workspace,
      promptToSaveWorkspaceTab: () =>
        new Promise((resolve) => {
          resolvePrompt = resolve;
        }),
      persistSavedWorkspaceTab: vi.fn(),
      persistUntitledWorkspaceTab: vi.fn()
    });

    const confirmPromise = closeUseCase.confirmWindowClose(
      windowCloseRequest("window-1")
    );
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    workspace.moveTabToWindow({
      tabId: movingTabId,
      targetWindowId: "window-2"
    });
    resolvePrompt("discard");

    await expect(confirmPromise).resolves.toEqual({ status: "cancelled" });
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
