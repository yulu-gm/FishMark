import {
  defaultKeymap,
  deleteCharBackward,
  history,
  historyKeymap,
  insertNewlineAndIndent
} from "@codemirror/commands";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap } from "@codemirror/view";

import {
  createActiveBlockStateFromBlockMap,
  createBlockMapCache,
  deriveInactiveBlockDecorationsState,
  runBlockquoteEnter,
  runCodeFenceBackspace,
  runCodeFenceEnter,
  runListEnter,
  type ActiveBlockState
} from "@yulora/editor-core";
import { parseBlockMap } from "@yulora/markdown-engine";

export type CreateCodeEditorControllerOptions = {
  parent: Element;
  initialContent: string;
  onChange: (content: string) => void;
  onBlur?: () => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
};

export type CodeEditorController = {
  getContent: () => string;
  replaceDocument: (nextContent: string) => void;
  insertText: (text: string) => void;
  setSelection: (anchor: number, head?: number) => void;
  pressEnter: () => void;
  pressBackspace: () => void;
  destroy: () => void;
};

const setBlockDecorationsEffect = StateEffect.define<DecorationSet>();

const blockDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let nextDecorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setBlockDecorationsEffect)) {
        nextDecorations = effect.value;
      }
    }

    return nextDecorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

export function createCodeEditorController(
  options: CreateCodeEditorControllerOptions
): CodeEditorController {
  const blockMapCache = createBlockMapCache(parseBlockMap);
  let activeBlockState = createActiveBlockStateFromBlockMap(blockMapCache.read(""), {
    anchor: 0,
    head: 0
  });
  let blockDecorationSignature = "";
  let hasEditorFocus = false;
  let isCompositionGuardActive = false;
  let hasPendingDerivedStateFlush = false;
  let applyBlockDecorations: (
    decorationSet: DecorationSet,
    signature: string,
    force?: boolean
  ) => void = () => {};

  const createSelectionSnapshot = (state: EditorState) => ({
    anchor: state.selection.main.anchor,
    head: state.selection.main.head
  });

  const notifyActiveBlockChange = (nextState: ActiveBlockState, force = false) => {
    const didChange =
      force ||
      activeBlockState.selection.anchor !== nextState.selection.anchor ||
      activeBlockState.selection.head !== nextState.selection.head ||
      activeBlockState.activeBlock?.id !== nextState.activeBlock?.id ||
      activeBlockState.blockMap !== nextState.blockMap;

    activeBlockState = nextState;

    if (didChange) {
      options.onActiveBlockChange?.(nextState);
    }
  };

  const recomputeDerivedState = (state: EditorState, force = false) => {
    const { activeBlockState: nextActiveBlockState, decorationSet, signature } =
      deriveInactiveBlockDecorationsState({
        source: state.doc.toString(),
        selection: createSelectionSnapshot(state),
        hasEditorFocus,
        blockMapCache
      });

    notifyActiveBlockChange(nextActiveBlockState, force);
    applyBlockDecorations(decorationSet, signature, force);
  };

  const createState = (content: string) =>
    EditorState.create({
      doc: content,
      extensions: [
        blockDecorationsField,
        history(),
        keymap.of([
          {
            key: "Backspace",
            run: (editorView) =>
              runCodeFenceBackspace(editorView, activeBlockState) || deleteCharBackward(editorView)
          },
          {
            key: "Enter",
            run: (editorView) => {
              return (
                runCodeFenceEnter(editorView, activeBlockState) ||
                runListEnter(editorView) ||
                runBlockquoteEnter(editorView) ||
                insertNewlineAndIndent(editorView)
              );
            }
          },
          ...historyKeymap,
          ...defaultKeymap
        ]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          "aria-label": "Markdown editor",
          spellcheck: "false"
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            options.onChange(update.state.doc.toString());
          }

          if (!update.docChanged && !update.selectionSet) {
            return;
          }

          if (
            isCompositionGuardActive ||
            update.view.compositionStarted ||
            update.view.composing
          ) {
            hasPendingDerivedStateFlush = true;
            return;
          }

          recomputeDerivedState(update.state);
        })
      ]
    });

  const initialState = createState(options.initialContent);
  const initialDerivedState = deriveInactiveBlockDecorationsState({
    source: initialState.doc.toString(),
    selection: createSelectionSnapshot(initialState),
    hasEditorFocus,
    blockMapCache
  });
  activeBlockState = initialDerivedState.activeBlockState;

  const view = new EditorView({
    state: initialState,
    parent: options.parent
  });

  applyBlockDecorations = (decorationSet, signature, force = false) => {
    if (!force && signature === blockDecorationSignature) {
      return;
    }

    blockDecorationSignature = signature;
    view.dispatch({
      effects: setBlockDecorationsEffect.of(decorationSet)
    });
  };

  applyBlockDecorations(
    initialDerivedState.decorationSet,
    initialDerivedState.signature,
    true
  );
  options.onActiveBlockChange?.(activeBlockState);

  const handleCompositionStart = () => {
    isCompositionGuardActive = true;
  };

  const handleCompositionEnd = () => {
    isCompositionGuardActive = false;

    if (!hasPendingDerivedStateFlush) {
      return;
    }

    hasPendingDerivedStateFlush = false;
    recomputeDerivedState(view.state, true);
  };

  const syncBlurDecorations = () => {
    queueMicrotask(() => {
      const nextHasEditorFocus = view.hasFocus;

      if (hasEditorFocus === nextHasEditorFocus) {
        return;
      }

      hasEditorFocus = nextHasEditorFocus;
      recomputeDerivedState(view.state, true);
    });
  };

  const handleFocusIn = () => {
    if (hasEditorFocus) {
      return;
    }

    hasEditorFocus = true;
    recomputeDerivedState(view.state, true);
  };

  const handleBlur = () => {
    syncBlurDecorations();
    options.onBlur?.();
  };

  view.dom.addEventListener("compositionstart", handleCompositionStart);
  view.dom.addEventListener("compositionupdate", handleCompositionStart);
  view.dom.addEventListener("compositionend", handleCompositionEnd);
  view.dom.addEventListener("focusin", handleFocusIn);
  view.dom.addEventListener("focusout", handleBlur);

  return {
    getContent: () => view.state.doc.toString(),
    replaceDocument(nextContent: string) {
      isCompositionGuardActive = false;
      hasPendingDerivedStateFlush = false;
      const nextState = createState(nextContent);
      blockMapCache.clear();

      view.setState(nextState);
      recomputeDerivedState(nextState, true);
    },
    insertText(text: string) {
      const selection = view.state.selection.main;
      const nextAnchor = selection.from + text.length;

      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text
        },
        selection: {
          anchor: nextAnchor,
          head: nextAnchor
        }
      });
    },
    setSelection(anchor: number, head = anchor) {
      view.dispatch({
        selection: {
          anchor,
          head
        }
      });
    },
    pressEnter() {
      if (
        !runCodeFenceEnter(view, activeBlockState) &&
        !runListEnter(view) &&
        !runBlockquoteEnter(view)
      ) {
        insertNewlineAndIndent(view);
      }
    },
    pressBackspace() {
      if (!runCodeFenceBackspace(view, activeBlockState)) {
        deleteCharBackward(view);
      }
    },
    destroy() {
      view.dom.removeEventListener("compositionstart", handleCompositionStart);
      view.dom.removeEventListener("compositionupdate", handleCompositionStart);
      view.dom.removeEventListener("compositionend", handleCompositionEnd);
      view.dom.removeEventListener("focusin", handleFocusIn);
      view.dom.removeEventListener("focusout", handleBlur);
      view.destroy();
    }
  };
}
