import { EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { createEditTransactionPlan, planEnter, planHardBreak, type EditTransactionPlan } from "@fishmark/editor-model";

import {
  beginCompositionEffect,
  compositionStateField,
  createEditorTransactionAdapter,
  editorStructureCacheField,
  finishCompositionEffect,
  noteCompositionGeometryEffect,
  readCompositionState,
  readEditorStructureCache,
  type EditorChangeFrame
} from "./transaction-adapter";

function stateWith(source: string, anchor = 0): EditorState {
  return EditorState.create({
    doc: source,
    selection: { anchor, head: anchor },
    extensions: [editorStructureCacheField, compositionStateField]
  });
}

function inputPlan(context: Parameters<typeof createEditTransactionPlan>[0]["context"], at: number, insert: string): EditTransactionPlan {
  return createEditTransactionPlan({
    context,
    commandId: "insert-text",
    intent: "edit",
    edits: [{ from: at, to: at, insert }],
    selection: { anchor: at + insert.length, head: at + insert.length }
  });
}

function structuralPlan(context: Parameters<typeof createEditTransactionPlan>[0]["context"], insert: string): EditTransactionPlan {
  return createEditTransactionPlan({
    context,
    commandId: "enter",
    intent: "structural",
    edits: [{ from: 0, to: 0, insert }],
    selection: { anchor: insert.length, head: insert.length }
  });
}

function harness(source = "alpha") {
  const frames: EditorChangeFrame[] = [];
  const adapter = createEditorTransactionAdapter({
    readCache: readEditorStructureCache,
    frames: {
      admitFrame: (frame) => {
        frames.push(frame);
        return { kind: "admitted" as const, sequence: frames.length };
      }
    }
  });
  let state = stateWith(source);
  adapter.rebindSession("tab-1", state);
  return {
    adapter,
    frames,
    state: () => state,
    dispatch(transaction: TransactionSpec): void {
      state = state.update(transaction).state;
    }
  };
}

describe("editor transaction adapter sessions", () => {
  it("rejects foreign plans and dispatch receipts even when both views have identical revisions", () => {
    const first = harness("alpha");
    const second = harness("alpha");
    const prepared = first.adapter.prepareCommand(first.state(), (context) => inputPlan(context, 5, "!"));
    if (prepared.kind !== "applied") throw new Error("expected applied");

    expect(second.adapter.preparePlan(second.state(), prepared.plan)).toMatchObject({
      kind: "stale", check: { kind: "unknown-origin" }
    });
    second.dispatch(prepared.transaction);
    expect(second.adapter.recordEditorDispatch(second.state(), prepared)).toEqual({ kind: "stale" });
    expect(second.frames).toEqual([]);
  });

  it.each(["tab-1", "tab-2"])("rejects a late dispatch after rebinding to %s", (tabId) => {
    const current = harness("alpha");
    const prepared = current.adapter.prepareCommand(current.state(), (context) => inputPlan(context, 5, "!"));
    if (prepared.kind !== "applied") throw new Error("expected applied");
    current.dispatch(prepared.transaction);
    current.adapter.rebindSession(tabId, current.state());

    expect(current.adapter.recordEditorDispatch(current.state(), prepared)).toEqual({ kind: "stale" });
    expect(current.frames).toEqual([]);
  });

  it("does not admit a prepared frame twice", () => {
    const current = harness("alpha");
    const prepared = current.adapter.prepareCommand(current.state(), (context) => inputPlan(context, 5, "!"));
    if (prepared.kind !== "applied") throw new Error("expected applied");
    current.dispatch(prepared.transaction);

    expect(current.adapter.recordEditorDispatch(current.state(), prepared)).toEqual({ kind: "noted" });
    expect(current.adapter.recordEditorDispatch(current.state(), prepared)).toEqual({ kind: "stale" });
    expect(current.frames).toHaveLength(1);
  });

  it("reports local and acknowledged revisions as different owners", () => {
    let acknowledged = 7;
    const adapter = createEditorTransactionAdapter({
      readCache: readEditorStructureCache,
      frames: { admitFrame: () => ({ kind: "admitted", sequence: 1 }) },
      readAcknowledgedRevision: () => acknowledged
    });
    const state = stateWith("alpha");
    const session = adapter.rebindSession("tab-1", state);

    expect(session.revision).toBe(readEditorStructureCache(state).revision);
    expect(session.acknowledgedRevision).toBe(7);
    expect(adapter.readLocalRevision(state)).toMatchObject({ generation: session.generation });

    acknowledged = 9;
    expect(adapter.readSession(state)?.acknowledgedRevision).toBe(9);
    expect(adapter.readSession(state)?.revision).toBe(session.revision);
  });

  it("rejects a plan built for a superseded session generation", () => {
    const seen: EditTransactionPlan[] = [];
    const harnessed = harness("alpha");
    const first = harnessed.adapter.prepareCommand(harnessed.state(), (context) => {
      const plan = inputPlan(context, 5, " one");
      seen.push(plan);
      return plan;
    });
    expect(first.kind).toBe("applied");

    const next = harnessed.adapter.rebindSession("tab-2", harnessed.state());
    const stale = harnessed.adapter.preparePlan(harnessed.state(), seen[0]!);

    expect(stale.kind).toBe("stale");
    if (stale.kind !== "stale") throw new Error("expected stale");
    expect(stale.check.kind).toBe("foreign-session");
    expect(next.generation).toBeGreaterThan(seen[0] === undefined ? 0 : 1);
  });

  it("rejects a plan whose revision is not the current one", () => {
    const harnessed = harness("alpha");
    const prepared = harnessed.adapter.prepareCommand(harnessed.state(), (context) => inputPlan(context, 5, " one"));
    if (prepared.kind !== "applied") throw new Error("expected applied");
    const plan = prepared.plan;

    // Dispatch the same edit first so the local revision moves past the plan.
    harnessed.dispatch({ changes: { from: 5, insert: " two" } });
    const stale = harnessed.adapter.preparePlan(harnessed.state(), plan);

    expect(stale.kind).toBe("stale");
    if (stale.kind !== "stale") throw new Error("expected stale");
    expect(stale.check).toMatchObject({ kind: "stale", planRevision: 1, currentRevision: 2 });
    expect(harnessed.frames).toHaveLength(0);
  });

  it("keeps the local revision monotonic across incremental, multi-range, and fallback edits", () => {
    const harnessed = harness("Alpha Beta");
    const revisions = [readEditorStructureCache(harnessed.state()).revision];

    harnessed.dispatch({ changes: { from: 5, insert: " X" } });
    revisions.push(readEditorStructureCache(harnessed.state()).revision);

    harnessed.dispatch({
      changes: [
        { from: 0, to: 1, insert: "A" },
        { from: 6, to: 7, insert: "B" }
      ]
    });
    revisions.push(readEditorStructureCache(harnessed.state()).revision);

    harnessed.dispatch({ changes: { from: 0, to: 0, insert: "\n\n# Heading\n\n" } });
    revisions.push(readEditorStructureCache(harnessed.state()).revision);

    harnessed.dispatch({ selection: { anchor: 2 } });
    revisions.push(readEditorStructureCache(harnessed.state()).revision);

    // A cursor move is not a document change: the revision must not move at all.
    expect(revisions.at(-1)).toBe(revisions.at(-2));
    for (let index = 1; index < revisions.length - 1; index += 1) {
      expect(revisions[index]!).toBeGreaterThan(revisions[index - 1]!);
    }
    expect(revisions.at(-1)).toBe(readEditorStructureCache(harnessed.state()).revision);
  });
});

describe("editor transaction adapter plans", () => {
  it("leaves transport to the host listener when no frame port is configured", () => {
    const state = stateWith("alpha");
    const adapter = createEditorTransactionAdapter({ readCache: readEditorStructureCache });
    adapter.rebindSession("tab-1", state);
    const prepared = adapter.prepareCommand(state, (context) => inputPlan(context, 5, "!"));
    if (prepared.kind !== "applied") throw new Error("expected applied");
    expect(adapter.recordEditorDispatch(state.update(prepared.transaction).state, prepared)).toEqual({
      kind: "rejected", reason: "host-observed"
    });
  });

  it("converts a plan into one transaction and one queue frame", () => {
    const harnessed = harness("alpha");
    const prepared = harnessed.adapter.prepareCommand(harnessed.state(), (context) =>
      inputPlan(context, 5, " beta")
    );

    expect(prepared.kind).toBe("applied");
    if (prepared.kind !== "applied") throw new Error("expected applied");
    expect(prepared.transaction).toMatchObject({
      changes: [{ from: 5, to: 5, insert: " beta" }],
      selection: { anchor: 10, head: 10 },
      userEvent: "input.type"
    });
    expect(prepared.frame).toEqual({
      baseText: "alpha",
      resultingText: "alpha beta",
      changes: [{ from: 5, to: 5, insert: " beta" }]
    });

    harnessed.dispatch(prepared.transaction);
    expect(harnessed.adapter.recordEditorDispatch(harnessed.state(), prepared)).toEqual({
      kind: "noted"
    });
    expect(harnessed.frames).toEqual([prepared.frame]);
  });

  it("round-trips multi-range and Unicode changes through the frame contract", () => {
    const source = "αlpha\r\nBeta 日本語";
    const harnessed = harness(source);
    const prepared = harnessed.adapter.prepareCommand(harnessed.state(), (context) => createEditTransactionPlan({
      context,
      commandId: "format-inline",
      intent: "edit",
      edits: [
        { from: 0, to: 1, insert: "Ω" },
        { from: 13, to: 16, insert: "語" }
      ],
      selection: { anchor: 2, head: 3 }
    }));

    expect(prepared.kind).toBe("applied");
    if (prepared.kind !== "applied") throw new Error("expected applied");
    const frame = prepared.frame;
    expect(frame.changes).toHaveLength(2);
    // CodeMirror normalizes CRLF documents to LF; the adapter must describe what the view holds.
    expect(frame.baseText).toBe("αlpha\nBeta 日本語");
    expect(frame.changes[0]).toEqual({ from: 0, to: 1, insert: "Ω" });
    expect(frame.resultingText.startsWith("Ωlpha\n")).toBe(true);
    expect(frame.resultingText.endsWith("語")).toBe(true);
    // The frame is exactly the queue's contract: applying the changes to baseText yields the text.
    expect(applyChangesLocally(frame.baseText, frame.changes)).toBe(frame.resultingText);
  });

  it("produces a selection-only transaction with no queue frame", () => {
    const harnessed = harness("alpha");
    const prepared = harnessed.adapter.prepareCommand(harnessed.state(), (context) => createEditTransactionPlan({
      context,
      commandId: "pointer",
      intent: "navigation",
      edits: [],
      selection: { anchor: 2, head: 4 }
    }));

    expect(prepared.kind).toBe("unchanged");
    if (prepared.kind !== "unchanged") throw new Error("expected unchanged");
    expect(prepared.transaction).toMatchObject({
      changes: [],
      userEvent: "select"
    });
    expect(harnessed.frames).toHaveLength(0);
  });

  it("uses the history event a structural decision names over the command id", () => {
    const harnessed = harness("1. Todo\n2. ");
    const exit = harnessed.adapter.prepareCommand(harnessed.state(), (context) =>
      createEditTransactionPlan({
        context,
        commandId: "enter",
        intent: "structural",
        edits: [{ from: 7, to: 10, insert: "" }],
        selection: { anchor: 7, head: 7 },
        userEventName: "input.list-exit"
      })
    );

    expect(exit.kind).toBe("applied");
    if (exit.kind !== "applied") throw new Error("expected applied");
    // The legacy vocabulary is a contract the renderer and undo grouping read, so a decision that
    // names its event keeps it even though its command id is still `enter`.
    expect(exit.transaction.userEvent).toBe("input.list-exit");
    expect(exit.transaction.annotations).toHaveLength(1);
  });

  it("groups structural edits separately from plain input in undo history", () => {
    const harnessed = harness("alpha");
    const input = harnessed.adapter.prepareCommand(harnessed.state(), (context) =>
      inputPlan(context, 5, "!")
    );
    const structural = harnessed.adapter.prepareCommand(harnessed.state(), (context) =>
      structuralPlan(context, "\n- ")
    );

    expect(input.kind).toBe("applied");
    expect(structural.kind).toBe("applied");
    if (input.kind !== "applied" || structural.kind !== "applied") throw new Error("expected applied");
    expect(input.transaction.annotations).toBeUndefined();
    expect(structural.transaction.annotations).toHaveLength(1);
    expect(input.transaction.userEvent).toBe("input.type");
    expect(structural.transaction.userEvent).toBe("input.enter");
  });

  it("refuses to enqueue a frame when the view moved after preparation", () => {
    const harnessed = harness("alpha");
    const prepared = harnessed.adapter.prepareCommand(harnessed.state(), (context) =>
      inputPlan(context, 5, " beta")
    );
    harnessed.dispatch({ changes: { from: 0, to: 0, insert: "X" } });

    expect(harnessed.adapter.recordEditorDispatch(harnessed.state(), prepared)).toEqual({
      kind: "stale"
    });
    expect(harnessed.frames).toHaveLength(0);
  });

  it("reports an unhandled command when the planner declines", () => {
    const harnessed = harness("alpha");
    const prepared = harnessed.adapter.prepareCommand(harnessed.state(), () => null);

    expect(prepared.kind).toBe("unhandled");
    expect(harnessed.frames).toHaveLength(0);
  });

  it("reports an unhandled command when no session is bound", () => {
    const adapter = createEditorTransactionAdapter({
      readCache: readEditorStructureCache,
      frames: { admitFrame: () => ({ kind: "admitted", sequence: 1 }) }
    });

    expect(adapter.preparePlan(stateWith("alpha"), null).kind).toBe("unhandled");
    expect(adapter.recordEditorDispatch(stateWith("alpha"), {
      kind: "unhandled",
      session: null
    })).toEqual({ kind: "no-session" });
  });
});

describe("editor transaction adapter composition", () => {
  it.each([planEnter, planHardBreak])("freezes semantic edit plans even when their history intent is edit", (planner) => {
    const harnessed = harness("alpha");
    harnessed.dispatch({ selection: { anchor: 5 }, effects: harnessed.adapter.startComposition(harnessed.state()) });
    expect(planner(harnessed.adapter.readSemanticContext(harnessed.state()))?.intent).toBe("edit");
    expect(harnessed.adapter.prepareCommand(harnessed.state(), planner).kind).toBe("frozen");
    expect(harnessed.frames).toHaveLength(0);
  });
  it("freezes structure-changing plans while composition text is provisional", () => {
    const harnessed = harness("alpha");
    harnessed.dispatch({ effects: harnessed.adapter.startComposition(harnessed.state()) });
    expect(harnessed.adapter.compositionStatus(harnessed.state()).kind).toBe("composing");

    const frozen = harnessed.adapter.prepareCommand(harnessed.state(), (context) =>
      structuralPlan(context, "\n")
    );
    expect(frozen.kind).toBe("frozen");
    expect(harnessed.frames).toHaveLength(0);

    const effect = harnessed.adapter.noteFrozenPlan(harnessed.state());
    expect(effect).not.toBeNull();
    harnessed.dispatch({ effects: effect! });

    const finished = harnessed.adapter.finishComposition(harnessed.state());
    expect(finished.receipt).toMatchObject({
      requiresStructureRefresh: true,
      reason: "composed-range-may-change-structure"
    });
    expect(finished.effects).toHaveLength(1);
    harnessed.dispatch({ effects: finished.effects });
    expect(readCompositionState(harnessed.state()).active).toBe(false);
  });

  it("still transports plain input during composition", () => {
    const harnessed = harness("alpha");
    harnessed.dispatch({ effects: harnessed.adapter.startComposition(harnessed.state()) });

    const prepared = harnessed.adapter.prepareCommand(harnessed.state(), (context) =>
      inputPlan(context, 5, "x")
    );
    expect(prepared.kind).toBe("applied");
    if (prepared.kind !== "applied") throw new Error("expected applied");
    harnessed.dispatch(prepared.transaction);
    expect(harnessed.adapter.recordEditorDispatch(harnessed.state(), prepared)).toEqual({
      kind: "noted"
    });
    expect(harnessed.frames).toHaveLength(1);
    expect(readCompositionState(harnessed.state()).dataRevision).toBe(2);
  });

  it("asks for exactly one recomputation when composition ends", () => {
    const harnessed = harness("alpha");
    harnessed.dispatch({ effects: beginCompositionEffect.of(1) });
    harnessed.dispatch({ effects: noteCompositionGeometryEffect.of(1) });
    harnessed.dispatch({ effects: noteCompositionGeometryEffect.of(1) });

    const first = harnessed.adapter.finishComposition(harnessed.state());
    expect(first.receipt).toMatchObject({
      geometryEventCount: 2,
      requiresStructureRefresh: true
    });
    harnessed.dispatch({ effects: finishCompositionEffect.of(null) });

    const second = harnessed.adapter.finishComposition(harnessed.state());
    expect(second.receipt).toBeNull();
  });

  it("does not request a refresh when composition changed nothing structural", () => {
    const harnessed = harness("alpha");
    harnessed.dispatch({ effects: beginCompositionEffect.of(1) });
    const finished = harnessed.adapter.finishComposition(harnessed.state());

    expect(finished.receipt).toMatchObject({
      requiresStructureRefresh: false,
      reason: "no-geometry-work"
    });
    harnessed.dispatch({ effects: finishCompositionEffect.of(null) });
    expect(harnessed.adapter.compositionStatus(harnessed.state()).kind).toBe("idle");
  });

  it("drops composition state when the session is rebound", () => {
    const harnessed = harness("alpha");
    harnessed.dispatch({ effects: harnessed.adapter.startComposition(harnessed.state()) });
    harnessed.adapter.rebindSession("tab-2", harnessed.state());
    harnessed.dispatch({ effects: harnessed.adapter.resetComposition() });

    expect(harnessed.adapter.compositionStatus(harnessed.state()).kind).toBe("idle");
  });
});

function applyChangesLocally(
  source: string,
  changes: readonly { readonly from: number; readonly to: number; readonly insert: string }[]
): string {
  let cursor = 0;
  let result = "";
  for (const change of changes) {
    result += source.slice(cursor, change.from);
    result += change.insert;
    cursor = change.to;
  }
  return result + source.slice(cursor);
}
