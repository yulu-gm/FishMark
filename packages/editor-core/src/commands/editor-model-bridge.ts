import {
  applyIncrementalEdit,
  createDocumentStructureCache,
  type DocumentStructureCache
} from "@fishmark/markdown-engine";
import {
  createEditorDerivedSnapshotFromCache,
  createEditorSemanticContext,
  type EditTransactionPlan,
  type EditorSemanticContext
} from "@fishmark/editor-model";
import { StateField, type EditorState, type Extension, type Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// The bridge between CodeMirror and the pure semantic engine. It owns exactly one thing that is
// not a pure function: the document structure cache that follows the editor document, updated
// incrementally for ordinary single-range edits and by a fresh parse otherwise. Every command
// decision is then made by `@fishmark/editor-model` from the semantic context.

export const editorStructureCacheField = StateField.define<DocumentStructureCache>({
  create: (state) => createDocumentStructureCache(state.doc.toString()),
  update: (cache, transaction) => nextCache(cache, transaction)
});

export function createEditorModelBridgeExtension(): Extension {
  return editorStructureCacheField;
}

// Commands read the document-derived cache from the field, so a keypress never re-parses.
export function readEditorStructureCache(state: EditorState): DocumentStructureCache {
  return state.field(editorStructureCacheField, false) ?? createDocumentStructureCache(state.doc.toString());
}

export function readEditorSemanticContext(state: EditorState): EditorSemanticContext {
  const selection = state.selection.main;

  return createEditorSemanticContext({
    snapshot: createEditorDerivedSnapshotFromCache(readEditorStructureCache(state)),
    selection: { anchor: selection.anchor, head: selection.head }
  });
}

// Applying a plan is one CodeMirror transaction, so one command is one undo step.
export function applyEditorPlan(
  view: EditorView,
  plan: EditTransactionPlan | null,
  userEvent = "input.type"
): boolean {
  if (plan === null) {
    return false;
  }

  view.dispatch({
    changes: plan.edits.map((edit) => ({ from: edit.from, to: edit.to, insert: edit.insert })),
    selection: { anchor: plan.selection.anchor, head: plan.selection.head },
    userEvent
  });

  return true;
}

export function runEditorPlanCommand(
  view: EditorView,
  planner: (context: EditorSemanticContext) => EditTransactionPlan | null,
  userEvent?: string
): boolean {
  return applyEditorPlan(view, planner(readEditorSemanticContext(view.state)), userEvent);
}

// A single-range change goes through the incremental cache; anything else reparses the document,
// which keeps the cache correct without pretending to know more than CodeMirror told us.
function nextCache(
  cache: DocumentStructureCache,
  transaction: Transaction
): DocumentStructureCache {
  if (!transaction.docChanged) {
    return cache;
  }

  const changes: Array<{ from: number; to: number; insert: string }> = [];

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changes.push({ from: fromA, to: toA, insert: inserted.toString() });
  });

  if (changes.length === 1) {
    const change = changes[0]!;
    const source = transaction.newDoc.toString();

    // The incremental parser reuses unaffected structure within a safe window.
    if (cache.source.length === 0 || cache.source !== source) {
      return applyIncrementalEdit(cache, {
        fromOffset: change.from,
        toOffset: change.to,
        insertedText: change.insert
      }).cache;
    }
  }

  return createDocumentStructureCache(transaction.newDoc.toString());
}
