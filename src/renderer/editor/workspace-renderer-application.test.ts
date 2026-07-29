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
  initialSnapshot?: WorkspaceWindowSnapshot | null;
  readEditorContent?: () => string;
} = {}) {
  return new WorkspaceRendererApplication({
    bridge: input.bridge as Window["fishmark"],
    initialSnapshot: "initialSnapshot" in input ? input.initialSnapshot : createSnapshot(),
    readEditorContent: input.readEditorContent ?? (() => "# First\n")
  });
}

function consumeEditorLoad(application: WorkspaceRendererApplication): EditorLoadIdentity {
  const identity = application.getPendingEditorLoadIdentity();
  expect(identity).not.toBeNull();
  expect(application.acknowledgeEditorLoad(identity!)).toBe(true);
  return identity!;
}

async function acknowledgeEditorReadOnly(application: WorkspaceRendererApplication): Promise<number> {
  await vi.waitFor(() => {
    expect(application.getState().editorTransition?.phase).toBe("sealing");
  });
  const transition = application.getState().editorTransition;
  expect(transition).not.toBeNull();
  expect(transition?.readOnly).toBe(true);
  expect(application.acknowledgeEditorTransition({
    token: transition!.token,
    readOnly: true
  })).toBe(true);
  return transition!.token;
}

