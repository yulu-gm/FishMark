// @vitest-environment jsdom

import { history, redo, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { createEditTransactionPlan, type EditTransactionPlan } from "@fishmark/editor-model";

import {
  compositionStateField,
  createEditorTransactionAdapter,
  editorStructureCacheField,
  readEditorStructureCache,
  type EditorPreparedCommand
} from "./transaction-adapter";

// History and undo evidence for the adapter. An automatic structure completion must be its own
// undo step instead of being welded onto the typing that triggered it, and a cursor move must not
// manufacture a history event at all.

function createView(source: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const state = EditorState.create({
    doc: source,
    selection: { anchor: source.length },
    extensions: [editorStructureCacheField, compositionStateField, history()]
  });
  const view = new EditorView({ state, parent: host });
  const adapter = createEditorTransactionAdapter({
    readCache: readEditorStructureCache,
    frames: { admitFrame: () => ({ kind: "admitted", sequence: 1 }) }
  });
  adapter.rebindSession("tab-1", view.state);
  return {
    view,
    adapter,
    dispatch(prepared: EditorPreparedCommand): void {
      if (prepared.kind === "unchanged" || prepared.kind === "applied") {
        view.dispatch(prepared.transaction);
        adapter.recordEditorDispatch(view.state, prepared);
      }
    },
    destroy(): void {
      view.destroy();
      host.remove();
    }
  };
}

// The planner receives the semantic context, never editor state.
function inputPlan(at: number, insert: string) {
  return (context: Parameters<typeof createEditTransactionPlan>[0]["context"]): EditTransactionPlan =>
    createEditTransactionPlan({
      context,
      commandId: "insert-text",
      intent: "edit",
      edits: [{ from: at, to: at, insert }],
      selection: { anchor: at + insert.length, head: at + insert.length }
    });
}

function structuralPlan(at: number, insert: string) {
  return (context: Parameters<typeof createEditTransactionPlan>[0]["context"]): EditTransactionPlan =>
    createEditTransactionPlan({
      context,
      commandId: "enter",
      intent: "structural",
      edits: [{ from: at, to: at, insert }],
      selection: { anchor: at + insert.length, head: at + insert.length }
    });
}

describe("adapter history grouping", () => {
  it("gives an automatic structure completion its own undo step", () => {
    const harness = createView("alpha");
    try {
      harness.dispatch(harness.adapter.prepareCommand(harness.view.state, inputPlan(5, "!")));
      expect(harness.view.state.doc.toString()).toBe("alpha!");

      harness.dispatch(harness.adapter.prepareCommand(harness.view.state, structuralPlan(6, "\n- ")));
      expect(harness.view.state.doc.toString()).toBe("alpha!\n- ");

      undo(harness.view);
      expect(harness.view.state.doc.toString()).toBe("alpha!");
      undo(harness.view);
      expect(harness.view.state.doc.toString()).toBe("alpha");
    } finally {
      harness.destroy();
    }
  });

  it("keeps consecutive plain input in one undo step", () => {
    const harness = createView("alpha");
    try {
      for (const character of ["!", "?", "."]) {
        const at = harness.view.state.doc.length;
        harness.dispatch(harness.adapter.prepareCommand(harness.view.state, inputPlan(at, character)));
      }
      expect(harness.view.state.doc.toString()).toBe("alpha!?.");

      undo(harness.view);
      expect(harness.view.state.doc.toString()).toBe("alpha");
    } finally {
      harness.destroy();
    }
  });

  it("redoes an automatic completion separately as well", () => {
    const harness = createView("alpha");
    try {
      harness.dispatch(harness.adapter.prepareCommand(harness.view.state, inputPlan(5, "!")));
      harness.dispatch(harness.adapter.prepareCommand(harness.view.state, structuralPlan(6, "\n- ")));

      undo(harness.view);
      undo(harness.view);
      expect(harness.view.state.doc.toString()).toBe("alpha");

      redo(harness.view);
      expect(harness.view.state.doc.toString()).toBe("alpha!");
      redo(harness.view);
      expect(harness.view.state.doc.toString()).toBe("alpha!\n- ");
    } finally {
      harness.destroy();
    }
  });

  it("does not create a history event for a cursor move", () => {
    const harness = createView("alpha");
    try {
      harness.dispatch(harness.adapter.prepareCommand(harness.view.state, inputPlan(5, "!")));
      const before = harness.view.state.doc.toString();
      const navigation = harness.adapter.prepareCommand(harness.view.state, (context) =>
        createEditTransactionPlan({
          context,
          commandId: "pointer",
          intent: "navigation",
          edits: [],
          selection: { anchor: 1, head: 1 }
        })
      );
      expect(navigation.kind).toBe("unchanged");
      harness.dispatch(navigation);
      expect(harness.view.state.selection.main.anchor).toBe(1);

      undo(harness.view);
      expect(harness.view.state.doc.toString()).toBe("alpha");
      expect(before).toBe("alpha!");
    } finally {
      harness.destroy();
    }
  });

  it("groups a structural plan with the isolate annotation the history extension reads", () => {
    const harness = createView("alpha");
    try {
      const prepared = harness.adapter.prepareCommand(harness.view.state, structuralPlan(5, "\n- "));
      expect(prepared.kind).toBe("applied");
      if (prepared.kind !== "applied") throw new Error("expected applied");
      // The annotation must be the real history annotation type, not a lookalike.
      expect(prepared.transaction.annotations).toHaveLength(1);
      const applied = harness.view.state.update(prepared.transaction);
      expect(applied.state.field(editorStructureCacheField, false)?.source).toBe("alpha\n- ");
    } finally {
      harness.destroy();
    }
  });

  it("keeps the adapter's own composition freeze out of history bookkeeping", () => {
    const harness = createView("alpha");
    try {
      harness.view.dispatch({ effects: harness.adapter.startComposition(harness.view.state) });
      const frozen = harness.adapter.prepareCommand(
        harness.view.state,
        structuralPlan(5, "\n- ")
      );
      expect(frozen.kind).toBe("frozen");

      undo(harness.view);
      expect(harness.view.state.doc.toString()).toBe("alpha");
    } finally {
      harness.destroy();
    }
  });
});
