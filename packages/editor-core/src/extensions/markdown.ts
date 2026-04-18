import {
  defaultKeymap,
  history,
  historyKeymap
} from "@codemirror/commands";
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import {
  type DecorationSet,
  EditorView,
  ViewPlugin,
  keymap
} from "@codemirror/view";

import type { MarkdownDocument } from "@yulora/markdown-engine";

import {
  createActiveBlockStateFromMarkdownDocument,
  type ActiveBlockSelection,
  type ActiveBlockState
} from "../active-block";
import {
  runMarkdownBackspace,
  runMarkdownEnter,
  runMarkdownTab
} from "../commands";
import { createMarkdownDocumentCache } from "../derived-state/markdown-document-cache";
import { deriveInactiveBlockDecorationsState } from "../derived-state/inactive-block-decorations";
import { createTextEditingShortcutKeymap } from "./markdown-shortcuts";

export type ParseMarkdownDocument = (source: string) => MarkdownDocument;

export type CreateYuloraMarkdownExtensionsOptions = {
  parseBlockMap?: ParseMarkdownDocument;
  parseMarkdownDocument?: ParseMarkdownDocument;
  onContentChange: (doc: string) => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
  onBlur?: () => void;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
};

type MarkdownExtensionRuntime = {
  activeBlockState: ActiveBlockState;
  blockDecorationSignature: string;
  hasEditorFocus: boolean;
  isCompositionGuardActive: boolean;
  hasPendingDerivedStateFlush: boolean;
};

const createSelectionSnapshot = (state: EditorState): ActiveBlockSelection => ({
  anchor: state.selection.main.anchor,
  head: state.selection.main.head
});

const forceRefreshMarkdownDecorationsEffect = StateEffect.define<null>();

