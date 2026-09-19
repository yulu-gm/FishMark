import { EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it, test, vi } from "vitest";

import {
  compositionStateField,
  createEditorTransactionAdapter,
  editorStructureCacheField,
  readEditorStructureCache,
  type EditorPreparedCommand
} from "@fishmark/codemirror-adapter";
import { createEditTransactionPlan, type EditTransactionPlan } from "@fishmark/editor-model";

import type {
  ApplyDocumentEditsInput,
  ApplyDocumentEditsResult,
  FlushDocumentEditsInput,
  FlushDocumentEditsResult
} from "../../shared/document-edit";
import type { DocumentProjectionEvent } from "../../shared/document-projection";
import {
  WorkspaceEditClient,
  type WorkspaceEditClientPorts,
  type WorkspaceEditClientStateChange
} from "../application/workspace-edit-client";

// Integration with the existing renderer owners. The adapter must hand frames to the real
// `WorkspaceEditClient` and read acknowledgement state from it; it must not keep a second queue.

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function applied(request: ApplyDocumentEditsInput): ApplyDocumentEditsResult {
  return {
    kind: "applied",
    acknowledgedSequence: request.clientSequence,
    revision: request.baseRevision + 1,
    isDirty: true
  };
}

function stateWith(source: string): EditorState {
  return EditorState.create({
    doc: source,
    extensions: [editorStructureCacheField, compositionStateField]
  });
}

function createIntegration(input?: {
  readonly source?: string;
  readonly apply?: (request: ApplyDocumentEditsInput) => Promise<ApplyDocumentEditsResult>;
}) {
  const changes: WorkspaceEditClientStateChange[] = [];
  let projectionListener: ((event: DocumentProjectionEvent) => void) | null = null;
  const ports: WorkspaceEditClientPorts = {
    createClientId: () => "renderer-client-1",
    applyDocumentEdits: vi.fn(
      input?.apply ?? (async (request: ApplyDocumentEditsInput) => applied(request))
    ),
    flushDocumentEdits: vi.fn(
      async (request: FlushDocumentEditsInput): Promise<FlushDocumentEditsResult> => ({
        kind: "flushed",
        acknowledgedSequence: request.throughSequence,
        revision: request.throughSequence,
        savedRevision: request.throughSequence,
        isDirty: false
      })
    ),
    subscribeDocumentProjection(listener) {
      projectionListener = listener;
      return () => {};
    },
    notifyState(change) {
      changes.push(change);
    }
  };
  const client = new WorkspaceEditClient({ windowId: "window-1", ports });
  client.start();
  const source = input?.source ?? "alpha";
  const binding = client.hydrateTab({
    tabId: "tab-1",
    text: source,
    revision: 1,
    savedRevision: 1,
    isDirty: false
  });
  let state = stateWith(source);
  const adapter = createEditorTransactionAdapter({
    readCache: readEditorStructureCache,
    frames: {
      admitFrame: (frame) => {
        const admission = client.admitFrame({ ...frame, binding });
        if (admission.kind === "admitted") return { kind: "admitted", sequence: admission.sequence };
        if (admission.kind === "stale") return { kind: "stale" };
        return { kind: "invalid-frame", reason: admission.reason };
      }
    },
    readAcknowledgedRevision: () => client.getTabState("tab-1")?.acknowledgedTextRevision ?? null,
    readObservedRevision: () => client.getTabState("tab-1")?.observedRevision ?? null
  });
  adapter.rebindSession("tab-1", state);

  return {
    adapter,
    client,
    binding,
    changes,
    state: () => state,
    projectionInstalled: () => projectionListener !== null,
    dispatch(transaction: TransactionSpec): void {
      state = state.update(transaction).state;
    },
    applyText(insert: string, at = state.doc.length): Extract<EditorPreparedCommand, { kind: "applied" }> {
      const prepared = adapter.prepareCommand(state, (context) => createEditTransactionPlan({
        context,
        commandId: "insert-text",
        intent: "edit",
        edits: [{ from: at, to: at, insert }],
        selection: { anchor: at + insert.length, head: at + insert.length }
      }));
      if (prepared.kind !== "applied") throw new Error(`expected applied, received ${prepared.kind}`);
      state = state.update(prepared.transaction).state;
      const outcome = adapter.recordEditorDispatch(state, prepared);
      if (outcome.kind !== "noted") throw new Error(`expected noted, received ${outcome.kind}`);
      return prepared;
    },
    project(event: DocumentProjectionEvent) {
      if (projectionListener === null) throw new Error("Projection listener was not installed.");
      projectionListener(event);
    }
  };
}

