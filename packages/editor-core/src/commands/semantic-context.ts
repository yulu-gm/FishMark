import type { EditorState } from "@codemirror/state";

import type { ActiveBlockState } from "../active-block";

export type SemanticSelection = {
  from: number;
  to: number;
  empty: boolean;
};

export type SemanticContext = {
  state: EditorState;
  source: string;
  activeState: ActiveBlockState;
  selection: SemanticSelection;
};

export function readSemanticContext(
  state: EditorState,
  activeState: ActiveBlockState
): SemanticContext {
  const main = state.selection.main;
  const from = Math.min(main.anchor, main.head);
  const to = Math.max(main.anchor, main.head);

  return {
    state,
    source: state.doc.toString(),
    activeState,
    selection: { from, to, empty: main.empty }
  };
}
