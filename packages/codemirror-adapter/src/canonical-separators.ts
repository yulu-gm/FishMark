import { StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { readCompositionState, readEditorStructureCache } from "./transaction-adapter";
import { createEditorDerivedSnapshotFromCache, type EditorDerivedSnapshot, type PhysicalLine } from "@fishmark/editor-model";

// Layout-affecting separators are direct decorations owned by the canonical
// physical document, independent of projected block/widget decoration updates.
export function createCanonicalSeparatorDecorations(snapshot: EditorDerivedSnapshot, caret: number): DecorationSet {
  const activeStart = snapshot.lineAt(caret)?.range.startOffset;
  return Decoration.set(snapshot.document.lines.flatMap((line) => {
    if (!isQuoteSeparator(line) || line.range.startOffset === activeStart) return [];
    return [collapsedLine.range(line.range.startOffset)];
  }));
}

const collapsedLine = Decoration.line({ attributes: { class: "cm-inactive-blank-line" } });

function isQuoteSeparator(line: PhysicalLine | null): line is PhysicalLine {
  return line !== null && line.role === "structural-blank" &&
    line.segments.findLast((segment) => segment.kind === "quote-marker" || segment.kind === "list-marker")?.kind === "quote-marker";
}

export function createCanonicalSeparatorField(readViewMode: (state: EditorState) => "source" | "wysiwym"): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
  create(state) {
    return readViewMode(state) === "source" ? Decoration.none :
      createCanonicalSeparatorDecorations(createEditorDerivedSnapshotFromCache(readEditorStructureCache(state)), state.selection.main.head);
  },
  update(value, transaction) {
    const state = transaction.state;
    if (readViewMode(state) === "source") return Decoration.none;
    if (readCompositionState(state).active) return value.map(transaction.changes);
    const refresh = transaction.docChanged || readCompositionState(transaction.startState).active ||
      readViewMode(transaction.startState) !== readViewMode(state);
    const before = transaction.startState.doc.lineAt(transaction.startState.selection.main.head).from;
    const after = state.doc.lineAt(state.selection.main.head).from;
    if (!refresh && before === after) return value;
    const snapshot = createEditorDerivedSnapshotFromCache(readEditorStructureCache(state));
    if (refresh) return createCanonicalSeparatorDecorations(snapshot, state.selection.main.head);
    const previous = snapshot.lineAt(before);
    // Selection-only movement touches at most the two caret lines, not the document.
    return value.update({ filterFrom: after, filterTo: after, filter: (from) => from !== after,
      add: isQuoteSeparator(previous) ? [collapsedLine.range(before)] : [] });
  },
  provide: (field) => EditorView.decorations.from(field)
});
}