async function acknowledgeEditorEditable(application: WorkspaceRendererApplication): Promise<number> {
  await vi.waitFor(() => {
    expect(application.getState().editorTransition?.phase).toBe("releasing");
  });
  const transition = application.getState().editorTransition;
  expect(transition).not.toBeNull();
  expect(transition?.readOnly).toBe(false);
  expect(application.acknowledgeEditorTransition({
    token: transition!.token,
    readOnly: false
  })).toBe(true);
  return transition!.token;
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
    const close = application.confirmWorkspaceWindowClose("close-1");
    await acknowledgeEditorReadOnly(application);
    await expect(close).resolves.toMatchObject({
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

    const close = application.confirmWorkspaceWindowClose("close-1");
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    const closeOutcome = await close;
    expect(closeOutcome).toMatchObject({
      kind: "failed-reconciled"
    });

    expect(updateWorkspaceTabDraft.mock.calls).toEqual([
      [{ tabId: "tab-1", content: "# First pending\n" }],
      [{ tabId: "tab-2", content: "# Second pending\n" }]
    ]);
    expect(confirmWorkspaceWindowClose).not.toHaveBeenCalled();
  });

  it.each([
    ["close", "closing-tab"],
    ["detach", "detaching-tab"]
  ] as const)(
    "seals the active editor before %s can drain or dispatch",
    async (command, transition) => {
      const pendingSnapshot = createSnapshot({ firstContent: "# Pending\n" });
      const removedSnapshot = createSnapshot({ activeTabId: "tab-2", includeFirst: false });
      const destructive = createDeferred<WorkspaceWindowSnapshot>();
      const updateWorkspaceTabDraft = vi.fn(async () => pendingSnapshot);
      let editorContent = "# Pending\n";
      const closeWorkspaceTab = vi.fn(() => destructive.promise);
      const detachWorkspaceTabToNewWindow = vi.fn(() => destructive.promise);
      const application = createApplication({
        bridge: {
          updateWorkspaceTabDraft,
          closeWorkspaceTab,
          detachWorkspaceTabToNewWindow
        },
        readEditorContent: () => editorContent
      });
      const identity = consumeEditorLoad(application);
      application.recordEditorChange({ identity, content: "# Pending\n" });

      const operation = command === "close"
        ? application.closeWorkspaceTab("tab-1")
        : application.detachWorkspaceTab("tab-1");
      await vi.waitFor(() => {
        expect(application.getState().editorTransition).toMatchObject({
          phase: "sealing",
          reason: transition,
          readOnly: true
        });
      });
      expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
      expect(closeWorkspaceTab).not.toHaveBeenCalled();
      expect(detachWorkspaceTabToNewWindow).not.toHaveBeenCalled();
      editorContent = "# Late destructive edit\n";
      expect(application.recordEditorChange({
        identity,
        content: "# Late destructive edit\n"
      })).toBe(true);

      await acknowledgeEditorReadOnly(application);
      await vi.waitFor(() => expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
        tabId: "tab-1",
        content: "# Late destructive edit\n"
      }));
      expect(application.getState().editorTransition?.phase).toBe("sealed");
      expect(application.recordEditorChange({
        identity,
        content: "# Too late\n"
      })).toBe(false);

      destructive.resolve(removedSnapshot);
      await acknowledgeEditorEditable(application);
      await expect(operation).resolves.toMatchObject({ kind: "committed" });
      expect(updateWorkspaceTabDraft).toHaveBeenCalledTimes(1);
    }
  );

  it("completes an active last-tab close without waiting for an editor that unmounted", async () => {
    const removedSnapshot = createSnapshot({
      activeTabId: null,
      includeFirst: false,
      includeSecond: false
    });
    const closeWorkspaceTab = vi.fn(async () => removedSnapshot);
    const application = createApplication({
      initialSnapshot: createSnapshot({ includeSecond: false }),
      bridge: {
        closeWorkspaceTab,
        updateWorkspaceTabDraft: vi.fn(async () => createSnapshot({ includeSecond: false }))
      }
    });
    consumeEditorLoad(application);

    const close = application.closeWorkspaceTab("tab-1");
    await acknowledgeEditorReadOnly(application);

    await expect(close).resolves.toMatchObject({ kind: "committed" });
    expect(closeWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-1" });
    expect(application.getState().workspaceSnapshot?.activeDocument).toBeNull();
    expect(application.getState().editorTransition).toBeNull();
  });

  it("settles an operation when disposal interrupts a sealing barrier", async () => {
    const application = createApplication({
      bridge: {
        closeWorkspaceTab: vi.fn(),
        getWorkspaceSnapshot: vi.fn(async () => createSnapshot())
      }
    });
    consumeEditorLoad(application);

    const close = application.closeWorkspaceTab("tab-1");
    await vi.waitFor(() => {
      expect(application.getState().editorTransition?.phase).toBe("sealing");
    });
    application.dispose();

    await expect(close).resolves.toMatchObject({ kind: "failed" });
  });

  it("settles an operation when disposal interrupts an editable release barrier", async () => {
    const removedSnapshot = createSnapshot({ activeTabId: "tab-2", includeFirst: false });
    const application = createApplication({
      bridge: {
        closeWorkspaceTab: vi.fn(async () => removedSnapshot),
        updateWorkspaceTabDraft: vi.fn(async () => createSnapshot())
      }
    });
    consumeEditorLoad(application);

    const close = application.closeWorkspaceTab("tab-1");
    await acknowledgeEditorReadOnly(application);
    await vi.waitFor(() => {
      expect(application.getState().editorTransition?.phase).toBe("releasing");
    });
    application.dispose();

    await expect(close).resolves.toMatchObject({ kind: "committed" });
  });

  it.each(["reload", "close", "detach", "window-close"] as const)(
    "does not create an editor barrier when a queued %s operation starts after disposal",
    async (command) => {
      const blocker = createDeferred<WorkspaceWindowSnapshot>();
      const reloadWorkspaceTabFromPath = vi.fn();
      const closeWorkspaceTab = vi.fn();
      const detachWorkspaceTabToNewWindow = vi.fn();
      const confirmWorkspaceWindowClose = vi.fn();
      const application = createApplication({
        bridge: {
          getWorkspaceSnapshot: vi.fn(() => blocker.promise),
          reloadWorkspaceTabFromPath,
          closeWorkspaceTab,
          detachWorkspaceTabToNewWindow,
          confirmWorkspaceWindowClose
        }
      });
      consumeEditorLoad(application);

      const first = application.refreshWorkspaceSnapshot();
      await vi.waitFor(() => expect(application.getPendingOperationKind()).toBe("refresh"));
      const destructive = command === "reload"
        ? application.reloadWorkspaceTabFromPath("tab-1")
        : command === "close"
          ? application.closeWorkspaceTab("tab-1")
          : command === "detach"
            ? application.detachWorkspaceTab("tab-1")
            : application.confirmWorkspaceWindowClose("close-1");
      application.dispose();
      blocker.resolve(createSnapshot());

      await expect(first).resolves.toMatchObject({ kind: "committed" });
      await expect(destructive).resolves.toMatchObject({ kind: "failed" });
      expect(application.getState().editorTransition).toBeNull();
      expect(reloadWorkspaceTabFromPath).not.toHaveBeenCalled();
      expect(closeWorkspaceTab).not.toHaveBeenCalled();
      expect(detachWorkspaceTabToNewWindow).not.toHaveBeenCalled();
      expect(confirmWorkspaceWindowClose).not.toHaveBeenCalled();
    }
  );

  it("does not continue a destructive operation when disposal occurs during canonical reconciliation", async () => {
    const snapshot = createSnapshot();
    const reconcile = createDeferred<WorkspaceWindowSnapshot>();
    const getWorkspaceSnapshot = vi.fn(() => reconcile.promise);
    const closeWorkspaceTab = vi.fn();
    const application = createApplication({
      initialSnapshot: null,
      bridge: {
        getWorkspaceSnapshot,
        closeWorkspaceTab
      }
    });

    const close = application.closeWorkspaceTab("tab-1");
    await vi.waitFor(() => expect(getWorkspaceSnapshot).toHaveBeenCalledTimes(1));
    application.dispose();
    reconcile.resolve(snapshot);

    await expect(close).resolves.toMatchObject({ kind: "failed" });
    expect(getWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    expect(closeWorkspaceTab).not.toHaveBeenCalled();
    expect(application.getState().editorTransition).toBeNull();
  });

  it("restores a new editor epoch when active close fails", async () => {
    const pendingSnapshot = createSnapshot({ firstContent: "# Pending\n" });
    const application = createApplication({
      bridge: {
        updateWorkspaceTabDraft: vi.fn(async () => pendingSnapshot),
        closeWorkspaceTab: vi.fn(async () => {
          throw new Error("close failed");
        }),
        getWorkspaceSnapshot: vi.fn(async () => pendingSnapshot)
      },
      readEditorContent: () => "# Pending\n"
    });
    const oldIdentity = consumeEditorLoad(application);
    const oldLoadRevision = application.getState().editorLoadRevision;
    application.recordEditorChange({ identity: oldIdentity, content: "# Pending\n" });

    const close = application.closeWorkspaceTab("tab-1");
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    await expect(close).resolves.toMatchObject({
      kind: "failed-reconciled"
    });

    expect(application.getState().editorTransition).toBeNull();
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Stale\n"
    })).toBe(false);
    const restoredIdentity = consumeEditorLoad(application);
    expect(restoredIdentity.epoch).toBeGreaterThan(oldIdentity.epoch);
    expect(restoredIdentity.loadRevision).toBe(oldLoadRevision);
    expect(application.recordEditorChange({
      identity: restoredIdentity,
      content: "# Editable again\n"
    })).toBe(true);
  });

  it("freezes the active editor through native close confirmation and restores it on cancel", async () => {
    const pendingSnapshot = createSnapshot({ firstContent: "# Pending\n" });
    const confirmation = createDeferred<boolean>();
    const updateWorkspaceTabDraft = vi.fn(async () => pendingSnapshot);
    const application = createApplication({
      bridge: {
        updateWorkspaceTabDraft,
        confirmWorkspaceWindowClose: vi.fn(() => confirmation.promise)
      },
      readEditorContent: () => "# Pending\n"
    });
    const oldIdentity = consumeEditorLoad(application);
    const oldLoadRevision = application.getState().editorLoadRevision;
    application.recordEditorChange({ identity: oldIdentity, content: "# Pending\n" });

    const close = application.confirmWorkspaceWindowClose("close-1");
    await vi.waitFor(() => expect(application.getState().editorTransition).toMatchObject({
      phase: "sealing",
      reason: "closing-window",
      readOnly: true
    }));
    expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Late window-close edit\n"
    })).toBe(true);

    await acknowledgeEditorReadOnly(application);
    await vi.waitFor(() => expect(updateWorkspaceTabDraft).toHaveBeenCalledTimes(1));

    confirmation.resolve(false);
    await acknowledgeEditorEditable(application);
    await expect(close).resolves.toMatchObject({ kind: "committed", value: false });
    expect(application.getState().editorTransition).toBeNull();
    const restoredIdentity = consumeEditorLoad(application);
    expect(restoredIdentity.epoch).toBeGreaterThan(oldIdentity.epoch);
    expect(restoredIdentity.loadRevision).toBe(oldLoadRevision);
    expect(application.recordEditorChange({
      identity: restoredIdentity,
      content: "# Editable after cancel\n"
    })).toBe(true);
  });

  it("does not freeze the active editor while removing an inactive tab", async () => {
    const activeSecond = createSnapshot({ activeTabId: "tab-2" });
    const removedFirst = createSnapshot({ activeTabId: "tab-2", includeFirst: false });
    const close = createDeferred<WorkspaceWindowSnapshot>();
    let editorContent = "# First\n";
    const updateWorkspaceTabDraft = vi.fn(async (input: { tabId: string; content: string }) =>
      input.tabId === "tab-1"
        ? activeSecond
        : createSnapshot({ activeTabId: "tab-2", secondContent: input.content })
    );
    const application = createApplication({
      bridge: {
        getWorkspaceSnapshot: vi.fn(async () => activeSecond),
        updateWorkspaceTabDraft,
        closeWorkspaceTab: vi.fn(() => close.promise),
        confirmWorkspaceWindowClose: vi.fn(async () => false)
      },
      readEditorContent: () => editorContent
    });
    const firstIdentity = consumeEditorLoad(application);
    application.recordEditorChange({ identity: firstIdentity, content: "# First pending\n" });
    await application.refreshWorkspaceSnapshot();
    const secondIdentity = consumeEditorLoad(application);

    const removing = application.closeWorkspaceTab("tab-1");
    await vi.waitFor(() => expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# First pending\n"
    }));
    expect(application.getState().editorTransition).toBeNull();
    editorContent = "# Second remains editable\n";
    expect(application.recordEditorChange({
      identity: secondIdentity,
      content: "# Second remains editable\n"
    })).toBe(true);

    close.resolve(removedFirst);
    await removing;
    const confirmClose = application.confirmWorkspaceWindowClose("close-1");
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    await confirmClose;
    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-2",
      content: "# Second remains editable\n"
    });
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
    const updateWorkspaceTabDraft = vi.fn(async (input: { content: string }) =>
      createSnapshot({ activeTabId: "tab-1", firstContent: input.content })
    );
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

    const reload = application.reloadWorkspaceTabFromPath("tab-1");
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    await expect(reload).resolves.toMatchObject({
      kind: "committed"
    });
    expect(application.getState().editorTransition).toBeNull();
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# Disk\n");
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Discard me\n"
    })).toBe(false);
    await application.runSaveTransaction({
      forceSaveAs: false,
      hasExternalConflict: false
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledTimes(1);
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
        reloadWorkspaceTabFromPath: vi.fn(() => reload.promise),
        updateWorkspaceTabDraft: vi.fn(async (input: { content: string }) =>
          createSnapshot({ firstContent: input.content })
        )
      }
    });
    const oldIdentity = consumeEditorLoad(application);

    const pendingReload = application.reloadWorkspaceTabFromPath("tab-1");
    await vi.waitFor(() => expect(application.getState().editorTransition).toMatchObject({
      phase: "sealing",
      reason: "reloading",
      readOnly: true
    }));
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Typed before read-only ack\n"
    })).toBe(true);
    expect(application.getState().editorTransition?.phase).toBe("sealing");
    await acknowledgeEditorReadOnly(application);
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Typed during reload\n"
    })).toBe(false);

    reload.resolve({ kind: "success", snapshot: diskSnapshot });
    await acknowledgeEditorEditable(application);
    await expect(pendingReload).resolves.toMatchObject({ kind: "committed" });
    expect(application.getState().editorTransition).toBeNull();
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# Disk\n");
  });

  it("advances the load boundary when a typed reload succeeds with identical content", async () => {
    const sameSnapshot = createSnapshot({ firstContent: "# Same\n" });
    const application = createApplication({
      initialSnapshot: sameSnapshot,
      bridge: {
        reloadWorkspaceTabFromPath: vi.fn(async () => ({
          kind: "success" as const,
          snapshot: sameSnapshot
        }))
      },
      readEditorContent: () => "# Same\n"
    });
    consumeEditorLoad(application);
    const oldLoadRevision = application.getState().editorLoadRevision;

    const reload = application.reloadWorkspaceTabFromPath("tab-1");
    await acknowledgeEditorReadOnly(application);
    await vi.waitFor(() => {
      expect(application.getState().editorTransition?.phase).toBe("releasing");
    });
    const pendingIdentity = application.getPendingEditorLoadIdentity();

    expect(pendingIdentity?.loadRevision).toBe(oldLoadRevision + 1);
    await acknowledgeEditorEditable(application);
    await expect(reload).resolves.toMatchObject({ kind: "committed" });
  });

  it("does not advance the active editor load boundary when an inactive reload succeeds", async () => {
    const activeSecond = createSnapshot({ activeTabId: "tab-2" });
    const application = createApplication({
      initialSnapshot: activeSecond,
      bridge: {
        reloadWorkspaceTabFromPath: vi.fn(async () => ({
          kind: "success" as const,
          snapshot: activeSecond
        }))
      },
      readEditorContent: () => "# Second\n"
    });
    const activeIdentity = consumeEditorLoad(application);
    const oldLoadRevision = application.getState().editorLoadRevision;

    await expect(application.reloadWorkspaceTabFromPath("tab-1")).resolves.toMatchObject({
      kind: "committed"
    });

    expect(application.getState().editorTransition).toBeNull();
    expect(application.getState().editorLoadRevision).toBe(oldLoadRevision);
    expect(application.getEditorBinding()).toEqual(activeIdentity);
    expect(application.getPendingEditorLoadIdentity()).toBeNull();
  });

  it.each(["revision-stale", "reload-error"] as const)(
    "rebinds a %s reload without replacing unchanged editor content",
    async (resultKind) => {
      const initialSnapshot = createSnapshot({ firstContent: "# Draft\n" });
      const application = createApplication({
        initialSnapshot,
        bridge: {
          updateWorkspaceTabDraft: vi.fn(async () => initialSnapshot),
          reloadWorkspaceTabFromPath: vi.fn(async () => resultKind === "revision-stale"
            ? { kind: "revision-stale" as const }
            : {
                kind: "error" as const,
                error: { code: "read-failed" as const, message: "read failed" }
              })
        },
        readEditorContent: () => "# Draft\n"
      });
      const oldIdentity = consumeEditorLoad(application);
      const oldLoadRevision = application.getState().editorLoadRevision;

      const reload = application.reloadWorkspaceTabFromPath("tab-1");
      await acknowledgeEditorReadOnly(application);
      await vi.waitFor(() => {
        expect(application.getState().editorTransition?.phase).toBe("releasing");
      });
      const pendingIdentity = application.getPendingEditorLoadIdentity();

      expect(pendingIdentity).toMatchObject({
        tabId: "tab-1",
        epoch: oldIdentity.epoch + 1,
        loadRevision: oldLoadRevision
      });
      expect(application.acknowledgeEditorLoad(pendingIdentity!)).toBe(true);
      await acknowledgeEditorEditable(application);
      await expect(reload).resolves.toMatchObject({ kind: resultKind });
      expect(application.getEditorBinding()).toEqual(pendingIdentity);
      expect(application.getState().editorLoadRevision).toBe(oldLoadRevision);
    }
  );

  it("preserves the cutoff draft when reload transport fails before commit", async () => {
    const recoveredSnapshot = createSnapshot({
      activeTabId: "tab-1",
      firstContent: "# Before reload\n"
    });
    let latestSnapshot = recoveredSnapshot;
    const updateWorkspaceTabDraft = vi.fn(async (input: { content: string }) => {
      latestSnapshot = createSnapshot({ activeTabId: "tab-1", firstContent: input.content });
      return latestSnapshot;
    });
    const confirmWorkspaceWindowClose = vi.fn(async () => true);
    const application = createApplication({
      initialSnapshot: recoveredSnapshot,
      bridge: {
        reloadWorkspaceTabFromPath: vi.fn(async () => {
          throw new Error("transport failed before commit");
        }),
        getWorkspaceSnapshot: vi.fn(async () => latestSnapshot),
        updateWorkspaceTabDraft,
        confirmWorkspaceWindowClose
      },
      readEditorContent: () => "# Unsaved draft\n"
    });
    const oldIdentity = consumeEditorLoad(application);
    application.recordEditorChange({ identity: oldIdentity, content: "# Unsaved draft\n" });

    const reload = application.reloadWorkspaceTabFromPath("tab-1");
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    await expect(reload).resolves.toMatchObject({
      kind: "failed-reconciled"
    });

    expect(application.getState().editorTransition).toBeNull();
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe(
      "# Unsaved draft\n"
    );
    expect(application.recordEditorChange({
      identity: oldIdentity,
      content: "# Stale buffer\n"
    })).toBe(false);
    consumeEditorLoad(application);
    const close = application.confirmWorkspaceWindowClose("close-1");
    await acknowledgeEditorReadOnly(application);
    await close;
    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Unsaved draft\n"
    });
    expect(confirmWorkspaceWindowClose).toHaveBeenCalled();
  });

  it("restores the sealed cutoff draft when reload commits but its response is rejected", async () => {
    const initialSnapshot = createSnapshot({ firstContent: "# Before reload\n" });
    const diskSnapshot = createSnapshot({ firstContent: "# Disk after ambiguous reload\n" });
    let latestSnapshot = initialSnapshot;
    const updateWorkspaceTabDraft = vi.fn(async (input: { content: string }) => {
      latestSnapshot = createSnapshot({ firstContent: input.content });
      return latestSnapshot;
    });
    const application = createApplication({
      initialSnapshot,
      bridge: {
        updateWorkspaceTabDraft,
        reloadWorkspaceTabFromPath: vi.fn(async () => {
          latestSnapshot = diskSnapshot;
          throw new Error("reload committed but response was lost");
        }),
        getWorkspaceSnapshot: vi.fn(async () => latestSnapshot),
        confirmWorkspaceWindowClose: vi.fn(async () => true)
      },
      readEditorContent: () => "# Unsaved draft\n"
    });
    const oldIdentity = consumeEditorLoad(application);
    const oldLoadRevision = application.getState().editorLoadRevision;
    application.recordEditorChange({ identity: oldIdentity, content: "# Unsaved draft\n" });

    const reload = application.reloadWorkspaceTabFromPath("tab-1");
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    await expect(reload).resolves.toMatchObject({ kind: "failed-reconciled" });

    expect(updateWorkspaceTabDraft).toHaveBeenNthCalledWith(1, {
      tabId: "tab-1",
      content: "# Unsaved draft\n"
    });
    expect(latestSnapshot).toEqual(diskSnapshot);
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe(
      "# Unsaved draft\n"
    );
    expect(application.getState().editorLoadRevision).toBe(oldLoadRevision);

    const restoredIdentity = consumeEditorLoad(application);
    const close = application.confirmWorkspaceWindowClose("close-ambiguous");
    await acknowledgeEditorReadOnly(application);
    await expect(close).resolves.toMatchObject({ kind: "committed", value: true });
    expect(restoredIdentity.epoch).toBeGreaterThan(oldIdentity.epoch);
    expect(updateWorkspaceTabDraft).toHaveBeenNthCalledWith(2, {
      tabId: "tab-1",
      content: "# Unsaved draft\n"
    });
  });

  it("restores a pre-synced sealed draft when ambiguous reload reconciliation returns disk content", async () => {
    const initialSnapshot = createSnapshot({ firstContent: "# Before reload\n" });
    const syncedDraftSnapshot = createSnapshot({ firstContent: "# Pre-synced draft\n" });
    const diskSnapshot = createSnapshot({ firstContent: "# Disk after reload\n" });
    let latestSnapshot = initialSnapshot;
    const updateWorkspaceTabDraft = vi.fn(async () => {
      latestSnapshot = syncedDraftSnapshot;
      return syncedDraftSnapshot;
    });
    const application = createApplication({
      initialSnapshot,
      bridge: {
        updateWorkspaceTabDraft,
        reloadWorkspaceTabFromPath: vi.fn(async () => {
          latestSnapshot = diskSnapshot;
          throw new Error("reload response lost");
        }),
        getWorkspaceSnapshot: vi.fn(async () => latestSnapshot),
        confirmWorkspaceWindowClose: vi.fn(async () => true)
      },
      readEditorContent: () => "# Pre-synced draft\n"
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorChange({ identity, content: "# Pre-synced draft\n" });
    await expect(application.flushActiveWorkspaceDraft()).resolves.toMatchObject({
      kind: "committed"
    });
    expect(updateWorkspaceTabDraft).toHaveBeenCalledTimes(1);

    const reload = application.reloadWorkspaceTabFromPath("tab-1");
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    await expect(reload).resolves.toMatchObject({ kind: "failed-reconciled" });
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe(
      "# Pre-synced draft\n"
    );

    consumeEditorLoad(application);
    const close = application.confirmWorkspaceWindowClose("close-pre-synced");
    await acknowledgeEditorReadOnly(application);
    await expect(close).resolves.toMatchObject({ kind: "committed", value: true });
    expect(updateWorkspaceTabDraft).toHaveBeenNthCalledWith(2, {
      tabId: "tab-1",
      content: "# Pre-synced draft\n"
    });
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
