import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap } from "@codemirror/view";

import {
  createActiveBlockStateFromBlockMap,
  type ActiveBlockState
} from "../../packages/editor-core/src";
import { parseBlockMap } from "../../packages/markdown-engine/src";

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
  destroy: () => void;
};

const setHeadingDecorationsEffect = StateEffect.define<DecorationSet>();

const headingDecorationsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let nextDecorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setHeadingDecorationsEffect)) {
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
  let blockMap = parseBlockMap(options.initialContent);
  let activeBlockState = createActiveBlockStateFromBlockMap(blockMap, {
    anchor: 0,
    head: 0
  });
  let headingDecorationSignature = "";
  let isCompositionGuardActive = false;
  let hasPendingDerivedStateFlush = false;
  let applyHeadingDecorations: (force?: boolean) => void = () => {};

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
    blockMap = parseBlockMap(state.doc.toString());
    notifyActiveBlockChange(
      createActiveBlockStateFromBlockMap(blockMap, createSelectionSnapshot(state)),
      force
    );
    applyHeadingDecorations(force);
  };

  const createHeadingDecorations = (state: ActiveBlockState) => {
    const activeBlockId = state.activeBlock?.id ?? null;
    const ranges = [];
    const signatures: string[] = [];

    for (const block of state.blockMap.blocks) {
      if (block.id === activeBlockId) {
        continue;
      }

      if (block.type === "heading") {
        signatures.push(`${block.type}:${block.id}:${block.startOffset}:${block.depth}`);
        ranges.push(
          Decoration.line({
            attributes: {
              class: `cm-inactive-heading cm-inactive-heading-depth-${block.depth}`
            }
          }).range(block.startOffset)
        );
        ranges.push(
          Decoration.mark({
            attributes: {
              class: "cm-inactive-heading-marker"
            }
          }).range(block.startOffset, block.startOffset + block.depth)
        );
      }

      if (block.type === "paragraph") {
        signatures.push(`${block.type}:${block.id}:${block.startOffset}`);
        ranges.push(
          Decoration.line({
            attributes: {
              class: "cm-inactive-paragraph cm-inactive-paragraph-leading"
            }
          }).range(block.startOffset)
        );
      }
    }

    return {
      decorationSet: Decoration.set(ranges, true),
      signature: signatures.join("|")
    };
  };

  const createState = (content: string) =>
    EditorState.create({
      doc: content,
      extensions: [
        headingDecorationsField,
        history(),
        keymap.of([...historyKeymap, ...defaultKeymap]),
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
  activeBlockState = createActiveBlockStateFromBlockMap(
    blockMap,
    createSelectionSnapshot(initialState)
  );

  const view = new EditorView({
    state: initialState,
    parent: options.parent
  });

  applyHeadingDecorations = (force = false) => {
    const { decorationSet, signature } = createHeadingDecorations(activeBlockState);

    if (!force && signature === headingDecorationSignature) {
      return;
    }

    headingDecorationSignature = signature;
    view.dispatch({
      effects: setHeadingDecorationsEffect.of(decorationSet)
    });
  };

  applyHeadingDecorations(true);
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

  const handleBlur = () => {
    options.onBlur?.();
  };

  view.dom.addEventListener("compositionstart", handleCompositionStart);
  view.dom.addEventListener("compositionupdate", handleCompositionStart);
  view.dom.addEventListener("compositionend", handleCompositionEnd);
  view.dom.addEventListener("focusout", handleBlur);

  return {
    getContent: () => view.state.doc.toString(),
    replaceDocument(nextContent: string) {
      isCompositionGuardActive = false;
      hasPendingDerivedStateFlush = false;
      blockMap = parseBlockMap(nextContent);
      const nextState = createState(nextContent);

      view.setState(nextState);
      notifyActiveBlockChange(
        createActiveBlockStateFromBlockMap(blockMap, createSelectionSnapshot(nextState)),
        true
      );
      applyHeadingDecorations(true);
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
    destroy() {
      view.dom.removeEventListener("compositionstart", handleCompositionStart);
      view.dom.removeEventListener("compositionupdate", handleCompositionStart);
      view.dom.removeEventListener("compositionend", handleCompositionEnd);
      view.dom.removeEventListener("focusout", handleBlur);
      view.destroy();
    }
  };
}