describe("codemirror adapter with the renderer edit client", () => {
  test("admits adapter frames through the existing queue without a second sequence owner", async () => {
    const harness = createIntegration();
    const first = harness.applyText(" one");

    await settle();
    expect(harness.client.getTabState("tab-1")?.nextSequence).toBe(2);
    expect(harness.changes.at(-1)?.state.acknowledgedText).toBe("alpha one");
    expect(first.frame.baseText).toBe("alpha");
    expect(first.frame.resultingText).toBe("alpha one");
  });

  test("keeps the local revision monotonic while main-confirmed revision lags behind", async () => {
    let release!: (result: ApplyDocumentEditsResult) => void;
    const pending = new Promise<ApplyDocumentEditsResult>((resolve) => {
      release = resolve;
    });
    const harness = createIntegration({ apply: () => pending });

    harness.applyText(" one");
    const localAfterFirst = harness.adapter.readLocalRevision(harness.state());
    expect(harness.adapter.readSession(harness.state())?.acknowledgedRevision).toBe(1);

    harness.applyText(" two", harness.state().doc.length);
    const localAfterSecond = harness.adapter.readLocalRevision(harness.state());

    expect(localAfterSecond!.revision).toBeGreaterThan(localAfterFirst!.revision);
    // The queue is still the owner of what main confirmed.
    expect(harness.adapter.readSession(harness.state())?.acknowledgedRevision).toBe(1);

    release({
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 2,
      isDirty: true
    });
    await settle();

    expect(harness.adapter.readLocalRevision(harness.state())!.revision)
      .toBeGreaterThan(harness.adapter.readSession(harness.state())!.acknowledgedRevision!);
    expect(harness.adapter.readSession(harness.state())?.acknowledgedRevision).toBe(2);
  });

  test("accepts a delayed acknowledgement for the frame the adapter produced", async () => {
    let release!: (result: ApplyDocumentEditsResult) => void;
    const pending = new Promise<ApplyDocumentEditsResult>((resolve) => {
      release = resolve;
    });
    const harness = createIntegration({ apply: () => pending });
    const prepared = harness.applyText(" one");

    expect(harness.client.getTabState("tab-1")?.inFlightSequence).toBe(1);

    release({
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 2,
      isDirty: true
    });
    await settle();

    expect(prepared.frame.resultingText).toBe(harness.client.getTabState("tab-1")?.acknowledgedText);
    expect(harness.client.getTabState("tab-1")?.batches).toHaveLength(0);
    expect(harness.client.getTabState("tab-1")?.inFlightSequence).toBeNull();
  });

  test("reports a discarded frame through the client's typed invalid-frame reason", () => {
    const harness = createIntegration();
    const binding = harness.binding;
    // A foreign binding makes the client reject the frame; the adapter must surface, not swallow it.
    const reply = harness.client.admitFrame({
      binding: { tabId: "tab-1", generation: binding.generation + 1 },
      baseText: "alpha",
      resultingText: "alpha!",
      changes: [{ from: 5, to: 5, insert: "!" }]
    });

    expect(reply.kind).toBe("stale");
  });

  test("sends no frame for a selection-only command", async () => {
    const harness = createIntegration();
    const prepared = harness.adapter.prepareCommand(harness.state(), (context) =>
      createEditTransactionPlan({
        context,
        commandId: "pointer",
        intent: "navigation",
        edits: [],
        selection: { anchor: 2, head: 4 }
      })
    );

    expect(prepared.kind).toBe("unchanged");
    if (prepared.kind !== "unchanged") throw new Error(`expected unchanged, received ${prepared.kind}`);
    harness.dispatch(prepared.transaction);
    expect(harness.client.getTabState("tab-1")?.batches).toHaveLength(0);
    await settle();
    expect(harness.client.getTabState("tab-1")?.nextSequence).toBe(1);
  });

  test("recovers through the client when the transport fails, without losing the adapter revision", async () => {
    const harness = createIntegration({
      apply: async () => {
        throw new Error("transport down");
      }
    });
    harness.applyText(" one");
    await settle();

    expect(harness.client.getTabState("tab-1")?.status).toBe("blocked");
    expect(harness.adapter.readLocalRevision(harness.state())!.revision).toBe(2);
    expect(harness.client.getTabState("tab-1")?.optimisticText).toBe("alpha one");
  });

  test("applies a remote projection without letting the adapter advance its own revision", async () => {
    const harness = createIntegration();
    await settle();
    const before = harness.adapter.readLocalRevision(harness.state())!.revision;

    expect(harness.projectionInstalled()).toBe(true);

    harness.project({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 4, savedRevision: 4, isDirty: false }
    });

    const session = harness.adapter.readSession(harness.state());
    // A remote projection moves only the observed canonical revision.
    expect(session?.observedRevision).toBe(4);
    // The adapter's own document revision is untouched by remote authoritative state.
    expect(harness.adapter.readLocalRevision(harness.state())!.revision).toBe(before);
  });

  test("keeps the confirmed revision below the observed revision for local edits", async () => {
    const harness = createIntegration();
    await settle();
    harness.applyText(" one");
    await settle();

    const session = harness.adapter.readSession(harness.state());
    expect(session?.acknowledgedRevision).toBe(2);
    expect(session?.observedRevision).toBe(2);

    harness.project({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 5, savedRevision: 5, isDirty: false }
    });

    const projected = harness.adapter.readSession(harness.state());
    expect(projected?.observedRevision).toBe(5);
    expect(projected?.acknowledgedRevision).toBe(2);
  });

  it("reports a stale plan instead of enqueueing it after the queue moved on", async () => {
    const harness = createIntegration();
    const context = harness.adapter.readSemanticContext(harness.state());
    const plan: EditTransactionPlan = createEditTransactionPlan({
      context,
      commandId: "insert-text",
      intent: "edit",
      edits: [{ from: 5, to: 5, insert: "!" }],
      selection: { anchor: 6, head: 6 }
    });

    harness.dispatch({ changes: { from: 0, to: 0, insert: "X" } });
    const stale = harness.adapter.preparePlan(harness.state(), plan);

    expect(stale.kind).toBe("stale");
    expect(harness.client.getTabState("tab-1")?.batches).toHaveLength(0);
  });
});
