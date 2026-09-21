import type { EditorView } from "@codemirror/view";
import {
  planTableDelete, planTableDeleteColumn, planTableDeleteRow,
  planTableInsertColumnLeft, planTableInsertColumnRight, planTableInsertRowAbove, planTableInsertRowBelow,
  planTableNextCell, planTablePreviousCell, planTableMoveToCell, planTableUpdateCell,
  planTableMoveVertical, planTableMoveHorizontal, reselectEditorSemanticContext,
  planTableBackspaceFromBelow,
  type EditorSemanticContext
} from "@fishmark/editor-model";
import type { ActiveBlockState } from "@fishmark/editor-model";
import { runSemanticCommand, type SemanticCommandPlanner } from "./semantic-keypress";
import type { TablePosition } from "./table-context";

// Widget callbacks carry the table's source identity because focus may still be in a neighbouring
// paragraph. Reselect only the immutable context; the resulting plan performs the single dispatch.
function contextForTable(context: EditorSemanticContext, target: TablePosition): EditorSemanticContext {
  if (target.tableStartOffset === undefined) return context;
  const offset = target.tableStartOffset;
  return reselectEditorSemanticContext(context, { anchor: offset, head: offset });
}
const run = (view: EditorView, planner: SemanticCommandPlanner) => runSemanticCommand(view, planner);
export function runTableNextCell(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTableNextCell);
}
export function runTablePreviousCell(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTablePreviousCell);
}
export function runTableMoveUp(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, context => planTableMoveVertical(context, "up"));
}
export function runTableMoveDown(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, context => planTableMoveVertical(context, "down"));
}
export const runTableMoveDownOrExit = runTableMoveDown;
export function runTableMoveLeft(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, context => planTableMoveHorizontal(context, "left"));
}
export function runTableMoveRight(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, context => planTableMoveHorizontal(context, "right"));
}
export function runTableInsertRowBelow(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTableInsertRowBelow);
}
export function runTableInsertRowAbove(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTableInsertRowAbove);
}
export function runTableInsertColumnLeft(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTableInsertColumnLeft);
}
export function runTableInsertColumnRight(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTableInsertColumnRight);
}
export function runTableDeleteRow(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTableDeleteRow);
}
export function runTableDeleteColumn(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTableDeleteColumn);
}
export function runTableDelete(view: EditorView, _state: ActiveBlockState): boolean {
  void _state;
  return run(view, planTableDelete);
}
export function runTableSelectCell(view: EditorView, _state: ActiveBlockState, target: TablePosition): boolean {
  void _state;
  return run(view, context => planTableMoveToCell(contextForTable(context, target), target));
}
export function runTableUpdateCell(view: EditorView, _state: ActiveBlockState, target: TablePosition, text: string): boolean {
  void _state;
  return run(view, context => planTableUpdateCell(contextForTable(context, target), target, text));
}
export function runTableEnterFromLineAbove(view: EditorView, state: ActiveBlockState): boolean {
  return state.tableCursor?.mode === "adjacent-above" && runTableSelectCell(view, state, state.tableCursor);
}
export function runTableEnterFromLineBelow(view: EditorView, state: ActiveBlockState): boolean {
  return state.tableCursor?.mode === "adjacent-below" && runTableSelectCell(view, state, state.tableCursor);
}
export function runTableBackspaceFromLineBelow(view: EditorView, state: ActiveBlockState): boolean {
  void state;
  return run(view, planTableBackspaceFromBelow);
}
