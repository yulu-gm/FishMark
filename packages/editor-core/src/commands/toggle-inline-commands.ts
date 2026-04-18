import type { EditorView } from "@codemirror/view";

import type { ActiveBlockState } from "../active-block";
import { readSemanticContext } from "./semantic-context";
import {
  computeEmphasisToggle,
  computeStrongToggle,
  type SemanticEdit
} from "./semantic-edits";

export function toggleStrong(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeStrongToggle(readSemanticContext(view.state, activeState)));
}

export function toggleEmphasis(view: EditorView, activeState: ActiveBlockState): boolean {
  return applySemanticEdit(view, computeEmphasisToggle(readSemanticContext(view.state, activeState)));
}

function applySemanticEdit(view: EditorView, edit: SemanticEdit | null): boolean {
  if (!edit) {
    return false;
  }
  view.dispatch({ changes: edit.changes, selection: edit.selection });
  return true;
}
