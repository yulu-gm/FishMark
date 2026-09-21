import type { EditorView } from "@codemirror/view";
import { planEnter, planBackspace, planIndentIn, planIndentOut, planMoveListItemUp, planMoveListItemDown } from "@fishmark/editor-model";
import type { ActiveBlockState } from "@fishmark/editor-model";
import { runSemanticCommand } from "./semantic-keypress";
export function runListEnter(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planEnter);
}
export function runListBackspace(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planBackspace);
}
export function runListMoveLineUp(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planMoveListItemUp);
}
export function runListMoveLineDown(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planMoveListItemDown);
}
export function runListIndentOnTab(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planIndentIn);
}
export function runListOutdentOnShiftTab(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planIndentOut);
}
