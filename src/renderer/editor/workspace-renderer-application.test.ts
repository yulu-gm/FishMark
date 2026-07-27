import { describe, expect, it, vi } from "vitest";

import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import {
  WorkspaceRendererApplication,
  type EditorLoadIdentity
} from "./workspace-renderer-application";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createSnapshot(input: {
  activeTabId?: string | null;
  firstContent?: string;
  secondContent?: string;
  includeFirst?: boolean;
  includeSecond?: boolean;
} = {}): WorkspaceWindowSnapshot {
  const activeTabId = input.activeTabId === undefined ? "tab-1" : input.activeTabId;
  const documents = [
    ...(input.includeFirst ?? true
      ? [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: input.firstContent ?? "# First\n"
        }]
      : []),
    ...(input.includeSecond ?? true
      ? [{
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: input.secondContent ?? "# Second\n"
        }]
      : [])
  ];
  const activeDocument = documents.find((document) => document.tabId === activeTabId) ?? null;

  return {
    windowId: "window-1",
    activeTabId,
    tabs: documents.map((document) => ({
      tabId: document.tabId,
      path: document.path,
      name: document.name,
      isDirty: false,
      saveState: "idle" as const
    })),
    activeDocument: activeDocument === null
      ? null
      : {
          ...activeDocument,
          encoding: "utf-8",
          isDirty: false,
          saveState: "idle"
        }
  };
}

function createApplication(input: {
  bridge?: Partial<Window["fishmark"]>;
  initialSnapshot?: WorkspaceWindowSnapshot;
  readEditorContent?: () => string;
} = {}) {
  return new WorkspaceRendererApplication({
    bridge: input.bridge as Window["fishmark"],
    initialSnapshot: input.initialSnapshot ?? createSnapshot(),
    readEditorContent: input.readEditorContent ?? (() => "# First\n")
  });
}

function consumeEditorLoad(application: WorkspaceRendererApplication): EditorLoadIdentity {
  const identity = application.getPendingEditorLoadIdentity();
  expect(identity).not.toBeNull();
  expect(application.acknowledgeEditorLoad(identity!)).toBe(true);
  return identity!;
}

