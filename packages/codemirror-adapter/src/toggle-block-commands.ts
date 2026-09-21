import type { EditorView } from "@codemirror/view";
import { planHeadingToggle, planBulletListToggle, planBlockquoteToggle, planCodeFenceToggle } from "@fishmark/editor-model";
import type { ActiveBlockState } from "@fishmark/editor-model";
import { runSemanticCommand } from "./semantic-keypress";
export function toggleHeading(level: 1 | 2 | 3 | 4) {
  return (view: EditorView, _activeState: ActiveBlockState): boolean =>
    {
  void _activeState;
  return runSemanticCommand(view, context => planHeadingToggle(context, level));
};
}
export function toggleBulletList(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planBulletListToggle);
}
export function toggleBlockquote(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planBlockquoteToggle);
}
export function toggleCodeFence(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planCodeFenceToggle);
}
