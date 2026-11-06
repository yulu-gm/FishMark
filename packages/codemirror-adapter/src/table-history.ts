import { invertedEffects, isolateHistory } from "@codemirror/commands";
import { Annotation, EditorState, StateEffect, StateField } from "@codemirror/state";
import type { TablePosition } from "./table-context";

// Native input still edits the cell DOM; only the source transaction owns undo.
// Group adjacent typing, but never merge across cells or typing/deletion/paste.
type TableInputGroup = TablePosition & { userEvent: string };
export const tableCellInput = Annotation.define<TableInputGroup>();
const tableInputGroup = StateField.define<TableInputGroup | null>({
  create: () => null,
  update(previous, transaction) {
    if (transaction.docChanged) return transaction.annotation(tableCellInput) ?? null;
    return transaction.startState.selection.eq(transaction.newSelection) ? previous : null;
  }
});
// Several absent cells can share one source offset. Preserve their semantic
// selection as an invertible history effect instead of guessing from that offset.
export const tableCellSelection = Annotation.define<TablePosition>();
const setTableCellSelection = StateEffect.define<TablePosition | null>({
  map(value, changes) {
    return value?.tableStartOffset === undefined ? value :
      { ...value, tableStartOffset: changes.mapPos(value.tableStartOffset) };
  }
});
export const tableCellSelectionField = StateField.define<TablePosition | null>({
  create: () => null,
  update(previous, transaction) {
    let value = transaction.docChanged || !transaction.startState.selection.eq(transaction.newSelection) ? null : previous;
    for (const effect of transaction.effects) if (effect.is(setTableCellSelection)) value = effect.value;
    return value;
  }
});
export const tableHistory = [
  tableCellSelectionField,
  invertedEffects.of(transaction => transaction.docChanged && transaction.effects.some(effect => effect.is(setTableCellSelection))
    ? [setTableCellSelection.of(transaction.startState.field(tableCellSelectionField))] : []),
  EditorState.transactionExtender.of(transaction => {
    const target = transaction.annotation(tableCellSelection) ?? transaction.annotation(tableCellInput);
    return target ? { effects: setTableCellSelection.of(target) } : null;
  }),
  tableInputGroup,
  EditorState.transactionExtender.of(transaction => {
    const input = transaction.annotation(tableCellInput);
    if (!input || !transaction.docChanged) return null;
    const previous = transaction.startState.field(tableInputGroup);
    return previous && previous.tableStartOffset === input.tableStartOffset &&
      previous.row === input.row && previous.column === input.column && previous.userEvent === input.userEvent
      ? null : { annotations: isolateHistory.of("before") };
  })
];

export function tableInputUserEvent(inputType: string): string {
  if (inputType.startsWith("delete")) return `delete.table.${inputType}`;
  if (inputType === "insertText") return "input.type.table";
  // A committed IME composition is one input event here, never an unfinished
  // composition that CodeMirror should join unconditionally to an older edit.
  return `input.table.${inputType}`;
}
