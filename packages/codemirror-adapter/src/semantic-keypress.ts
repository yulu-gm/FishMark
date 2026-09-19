import type { EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import {
  createEditorTransactionAdapter,
  readEditorStructureCache,
  type EditorPreparedCommand,
  type EditorTransactionAdapter
} from "./transaction-adapter";
import {
  planBackspace,
  planDelete,
  planEnter,
  planIndentIn,
  planIndentOut,
  planVerticalNavigation,
  planTableNextCell,
  planTablePreviousCell,
  type EditTransactionPlan,
  type EditorSemanticContext
} from "@fishmark/editor-model";

// The one decision path for semantic keypresses. Every command here reads the semantic context
// built by the adapter's document structure cache and lets `@fishmark/editor-model` decide the
// edit. The renderer's existing update listener observes the final dispatched transaction and
// owns its frame, so normalizations, undo and native browser edits share the same queue.

export type SemanticCommandPlanner = (
  context: EditorSemanticContext
) => EditTransactionPlan | null;

export type SemanticCommandResult =
  | "applied"
  | "unchanged"
  | "unhandled"
  | "frozen"
  | "stale";

export type SemanticCommandBindings = {
  readonly adapter: EditorTransactionAdapter;
  readonly bindSession: (view: EditorView, tabId?: string) => void;
  readonly releaseSession: () => void;
  readonly run: (view: EditorView, planner: SemanticCommandPlanner) => SemanticCommandResult;
};

const viewBindings = new WeakMap<EditorView, SemanticCommandBindings>();

export function runSemanticCommand(view: EditorView, planner: SemanticCommandPlanner): boolean {
  let bindings = viewBindings.get(view);
  if (bindings === undefined) {
    bindings = createSemanticCommandBindings();
    view.dispatch({ effects: StateEffect.appendConfig.of(bindings.adapter.extension()) });
    bindings.bindSession(view);
  }
  return bindings.run(view, planner) !== "unhandled";
}

export function createSemanticCommandBindings(input: {
  readonly readAcknowledgedRevision?: () => number | null;
  readonly readObservedRevision?: () => number | null;
} = {}): SemanticCommandBindings {
  const adapter = createEditorTransactionAdapter({
    readCache: readEditorStructureCache,
    ...(input.readAcknowledgedRevision === undefined
      ? {}
      : { readAcknowledgedRevision: input.readAcknowledgedRevision }),
    ...(input.readObservedRevision === undefined
      ? {}
      : { readObservedRevision: input.readObservedRevision })
  });

  const bindings: SemanticCommandBindings = {
    adapter,
    bindSession: (view, tabId = SEMANTIC_EDITOR_SESSION_ID) => {
      // Rebinding invalidates plans from an earlier tab or load, even when the text is identical.
      adapter.rebindSession(tabId, view.state);
      viewBindings.set(view, bindings);
    },
    releaseSession: () => {
      adapter.releaseSession();
    },
    run: (view, planner) =>
      applyPreparedSemanticCommand(view, adapter, adapter.prepareCommand(view.state, planner))
  };
  return bindings;
}

// Standalone editor views use this identity; the renderer supplies the real tab identity.
export const SEMANTIC_EDITOR_SESSION_ID = "editor";

// Only an unhandled plan falls through to CodeMirror's native binding. Composition and stale
// plans consume the key without allowing a second edit to bypass the guard.
function applyPreparedSemanticCommand(
  view: EditorView,
  adapter: EditorTransactionAdapter,
  prepared: EditorPreparedCommand
): SemanticCommandResult {
  if (prepared.kind === "frozen") {
    const effect = adapter.noteFrozenPlan(view.state);
    if (effect !== null) {
      view.dispatch({ effects: effect });
    }
    return "frozen";
  }
  if (prepared.kind === "stale") {
    return "stale";
  }
  if (prepared.kind === "unhandled") {
    return "unhandled";
  }
  view.dispatch({ ...prepared.transaction, scrollIntoView: true });
  if (prepared.kind === "unchanged") {
    return "unchanged";
  }
  // The host's update listener owns all document frames, including native input, undo and these
  // semantic transactions. Admitting the prepared frame here would enqueue the edit twice.
  return "applied";
}

export function planSemanticEnter(context: EditorSemanticContext): EditTransactionPlan | null {
  return planEnter(context);
}

export function planSemanticBackspace(context: EditorSemanticContext): EditTransactionPlan | null {
  return planBackspace(context);
}

export function planSemanticDelete(context: EditorSemanticContext): EditTransactionPlan | null {
  return planDelete(context);
}

export function planSemanticTab(context: EditorSemanticContext): EditTransactionPlan | null {
  return planTableNextCell(context) ?? planIndentIn(context);
}

export function planSemanticShiftTab(context: EditorSemanticContext): EditTransactionPlan | null {
  return planTablePreviousCell(context) ?? planIndentOut(context);
}

export function planSemanticArrow(
  direction: "up" | "down"
): SemanticCommandPlanner {
  return (context) => planVerticalNavigation(context, direction);
}
