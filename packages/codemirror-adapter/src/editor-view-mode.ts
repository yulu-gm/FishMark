import { StateEffect, StateField, Transaction, type EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type EditorViewMode = "wysiwym" | "source";

export const DEFAULT_EDITOR_VIEW_MODE: EditorViewMode = "wysiwym";

export const setMarkdownEditorViewModeEffect = StateEffect.define<EditorViewMode>();

export const markdownEditorViewModeField = StateField.define<EditorViewMode>({
  create() {
    return DEFAULT_EDITOR_VIEW_MODE;
  },
  update(mode, transaction) {
    let nextMode = mode;

    for (const effect of transaction.effects) {
      if (effect.is(setMarkdownEditorViewModeEffect)) {
        nextMode = effect.value;
      }
    }

    return nextMode;
  }
});

export function createMarkdownEditorViewModeExtension(
  initialMode: EditorViewMode = DEFAULT_EDITOR_VIEW_MODE
): Extension {
  return markdownEditorViewModeField.init(() => initialMode);
}

export function getMarkdownEditorViewMode(state: EditorState): EditorViewMode {
  return state.field(markdownEditorViewModeField, false) ?? DEFAULT_EDITOR_VIEW_MODE;
}

export function setMarkdownEditorViewMode(
  view: EditorView,
  mode: EditorViewMode
): void {
  if (getMarkdownEditorViewMode(view.state) === mode) {
    return;
  }

  view.dispatch({
    effects: setMarkdownEditorViewModeEffect.of(mode),
    annotations: Transaction.addToHistory.of(false)
  });
}