describe("WorkspaceRendererApplication", () => {
  it.each(["close", "detach"] as const)(
    "drains an inactive target draft before %s and fails closed",
    async (command) => {
      const targetSnapshot = createSnapshot({ activeTabId: "tab-2" });
      const updateWorkspaceTabDraft = vi.fn(async () => {
        throw new Error("draft rejected");
      });
      const closeWorkspaceTab = vi.fn(async () =>
        createSnapshot({ activeTabId: "tab-2", includeFirst: false })
      );
      const detachWorkspaceTabToNewWindow = vi.fn(async () =>
        createSnapshot({ activeTabId: "tab-2", includeFirst: false })
      );
      const application = createApplication({
        bridge: {
          getWorkspaceSnapshot: vi.fn(async () => targetSnapshot),
          updateWorkspaceTabDraft,
          closeWorkspaceTab,
          detachWorkspaceTabToNewWindow
        }
      });
      const sourceIdentity = consumeEditorLoad(application);
      expect(application.recordEditorChange({
        identity: sourceIdentity,
        content: "# Pending source\n"
      })).toBe(true);
      await expect(application.refreshWorkspaceSnapshot()).resolves.toMatchObject({
        kind: "committed"
      });

      const outcome = command === "close"
        ? await application.closeWorkspaceTab("tab-1")
        : await application.detachWorkspaceTab("tab-1");

      expect(outcome.kind).toBe("failed-reconciled");
      expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
        tabId: "tab-1",
        content: "# Pending source\n"
      });
      expect(closeWorkspaceTab).not.toHaveBeenCalled();
      expect(detachWorkspaceTabToNewWindow).not.toHaveBeenCalled();
    }
  );

  it("removes a target outbox lifecycle only after close snapshot proves removal", async () => {
    const targetSnapshot = createSnapshot({ activeTabId: "tab-2" });
    const closedSnapshot = createSnapshot({ activeTabId: "tab-2", includeFirst: false });
    const updateWorkspaceTabDraft = vi.fn(async () => targetSnapshot);
    const confirmWorkspaceWindowClose = vi.fn(async () => true);
    const application = createApplication({
      bridge: {
        getWorkspaceSnapshot: vi.fn(async () => targetSnapshot),
        updateWorkspaceTabDraft,
        closeWorkspaceTab: vi.fn(async () => closedSnapshot),
        confirmWorkspaceWindowClose
      }
    });
    const sourceIdentity = consumeEditorLoad(application);
    application.recordEditorChange({ identity: sourceIdentity, content: "# Pending source\n" });
    await application.refreshWorkspaceSnapshot();

    await expect(application.closeWorkspaceTab("tab-1")).resolves.toMatchObject({
      kind: "committed"
    });
    updateWorkspaceTabDraft.mockClear();
    await expect(application.confirmWorkspaceWindowClose("close-1")).resolves.toMatchObject({
      kind: "committed",
      value: true
    });

    expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
    expect(confirmWorkspaceWindowClose).toHaveBeenCalledWith({ requestId: "close-1" });
  });

  it("drains every tab outbox before native close confirmation", async () => {
    const targetSnapshot = createSnapshot({ activeTabId: "tab-2" });
    let editorContent = "# First\n";
    const updateWorkspaceTabDraft = vi
      .fn()
      .mockResolvedValueOnce(targetSnapshot)
      .mockRejectedValueOnce(new Error("second draft rejected"));
    const confirmWorkspaceWindowClose = vi.fn(async () => true);
    const application = createApplication({
      bridge: {
        getWorkspaceSnapshot: vi.fn(async () => targetSnapshot),
        updateWorkspaceTabDraft,
        confirmWorkspaceWindowClose
      },
      readEditorContent: () => editorContent
    });
    const firstIdentity = consumeEditorLoad(application);
    application.recordEditorChange({ identity: firstIdentity, content: "# First pending\n" });
    await application.refreshWorkspaceSnapshot();
    const secondIdentity = consumeEditorLoad(application);
    editorContent = "# Second pending\n";
    application.recordEditorChange({ identity: secondIdentity, content: "# Second pending\n" });

    await expect(application.confirmWorkspaceWindowClose("close-1")).resolves.toMatchObject({
      kind: "failed-reconciled"
    });

    expect(updateWorkspaceTabDraft.mock.calls).toEqual([
      [{ tabId: "tab-1", content: "# First pending\n" }],
      [{ tabId: "tab-2", content: "# Second pending\n" }]
    ]);
    expect(confirmWorkspaceWindowClose).not.toHaveBeenCalled();
  });

  it("invalidates same-tab editor ownership until CodeMirror consumes canonical replacement", async () => {
    const replacement = createSnapshot({
      activeTabId: "tab-1",
      firstContent: "# Replaced on disk\n"
    });
    const updateWorkspaceTabDraft = vi.fn();
    const application = createApplication({
      bridge: {
        getWorkspaceSnapshot: vi.fn(async () => replacement),
        updateWorkspaceTabDraft,
        activateWorkspaceTab: vi.fn()
      },
      readEditorContent: () => "# Old editor buffer\n"
    });
    const oldIdentity = consumeEditorLoad(application);

    await expect(application.refreshWorkspaceSnapshot()).resolves.toMatchObject({
      kind: "committed"
    });
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Old editor buffer\n"
    })).toBe(false);
    await application.activateWorkspaceTab("tab-1");

    expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe(
      "# Replaced on disk\n"
    );
  });

  it("committed reload discards the old draft and cannot revive it on blur/save", async () => {
    const diskSnapshot = createSnapshot({
      activeTabId: "tab-1",
      firstContent: "# Disk\n"
    });
    const updateWorkspaceTabDraft = vi.fn();
    const saveMarkdownFile = vi.fn(async () => ({
      status: "success" as const,
      document: {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# Disk\n",
        encoding: "utf-8" as const
      }
    }));
    const application = createApplication({
      bridge: {
        reloadWorkspaceTabFromPath: vi.fn(async () => ({
          kind: "success" as const,
          snapshot: diskSnapshot
        })),
        updateWorkspaceTabDraft,
        saveMarkdownFile,
        getWorkspaceSnapshot: vi.fn(async () => diskSnapshot)
      },
      readEditorContent: () => "# Discard me\n"
    });
    const oldIdentity = consumeEditorLoad(application);
    application.recordEditorChange({ identity: oldIdentity, content: "# Discard me\n" });

    await expect(application.reloadWorkspaceTabFromPath("tab-1")).resolves.toMatchObject({
      kind: "committed"
    });
    expect(application.getState().editorTransition).toBe("idle");
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# Disk\n");
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Discard me\n"
    })).toBe(false);
    await application.runSaveTransaction({
      forceSaveAs: false,
      hasExternalConflict: false
    });

    expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
    expect(saveMarkdownFile).toHaveBeenCalledWith({ tabId: "tab-1" });
  });

  it("invalidates the editor lease and exposes a read-only transition while reload is in flight", async () => {
    const reload = createDeferred<{
      kind: "success";
      snapshot: WorkspaceWindowSnapshot;
    }>();
    const diskSnapshot = createSnapshot({ firstContent: "# Disk\n" });
    const application = createApplication({
      bridge: {
        reloadWorkspaceTabFromPath: vi.fn(() => reload.promise)
      }
    });
    const oldIdentity = consumeEditorLoad(application);

    const pendingReload = application.reloadWorkspaceTabFromPath("tab-1");
    await vi.waitFor(() => expect(application.getState().editorTransition).toBe("reloading"));
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Typed during reload\n"
    })).toBe(false);

    reload.resolve({ kind: "success", snapshot: diskSnapshot });
    await expect(pendingReload).resolves.toMatchObject({ kind: "committed" });
    expect(application.getState().editorTransition).toBe("idle");
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# Disk\n");
  });

  it("preserves the cutoff draft when reload transport fails before commit", async () => {
    const recoveredSnapshot = createSnapshot({
      activeTabId: "tab-1",
      firstContent: "# Before reload\n"
    });
    const updateWorkspaceTabDraft = vi.fn(async () => recoveredSnapshot);
    const confirmWorkspaceWindowClose = vi.fn(async () => true);
    const application = createApplication({
      initialSnapshot: recoveredSnapshot,
      bridge: {
        reloadWorkspaceTabFromPath: vi.fn(async () => {
          throw new Error("transport failed before commit");
        }),
        getWorkspaceSnapshot: vi.fn(async () => recoveredSnapshot),
        updateWorkspaceTabDraft,
        confirmWorkspaceWindowClose
      },
      readEditorContent: () => "# Unsaved draft\n"
    });
    const oldIdentity = consumeEditorLoad(application);
    application.recordEditorChange({ identity: oldIdentity, content: "# Unsaved draft\n" });

    await expect(application.reloadWorkspaceTabFromPath("tab-1")).resolves.toMatchObject({
      kind: "failed-reconciled"
    });

    expect(application.getState().editorTransition).toBe("idle");
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe(
      "# Unsaved draft\n"
    );
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Stale buffer\n"
    })).toBe(false);
    consumeEditorLoad(application);
    await application.confirmWorkspaceWindowClose("close-1");
    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Unsaved draft\n"
    });
    expect(confirmWorkspaceWindowClose).toHaveBeenCalled();
  });

  it("blocks every later command while canonical state remains unknown", async () => {
    const getWorkspaceSnapshot = vi.fn(async () => {
      throw new Error("reconcile unavailable");
    });
    const closeWorkspaceTab = vi.fn();
    const application = createApplication({
      bridge: {
        activateWorkspaceTab: vi.fn(async () => {
          throw new Error("activation transport unknown");
        }),
        getWorkspaceSnapshot,
        closeWorkspaceTab
      }
    });
    consumeEditorLoad(application);

    await expect(application.activateWorkspaceTab("tab-2")).resolves.toMatchObject({
      kind: "canonical-unavailable"
    });
    expect(application.getCanonicalStatus()).toBe("unknown");
    const identity = application.getEditorBinding();
    expect(identity).not.toBeNull();
    expect(application.recordEditorChange({
      identity: identity!,
      content: "# Local edit while canonical is unknown\n"
    })).toBe(true);
    await expect(application.closeWorkspaceTab("tab-1")).resolves.toMatchObject({
      kind: "canonical-unavailable"
    });

    expect(getWorkspaceSnapshot).toHaveBeenCalledTimes(2);
    expect(closeWorkspaceTab).not.toHaveBeenCalled();
  });

  it.each(["activation", "open"] as const)(
    "keeps save bound to its invocation tab across queued %s",
    async (interleaving) => {
      const draftSync = createDeferred<WorkspaceWindowSnapshot>();
      const sourceSnapshot = createSnapshot({
        activeTabId: "tab-1",
        firstContent: "# Pending\n"
      });
      const targetSnapshot = createSnapshot({ activeTabId: "tab-2" });
      const openedSnapshot = createSnapshot({ activeTabId: "tab-2", includeFirst: false });
      const saveMarkdownFile = vi.fn(async () => ({
        status: "success" as const,
        document: {
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# Pending\n",
          encoding: "utf-8" as const
        }
      }));
      const activateWorkspaceTab = vi.fn(async () => targetSnapshot);
      const openWorkspaceFileFromPath = vi.fn(async () => ({
        kind: "success" as const,
        snapshot: openedSnapshot
      }));
      const getWorkspaceSnapshot = vi.fn(async () => sourceSnapshot);
      const application = createApplication({
        bridge: {
          updateWorkspaceTabDraft: vi.fn(() => draftSync.promise),
          saveMarkdownFile,
          activateWorkspaceTab,
          openWorkspaceFileFromPath,
          getWorkspaceSnapshot
        }
      });
      const identity = consumeEditorLoad(application);
      application.recordEditorChange({ identity, content: "# Pending\n" });

      const save = application.runSaveTransaction({
        forceSaveAs: false,
        hasExternalConflict: false
      });
      await vi.waitFor(() => expect(application.getPendingOperationKind()).toBe("save"));
      const later = interleaving === "activation"
        ? application.activateWorkspaceTab("tab-2")
        : application.openMarkdownFromPath("C:/notes/opened.md");
      await Promise.resolve();
      expect(activateWorkspaceTab).not.toHaveBeenCalled();
      expect(openWorkspaceFileFromPath).not.toHaveBeenCalled();
      draftSync.resolve(sourceSnapshot);

      await expect(save).resolves.toMatchObject({ kind: "committed", tabId: "tab-1" });
      await later;
      expect(saveMarkdownFile).toHaveBeenCalledWith({ tabId: "tab-1" });
      expect(saveMarkdownFile.mock.invocationCallOrder[0]).toBeLessThan(
        interleaving === "activation"
          ? activateWorkspaceTab.mock.invocationCallOrder[0]!
          : openWorkspaceFileFromPath.mock.invocationCallOrder[0]!
      );
    }
  );
});
