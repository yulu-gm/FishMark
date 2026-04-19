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
  runMarkdownArrowDown,
  runMarkdownArrowUp,
  runMarkdownBackspace,
  runMarkdownEnter,
  runMarkdownTab,
  runTableInsertRowBelow,
  runTableMoveDown,
  runTableMoveDownOrExit,
  runTableMoveLeft,
  runTableMoveRight,
  runTableMoveUp,
  runTableNextCell,
  runTablePreviousCell,
  runTableSelectCell,
  runTableUpdateCell
} from "../commands";
import { createMarkdownDocumentCache } from "../derived-state/markdown-document-cache";
import { deriveInactiveBlockDecorationsState } from "../derived-state/inactive-block-decorations";
import { readTableContext } from "../commands/table-context";
import { createGroupedShortcutKeymaps } from "./markdown-shortcuts";
import type { TableWidgetCallbacks, TableWidgetPosition } from "../decorations";

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
  let tableInteractionView: EditorView | null = null;
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
  const groupedShortcutKeymaps = createGroupedShortcutKeymaps(() => runtime.activeBlockState);

  const createLiveActiveBlockState = (state: EditorState): ActiveBlockState =>
    deriveInactiveBlockDecorationsState({
      source: state.doc.toString(),
      selection: createSelectionSnapshot(state),
      hasEditorFocus: runtime.hasEditorFocus,
      markdownDocumentCache,
      resolveImagePreviewUrl: options.resolveImagePreviewUrl,
      tableWidgetCallbacks,
      previousTableCursor: runtime.activeBlockState.tableCursor
    }).activeBlockState;

  const isTableCellInput = (element: Element | null): element is HTMLInputElement =>
    element instanceof HTMLInputElement && element.classList.contains("cm-table-widget-input");

  const resolvePointerSelectionAnchor = (
    view: EditorView,
    target: EventTarget | null,
    event: MouseEvent
  ): number | null => {
    const targetElement = target instanceof Element ? target : null;

    if (!targetElement || !view.dom.contains(targetElement)) {
      return null;
    }

    const lineElement = targetElement.closest(".cm-line");

    if (!(lineElement instanceof HTMLElement)) {
      return null;
    }

    if (event.clientX !== 0 || event.clientY !== 0) {
      const positionAtCoords = view.posAtCoords({
        x: event.clientX,
        y: event.clientY
      });

      if (typeof positionAtCoords === "number") {
        return positionAtCoords;
      }
    }

    try {
      return view.posAtDOM(lineElement, 0);
    } catch {
      return null;
    }
  };

  const focusTableCellInput = (view: EditorView, target: TableWidgetPosition) => {
    queueMicrotask(() => {
      const input = view.dom.querySelector<HTMLInputElement>(
        `[data-table-cell="${target.row}:${target.column}"]`
      );

      if (!input) {
        return;
      }

      if (document.activeElement !== input) {
        input.focus();
      }

      const nextOffset = Math.max(
        0,
        Math.min(target.offsetInCell ?? input.value.length, input.value.length)
      );

      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(nextOffset, nextOffset);
      }
    });
  };

  const focusTableCellFromActiveState = (view: EditorView, activeState: ActiveBlockState) => {
    const tableContext = readTableContext(view.state, activeState);

    if (!tableContext) {
      return;
    }

    focusTableCellInput(view, tableContext.position);
  };

  const selectTablePosition = (view: EditorView, position: TableWidgetPosition) =>
    runTableSelectCell(view, createLiveActiveBlockState(view.state), position);

  const syncTableInteractionFocus = (
    view: EditorView,
    nextActiveState = createLiveActiveBlockState(view.state),
    options?: { force?: boolean }
  ) => {
    const activeElement = document.activeElement;
    const focusWithinEditor = activeElement instanceof Node && view.dom.contains(activeElement);

    if (!options?.force && !focusWithinEditor && !view.hasFocus) {
      return;
    }

    if (nextActiveState.tableCursor?.mode === "inside") {
      if (!options?.force && isTableCellInput(activeElement)) {
        return;
      }

      focusTableCellFromActiveState(view, nextActiveState);
      return;
    }

    if (isTableCellInput(activeElement)) {
      view.focus();
    }
  };

  const runTableCallbackAction = (
    position: TableWidgetPosition,
    action: (view: EditorView, activeState: ActiveBlockState) => boolean,
    options?: {
      reseatSelection?: boolean;
      syncFocus?: boolean;
    }
  ) => {
    if (!tableInteractionView) {
      return;
    }

    if (options?.reseatSelection !== false) {
      selectTablePosition(tableInteractionView, position);
    }

    if (!action(tableInteractionView, createLiveActiveBlockState(tableInteractionView.state))) {
      return;
    }

    if (options?.syncFocus !== false) {
      syncTableInteractionFocus(
        tableInteractionView,
        createLiveActiveBlockState(tableInteractionView.state),
        { force: true }
      );
    }
  };

  const tableWidgetCallbacks: TableWidgetCallbacks = {
    selectCell(position, options) {
      if (!tableInteractionView) {
        return;
      }

      if (selectTablePosition(tableInteractionView, position) && options?.restoreDomFocus !== false) {
        focusTableCellInput(tableInteractionView, position);
      }
    },
    updateCell(position, text) {
      if (!tableInteractionView) {
        return;
      }

      if (
        runTableUpdateCell(
          tableInteractionView,
          createLiveActiveBlockState(tableInteractionView.state),
          position,
          text
        )
      ) {
        focusTableCellInput(tableInteractionView, position);
      }
    },
    moveToNextCell(position) {
      runTableCallbackAction(position, runTableNextCell);
    },
    moveToPreviousCell(position) {
      runTableCallbackAction(position, runTablePreviousCell);
    },
    moveUp(position) {
      runTableCallbackAction(position, runTableMoveUp);
    },
    moveDown(position) {
      runTableCallbackAction(position, runTableMoveDown);
    },
    moveLeft(position) {
      runTableCallbackAction(position, runTableMoveLeft);
    },
    moveRight(position) {
      runTableCallbackAction(position, runTableMoveRight);
    },
    moveDownOrExit(position) {
      runTableCallbackAction(position, runTableMoveDownOrExit);
    },
    insertRowBelow(position) {
      runTableCallbackAction(position, runTableInsertRowBelow);
    }
  };

  const notifyActiveBlockChange = (nextState: ActiveBlockState, force = false) => {
    const didChange =
      force ||
      runtime.activeBlockState.selection.anchor !== nextState.selection.anchor ||
      runtime.activeBlockState.selection.head !== nextState.selection.head ||
      runtime.activeBlockState.activeBlock?.id !== nextState.activeBlock?.id ||
      runtime.activeBlockState.blockMap !== nextState.blockMap ||
      runtime.activeBlockState.tableCursor?.mode !== nextState.tableCursor?.mode ||
      runtime.activeBlockState.tableCursor?.tableStartOffset !== nextState.tableCursor?.tableStartOffset ||
      runtime.activeBlockState.tableCursor?.row !== nextState.tableCursor?.row ||
      runtime.activeBlockState.tableCursor?.column !== nextState.tableCursor?.column;

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
      resolveImagePreviewUrl: options.resolveImagePreviewUrl,
      tableWidgetCallbacks,
      previousTableCursor: runtime.activeBlockState.tableCursor
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
    syncTableInteractionFocus(view, activeBlockState);
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
      tableInteractionView = view;
      view.dom.addEventListener("compositionstart", this.handleCompositionStart);
      view.dom.addEventListener("compositionupdate", this.handleCompositionStart);
      view.dom.addEventListener("compositionend", this.handleCompositionEnd);
      view.dom.addEventListener("focusin", this.handleFocusIn);
      view.dom.addEventListener("focusout", this.handleFocusOut);
      view.dom.addEventListener("mousedown", this.handleMouseDown, true);

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

    handleMouseDown = (event: MouseEvent) => {
      const activeElement = document.activeElement;
      const eventTarget = event.target instanceof Element ? event.target : null;

      if (!isTableCellInput(activeElement)) {
        return;
      }

      if (eventTarget?.closest(".cm-table-widget")) {
        return;
      }

      const nextAnchor = resolvePointerSelectionAnchor(this.view, event.target, event);

      if (nextAnchor === null) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      this.view.dispatch({
        selection: {
          anchor: nextAnchor,
          head: nextAnchor
        }
      });
      this.view.focus();
    };

    destroy() {
      if (tableInteractionView === this.view) {
        tableInteractionView = null;
      }
      this.view.dom.removeEventListener("compositionstart", this.handleCompositionStart);
      this.view.dom.removeEventListener("compositionupdate", this.handleCompositionStart);
      this.view.dom.removeEventListener("compositionend", this.handleCompositionEnd);
      this.view.dom.removeEventListener("focusin", this.handleFocusIn);
      this.view.dom.removeEventListener("focusout", this.handleFocusOut);
      this.view.dom.removeEventListener("mousedown", this.handleMouseDown, true);
    }
  });

  return [
    blockDecorationsField,
    lifecyclePlugin,
    history(),
    keymap.of([
      {
        key: "ArrowUp",
        run: (view) => {
          const handled = runMarkdownArrowUp(view, runtime.activeBlockState);

          if (handled) {
            syncTableInteractionFocus(view, createLiveActiveBlockState(view.state), { force: true });
          }

          return handled;
        }
      },
      {
        key: "ArrowDown",
        run: (view) => {
          const handled = runMarkdownArrowDown(view, runtime.activeBlockState);

          if (handled) {
            syncTableInteractionFocus(view, createLiveActiveBlockState(view.state), { force: true });
          }

          return handled;
        }
      },
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
      ...groupedShortcutKeymaps.defaultText,
      ...groupedShortcutKeymaps.tableEditing,
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
