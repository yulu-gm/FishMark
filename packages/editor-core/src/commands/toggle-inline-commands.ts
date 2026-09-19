import type { EditorView } from "@codemirror/view";
import { planStrongToggle, planEmphasisToggle } from "@fishmark/editor-model";
import type { ActiveBlockState } from "../active-block";
import { runSemanticCommand } from "@fishmark/codemirror-adapter";
export function toggleStrong(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planStrongToggle);
}
export function toggleEmphasis(view: EditorView, _activeState: ActiveBlockState): boolean {
  void _activeState;
  return runSemanticCommand(view, planEmphasisToggle);
}