export function createYuloraMarkdownExtensions(
  options: CreateYuloraMarkdownExtensionsOptions
): Extension[] {
  const parseMarkdownDocument = options.parseMarkdownDocument ?? options.parseBlockMap;

  if (!parseMarkdownDocument) {
    throw new Error(
      "createYuloraMarkdownExtensions requires parseBlockMap or parseMarkdownDocument"
    );
  }

  const markdownDocumentCache = createMarkdownDocumentCache(parseMarkdownDocument);
  const runtime: MarkdownExtensionRuntime = {
    activeBlockState: createActiveBlockStateFromMarkdownDocument(markdownDocumentCache.read(""), {
      anchor: 0,
      head: 0
    }),
    blockDecorationSignature: "",
    hasEditorFocus: false,
    isCompositionGuardActive: false,
    hasPendingDerivedStateFlush: false
  };

  const setBlockDecorationsEffect = StateEffect.define<DecorationSet>();

  const notifyActiveBlockChange = (nextState: ActiveBlockState, force = false) => {
    const didChange =
      force ||
      runtime.activeBlockState.selection.anchor !== nextState.selection.anchor ||
      runtime.activeBlockState.selection.head !== nextState.selection.head ||
      runtime.activeBlockState.activeBlock?.id !== nextState.activeBlock?.id ||
      runtime.activeBlockState.blockMap !== nextState.blockMap;

    runtime.activeBlockState = nextState;

    if (didChange) {
      options.onActiveBlockChange?.(nextState);
    }
  };

  const createDerivedState = (state: EditorState) =>
    deriveInactiveBlockDecorationsState({
      source: state.doc.toString(),
      selection: createSelectionSnapshot(state),
      hasEditorFocus: runtime.hasEditorFocus,
      markdownDocumentCache,
      resolveImagePreviewUrl: options.resolveImagePreviewUrl
    });

  const blockDecorationsField = StateField.define<DecorationSet>({
    create(state) {
      const { activeBlockState, decorationSet, signature } = createDerivedState(state);

      runtime.activeBlockState = activeBlockState;
      runtime.blockDecorationSignature = signature;

      return decorationSet;
    },
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

  const applyBlockDecorations = (
    view: EditorView,
    decorationSet: DecorationSet,
    signature: string,
    force = false
  ) => {
    if (!force && signature === runtime.blockDecorationSignature) {
      return;
    }

    runtime.blockDecorationSignature = signature;
    view.dispatch({
      effects: setBlockDecorationsEffect.of(decorationSet)
    });
  };

  const recomputeDerivedState = (view: EditorView, state: EditorState, force = false) => {
    const { activeBlockState, decorationSet, signature } = createDerivedState(state);

    notifyActiveBlockChange(activeBlockState, force);
    applyBlockDecorations(view, decorationSet, signature, force);
  };

  const syncBlurDecorations = (view: EditorView) => {
    queueMicrotask(() => {
      const nextHasEditorFocus = view.hasFocus;

      if (runtime.hasEditorFocus === nextHasEditorFocus) {
        return;
      }

      runtime.hasEditorFocus = nextHasEditorFocus;
      recomputeDerivedState(view, view.state, true);
    });
  };

  const lifecyclePlugin = ViewPlugin.fromClass(class {
    view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      view.dom.addEventListener("compositionstart", this.handleCompositionStart);
      view.dom.addEventListener("compositionupdate", this.handleCompositionStart);
      view.dom.addEventListener("compositionend", this.handleCompositionEnd);
      view.dom.addEventListener("focusin", this.handleFocusIn);
      view.dom.addEventListener("focusout", this.handleFocusOut);

      options.onActiveBlockChange?.(runtime.activeBlockState);

      if (!view.hasFocus) {
        return;
      }

      runtime.hasEditorFocus = true;
      recomputeDerivedState(view, view.state, true);
    }

    handleCompositionStart = () => {
      runtime.isCompositionGuardActive = true;
    };

    handleCompositionEnd = () => {
      runtime.isCompositionGuardActive = false;

      if (!runtime.hasPendingDerivedStateFlush) {
        return;
      }

      runtime.hasPendingDerivedStateFlush = false;
      recomputeDerivedState(this.view, this.view.state, true);
    };

    handleFocusIn = () => {
      if (runtime.hasEditorFocus) {
        return;
      }

      runtime.hasEditorFocus = true;
      recomputeDerivedState(this.view, this.view.state, true);
    };

    handleFocusOut = () => {
      syncBlurDecorations(this.view);
      options.onBlur?.();
    };

    destroy() {
      this.view.dom.removeEventListener("compositionstart", this.handleCompositionStart);
      this.view.dom.removeEventListener("compositionupdate", this.handleCompositionStart);
      this.view.dom.removeEventListener("compositionend", this.handleCompositionEnd);
      this.view.dom.removeEventListener("focusin", this.handleFocusIn);
      this.view.dom.removeEventListener("focusout", this.handleFocusOut);
    }
  });

  return [
    blockDecorationsField,
    lifecyclePlugin,
    history(),
    keymap.of([
      {
        key: "Backspace",
        run: (view) => runMarkdownBackspace(view, runtime.activeBlockState)
      },
      {
        key: "Enter",
        run: (view) => runMarkdownEnter(view, runtime.activeBlockState)
      },
      {
        key: "Tab",
        run: (view) => runMarkdownTab(view, runtime.activeBlockState)
      },
      ...createTextEditingShortcutKeymap(() => runtime.activeBlockState),
      ...historyKeymap,
      ...defaultKeymap
    ]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      "aria-label": "Markdown editor",
      spellcheck: "false"
    }),
    EditorView.updateListener.of((update) => {
      const shouldForceRefresh = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(forceRefreshMarkdownDecorationsEffect))
      );

      if (update.docChanged) {
        options.onContentChange(update.state.doc.toString());
      }

      if (!update.docChanged && !update.selectionSet && !shouldForceRefresh) {
        return;
      }

      if (shouldForceRefresh) {
        recomputeDerivedState(update.view, update.state, true);
        return;
      }

      if (
        runtime.isCompositionGuardActive ||
        update.view.compositionStarted ||
        update.view.composing
      ) {
        runtime.hasPendingDerivedStateFlush = true;
        return;
      }

      recomputeDerivedState(update.view, update.state);
    })
  ];
}

export function refreshMarkdownDecorations(view: EditorView): void {
  view.dispatch({
    effects: forceRefreshMarkdownDecorationsEffect.of(null)
  });
}
