import { describe, expect, it, vi } from "vitest";
import { WorkspaceEditClient } from "./workspace-edit-client";

import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import {
  WorkspaceRendererApplication,
  type EditorLoadIdentity
} from "./workspace-renderer-application";
import type { CodeEditorDocumentChangeFrame } from "../code-editor";

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
          revision: 0,
          savedRevision: 0,
          isDirty: false,
          saveState: "idle"
        }
  };
}

function createRecoverySnapshot(): WorkspaceWindowSnapshot {
  return {
    windowId: "window-1",
    activeTabId: "recovery-tab",
    tabs: [
      { tabId: "tab-1", path: "C:/notes/first.md", name: "first.md", isDirty: true, saveState: "idle" },
      { tabId: "recovery-tab", path: null, name: "Untitled", isDirty: false, saveState: "idle" }
    ],
    activeDocument: {
      tabId: "recovery-tab", path: null, name: "Untitled", content: "", encoding: "utf-8",
      revision: 0, savedRevision: 0, isDirty: false, saveState: "idle"
    }
  };
}

function createApplication(input: {
  bridge?: Partial<Window["fishmark"]>;
  initialSnapshot?: WorkspaceWindowSnapshot | null;
  autoAcknowledgeRecovery?: boolean;
} = {}) {
  const application = new WorkspaceRendererApplication({
    bridge: input.bridge as Window["fishmark"],
    initialSnapshot: "initialSnapshot" in input ? input.initialSnapshot : createSnapshot()
  });
  application.registerEditorCanonicalRestore(async () => ({ kind: "restored" }));
  if (input.autoAcknowledgeRecovery ?? true) {
    application.subscribe(() => {
      const transition = application.getState().editorTransition;
      if (transition?.reason === "recovering" && transition.phase === "sealing") {
        queueMicrotask(() => application.acknowledgeEditorTransition({
          token: transition.token,
          readOnly: true
        }));
      }
    });
  }
  return application;
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
  it("retains the acknowledged edit queue across a cancelled close epoch rebind", async () => {
    const applyDocumentEdits = vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
      kind: "applied" as const, acknowledgedSequence: input.clientSequence,
      revision: input.baseRevision + 1, isDirty: true
    }));
    const application = createApplication({
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: input.throughSequence, savedRevision: 0, isDirty: true
        })),
        confirmWorkspaceWindowClose: vi.fn(async () => ({ status: "cancelled" as const })),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const before = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity: before, baseText: "# First\n", resultingText: "# First!\n",
      changes: [{ from: 7, to: 7, insert: "!" }]
    })).toBe(true);
    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledTimes(1));
    // The shell intentionally has old canonical text/revisions and a disposable
    // dirty overlay. It must not become a fresh transport hydration checkpoint.
    expect(application.getState().workspaceSnapshot?.activeDocument).toMatchObject({
      content: "# First\n", revision: 0, savedRevision: 0, isDirty: true
    });
    const closing = application.confirmWorkspaceWindowClose("close-1");
    await acknowledgeEditorReadOnly(application);
    await vi.waitFor(() => expect(application.getState().editorTransition?.phase).toBe("releasing"));
    const rebound = consumeEditorLoad(application);
    expect(rebound.epoch).toBeGreaterThan(before.epoch);
    expect(rebound.loadRevision).toBe(before.loadRevision);
    await acknowledgeEditorEditable(application);
    await expect(closing).resolves.toEqual({ kind: "committed", value: false });
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First!\n");
    expect(application.recordEditorDocumentChangeFrame({
      identity: rebound, baseText: "# First!\n", resultingText: "# First!!\n",
      changes: [{ from: 8, to: 8, insert: "!" }]
    })).toBe(true);
    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledTimes(2));
    expect(applyDocumentEdits.mock.calls[1]?.[0]).toMatchObject({ clientSequence: 2, baseRevision: 1 });
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First!!\n");
    application.dispose();
  });

  it("routes an editor frame only through revisioned edits while keeping canonical content disposable", async () => {
    const applyDocumentEdits = vi.fn(async (input: {
      clientSequence: number;
      baseRevision: number;
    }) => ({
      kind: "applied" as const,
      acknowledgedSequence: input.clientSequence,
      revision: input.baseRevision + 1,
      isDirty: true
    }));
    const application = createApplication({
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    const frame: CodeEditorDocumentChangeFrame = {
      identity,
      baseText: "# First\n",
      resultingText: "# First!\n",
      changes: [{ from: 7, to: 7, insert: "!" }]
    };

    application.recordEditorFramePending({ hasPending: true, identity });
    expect(application.recordEditorDocumentChangeFrame(frame)).toBe(true);
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# First\n");
    expect(application.getState().workspaceSnapshot?.activeDocument?.isDirty).toBe(true);
    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledWith({
      tabId: "tab-1",
      clientId: expect.any(String),
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 7, to: 7, insert: "!" }]
    }));
  });

  it("reconciles a non-overlapping conflict in the active view before reusing its client sequence", async () => {
    let attempts = 0;
    const applyDocumentEdits = vi.fn(async (input: { clientSequence: number; baseRevision: number }) => {
      attempts += 1;
      return attempts === 1
        ? {
            kind: "revision-conflict" as const,
            canonicalRevision: 1,
            canonicalText: "alpha REMOTE",
            isDirty: true
          }
        : {
            kind: "applied" as const,
            acknowledgedSequence: input.clientSequence,
            revision: input.baseRevision + 1,
            isDirty: true
          };
    });
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "alpha omega" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    const applyRemotePatch = vi.fn(async () => ({ kind: "applied" as const }));
    application.registerEditorRemotePatch(applyRemotePatch);

    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "alpha omega",
      resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    })).toBe(true);

    await vi.waitFor(() => expect(applyRemotePatch).toHaveBeenCalledWith({
      identity,
      expectedBefore: "LOCAL omega",
      expectedAfter: "LOCAL REMOTE",
      from: 6,
      to: 11,
      insert: "REMOTE"
    }));
    expect(applyDocumentEdits).toHaveBeenCalledTimes(2);
    expect(applyDocumentEdits.mock.calls[1]?.[0]).toMatchObject({
      clientSequence: 1,
      baseRevision: 1,
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
  });

  it("seals the active editor before preparing a conflict resolution", async () => {
    const seal = createDeferred<{ text: string; identity: EditorLoadIdentity | null }>();
    const applyRemotePatch = vi.fn(async () => ({ kind: "applied" as const }));
    let attempts = 0;
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "alpha omega" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => {
          attempts += 1;
          return attempts === 1
            ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "alpha REMOTE", isDirty: true }
            : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true };
        }),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    const barrier = vi.fn(() => seal.promise);
    application.registerEditorBarrier(barrier);
    application.registerEditorRemotePatch(applyRemotePatch);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "alpha omega", resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });

    await vi.waitFor(() => expect(barrier).toHaveBeenCalledTimes(1));
    expect(applyRemotePatch).not.toHaveBeenCalled();
    seal.resolve({ text: "LOCAL omega", identity });
    await vi.waitFor(() => expect(applyRemotePatch).toHaveBeenCalledTimes(1));
  });

  it("captures an adapter recovery outcome durably and gates destructive workflows", async () => {
    const openWorkspaceFile = vi.fn();
    const application = createApplication({ bridge: {
      applyDocumentEdits: vi.fn(), flushDocumentEdits: vi.fn(),
      onDocumentProjection: vi.fn(() => () => {}), openWorkspaceFile
    } });
    const identity = consumeEditorLoad(application);

    expect(application.recordDiscardedEditorDocumentText({
      identity,
      text: "# exact discarded text\n"
    })).toBe(true);
    await expect(application.openMarkdown()).resolves.toMatchObject({ kind: "failed" });
    expect(openWorkspaceFile).not.toHaveBeenCalled();
  });

  it("automatically materializes a recovery tab for a non-conflict adapter recovery so the window can close", async () => {
    const createWorkspaceTab = vi.fn(async () => createRecoverySnapshot());
    const flushDocumentEdits = vi.fn(async (input: { throughSequence: number }) => ({
      kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
      revision: 1, savedRevision: 0, isDirty: true
    }));
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "# remote\n", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
    );
    const confirmWorkspaceWindowClose = vi.fn(async () => ({ status: "confirmed" as const }));
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "# local\n" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits,
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {}),
        confirmWorkspaceWindowClose,
        getWorkspaceSnapshot: vi.fn(async () => createSnapshot({ firstContent: "# local\n" }))
      }
    });
    // Auto-acknowledge every read-only sealing transition, including closing-window after
    // recovery materialization retires the source editor binding.
    application.subscribe(() => {
      const transition = application.getState().editorTransition;
      if (transition?.phase === "sealing" && transition.readOnly) {
        queueMicrotask(() => application.acknowledgeEditorTransition({
          token: transition.token,
          readOnly: true
        }));
      }
    });
    const identity = consumeEditorLoad(application);

    // A non-conflict adapter discard (e.g. unload without a recoverable queue) must still
    // materialize the durable recovery tab automatically, exactly like a conflict path,
    // otherwise getRecoveryPendingOutcome permanently blocks window close.
    expect(application.recordDiscardedEditorDocumentText({
      identity,
      text: "# exact discarded local text\n"
    })).toBe(true);

    await vi.waitFor(() => expect(createWorkspaceTab).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledWith(expect.objectContaining({
      tabId: "recovery-tab", clientSequence: 1, baseRevision: 0
    })));
    await vi.waitFor(() => expect(flushDocumentEdits).toHaveBeenCalledWith(expect.objectContaining({
      tabId: "recovery-tab", throughSequence: 1
    })));
    // Recovery materialization retires the source queue only after the recovery tab flush
    // acknowledges; wait for the durable recovery record to clear before closing the window.
    // vi.waitFor's microtask pump can starve the coordinator promise chain, so give the
    // event loop a real turn before asserting the durable recovery record retired.
    await new Promise((resolve) => setTimeout(resolve, 250));
    // Recovery materialization retires the source queue only after the recovery tab flush
    // acknowledges; wait for the durable recovery record to clear before closing the window.
    // vi.waitFor's microtask pump can starve the coordinator promise chain, so give the
    // event loop a real turn before asserting the durable recovery record retired.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(
      (application as unknown as { recoveryByTab: Map<string, unknown> }).recoveryByTab.size
    ).toBe(0);

    const close = application.confirmWorkspaceWindowClose("close-1");
    await expect(close).resolves.toMatchObject({ kind: "committed", value: true });
    expect(confirmWorkspaceWindowClose).toHaveBeenCalledWith({ requestId: "close-1" });
  }, 15000);

  it("does not double-materialize the same recovery tab", async () => {
    const createWorkspaceTab = vi.fn(async () => createRecoverySnapshot());
    const flushDocumentEdits = vi.fn(async (input: { throughSequence: number }) => ({
      kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
      revision: 1, savedRevision: 0, isDirty: true
    }));
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "# remote\n", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: false }
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "# local\n" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits,
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {}),
        getWorkspaceSnapshot: vi.fn(async () => createSnapshot({ firstContent: "# local\n" }))
      }
    });
    const identity = consumeEditorLoad(application);

    expect(application.recordDiscardedEditorDocumentText({
      identity,
      text: "# first discard\n"
    })).toBe(true);
    expect(application.recordDiscardedEditorDocumentText({
      identity,
      text: "# second discard\n"
    })).toBe(true);

    await vi.waitFor(() => expect(createWorkspaceTab).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(flushDocumentEdits).toHaveBeenCalledTimes(1));
  });

  it("blocks destructive workflows while a durable recovery payload exists but still permits reorder", async () => {
    const openWorkspaceFile = vi.fn();
    const reorderWorkspaceTab = vi.fn(async () => createSnapshot());
    const application = createApplication({ bridge: { openWorkspaceFile, reorderWorkspaceTab } });
    (application as unknown as { recoveryByTab: Map<string, unknown> }).recoveryByTab.set("tab-1", {});
    await expect(application.openMarkdown()).resolves.toMatchObject({ kind: "failed" });
    await expect(application.reorderWorkspaceTab("tab-1", 0)).resolves.toMatchObject({ kind: "committed" });
    expect(openWorkspaceFile).not.toHaveBeenCalled();
  });

  it("gates explicit draft flush and active edit barrier while recovery is pending", async () => {
    const operation = vi.fn(async () => "should-not-run");
    const application = createApplication();
    (application as unknown as { recoveryByTab: Map<string, unknown> }).recoveryByTab.set("tab-1", {});

    await expect(application.flushActiveWorkspaceDraft()).resolves.toMatchObject({ kind: "failed" });
    await expect(application.runWithActiveEditBarrier(operation)).resolves.toMatchObject({ kind: "failed" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("creates a recovery-only tab and acknowledges exact overlapping Markdown text", async () => {
    const localText = "> local\n> ```ts\n> const y = 2\n> ```\n";
    const recoverySnapshot: WorkspaceWindowSnapshot = {
      windowId: "window-1",
      activeTabId: "recovery-tab",
      tabs: [
        { tabId: "tab-1", path: "C:/notes/first.md", name: "first.md", isDirty: true, saveState: "idle" },
        { tabId: "recovery-tab", path: null, name: "Untitled", isDirty: false, saveState: "idle" }
      ],
      activeDocument: {
        tabId: "recovery-tab", path: null, name: "Untitled", content: "", encoding: "utf-8",
        revision: 0, savedRevision: 0, isDirty: false, saveState: "idle"
      }
    };
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "> remote\n", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "> local\n> ```ts\n> const y = 1\n> ```\n" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        createWorkspaceTab: vi.fn(async () => recoverySnapshot),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    const baseText = "> local\n> ```ts\n> const y = 1\n> ```\n";
    application.recordEditorDocumentChangeFrame({
      identity, baseText, resultingText: localText,
      changes: [{ from: baseText.indexOf("1"), to: baseText.indexOf("1") + 1, insert: "2" }]
    });

    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledTimes(2));
    expect(applyDocumentEdits.mock.calls[1]?.[0]).toMatchObject({
      tabId: "recovery-tab", clientSequence: 1, baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: localText }]
    });
  });

  it("retains an exact recovery record when creation fails, then creates only once on retry", async () => {
    const localText = "> local\n> - nested\n";
    const recoverySnapshot = createRecoverySnapshot();
    const createWorkspaceTab = vi.fn()
      .mockRejectedValueOnce(new Error("create offline"))
      .mockResolvedValue(recoverySnapshot);
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "> remote\n", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "> local\n> - original\n" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    const baseText = "> local\n> - original\n";
    application.recordEditorDocumentChangeFrame({
      identity,
      baseText,
      resultingText: localText,
      changes: [{ from: baseText.indexOf("original"), to: baseText.indexOf("original") + 8, insert: "nested" }]
    });

    await vi.waitFor(() => expect(createWorkspaceTab).toHaveBeenCalledTimes(1));
    await expect(application.retryRecovery("tab-1")).resolves.toBe(true);

    expect(createWorkspaceTab).toHaveBeenCalledTimes(2);
    expect(applyDocumentEdits.mock.calls[1]?.[0]).toMatchObject({
      tabId: "recovery-tab", clientSequence: 1, baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: localText }]
    });
    await expect(application.retryRecovery("tab-1")).resolves.toBe(false);
    expect(createWorkspaceTab).toHaveBeenCalledTimes(2);
  });

  it("uses the newest exact late recovery text when input arrives before recovery becomes read-only", async () => {
    const createWorkspaceTab = vi.fn()
      .mockRejectedValueOnce(new Error("create offline"))
      .mockResolvedValue(createRecoverySnapshot());
    const appliedTexts: string[] = [];
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "base" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number; changes: readonly { insert: string }[] }) => {
          if (input.tabId === "tab-1") {
            return { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true };
          }
          appliedTexts.push(input.changes[0]?.insert ?? "");
          return { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true };
        }),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "base", resultingText: "LOCAL",
      changes: [{ from: 0, to: 4, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect(createWorkspaceTab).toHaveBeenCalledTimes(1));
    expect(application.recordDiscardedEditorDocumentText({ identity, text: "LOCAL newest" })).toBe(true);

    // Automatic materialization retries the durable recovery with the newest exact text after
    // the first create attempt failed, so the recovery tab acknowledges the late payload.
    await vi.waitFor(() => expect(createWorkspaceTab).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(appliedTexts).toEqual(["LOCAL newest"]));
    await vi.waitFor(() => {
      expect(
        (application as unknown as { recoveryByTab: Map<string, unknown> }).recoveryByTab.size
      ).toBe(0);
    });
  });

  it("does not create a recovery tab until the active editor acknowledges read-only", async () => {
    const createWorkspaceTab = vi.fn(async () => createRecoverySnapshot());
    const application = createApplication({
      autoAcknowledgeRecovery: false,
      initialSnapshot: createSnapshot({ firstContent: "base" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
          input.tabId === "tab-1"
            ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true }
            : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
        ),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "base", resultingText: "LOCAL",
      changes: [{ from: 0, to: 4, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect(application.getState().editorTransition).toMatchObject({
      phase: "sealing", reason: "recovering", readOnly: true
    }));
    expect(createWorkspaceTab).not.toHaveBeenCalled();
    await acknowledgeEditorReadOnly(application);
    await vi.waitFor(() => expect(createWorkspaceTab).toHaveBeenCalledTimes(1));
  });

  it("uses the finalized recovery payload captured while the composition-aware seal is pending", async () => {
    const seal = createDeferred<{ text: string; identity: EditorLoadIdentity | null }>();
    const restore = vi.fn(async () => ({ kind: "restored" as const }));
    const recoveryInserts: string[] = [];
    const application = createApplication({
      autoAcknowledgeRecovery: false,
      initialSnapshot: createSnapshot({ firstContent: "base" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number; changes: readonly { insert: string }[] }) => {
          recoveryInserts.push(input.changes[0]?.insert ?? "");
          return { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true };
        }),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        getWorkspaceSnapshot: vi.fn(async () => createSnapshot({ firstContent: "base" })),
        createWorkspaceTab: vi.fn(async () => createRecoverySnapshot()),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    const barrier = vi.fn(() => seal.promise);
    application.registerEditorBarrier(barrier);
    application.registerEditorCanonicalRestore(restore);
    expect(application.recordDiscardedEditorDocumentText({ identity, text: "LOCAL" })).toBe(true);
    // Automatic materialization drives the same coordinator; wait for the composition-aware
    // seal to be requested rather than calling retryRecovery manually.
    await vi.waitFor(() => expect(barrier).toHaveBeenCalledTimes(1));
    expect(application.recordDiscardedEditorDocumentText({ identity, text: "LOCAL newest" })).toBe(true);
    seal.resolve({ identity, text: "LOCAL newest" });
    await acknowledgeEditorReadOnly(application);
    await vi.waitFor(() => expect(recoveryInserts).toHaveLength(1));

    expect(restore).toHaveBeenCalledWith(expect.objectContaining({ expectedBefore: "LOCAL newest" }));
    expect(recoveryInserts).toEqual(["LOCAL newest"]);
  });

  it("fetches authoritative canonical text for a missing-sequence recovery and never restores blank", async () => {
    const canonical = createSnapshot({ firstContent: "# authoritative\n" });
    canonical.activeDocument = { ...canonical.activeDocument!, revision: 3, savedRevision: 0, isDirty: true };
    const restore = vi.fn(async () => ({ kind: "restored" as const }));
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "# base\n" }),
      bridge: {
        applyDocumentEdits: vi.fn(async () => ({
          kind: "sequence-gap" as const, expectedSequence: 2, canonicalRevision: 3
        })),
        flushDocumentEdits: vi.fn(),
        getWorkspaceSnapshot: vi.fn(async () => canonical),
        createWorkspaceTab: vi.fn().mockRejectedValue(new Error("stop after restore")),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.registerEditorCanonicalRestore(restore);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "# base\n", resultingText: "# local\n",
      changes: [{ from: 2, to: 6, insert: "local" }]
    });
    await vi.waitFor(() => expect((application as unknown as {
      recoveryByTab: Map<string, unknown>;
    }).recoveryByTab.has("tab-1")).toBe(true));

    await expect(application.retryRecovery("tab-1")).resolves.toBe(false);
    expect(restore).toHaveBeenCalledWith(expect.objectContaining({
      expectedBefore: "# local\n",
      canonicalText: "# authoritative\n"
    }));
    expect(restore).not.toHaveBeenCalledWith(expect.objectContaining({ canonicalText: "" }));
  });

  it("fetches authoritative canonical text for a flush-gap recovery and retains payload on fetch failure", async () => {
    const getWorkspaceSnapshot = vi.fn()
      .mockRejectedValueOnce(new Error("canonical unavailable"));
    const restore = vi.fn(async () => ({ kind: "restored" as const }));
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "# base\n" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
          kind: "applied" as const, acknowledgedSequence: input.clientSequence,
          revision: input.baseRevision + 1, isDirty: true
        })),
        flushDocumentEdits: vi.fn(async () => ({
          kind: "sequence-gap" as const, expectedSequence: 1, canonicalRevision: 2
        })),
        getWorkspaceSnapshot,
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.registerEditorCanonicalRestore(restore);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "# base\n", resultingText: "# local\n",
      changes: [{ from: 2, to: 6, insert: "local" }]
    });
    await expect(application.runWithActiveEditBarrier(async () => undefined)).resolves.toMatchObject({
      kind: "failed-reconciled"
    });

    await expect(application.retryRecovery("tab-1")).resolves.toBe(false);
    expect(restore).not.toHaveBeenCalled();
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# local\n");
    await expect(application.openMarkdown()).resolves.toMatchObject({ kind: "failed" });
  });

  it("restores the source once before recovery creation and does not restore it again after create retry", async () => {
    const createWorkspaceTab = vi.fn()
      .mockRejectedValueOnce(new Error("create offline"))
      .mockResolvedValue(createRecoverySnapshot());
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "local" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
          input.tabId === "tab-1"
            ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true }
            : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
        ),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    const restore = vi.fn(async () => ({ kind: "restored" as const }));
    application.registerEditorCanonicalRestore(restore);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "local", resultingText: "LOCAL",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect(createWorkspaceTab).toHaveBeenCalledTimes(1));
    await expect(application.retryRecovery("tab-1")).resolves.toBe(true);

    expect(restore).toHaveBeenCalledTimes(1);
    expect(createWorkspaceTab).toHaveBeenCalledTimes(2);
  });

  it("keeps a rejected remote patch total and converts it into durable recovery", async () => {
    const createWorkspaceTab = vi.fn(async () => createRecoverySnapshot());
    let attempts = 0;
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "alpha omega" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) => {
          if (input.tabId === "tab-1" && attempts++ === 0) {
            return { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "alpha REMOTE", isDirty: true };
          }
          return { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true };
        }),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.registerEditorRemotePatch(async () => { throw new Error("view disposed"); });
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "alpha omega", resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });

    await vi.waitFor(() => expect(createWorkspaceTab).toHaveBeenCalledTimes(1));
    expect(application.getState().workspaceSnapshot?.activeDocument?.tabId).toBe("recovery-tab");
  });

  it("retains authoritative conflict canonical data when the source binding becomes stale after patch", async () => {
    let attempts = 0;
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "alpha omega" }),
      bridge: {
        applyDocumentEdits: vi.fn(async () => {
          attempts += 1;
          return { kind: "revision-conflict" as const, canonicalRevision: 7, canonicalText: "alpha REMOTE", isDirty: true };
        }),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.registerEditorRemotePatch(async () => {
      const internal = application as unknown as {
        editBindings: Map<string, { binding: unknown }>;
        editClient: { retireTab(binding: unknown): boolean };
      };
      const entry = internal.editBindings.get("tab-1");
      internal.editBindings.delete("tab-1");
      if (entry !== undefined) internal.editClient.retireTab(entry.binding);
      return { kind: "applied" };
    });
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "alpha omega", resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });

    await vi.waitFor(() => expect((application as unknown as {
      recoveryByTab: Map<string, { localText: string; canonicalText: string; canonicalRevision: number }>;
    }).recoveryByTab.get("tab-1")).toMatchObject({
      localText: "LOCAL REMOTE",
      canonicalText: "alpha REMOTE",
      canonicalRevision: 7
    }));
    expect(attempts).toBe(1);
    await expect(application.openMarkdown()).resolves.toMatchObject({ kind: "failed" });
  });

  it("publishes acknowledged recovery text and reuses its binding for the next local frame", async () => {
    const localText = "> nested\n> - item 😀\n";
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "local" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        createWorkspaceTab: vi.fn(async () => createRecoverySnapshot()),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "local", resultingText: localText,
      changes: [{ from: 0, to: 5, insert: localText }]
    });
    await vi.waitFor(() => expect(application.getState().workspaceSnapshot?.activeDocument).toMatchObject({
      tabId: "recovery-tab", content: localText, revision: 1
    }));
    const recoveryIdentity = consumeEditorLoad(application);

    expect(application.recordEditorDocumentChangeFrame({
      identity: recoveryIdentity,
      baseText: localText,
      resultingText: `${localText}!`,
      changes: [{ from: localText.length, to: localText.length, insert: "!" }]
    })).toBe(true);
    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenLastCalledWith(expect.objectContaining({
      tabId: "recovery-tab", clientSequence: 2, baseRevision: 1
    })));
  });

  it("resolves a barrier conflict inline and continues the current operation", async () => {
    let attempts = 0;
    const operation = vi.fn(async () => "saved");
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "alpha omega" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => {
          attempts += 1;
          return attempts === 1
            ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "alpha REMOTE", isDirty: true }
            : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true };
        }),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 2, savedRevision: 0, isDirty: true
        })),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.registerEditorBarrier(async () => ({ identity, text: "LOCAL omega" }));
    application.registerEditorRemotePatch(async () => ({ kind: "applied" }));
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "alpha omega", resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });

    await expect(application.runWithActiveEditBarrier(operation)).resolves.toMatchObject({
      kind: "committed", value: "saved"
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
  });

  it("retries recovery transport with the original recovery binding and request without creating again", async () => {
    const localText = "> quote\n> ```ts\n> const value = '😀'\n> ```\n";
    const recoverySnapshot = createRecoverySnapshot();
    let recoveryAttempts = 0;
    const applyDocumentEdits = vi.fn((input: { tabId: string; clientSequence: number; baseRevision: number }) => {
      if (input.tabId === "tab-1") {
        return Promise.resolve({
          kind: "revision-conflict" as const,
          canonicalRevision: 1,
          canonicalText: "> remote\n",
          isDirty: true
        });
      }
      recoveryAttempts += 1;
      return recoveryAttempts < 3
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({
            kind: "applied" as const,
            acknowledgedSequence: input.clientSequence,
            revision: input.baseRevision + 1,
            isDirty: true
          });
    });
    const createWorkspaceTab = vi.fn(async () => recoverySnapshot);
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "> quote\n> ```ts\n> const value = 'old'\n> ```\n" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const, acknowledgedSequence: input.throughSequence,
          revision: 1, savedRevision: 0, isDirty: true
        })),
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    const baseText = "> quote\n> ```ts\n> const value = 'old'\n> ```\n";
    application.recordEditorDocumentChangeFrame({
      identity, baseText, resultingText: localText,
      changes: [{ from: baseText.indexOf("old"), to: baseText.indexOf("old") + 3, insert: "😀" }]
    });

    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledTimes(3));
    const request = applyDocumentEdits.mock.calls[1]?.[0];
    await vi.waitFor(() => expect((application as unknown as {
      recoveryByTab: Map<string, { phase: string }>;
    }).recoveryByTab.get("tab-1")?.phase).toBe("blocked"));
    await expect(application.retryRecovery("tab-1")).resolves.toBe(true);
    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledTimes(4));

    expect(createWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(applyDocumentEdits.mock.calls[3]?.[0]).toEqual(request);
  });

  it("retries a retained recovery flush without reapplying or creating another tab", async () => {
    const localText = "- one\n  > quote\n  > ```md\n  > 😀\n  > ```\n";
    const recoverySnapshot = createRecoverySnapshot();
    let flushAttempts = 0;
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "- remote\n", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
    );
    const createWorkspaceTab = vi.fn(async () => recoverySnapshot);
    const flushDocumentEdits = vi.fn(async (input: { tabId: string; throughSequence: number }) => {
      flushAttempts += 1;
      return flushAttempts === 1
        ? { kind: "error" as const, error: { code: "internal-error" as const, message: "flush offline" } }
        : { kind: "flushed" as const, acknowledgedSequence: input.throughSequence, revision: 1, savedRevision: 0, isDirty: true };
    });
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "- old\n" }),
      bridge: { applyDocumentEdits, flushDocumentEdits, createWorkspaceTab, onDocumentProjection: vi.fn(() => () => {}) }
    });
    const identity = consumeEditorLoad(application);
    const baseText = "- old\n";
    application.recordEditorDocumentChangeFrame({
      identity, baseText, resultingText: localText,
      changes: [{ from: 0, to: baseText.length, insert: localText }]
    });

    await vi.waitFor(() => expect(flushDocumentEdits).toHaveBeenCalledTimes(1));
    await expect(application.retryRecovery("tab-1")).resolves.toBe(true);

    expect(createWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(applyDocumentEdits).toHaveBeenCalledTimes(2);
    expect(flushDocumentEdits).toHaveBeenCalledTimes(2);
    expect(flushDocumentEdits.mock.calls[1]?.[0]).toEqual(flushDocumentEdits.mock.calls[0]?.[0]);
  });

  it("keeps the recovery payload inert when source ownership disappears while recovery creation is pending", async () => {
    const recoveryCreate = createDeferred<WorkspaceWindowSnapshot>();
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "local" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(),
        createWorkspaceTab: vi.fn(() => recoveryCreate.promise),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "local", resultingText: "LOCAL",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect((application as unknown as {
      recoveryByTab: Map<string, { phase: string }>;
    }).recoveryByTab.get("tab-1")?.phase).toBe("creating"));

    (application as unknown as { recordCanonicalSnapshot(snapshot: WorkspaceWindowSnapshot): void })
      .recordCanonicalSnapshot(createSnapshot({ activeTabId: "tab-2", includeFirst: false }));
    recoveryCreate.resolve(createRecoverySnapshot());
    await Promise.resolve();
    await Promise.resolve();

    expect(applyDocumentEdits).toHaveBeenCalledTimes(1);
    expect((application as unknown as { recoveryByTab: Map<string, unknown> }).recoveryByTab.has("tab-1")).toBe(true);
  });

  it("fences a recovery create result after disposal without applying or retiring source state", async () => {
    const recoveryCreate = createDeferred<WorkspaceWindowSnapshot>();
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: 1, isDirty: true }
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "local" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(),
        createWorkspaceTab: vi.fn(() => recoveryCreate.promise),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "local", resultingText: "LOCAL",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect((application as unknown as {
      recoveryByTab: Map<string, { phase: string }>;
    }).recoveryByTab.get("tab-1")?.phase).toBe("creating"));
    application.dispose();
    recoveryCreate.resolve(createRecoverySnapshot());
    await Promise.resolve();
    await Promise.resolve();

    expect(applyDocumentEdits).toHaveBeenCalledTimes(1);
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("local");
  });

  it("fences a recovery apply acknowledgement after disposal before it can flush or retire the source", async () => {
    const recoveryApply = createDeferred<{
      kind: "applied";
      acknowledgedSequence: number;
      revision: number;
      isDirty: boolean;
    }>();
    const flushDocumentEdits = vi.fn();
    const applyDocumentEdits = vi.fn((input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? Promise.resolve({ kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true })
        : recoveryApply.promise
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "local" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits,
        createWorkspaceTab: vi.fn(async () => createRecoverySnapshot()),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "local", resultingText: "LOCAL",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledTimes(2));
    application.dispose();
    recoveryApply.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(flushDocumentEdits).not.toHaveBeenCalled();
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("local");
  });

  it("fences a recovery flush completion after disposal without committing its recovery snapshot", async () => {
    const recoveryFlush = createDeferred<{
      kind: "flushed";
      acknowledgedSequence: number;
      revision: number;
      savedRevision: number;
      isDirty: boolean;
    }>();
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true }
        : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "local" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(() => recoveryFlush.promise),
        createWorkspaceTab: vi.fn(async () => createRecoverySnapshot()),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "local", resultingText: "LOCAL",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect((application as unknown as {
      recoveryByTab: Map<string, { phase: string }>;
    }).recoveryByTab.get("tab-1")?.phase).toBe("applying"));
    application.dispose();
    recoveryFlush.resolve({ kind: "flushed", acknowledgedSequence: 1, revision: 1, savedRevision: 0, isDirty: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(application.getState().workspaceSnapshot?.activeDocument?.tabId).toBe("tab-1");
  });

  it("retains the source binding until the recovery checkpoint succeeds, then removes it", async () => {
    const recoveryFlush = createDeferred<{
      kind: "flushed";
      acknowledgedSequence: number;
      revision: number;
      savedRevision: number;
      isDirty: boolean;
    }>();
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "local" }),
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
          input.tabId === "tab-1"
            ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true }
            : { kind: "applied" as const, acknowledgedSequence: input.clientSequence, revision: input.baseRevision + 1, isDirty: true }
        ),
        flushDocumentEdits: vi.fn(() => recoveryFlush.promise),
        createWorkspaceTab: vi.fn(async () => createRecoverySnapshot()),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "local", resultingText: "LOCAL",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect((application as unknown as {
      editBindings: Map<string, unknown>;
    }).editBindings.has("tab-1")).toBe(true));
    recoveryFlush.resolve({ kind: "flushed", acknowledgedSequence: 1, revision: 1, savedRevision: 0, isDirty: true });
    await vi.waitFor(() => expect(application.getState().workspaceSnapshot?.activeDocument?.tabId).toBe("recovery-tab"));

    expect((application as unknown as { editBindings: Map<string, unknown> }).editBindings.has("tab-1")).toBe(false);
  });

  it("keeps a typed recovery apply error blocked and refuses create or transport retry", async () => {
    const createWorkspaceTab = vi.fn(async () => createRecoverySnapshot());
    const applyDocumentEdits = vi.fn(async (input: { tabId: string; clientSequence: number; baseRevision: number }) =>
      input.tabId === "tab-1"
        ? { kind: "revision-conflict" as const, canonicalRevision: 1, canonicalText: "remote", isDirty: true }
        : { kind: "error" as const, error: { code: "internal-error" as const, message: "server rejected" } }
    );
    const application = createApplication({
      initialSnapshot: createSnapshot({ firstContent: "local" }),
      bridge: {
        applyDocumentEdits,
        flushDocumentEdits: vi.fn(),
        createWorkspaceTab,
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({
      identity, baseText: "local", resultingText: "LOCAL",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await vi.waitFor(() => expect(applyDocumentEdits).toHaveBeenCalledTimes(2));

    await expect(application.retryRecovery("tab-1")).resolves.toBe(false);
    expect(createWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(applyDocumentEdits).toHaveBeenCalledTimes(2);
  });

  it("enters incremental mode at pending admission so a pre-frame workflow cannot recreate a full draft", async () => {
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const,
          acknowledgedSequence: input.throughSequence,
          revision: 0,
          savedRevision: 0,
          isDirty: false
        })),
        onDocumentProjection: vi.fn(() => () => {}),
        openWorkspaceFile: vi.fn(async () => ({ kind: "cancelled" as const }))
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorFramePending({ hasPending: true, identity });

    await expect(application.openMarkdown()).resolves.toMatchObject({ kind: "cancelled" });
  });

  it("keeps optimistic editor projection separate from canonical text across later frames", async () => {
    const deferredApply = createDeferred<{
      kind: "applied";
      acknowledgedSequence: number;
      revision: number;
      isDirty: boolean;
    }>();
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(() => deferredApply.promise),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First\n",
      resultingText: "# First!\n",
      changes: [{ from: 7, to: 7, insert: "!" }]
    })).toBe(true);
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First!\n",
      resultingText: "# First!?\n",
      changes: [{ from: 8, to: 8, insert: "?" }]
    })).toBe(true);
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# First\n");
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First!?\n");
    const projection = application.getEditorViewSnapshot();
    const store = application.getState();
    expect(application.getEditorViewSnapshot()).toBe(projection);
    expect(application.getState()).toBe(store);
    deferredApply.resolve({
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 1,
      isDirty: true
    });
  });

  it("adopts an exact acknowledged canonical save without replacing the editor load", async () => {
    const saved = createSnapshot({ firstContent: "# First!\n" });
    saved.activeDocument = { ...saved.activeDocument!, revision: 1, savedRevision: 1, isDirty: false };
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
          kind: "applied" as const,
          acknowledgedSequence: input.clientSequence,
          revision: input.baseRevision + 1,
          isDirty: true
        })),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const,
          acknowledgedSequence: input.throughSequence,
          revision: 1,
          savedRevision: 1,
          isDirty: false
        })),
        onDocumentProjection: vi.fn(() => () => {}),
        getWorkspaceSnapshot: vi.fn(async () => saved)
      }
    });
    const identity = consumeEditorLoad(application);
    const epoch = application.getState().editorEpoch;
    const loadRevision = application.getState().editorLoadRevision;
    expect(application.recordEditorDocumentChangeFrame({
      identity, baseText: "# First\n", resultingText: "# First!\n",
      changes: [{ from: 7, to: 7, insert: "!" }]
    })).toBe(true);
    await vi.waitFor(() => expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First!\n"));
    await application.refreshWorkspaceSnapshot();
    expect(application.getState().editorEpoch).toBe(epoch);
    expect(application.getState().editorLoadRevision).toBe(loadRevision);
    expect(application.getEditorBinding()).toEqual(identity);
  });

  it("does not let a stale canonical refresh erase an already acknowledged local edit", async () => {
    const staleSnapshot = createSnapshot();
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
          kind: "applied" as const,
          acknowledgedSequence: input.clientSequence,
          revision: input.baseRevision + 1,
          isDirty: true
        })),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {}),
        getWorkspaceSnapshot: vi.fn(async () => staleSnapshot)
      }
    });
    const identity = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First\n",
      resultingText: "# Local acknowledged\n",
      changes: [{ from: 2, to: 7, insert: "Local acknowledged" }]
    })).toBe(true);
    await vi.waitFor(() => expect(application.getEditorViewSnapshot()?.activeDocument?.content)
      .toBe("# Local acknowledged\n"));

    await application.refreshWorkspaceSnapshot();

    expect(application.getEditorBinding()).toEqual(identity);
    expect(application.getState().workspaceSnapshot?.activeDocument?.isDirty).toBe(true);
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# Local acknowledged\n");
  });

  it("holds the save cutoff while preserving a post-cutoff tail in the disposable editor view", async () => {
    const saveDeferred = createDeferred<{
      status: "success";
      document: { path: string; name: string; content: string; encoding: "utf-8" };
    }>();
    const savedCutoff = createSnapshot({ firstContent: "# First!\n" });
    savedCutoff.activeDocument = {
      ...savedCutoff.activeDocument!,
      revision: 1,
      savedRevision: 1,
      isDirty: false
    };
    const saveMarkdownFile = vi.fn(() => saveDeferred.promise);
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
          kind: "applied" as const,
          acknowledgedSequence: input.clientSequence,
          revision: input.baseRevision + 1,
          isDirty: true
        })),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const,
          acknowledgedSequence: input.throughSequence,
          revision: 1,
          savedRevision: 0,
          isDirty: true
        })),
        onDocumentProjection: vi.fn(() => () => {}),
        saveMarkdownFile,
        getWorkspaceSnapshot: vi.fn(async () => savedCutoff)
      }
    });
    const identity = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First\n",
      resultingText: "# First!\n",
      changes: [{ from: 7, to: 7, insert: "!" }]
    })).toBe(true);
    const save = application.runSaveTransaction({ forceSaveAs: false, hasExternalConflict: false });
    await vi.waitFor(() => expect(saveMarkdownFile).toHaveBeenCalledTimes(1));
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First!\n",
      resultingText: "# First!?\n",
      changes: [{ from: 8, to: 8, insert: "?" }]
    })).toBe(true);

    saveDeferred.resolve({
      status: "success",
      document: { path: "C:/notes/first.md", name: "first.md", content: "# First!\n", encoding: "utf-8" }
    });
    await expect(save).resolves.toMatchObject({ kind: "committed" });

    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# First!\n");
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First!?\n");
    expect(application.getState().workspaceSnapshot?.activeDocument?.isDirty).toBe(true);
  });

  it.each(["open", "create", "activate"] as const)(
    "does not dispatch %s before an admitted incremental frame acknowledges",
    async (command) => {
      const applyDeferred = createDeferred<{
        kind: "applied";
        acknowledgedSequence: number;
        revision: number;
        isDirty: boolean;
      }>();
      const openWorkspaceFile = vi.fn(async () => ({ kind: "cancelled" as const }));
      const createWorkspaceTab = vi.fn(async () => createSnapshot());
      const activateWorkspaceTab = vi.fn(async () => createSnapshot({ activeTabId: "tab-2" }));
      const application = createApplication({
        bridge: {
          applyDocumentEdits: vi.fn(() => applyDeferred.promise),
          flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
            kind: "flushed" as const,
            acknowledgedSequence: input.throughSequence,
            revision: 1,
            savedRevision: 0,
            isDirty: true
          })),
          onDocumentProjection: vi.fn(() => () => {}),
          openWorkspaceFile,
          createWorkspaceTab,
          activateWorkspaceTab
        }
      });
      const identity = consumeEditorLoad(application);
      expect(application.recordEditorDocumentChangeFrame({
        identity,
        baseText: "# First\n",
        resultingText: "# Pending\n",
        changes: [{ from: 2, to: 7, insert: "Pending" }]
      })).toBe(true);
      const operation = command === "open"
        ? application.openMarkdown()
        : command === "create"
          ? application.createUntitledMarkdown()
          : application.activateWorkspaceTab("tab-2");
      await Promise.resolve();
      expect(openWorkspaceFile).not.toHaveBeenCalled();
      expect(createWorkspaceTab).not.toHaveBeenCalled();
      expect(activateWorkspaceTab).not.toHaveBeenCalled();

      applyDeferred.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
      await expect(operation).resolves.toMatchObject({
        kind: command === "open" ? "cancelled" : "committed"
      });
      expect(openWorkspaceFile.mock.calls.length + createWorkspaceTab.mock.calls.length +
        activateWorkspaceTab.mock.calls.length).toBe(1);
    }
  );

  it.each(["close", "detach", "move"] as const)(
    "seals but does not dispatch %s until its incremental frame acknowledges",
    async (command) => {
      const applyDeferred = createDeferred<{
        kind: "applied";
        acknowledgedSequence: number;
        revision: number;
        isDirty: boolean;
      }>();
      const removed = createSnapshot({ activeTabId: "tab-2", includeFirst: false });
      const closeWorkspaceTab = vi.fn(async () => removed);
      const detachWorkspaceTabToNewWindow = vi.fn(async () => removed);
      const moveWorkspaceTabToWindow = vi.fn(async () => ({ sourceWindowSnapshot: removed, targetWindowSnapshot: createSnapshot() }));
      const application = createApplication({
        bridge: {
          applyDocumentEdits: vi.fn(() => applyDeferred.promise),
          flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
            kind: "flushed" as const,
            acknowledgedSequence: input.throughSequence,
            revision: 1,
            savedRevision: 0,
            isDirty: true
          })),
          onDocumentProjection: vi.fn(() => () => {}),
          closeWorkspaceTab,
          moveWorkspaceTabToWindow,
          detachWorkspaceTabToNewWindow
        }
      });
      const identity = consumeEditorLoad(application);
      expect(application.recordEditorDocumentChangeFrame({
        identity,
        baseText: "# First\n",
        resultingText: "# Pending\n",
        changes: [{ from: 2, to: 7, insert: "Pending" }]
      })).toBe(true);
      const operation = command === "close"
        ? application.closeWorkspaceTab("tab-1")
        : command === "detach" ? application.detachWorkspaceTab("tab-1") : application.moveWorkspaceTab({ tabId: "tab-1", targetWindowId: "window-2", targetIndex: 0 });
      await acknowledgeEditorReadOnly(application);
      expect(closeWorkspaceTab).not.toHaveBeenCalled();
      expect(detachWorkspaceTabToNewWindow).not.toHaveBeenCalled();
      expect(moveWorkspaceTabToWindow).not.toHaveBeenCalled();

      applyDeferred.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
      await vi.waitFor(() => expect(
        command === "close" ? closeWorkspaceTab : command === "detach" ? detachWorkspaceTabToNewWindow : moveWorkspaceTabToWindow
      ).toHaveBeenCalledTimes(1));
      await acknowledgeEditorEditable(application);
      await expect(operation).resolves.toMatchObject({ kind: "committed" });
    }
  );

  it("does not confirm native close until every incremental acknowledgement reaches its barrier", async () => {
    const applyDeferred = createDeferred<{
      kind: "applied";
      acknowledgedSequence: number;
      revision: number;
      isDirty: boolean;
    }>();
    const confirmWorkspaceWindowClose = vi.fn(async () => ({ status: "confirmed" as const }));
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(() => applyDeferred.promise),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const,
          acknowledgedSequence: input.throughSequence,
          revision: 1,
          savedRevision: 0,
          isDirty: true
        })),
        onDocumentProjection: vi.fn(() => () => {}),
        confirmWorkspaceWindowClose
      }
    });
    const identity = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First\n",
      resultingText: "# Pending\n",
      changes: [{ from: 2, to: 7, insert: "Pending" }]
    })).toBe(true);
    const close = application.confirmWorkspaceWindowClose("close-1");
    await acknowledgeEditorReadOnly(application);
    expect(confirmWorkspaceWindowClose).not.toHaveBeenCalled();
    applyDeferred.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
    await expect(close).resolves.toMatchObject({ kind: "committed", value: true });
    expect(confirmWorkspaceWindowClose).toHaveBeenCalledWith({ requestId: "close-1" });
  });

  it("does not reload an active document before its incremental cutoff acknowledges", async () => {
    const applyDeferred = createDeferred<{
      kind: "applied";
      acknowledgedSequence: number;
      revision: number;
      isDirty: boolean;
    }>();
    const reloaded = createSnapshot({ firstContent: "# Reloaded\n" });
    reloaded.activeDocument = {
      ...reloaded.activeDocument!, revision: 1, savedRevision: 1, isDirty: false
    };
    const reloadWorkspaceTabFromPath = vi.fn(async () => ({ kind: "success" as const, snapshot: reloaded }));
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(() => applyDeferred.promise),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const,
          acknowledgedSequence: input.throughSequence,
          revision: 1,
          savedRevision: 0,
          isDirty: true
        })),
        onDocumentProjection: vi.fn(() => () => {}),
        reloadWorkspaceTabFromPath
      }
    });
    const identity = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First\n",
      resultingText: "# Pending\n",
      changes: [{ from: 2, to: 7, insert: "Pending" }]
    })).toBe(true);
    const reload = application.reloadWorkspaceTabFromPath("tab-1");
    await acknowledgeEditorReadOnly(application);
    expect(reloadWorkspaceTabFromPath).not.toHaveBeenCalled();
    applyDeferred.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
    await vi.waitFor(() => expect(reloadWorkspaceTabFromPath).toHaveBeenCalledWith({ tabId: "tab-1" }));
    await acknowledgeEditorEditable(application);
    await expect(reload).resolves.toMatchObject({ kind: "committed" });
  });

  it("fails closed before reload IPC when an incremental barrier is rejected and retains exact text", async () => {
    const reloadWorkspaceTabFromPath = vi.fn();
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(async () => ({
          kind: "error" as const,
          error: { code: "unknown-tab" as const, message: "Document is unavailable." }
        })),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {}),
        reloadWorkspaceTabFromPath,
        getWorkspaceSnapshot: vi.fn(async () => createSnapshot())
      }
    });
    const identity = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First\n",
      resultingText: "# Exact retained\n",
      changes: [{ from: 2, to: 7, insert: "Exact retained" }]
    })).toBe(true);
    const reload = application.reloadWorkspaceTabFromPath("tab-1");
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    await expect(reload).resolves.toMatchObject({ kind: "failed-reconciled" });
    expect(reloadWorkspaceTabFromPath).not.toHaveBeenCalled();
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# Exact retained\n");
  });

  it("reorders tabs without acquiring an edit flush barrier", async () => {
    const reordered = createSnapshot();
    const flushDocumentEdits = vi.fn();
    const reorderWorkspaceTab = vi.fn(async () => reordered);
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(),
        flushDocumentEdits,
        onDocumentProjection: vi.fn(() => () => {}),
        reorderWorkspaceTab
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorFramePending({ hasPending: true, identity });

    await expect(application.reorderWorkspaceTab("tab-1", 0)).resolves.toMatchObject({ kind: "committed" });
    expect(reorderWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-1", toIndex: 0 });
    expect(flushDocumentEdits).not.toHaveBeenCalled();
  });

  it("preserves exact recovery text across a canonical refresh instead of retiring the binding", async () => {
    const canonical = createSnapshot({ firstContent: "# Disk replacement\n" });
    canonical.activeDocument = {
      ...canonical.activeDocument!,
      revision: 1,
      savedRevision: 0,
      isDirty: true
    };
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {}),
        getWorkspaceSnapshot: vi.fn(async () => canonical)
      }
    });
    const identity = consumeEditorLoad(application);

    expect(application.recordDiscardedEditorDocumentText({
      identity,
      text: "# Exact local recovery\n"
    })).toBe(true);
    await expect(application.refreshWorkspaceSnapshot()).resolves.toMatchObject({ kind: "committed" });

    // Automatic materialization seals the editor and retains the exact local text as durable
    // recovery. Without a createWorkspaceTab port the materialization stays blocked, but the
    // recovery text must remain readable from the disposable editor view and the durable
    // record must not be retired by the canonical refresh.
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# Disk replacement\n");
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# Exact local recovery\n");
    expect(
      (application as unknown as { recoveryByTab: Map<string, unknown> }).recoveryByTab.has("tab-1")
    ).toBe(true);
  });

  it("never publishes clean while a pending adapter frame crosses a canonical replacement", async () => {
    const canonical = createSnapshot({ firstContent: "# Disk replacement\n" });
    canonical.activeDocument = {
      ...canonical.activeDocument!,
      revision: 1,
      savedRevision: 1,
      isDirty: false
    };
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {}),
        getWorkspaceSnapshot: vi.fn(async () => canonical)
      }
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorFramePending({ hasPending: true, identity });
    const dirtyTimeline: boolean[] = [];
    const unsubscribe = application.subscribe(() => {
      dirtyTimeline.push(application.getState().workspaceSnapshot?.activeDocument?.isDirty ?? false);
    });

    await application.refreshWorkspaceSnapshot();
    expect(application.getEditorBinding()).toEqual(identity);
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First\n");
    expect(application.recordDiscardedEditorDocumentText({
      identity,
      text: "# Exact adapter fallback\n"
    })).toBe(true);
    unsubscribe();

    expect(dirtyTimeline).not.toContain(false);
    expect(application.getState().workspaceSnapshot?.activeDocument?.content).toBe("# Disk replacement\n");
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# Exact adapter fallback\n");
  });

  it("keeps an inactive tab projection from replacing the active editor view", async () => {
    let projectionListener: ((event: {
      windowId: string;
      projection: { tabId: string; revision: number; savedRevision: number; isDirty: boolean };
    }) => void) | null = null;
    let canonical = createSnapshot();
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
          kind: "applied" as const,
          acknowledgedSequence: input.clientSequence,
          revision: input.baseRevision + 1,
          isDirty: true
        })),
        flushDocumentEdits: vi.fn(),
        getWorkspaceSnapshot: vi.fn(async () => canonical),
        onDocumentProjection: vi.fn((listener) => {
          projectionListener = listener;
          return () => {};
        })
      }
    });
    application.start();
    const identityA = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity: identityA,
      baseText: "# First\n",
      resultingText: "# First local\n",
      changes: [{ from: 7, to: 7, insert: " local" }]
    })).toBe(true);
    await vi.waitFor(() => expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First local\n"));

    canonical = createSnapshot({ activeTabId: "tab-2" });
    await application.refreshWorkspaceSnapshot();
    consumeEditorLoad(application);
    projectionListener!({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 2, savedRevision: 1, isDirty: true }
    });

    expect(application.getState().workspaceSnapshot?.activeDocument?.tabId).toBe("tab-2");
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# Second\n");
  });

  it("hydrates externally changed clean inactive content instead of reviving its cached projection", async () => {
    let canonical = createSnapshot();
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {}),
        getWorkspaceSnapshot: vi.fn(async () => canonical)
      }
    });
    consumeEditorLoad(application);

    canonical = createSnapshot({ activeTabId: "tab-2" });
    await application.refreshWorkspaceSnapshot();
    consumeEditorLoad(application);
    canonical = createSnapshot({ activeTabId: "tab-1" });
    await application.refreshWorkspaceSnapshot();
    consumeEditorLoad(application);

    canonical = createSnapshot({ activeTabId: "tab-2", secondContent: "# Externally changed\n" });
    canonical.activeDocument = {
      ...canonical.activeDocument!,
      revision: 1,
      savedRevision: 1,
      isDirty: false
    };
    await application.refreshWorkspaceSnapshot();

    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# Externally changed\n");
    const identity = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# Externally changed\n",
      resultingText: "# Externally changed!\n",
      changes: [{ from: 20, to: 20, insert: "!" }]
    })).toBe(true);
  });

  it("publishes one atomic dirty overlay for multiple live tab queues", async () => {
    const deferredApply = createDeferred<{
      kind: "applied";
      acknowledgedSequence: number;
      revision: number;
      isDirty: boolean;
    }>();
    let canonical = createSnapshot();
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(() => deferredApply.promise),
        flushDocumentEdits: vi.fn(),
        onDocumentProjection: vi.fn(() => () => {}),
        getWorkspaceSnapshot: vi.fn(async () => canonical)
      }
    });
    const identityA = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity: identityA,
      baseText: "# First\n",
      resultingText: "# First local\n",
      changes: [{ from: 7, to: 7, insert: " local" }]
    })).toBe(true);

    canonical = createSnapshot({ activeTabId: "tab-2" });
    await application.refreshWorkspaceSnapshot();
    const identityB = consumeEditorLoad(application);
    expect(application.recordEditorDocumentChangeFrame({
      identity: identityB,
      baseText: "# Second\n",
      resultingText: "# Second local\n",
      changes: [{ from: 8, to: 8, insert: " local" }]
    })).toBe(true);

    const published: Array<readonly boolean[]> = [];
    const unsubscribe = application.subscribe(() => {
      published.push(application.getState().workspaceSnapshot?.tabs.map((tab) => tab.isDirty) ?? []);
    });
    canonical = createSnapshot({ activeTabId: "tab-2" });
    await application.refreshWorkspaceSnapshot();
    unsubscribe();

    expect(published).toEqual([[true, true]]);
  });

  it("seals the active adapter before acquiring its revisioned flush barrier", async () => {
    const calls: string[] = [];
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => {
          calls.push("apply");
          return {
            kind: "applied" as const,
            acknowledgedSequence: input.clientSequence,
            revision: input.baseRevision + 1,
            isDirty: true
          };
        }),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => {
          calls.push("flush");
          return {
            kind: "flushed" as const,
            acknowledgedSequence: input.throughSequence,
            revision: 1,
            savedRevision: 0,
            isDirty: true
          };
        }),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.registerEditorBarrier(async () => {
      calls.push("seal");
      expect(application.recordEditorDocumentChangeFrame({
        identity,
        baseText: "# First\n",
        resultingText: "# First!\n",
        changes: [{ from: 7, to: 7, insert: "!" }]
      })).toBe(true);
      return { identity, text: "# First!\n" };
    });
    application.recordEditorFramePending({ hasPending: true, identity });

    await expect(application.flushActiveWorkspaceDraft()).resolves.toMatchObject({
      kind: "committed"
    });
    expect(calls).toEqual(["seal", "apply", "flush"]);
  });

  it("passes the immutable adapter seal snapshot to export work even if a tail arrives before seal resolves", async () => {
    const seal = createDeferred<{ identity: EditorLoadIdentity; text: string }>();
    const application = createApplication({
      bridge: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
          kind: "applied" as const,
          acknowledgedSequence: input.clientSequence,
          revision: input.baseRevision + 1,
          isDirty: true
        })),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const,
          acknowledgedSequence: input.throughSequence,
          revision: 2,
          savedRevision: 0,
          isDirty: true
        })),
        onDocumentProjection: vi.fn(() => () => {})
      }
    });
    const identity = consumeEditorLoad(application);
    application.registerEditorBarrier(() => seal.promise);
    application.recordEditorFramePending({ hasPending: true, identity });
    const exportOperation = vi.fn(async (
      _document: NonNullable<WorkspaceWindowSnapshot["activeDocument"]>,
      sealedText: string
    ) => sealedText);
    const exported = application.runWithActiveEditBarrier(exportOperation);
    await Promise.resolve();
    expect(application.recordEditorDocumentChangeFrame({
      identity,
      baseText: "# First\n",
      resultingText: "# First tail\n",
      changes: [{ from: 7, to: 7, insert: " tail" }]
    })).toBe(true);
    seal.resolve({ identity, text: "# First\n" });

    await expect(exported).resolves.toMatchObject({ kind: "committed", value: "# First\n" });
    expect(exportOperation).toHaveBeenCalledWith(expect.any(Object), "# First\n");
    expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First tail\n");
  });

  it("binds an initially unknown window before accepting its projection metadata", async () => {
    let projectionListener: ((event: {
      windowId: string;
      projection: { tabId: string; revision: number; savedRevision: number; isDirty: boolean };
    }) => void) | null = null;
    const application = createApplication({
      initialSnapshot: null,
      bridge: {
        getWorkspaceSnapshot: vi.fn(async () => createSnapshot()),
        onDocumentProjection: vi.fn((listener) => {
          projectionListener = listener;
          return () => {};
        })
      }
    });
    application.start();
    await expect(application.refreshWorkspaceSnapshot()).resolves.toMatchObject({
      kind: "committed"
    });
    const identity = consumeEditorLoad(application);
    application.recordEditorFramePending({ hasPending: true, identity });
    expect(projectionListener).not.toBeNull();
    projectionListener!({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 1, savedRevision: 1, isDirty: false }
    });
    expect(application.getState().workspaceSnapshot?.activeDocument?.isDirty).toBe(true);
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

  it.each(["reload", "close", "detach", "window-close"] as const)(
    "does not create an editor barrier when a queued %s operation starts after disposal",
    async (command) => {
      const blocker = createDeferred<WorkspaceWindowSnapshot>();
      const reloadWorkspaceTabFromPath = vi.fn();
      const closeWorkspaceTab = vi.fn();
      const detachWorkspaceTabToNewWindow = vi.fn();
      const moveWorkspaceTabToWindow = vi.fn();
      const confirmWorkspaceWindowClose = vi.fn();
      const application = createApplication({
        bridge: {
          getWorkspaceSnapshot: vi.fn(() => blocker.promise),
          reloadWorkspaceTabFromPath,
          closeWorkspaceTab,
          moveWorkspaceTabToWindow,
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

      // The in-flight refresh also rejects its late result after disposal.
      await expect(first).resolves.toMatchObject({ kind: "failed" });
      await expect(destructive).resolves.toMatchObject({ kind: "failed" });
      expect(application.getState().editorTransition).toBeNull();
      expect(reloadWorkspaceTabFromPath).not.toHaveBeenCalled();
      expect(closeWorkspaceTab).not.toHaveBeenCalled();
      expect(detachWorkspaceTabToNewWindow).not.toHaveBeenCalled();
      expect(moveWorkspaceTabToWindow).not.toHaveBeenCalled();
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

  it("does not advance the active editor load boundary when an inactive reload succeeds", async () => {
    const activeSecond = createSnapshot({ activeTabId: "tab-2" });
    const application = createApplication({
      initialSnapshot: activeSecond,
      bridge: {
        reloadWorkspaceTabFromPath: vi.fn(async () => ({
          kind: "success" as const,
          snapshot: activeSecond
        }))
      }
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
});


describe("RF-801 application commands without React", () => {
  it("shares conflict-aware manual save policy between test driver and menu", async () => {
    const snapshot = createSnapshot();
    snapshot.activeDocument = { ...snapshot.activeDocument!, externalChange: { kind: "modified" } };
    const saveMarkdownFile = vi.fn();
    const saveMarkdownFileAs = vi.fn(async () => ({ status: "cancelled" as const }));
    const application = createApplication({ initialSnapshot: snapshot, bridge: { saveMarkdownFile, saveMarkdownFileAs } });
    await application.getEditorTestAdapter().saveDocument();
    expect(saveMarkdownFileAs).toHaveBeenCalledTimes(1);
    expect(application.commands.runMenuCommand("save-markdown-file")).toBe(true);
    await vi.waitFor(() => expect(saveMarkdownFileAs).toHaveBeenCalledTimes(2));
    expect(saveMarkdownFile).not.toHaveBeenCalled();
    application.dispose();
  });

  it("routes dropped batches through the same opening command and preserves cancel silence", async () => {
    const handleDroppedMarkdownFile = vi.fn(async () => ({ disposition: "open-in-place" as const }));
    const openWorkspaceFileFromPath = vi.fn(async () => ({ kind: "focused-existing" as const }));
    const notify = vi.fn();
    const application = createApplication({ bridge: { handleDroppedMarkdownFile, openWorkspaceFileFromPath } });
    application.updatePresentation({ showNotification: notify });
    await expect(application.commands.dropMarkdownFiles(["a.md", "b.md"])).resolves.toBe(true);
    expect(handleDroppedMarkdownFile).toHaveBeenCalledWith({ targetPaths: ["a.md", "b.md"], hasOpenDocument: true });
    expect(openWorkspaceFileFromPath).toHaveBeenCalledTimes(2);
    await expect(application.commands.openMarkdownFromPaths([])).resolves.toBe(false);
    expect(notify).not.toHaveBeenCalled();
    application.dispose();
  });

  it("does not notify or dispatch a queued operation after disposal", async () => {
    const deferred = createDeferred<{ kind: "cancelled" }>();
    const openWorkspaceFile = vi.fn(() => deferred.promise);
    const createWorkspaceTab = vi.fn();
    const notify = vi.fn();
    const application = createApplication({ bridge: { openWorkspaceFile, createWorkspaceTab } });
    application.updatePresentation({ showNotification: notify });
    const opening = application.commands.openMarkdown();
    await vi.waitFor(() => expect(openWorkspaceFile).toHaveBeenCalledTimes(1));
    const queued = application.commands.createUntitledMarkdown();
    application.dispose();
    deferred.resolve({ kind: "cancelled" });
    await Promise.all([opening, queued]);
    expect(createWorkspaceTab).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("external conflict command identity and barriers", () => {
  it("does not redirect a queued gesture for tab A after an earlier activation selects tab B", async () => {
    const blocker = createDeferred<WorkspaceWindowSnapshot>();
    const resolveExternalChange = vi.fn();
    const application = createApplication({ bridge: {
      getWorkspaceSnapshot: vi.fn(() => blocker.promise),
      activateWorkspaceTab: vi.fn(async () => createSnapshot({ activeTabId: "tab-2" })),
      resolveExternalChange
    } });
    const refreshing = application.refreshWorkspaceSnapshot();
    await vi.waitFor(() => expect(application.getPendingOperationKind()).toBe("refresh"));
    const activating = application.commands.activateWorkspaceTab("tab-2");
    const resolving = application.keepMemoryVersion();
    blocker.resolve(createSnapshot());
    await Promise.all([refreshing, activating, resolving]);
    expect(application.getActiveTabId()).toBe("tab-2");
    expect(resolveExternalChange).not.toHaveBeenCalled();
    application.dispose();
  });

  it("waits for pending frame acknowledgement and flush before resolving a conflict", async () => {
    const acknowledgement = createDeferred<{ kind: "applied"; acknowledgedSequence: number; revision: number; isDirty: boolean }>();
    const flushDocumentEdits = vi.fn(async () => ({ kind: "flushed" as const, acknowledgedSequence: 1, revision: 1, savedRevision: 0, isDirty: true }));
    const resolveExternalChange = vi.fn(async () => ({ kind: "resolved" as const }));
    const snapshot = createSnapshot({ firstContent: "# Pending\n" });
    snapshot.activeDocument = { ...snapshot.activeDocument!, revision: 1, isDirty: true };
    const application = createApplication({ bridge: {
      applyDocumentEdits: vi.fn(() => acknowledgement.promise), flushDocumentEdits,
      resolveExternalChange, getWorkspaceSnapshot: vi.fn(async () => snapshot)
    } });
    const identity = consumeEditorLoad(application);
    application.recordEditorDocumentChangeFrame({ identity, baseText: "# First\n", resultingText: "# Pending\n", changes: [{ from: 2, to: 7, insert: "Pending" }] });
    const resolving = application.keepMemoryVersion();
    await vi.waitFor(() => expect(application.getPendingOperationKind()).toBe("external-change"));
    expect(resolveExternalChange).not.toHaveBeenCalled();
    acknowledgement.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
    await resolving;
    expect(resolveExternalChange).toHaveBeenCalledWith({ tabId: "tab-1", command: "keep-memory" });
    expect(flushDocumentEdits.mock.invocationCallOrder[0]).toBeLessThan(resolveExternalChange.mock.invocationCallOrder[0]!);
    application.dispose();
  });

  it.each(["resolved", "error", "cancelled", "transport-error"] as const)("releases reload sealing after %s", async (kind) => {
    const notification = vi.fn();
    const resolveExternalChange = vi.fn(async () => {
      if (kind === "transport-error") throw new Error("transport offline");
      if (kind === "error") return { kind, message: "reload rejected" };
      return { kind };
    });
    const application = createApplication({ bridge: {
      resolveExternalChange, getWorkspaceSnapshot: vi.fn(async () => createSnapshot()),
      flushDocumentEdits: vi.fn(async () => ({ kind: "flushed" as const, acknowledgedSequence: 0, revision: 0, savedRevision: 0, isDirty: false }))
    } });
    application.updatePresentation({ showNotification: notification });
    consumeEditorLoad(application);
    const reloading = application.reloadFromDisk();
    await acknowledgeEditorReadOnly(application);
    await acknowledgeEditorEditable(application);
    await reloading;
    expect(application.getState().editorTransition).toBeNull();
    expect(application.getPendingEditorLoadIdentity()?.tabId).toBe("tab-1");
    expect(notification).toHaveBeenCalledTimes(kind === "error" || kind === "transport-error" ? 1 : 0);
    application.dispose();
  });

  it("suppresses late resolve callbacks and releases sealing when disposed during external reload", async () => {
    const result = createDeferred<{ kind: "resolved" }>();
    const resolveExternalChange = vi.fn(() => result.promise);
    const getWorkspaceSnapshot = vi.fn();
    const notification = vi.fn();
    const application = createApplication({ bridge: { resolveExternalChange, getWorkspaceSnapshot,
      flushDocumentEdits: vi.fn(async () => ({ kind: "flushed" as const, acknowledgedSequence: 0, revision: 0, savedRevision: 0, isDirty: false }))
    } });
    application.updatePresentation({ showNotification: notification });
    consumeEditorLoad(application);
    const reloading = application.reloadFromDisk();
    await acknowledgeEditorReadOnly(application);
    await vi.waitFor(() => expect(resolveExternalChange).toHaveBeenCalledTimes(1));
    application.dispose();
    result.resolve({ kind: "resolved" });
    await reloading;
    expect(getWorkspaceSnapshot).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
    expect(application.getState().editorTransition).toBeNull();
  });
});

describe("application disposal at completed drain boundary", () => {
  it.each(["create", "activate"] as const)("does not dispatch %s when disposal occurs as the started barrier releases", async (kind) => {
    const checkpoint = createDeferred<{ kind: "flushed"; acknowledgedSequence: number; revision: number; savedRevision: number; isDirty: boolean }>();
    const createWorkspaceTab = vi.fn();
    const activateWorkspaceTab = vi.fn();
    const flushDocumentEdits = vi.fn(() => checkpoint.promise);
    const application = createApplication({ bridge: { createWorkspaceTab, activateWorkspaceTab, flushDocumentEdits } });
    consumeEditorLoad(application);
    // Fault injection at the public edit-client lease boundary: the real checkpoint
    // succeeds, then the application is disposed before its awaiting command resumes.
    const acquire = WorkspaceEditClient.prototype.acquireFlushBarrier;
    const spy = vi.spyOn(WorkspaceEditClient.prototype, "acquireFlushBarrier").mockImplementation(async function (this: WorkspaceEditClient, tabId) {
      const result = await acquire.call(this, tabId);
      if (result.kind !== "acquired") return result;
      return { ...result, lease: { release() { result.lease.release(); application.dispose(); } } };
    });
    try {
      const operation = kind === "create" ? application.createUntitledMarkdown() : application.activateWorkspaceTab("tab-2");
      await vi.waitFor(() => expect(flushDocumentEdits).toHaveBeenCalledTimes(1));
      checkpoint.resolve({ kind: "flushed" as const, acknowledgedSequence: 0, revision: 0, savedRevision: 0, isDirty: false });
      await expect(operation).resolves.toMatchObject({ kind: "failed" });
      expect(createWorkspaceTab).not.toHaveBeenCalled();
      expect(activateWorkspaceTab).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); application.dispose(); }
  });

  it.each(["create", "activate"] as const)("rejects a late %s IPC result after disposal without replacing the projection", async (kind) => {
    const response = createDeferred<WorkspaceWindowSnapshot>();
    const createWorkspaceTab = vi.fn(() => response.promise);
    const activateWorkspaceTab = vi.fn(() => response.promise);
    const application = createApplication({ bridge: { createWorkspaceTab, activateWorkspaceTab } });
    const original = application.getState();
    const operation = kind === "create" ? application.createUntitledMarkdown() : application.activateWorkspaceTab("tab-2");
    await vi.waitFor(() => expect(kind === "create" ? createWorkspaceTab : activateWorkspaceTab).toHaveBeenCalledTimes(1));
    application.dispose();
    response.resolve(createSnapshot({ activeTabId: "tab-2" }));
    await expect(operation).resolves.toMatchObject({ kind: "failed" });
    expect(application.getState()).toBe(original);
  });
});

it("refreshes external conflict metadata once per subscription without replacing pending editor text", async () => {
  let notify!: Parameters<Window["fishmark"]["onExternalMarkdownFileChanged"]>[0];
  const detach = vi.fn();
  const subscribe = vi.fn((listener: typeof notify) => { notify = listener; return detach; });
  const canonical = createSnapshot();
  canonical.activeDocument = { ...canonical.activeDocument!, externalChange: { kind: "modified" } };
  const getWorkspaceSnapshot = vi.fn(async () => canonical);
  const application = createApplication({ bridge: {
    onExternalMarkdownFileChanged: subscribe,
    onDocumentProjection: () => () => {},
    getWorkspaceSnapshot
  } });
  application.start();
  application.start();
  expect(subscribe).toHaveBeenCalledTimes(1);
  const identity = consumeEditorLoad(application);
  application.recordEditorFramePending({ hasPending: true, identity });
  notify({ path: "C:\\notes\\first.md", kind: "modified" });
  await vi.waitFor(() => expect(application.getActiveDocument()?.externalChange).toEqual({ kind: "modified" }));
  expect(application.getEditorBinding()).toEqual(identity);
  expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# First\n");
  expect(application.getEditorViewSnapshot()?.activeDocument?.isDirty).toBe(true);
  expect(application.recordDiscardedEditorDocumentText({ identity, text: "# Unsaved adapter text\n" })).toBe(true);
  expect(application.getEditorViewSnapshot()?.activeDocument?.content).toBe("# Unsaved adapter text\n");
  expect(getWorkspaceSnapshot).toHaveBeenCalledTimes(1);
  application.dispose();
  expect(detach).toHaveBeenCalledTimes(1);
});

it("ignores an external-notification snapshot that returns after disposal", async () => {
  let notify!: Parameters<Window["fishmark"]["onExternalMarkdownFileChanged"]>[0];
  const pending = createDeferred<WorkspaceWindowSnapshot>();
  const getWorkspaceSnapshot = vi.fn(() => pending.promise);
  const application = createApplication({ bridge: {
    onExternalMarkdownFileChanged: (listener) => { notify = listener; return () => {}; },
    onDocumentProjection: () => () => {},
    getWorkspaceSnapshot
  } });
  application.start();
  consumeEditorLoad(application);
  notify({ path: "C:/notes/first.md", kind: "modified" });
  await vi.waitFor(() => expect(getWorkspaceSnapshot).toHaveBeenCalledTimes(1));
  application.dispose();
  const before = application.getState();
  const binding = application.getEditorBinding();
  pending.resolve(createSnapshot({ firstContent: "late replacement must not appear" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(application.getState()).toBe(before);
  expect(application.getEditorBinding()).toEqual(binding);
});
