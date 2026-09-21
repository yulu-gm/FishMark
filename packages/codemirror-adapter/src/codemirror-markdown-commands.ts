import type { EditorView } from "@codemirror/view";
import { planEnter, planBackspace, planHardBreak, planPointerSelection, planVerticalNavigation } from "@fishmark/editor-model";
import type { ActiveBlockState } from "@fishmark/editor-model";
import { resolveArrowUp, resolveArrowDown } from "./interactions";
import { runSemanticCommand, planSemanticTab, planSemanticShiftTab } from "./semantic-keypress";
export function runMarkdownEnter(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planEnter);
}
export function runMarkdownBackspace(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planBackspace);
}
export function runMarkdownHardBreak(view: EditorView): boolean {
  return runSemanticCommand(view, planHardBreak);
}
export function runMarkdownTab(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planSemanticTab);
}
export function runMarkdownShiftTab(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planSemanticShiftTab);
}
export function runMarkdownArrowDown(view: EditorView, activeState: ActiveBlockState): boolean {
  const target = resolveArrowDown(view, activeState);
  return runSemanticCommand(view, context => target === null ? planVerticalNavigation(context, "down") : planPointerSelection(context, target.anchor));
}
export function runMarkdownArrowUp(view: EditorView, activeState: ActiveBlockState): boolean {
  const target = resolveArrowUp(view, activeState);
  return runSemanticCommand(view, context => target === null ? planVerticalNavigation(context, "up") : planPointerSelection(context, target.anchor));
}
