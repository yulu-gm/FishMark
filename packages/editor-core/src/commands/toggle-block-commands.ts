import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import { readSemanticContext } from "./semantic-context";
import {
  computeBlockquoteToggle,
  computeBulletListToggle,
  computeCodeFenceToggle,
  computeHeadingToggle,
  type SemanticEdit
} from "./semantic-edits";

export function toggleHeading(level: 1 | 2 | 3 | 4) {
  return (view: EditorView, activeState: ActiveBlockState): boolean =>
    applySemanticEdit(view, computeHeadingToggle(readSemanticContext(view.state, activeState), level));
}

export function toggleBulletList(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeBulletListToggle(readSemanticContext(view.state, activeState)));
}

export function toggleBlockquote(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeBlockquoteToggle(readSemanticContext(view.state, activeState)));
}

export function toggleCodeFence(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeCodeFenceToggle(readSemanticContext(view.state, activeState)));
}

function applySemanticEdit(view: EditorView, edit: SemanticEdit | null): boolean {
  if (!edit) {
    return false;
  }
  view.dispatch({ changes: edit.changes, selection: edit.selection });
  return true;
}
