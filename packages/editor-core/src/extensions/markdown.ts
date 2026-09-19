import {
  defaultKeymap,
  history,
  historyKeymap
} from "@codemirror/commands";
import {
  Annotation,
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  type TransactionSpec,
  type Extension
} from "@codemirror/state";
import {
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  keymap
} from "@codemirror/view";

import { planNormalizeOrderedListScopes, planPointerSelection, planTableUpdateCell, reselectEditorSemanticContext } from "@fishmark/editor-model";
import { createCanonicalSeparatorField, finishCompositionEffect, readCompositionState, readEditorStructureCache } from "@fishmark/codemirror-adapter";
import type {
  InlineASTNode,
  InlineLink,
  InlineRoot,
  BlockMap,
  ListBlock,
  ListItemBlock,
  MarkdownBlock,
  MarkdownDocument
} from "@fishmark/markdown-engine";

import {
  createActiveBlockStateFromMarkdownDocument,
  type ActiveBlockSelection,
  type ActiveBlockState
} from "../active-block";
import {
  createSemanticCommandBindings,
  planSemanticEnter,
  planSemanticBackspace,
  planSemanticDelete,
  planSemanticTab,
  planSemanticShiftTab,
  planSemanticArrow,
  type SemanticCommandBindings
} from "@fishmark/codemirror-adapter";
import {
  runListMoveLineDown,
  runListMoveLineUp,
  runMarkdownHardBreak,
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
import {
  createEditorDerivedState,
  type EditorDerivedState
} from "../derived-state/editor-derived-state";
import { deriveInactiveBlockDecorationsState } from "../derived-state/inactive-block-decorations";
import { readTableContext, type TablePosition } from "../commands/table-context";
import { createGroupedShortcutKeymaps } from "./markdown-shortcuts";
import {
  type TableWidgetCallbacks
} from "../decorations";
import { createSelectionScopedBlockDecorations } from "../decorations/block-decorations";
import {
  INACTIVE_INLINE_LINK_HREF_ATTRIBUTE,
  INACTIVE_INLINE_LINK_SELECTOR
} from "../decorations/inline-decorations";
import {
  INACTIVE_INLINE_FOOTNOTE_REFERENCE_IDENTIFIER_ATTRIBUTE,
  INACTIVE_INLINE_FOOTNOTE_REFERENCE_SELECTOR
} from "../decorations/footnote-widgets";
import { subscribeCodeHighlightParserLoaded } from "../decorations/code-highlight-language-loader";
import {
  normalizeHiddenSelectionAnchor,
  normalizeStructuralBlankSelectionAnchor
} from "../line-visibility";
import { resolveArrowUp, resolveArrowDown, resolvePointerSelectionAnchor as resolveBlockPointerSelectionAnchor } from "../interactions";
import {
  createMarkdownEditorViewModeExtension,
  getMarkdownEditorViewMode,
  setMarkdownEditorViewModeEffect,
  type EditorViewMode
} from "../editor-view-mode";

export type ParseMarkdownDocument = (source: string) => MarkdownDocument;
export type ParseOrderedListNormalizationBlockMap = (source: string) => BlockMap;

export type CreateFishMarkMarkdownExtensionsOptions = {
  parseMarkdownDocument?: ParseMarkdownDocument;
  parseOrderedListNormalizationBlockMap?: ParseOrderedListNormalizationBlockMap;
  readAcknowledgedRevision?: () => number | null;
  readObservedRevision?: () => number | null;
  // The host receives the bound semantic command surface so its own command API (menu, toolbar,
  // test driver, controller press helpers) runs the same decisions as the keymap.
  onSemanticCommands?: (commands: SemanticCommandBindings) => void;
  onContentChange: (doc: string) => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
  onBlockDecorationsBuilt?: () => void;
  onBlur?: () => void;
  onOpenLink?: (href: string) => void;
  resolveImagePreviewUrl?: (href: string | null) => string | null;
  viewMode?: EditorViewMode;
};

type MarkdownExtensionRuntime = {
  activeBlockState: ActiveBlockState;
  editorDerivedState: EditorDerivedState;
  blockDecorationSignature: string;
  hasEditorFocus: boolean;
  hasPendingDerivedStateFlush: boolean;
};

const createSelectionSnapshot = (state: EditorState): ActiveBlockSelection => ({
  anchor: state.selection.main.anchor,
  head: state.selection.main.head
});

const forceRefreshMarkdownDecorationsEffect = StateEffect.define<null>();
const orderedListNormalizationAnnotation = Annotation.define<boolean>();
const hiddenMarkerSelectionNormalizationAnnotation = Annotation.define<boolean>();
const structuralNavigationSelectionNormalizationAnnotation = Annotation.define<boolean>();
const blockPointerDragThresholdPx = 3;

export function createFishMarkMarkdownExtensions(
  options: CreateFishMarkMarkdownExtensionsOptions
): Extension[] {
  const parseMarkdownDocument = options.parseMarkdownDocument;

  if (!parseMarkdownDocument) {
    throw new Error(
      "createFishMarkMarkdownExtensions requires parseMarkdownDocument"
    );
  }

  const markdownDocumentCache = createMarkdownDocumentCache(parseMarkdownDocument);
  const initialSelection = {
    anchor: 0,
    head: 0
  };
  const initialEditorDerivedState = createEditorDerivedState({
    source: "",
    selection: initialSelection,
    parseMarkdownDocument: markdownDocumentCache.read
  });
  let tableInteractionView: EditorView | null = null;
  let pendingTableComposition: { position: TablePosition; text: string; source: string; generation: number } | null = null;
  const runtime: MarkdownExtensionRuntime = {
    activeBlockState: initialEditorDerivedState.activeBlockState,
    editorDerivedState: initialEditorDerivedState,
    blockDecorationSignature: "",
    hasEditorFocus: false,
    hasPendingDerivedStateFlush: false
  };

  const setBlockDecorationsEffect = StateEffect.define<DecorationSet>();
  const groupedShortcutKeymaps = createGroupedShortcutKeymaps(() => runtime.activeBlockState);
  const canOpenExternalLink = typeof options.onOpenLink === "function";

  // Every command uses the model. The host observes the final transaction for transport, including
  // normalizations and native input; requesting this surface does not opt into a different engine.
  const semanticCommands = createSemanticCommandBindings({
        ...(options.readAcknowledgedRevision === undefined
          ? {}
          : { readAcknowledgedRevision: options.readAcknowledgedRevision }),
        ...(options.readObservedRevision === undefined
          ? {}
          : { readObservedRevision: options.readObservedRevision })
      });

  if (semanticCommands !== null) {
    options.onSemanticCommands?.(semanticCommands);
  }

  const readStateMarkdownDocument = (state: EditorState): MarkdownDocument => {
    const cache = readEditorStructureCache(state);
    return markdownDocumentCache.readTree(cache.tree);
  };

  const createLiveEditorDerivedState = (state: EditorState): EditorDerivedState => {
    const markdownDocument = readStateMarkdownDocument(state);
    return createEditorDerivedState({
      source: readEditorStructureCache(state).source,
      selection: createSelectionSnapshot(state),
      parseMarkdownDocument: () => markdownDocument,
      previousTableCursor: runtime.activeBlockState.tableCursor
    });
  };

  const createLiveActiveBlockState = (state: EditorState): ActiveBlockState =>
    createLiveEditorDerivedState(state).activeBlockState;

  const isTableCellEditor = (element: Element | null): element is HTMLElement =>
    element instanceof HTMLElement && element.classList.contains("cm-table-widget-input");

  const resolveFallbackPointerSelectionAnchor = (
    view: EditorView,
    target: EventTarget | null,
    event: MouseEvent
  ): number | null => {
    const targetElement = target instanceof Element ? target : null;

    if (!targetElement || !view.dom.contains(targetElement)) {
      return null;
    }

    const lineElement = targetElement.closest(".cm-line");
    const hasPointerCoordinates = event.clientX !== 0 || event.clientY !== 0;

    if (hasPointerCoordinates && !isBlankTableSideGutterClick(view, lineElement, event.clientY)) {
      const positionAtCoords = view.posAtCoords({
        x: event.clientX,
        y: event.clientY
      });

      if (typeof positionAtCoords === "number") {
        return positionAtCoords;
      }
    }

    if (!(lineElement instanceof HTMLElement)) {
      return null;
    }

    try {
      return view.posAtDOM(lineElement, 0);
    } catch {
      return null;
    }
  };

  const isBlankTableSideGutterClick = (
    view: EditorView,
    lineElement: Element | null,
    clientY: number
  ): boolean => {
    if (lineElement) {
      return false;
    }

    return Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-table-widget")).some((table) => {
      const rect = table.getBoundingClientRect();

      return clientY >= rect.top && clientY <= rect.bottom;
    });
  };

  const focusTableCellEditor = (
    view: EditorView,
    target: TablePosition,
    options?: { restoreSelection?: boolean }
  ) => {
    queueMicrotask(() => {
      const liveActiveState = createLiveActiveBlockState(view.state);
      const liveCursor = liveActiveState.tableCursor;

      if (
        liveCursor?.mode !== "inside" ||
        liveCursor.tableStartOffset !== target.tableStartOffset ||
        liveCursor.row !== target.row ||
        liveCursor.column !== target.column
      ) {
        return;
      }

      const editor = findTableCellEditor(view, liveCursor);

      if (!editor) {
        return;
      }

      const contentLength = readTableCellText(editor).length;
      const nextOffset = Math.max(
        0,
        Math.min(liveCursor.offsetInCell ?? target.offsetInCell ?? contentLength, contentLength)
      );

      const shouldRestoreSelection = options?.restoreSelection !== false || document.activeElement !== editor;

      if (shouldRestoreSelection) {
        setTableCellSelection(editor, nextOffset);
        editor.focus({ preventScroll: true });
        setTableCellSelection(editor, nextOffset);
      }

      scheduleTableCellIntoEditorScroller(view, editor);
    });
  };

  const scheduleTableCellIntoEditorScroller = (view: EditorView, editor: HTMLElement) => {
    scrollTableCellIntoEditorScroller(view, editor);

    const frame = editor.ownerDocument.defaultView?.requestAnimationFrame;
    if (!frame) {
      return;
    }

    frame(() => {
      if (editor.isConnected) {
        scrollTableCellIntoEditorScroller(view, editor);
      }
    });
  };

  const scrollTableCellIntoEditorScroller = (view: EditorView, editor: HTMLElement) => {
    const scroller = editor.closest<HTMLElement>(".cm-scroller");

    if (!scroller) {
      return;
    }

    scrollElementIntoScroller(
      scroller,
      editor.getBoundingClientRect(),
      scroller.getBoundingClientRect()
    );

    view.requestMeasure({
      read: () => ({
        editorRect: editor.getBoundingClientRect(),
        scrollerRect: scroller.getBoundingClientRect()
      }),
      write: ({ editorRect, scrollerRect }) => {
        scrollElementIntoScroller(scroller, editorRect, scrollerRect);
      }
    });
  };

  const scrollElementIntoScroller = (
    scroller: HTMLElement,
    editorRect: DOMRect,
    scrollerRect: DOMRect
  ) => {
    let deltaTop = 0;
    let deltaLeft = 0;

    if (editorRect.top < scrollerRect.top) {
      deltaTop = editorRect.top - scrollerRect.top;
    } else if (editorRect.bottom > scrollerRect.bottom) {
      deltaTop = editorRect.bottom - scrollerRect.bottom;
    }

    if (editorRect.left < scrollerRect.left) {
      deltaLeft = editorRect.left - scrollerRect.left;
    } else if (editorRect.right > scrollerRect.right) {
      deltaLeft = editorRect.right - scrollerRect.right;
    }

    if (deltaTop !== 0) {
      scroller.scrollTop = Math.max(0, scroller.scrollTop + deltaTop);
    }

    if (deltaLeft !== 0) {
      scroller.scrollLeft = Math.max(0, scroller.scrollLeft + deltaLeft);
    }
  };

  const findTableCellEditor = (view: EditorView, target: Required<TablePosition>): HTMLElement | null => {
    const tableRoot = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-table-widget")).find(
      (root) => root.dataset.tableStartOffset === String(target.tableStartOffset)
    );

    return tableRoot?.querySelector<HTMLElement>(
      `[data-table-cell="${target.row}:${target.column}"]`
    ) ?? null;
  };

  const readTableCellText = (editor: HTMLElement) => editor.textContent ?? "";

  const setTableCellSelection = (editor: HTMLElement, offset: number) => {
    const documentSelection = editor.ownerDocument.getSelection();

    if (!documentSelection) {
      return;
    }

    const contentLength = readTableCellText(editor).length;
    const clampedOffset = Math.max(0, Math.min(offset, contentLength));
    const { node, nodeOffset } = resolveTableCellSelectionTarget(editor, clampedOffset);
    const range = editor.ownerDocument.createRange();

    range.setStart(node, nodeOffset);
    range.collapse(true);
    documentSelection.removeAllRanges();
    documentSelection.addRange(range);
  };

  const resolveTableCellSelectionTarget = (
    editor: HTMLElement,
    offset: number
  ): { node: Node; nodeOffset: number } => {
    const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let consumed = 0;
    let currentNode = walker.nextNode();

    while (currentNode) {
      const textLength = currentNode.textContent?.length ?? 0;

      if (consumed + textLength >= offset) {
        return {
          node: currentNode,
          nodeOffset: offset - consumed
        };
      }

      consumed += textLength;
      currentNode = walker.nextNode();
    }

    return {
      node: editor,
      nodeOffset: editor.childNodes.length
    };
  };

  const focusTableCellFromActiveState = (view: EditorView, activeState: ActiveBlockState) => {
    const tableContext = readTableContext(view.state, activeState);

    if (!tableContext) {
      return;
    }

    focusTableCellEditor(view, tableContext.position);
  };

  const selectTablePosition = (view: EditorView, position: TablePosition) =>
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
      if (!options?.force && isTableCellEditor(activeElement)) {
        return;
      }

      focusTableCellFromActiveState(view, nextActiveState);
      return;
    }

    if (isTableCellEditor(activeElement)) {
      view.focus();
    }
  };

  const runTableCallbackAction = (
    position: TablePosition,
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

      if (!selectTablePosition(tableInteractionView, position)) {
        return;
      }

      if (options?.restoreDomFocus !== false) {
        syncTableInteractionFocus(
          tableInteractionView,
          createLiveActiveBlockState(tableInteractionView.state),
          { force: true }
        );
      } else {
        focusTableCellEditor(tableInteractionView, position, { restoreSelection: false });
      }
    },
    updateCell(position, text) {
      if (!tableInteractionView) {
        return;
      }
      if (readCompositionState(tableInteractionView.state).active) {
        const session = semanticCommands.adapter.readSession(tableInteractionView.state);
        if (session !== null) pendingTableComposition = { position, text,
          source: tableInteractionView.state.doc.toString(), generation: session.generation };
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
        focusTableCellEditor(tableInteractionView, position);
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

  const createDecoratedDerivedState = (
    editorDerivedState: EditorDerivedState,
    state: EditorState
  ) => {
    const viewMode = getMarkdownEditorViewMode(state);
    const inactiveBlockDecorationsState = deriveInactiveBlockDecorationsState({
      source: editorDerivedState.source,
      selection: editorDerivedState.selection,
      hasEditorFocus: runtime.hasEditorFocus,
      editorDerivedState,
      resolveImagePreviewUrl: options.resolveImagePreviewUrl,
      tableWidgetCallbacks,
      viewMode
    });

    options.onBlockDecorationsBuilt?.();

    return {
      ...inactiveBlockDecorationsState,
      editorDerivedState
    };
  };

  const createDerivedState = (state: EditorState) =>
    createDecoratedDerivedState(createLiveEditorDerivedState(state), state);

  const blockDecorationsField = StateField.define<DecorationSet>({
    create(state) {
      const { activeBlockState, decorationSet, editorDerivedState, signature } = createDerivedState(state);

      runtime.activeBlockState = activeBlockState;
      runtime.editorDerivedState = editorDerivedState;
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
  const whitespaceInputHandler = EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to || text.trim().length > 0 || /[\r\n]/u.test(text)) {
      return false;
    }

    const line = view.state.doc.lineAt(from);

    if (from < line.from || from > line.to || line.text.trim().length > 0) {
      return false;
    }

    const anchor = from + text.length;

    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor, head: anchor },
      userEvent: "input.type"
    });

    return true;
  });

  const applyBlockDecorations = (
    view: EditorView,
    decorationSet: DecorationSet,
    signature: string,
    force = false,
    effects: readonly StateEffect<unknown>[] = []
  ) => {
    if (!force && signature === runtime.blockDecorationSignature) {
      return;
    }

    runtime.blockDecorationSignature = signature;
    view.dispatch({
      effects: [...effects, setBlockDecorationsEffect.of(decorationSet)]
    });
  };

  const recomputeDerivedState = (
    view: EditorView,
    state: EditorState,
    recomputeOptions: boolean | { force?: boolean; reuseMappedDecorations?: boolean } = false,
    effects: readonly StateEffect<unknown>[] = []
  ) => {
    const force = typeof recomputeOptions === "boolean" ? recomputeOptions : recomputeOptions.force === true;
    const reuseMappedDecorations =
      typeof recomputeOptions === "object" && recomputeOptions.reuseMappedDecorations === true;
    const editorDerivedState = createLiveEditorDerivedState(state);

    if (!force && reuseMappedDecorations && runtime.editorDerivedState.source === editorDerivedState.source) {
      const scopedDecorations = createSelectionScopedBlockDecorations({
        baseDecorationSet: state.field(blockDecorationsField),
        previousActiveBlockState: runtime.editorDerivedState.activeBlockState,
        previousActiveLine: runtime.editorDerivedState.activeLine,
        activeBlockState: editorDerivedState.activeBlockState,
        activeLine: editorDerivedState.activeLine,
        editingDocument: editorDerivedState.editingDocument,
        hasEditorFocus: runtime.hasEditorFocus,
        source: editorDerivedState.source,
        referenceDefinitions: editorDerivedState.referenceDefinitions,
        resolveImagePreviewUrl: options.resolveImagePreviewUrl,
        tableWidgetCallbacks,
        viewMode: getMarkdownEditorViewMode(state)
      });

      runtime.editorDerivedState = editorDerivedState;
      notifyActiveBlockChange(editorDerivedState.activeBlockState);
      if (scopedDecorations.didUpdateDecorations) {
        applyBlockDecorations(
          view,
          scopedDecorations.decorationSet,
          scopedDecorations.signature,
          true
        );
      } else {
        runtime.blockDecorationSignature = scopedDecorations.signature;
      }
      syncTableInteractionFocus(view, editorDerivedState.activeBlockState);
      return;
    }

    const { activeBlockState, decorationSet, signature } = createDecoratedDerivedState(
      editorDerivedState,
      state
    );

    runtime.editorDerivedState = editorDerivedState;
    notifyActiveBlockChange(activeBlockState, force);
    applyBlockDecorations(view, decorationSet, signature, force, effects);
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

  const openHref = (href: string | null | undefined): boolean => {
    if (!canOpenExternalLink || !href) {
      return false;
    }

    options.onOpenLink?.(href);
    return true;
  };

  const openLinkAtSelection = (view: EditorView): boolean => {
    const link = findLinkAtOffset(
      markdownDocumentCache.read(view.state.doc.toString()),
      view.state.selection.main.head
    );

    return openHref(link?.href);
  };

  const resolveInactiveLinkTarget = (event: MouseEvent): HTMLElement | null => {
    const targetElement = event.target instanceof Element ? event.target : null;

    if (!targetElement || event.button !== 0 || (!event.ctrlKey && !event.metaKey)) {
      return null;
    }

    const linkElement = targetElement.closest<HTMLElement>(INACTIVE_INLINE_LINK_SELECTOR);

    return linkElement instanceof HTMLElement ? linkElement : null;
  };

  const resolveInactiveFootnoteReferenceTarget = (event: MouseEvent): HTMLElement | null => {
    const targetElement = event.target instanceof Element ? event.target : null;

    if (!targetElement || event.button !== 0 || (!event.ctrlKey && !event.metaKey)) {
      return null;
    }

    const referenceElement = targetElement.closest<HTMLElement>(INACTIVE_INLINE_FOOTNOTE_REFERENCE_SELECTOR);

    return referenceElement instanceof HTMLElement ? referenceElement : null;
  };

  const jumpToFootnoteDefinition = (view: EditorView, identifier: string | null | undefined): boolean => {
    if (!identifier) {
      return false;
    }

    const footnoteDefinition = markdownDocumentCache
      .read(view.state.doc.toString())
      .footnoteDefinitions?.get(identifier);

    if (!footnoteDefinition) {
      return false;
    }

    const anchor = footnoteDefinition.contentStartOffset;

    view.dispatch({
      selection: {
        anchor,
        head: anchor
      },
      effects: EditorView.scrollIntoView(anchor, {
        y: "center",
        yMargin: 24
      })
    });
    view.focus();
    return true;
  };

  const lifecyclePlugin = ViewPlugin.fromClass(class {
    view: EditorView;
    compositionFinishTimer: ReturnType<typeof setTimeout> | null = null;
    compositionBaseSource: string | null = null;
    compositionGeneration: number | null = null;
    stopBlockPointerDragSelection: (() => void) | null = null;
    unsubscribeCodeHighlightParserLoaded: () => void;

    constructor(view: EditorView) {
      this.view = view;
      tableInteractionView = view;
      // The adapter owns one document structure cache per view; the semantic session starts with
      // the view that hosts it.
      semanticCommands?.bindSession(view);
      this.unsubscribeCodeHighlightParserLoaded = subscribeCodeHighlightParserLoaded(() => {
        this.view.dispatch({
          effects: forceRefreshMarkdownDecorationsEffect.of(null)
        });
      });
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
      if (this.compositionFinishTimer !== null) {
        clearTimeout(this.compositionFinishTimer);
        this.compositionFinishTimer = null;
      }
      if (!readCompositionState(this.view.state).active) {
        this.compositionBaseSource = this.view.state.doc.toString();
        this.compositionGeneration = semanticCommands.adapter.readSession(this.view.state)?.generation ?? null;
        pendingTableComposition = null;
        this.view.dispatch({ effects: semanticCommands.adapter.startComposition(this.view.state) });
      }
    };

    update(update: ViewUpdate) {
      if (update.transactions.some((transaction) => readCompositionState(transaction.startState).active &&
          !readCompositionState(transaction.state).active &&
          !transaction.effects.some((effect) => effect.is(finishCompositionEffect)))) {
        if (this.compositionFinishTimer !== null) clearTimeout(this.compositionFinishTimer);
        this.compositionFinishTimer = null;
        this.compositionBaseSource = null;
        this.compositionGeneration = null;
        pendingTableComposition = null;
      }
    }

    handleCompositionEnd = () => {
      // Browsers may deliver the final native input after compositionend. Keep
      // provisional text protected through that event turn, then finalize once.
      if (this.compositionFinishTimer !== null) clearTimeout(this.compositionFinishTimer);
      this.compositionFinishTimer = setTimeout(this.finishComposition, 0);
    };

    finishComposition = () => {
      this.compositionFinishTimer = null;
      const completion = semanticCommands.adapter.finishComposition(this.view.state);
      const originalState = this.view.state;
      const generation = semanticCommands.adapter.readSession(originalState)?.generation ?? null;
      const pendingTable = pendingTableComposition;
      pendingTableComposition = null;
      const before = generation === this.compositionGeneration ? this.compositionBaseSource : null;
      this.compositionBaseSource = null;
      this.compositionGeneration = null;
      let finalState = originalState;
      let changes = originalState.changes([]);
      let appliedTable = false;
      if (pendingTable !== null && pendingTable.generation === generation && pendingTable.source === originalState.doc.toString()) {
        const context = semanticCommands.adapter.readSemanticContext(originalState);
        const offset = pendingTable.position.tableStartOffset;
        const tableContext = offset === undefined ? context : reselectEditorSemanticContext(context, { anchor: offset, head: offset });
        const plan = planTableUpdateCell(tableContext, pendingTable.position, pendingTable.text);
        if (plan !== null) {
          const candidate = originalState.update({ changes: plan.edits, selection: plan.selection, filter: false });
          finalState = candidate.state;
          changes = candidate.changes;
          appliedTable = true;
        }
      }
      const source = finalState.doc.toString();
      let normalization = null;
      if (before !== null && before !== source) {
        let from = 0;
        while (from < before.length && from < source.length && before[from] === source[from]) from += 1;
        let oldEnd = before.length;
        let to = source.length;
        while (oldEnd > from && to > from && before[oldEnd - 1] === source[to - 1]) { oldEnd -= 1; to -= 1; }
        normalization = planNormalizeOrderedListScopes(semanticCommands.adapter.readSemanticContext(finalState), {
          changedRanges: [{ from, to }]
        });
      }
      if (normalization !== null) {
        const candidate = finalState.update({ changes: normalization.edits, selection: normalization.selection, filter: false });
        changes = changes.compose(candidate.changes);
        finalState = candidate.state;
      }
      // Finish and normalization share one transaction so canonical geometry
      // rebuilds once from final text; the host retains normal frame ownership.
      this.view.dispatch({
        effects: completion.effects,
        ...(changes.empty ? {} : { changes, selection: finalState.selection,
          annotations: orderedListNormalizationAnnotation.of(true), userEvent: "input.normalize" }),
        filter: false
      });

      if (!runtime.hasPendingDerivedStateFlush) {
        return;
      }

      runtime.hasPendingDerivedStateFlush = false;
      recomputeDerivedState(this.view, this.view.state, true);
      if (appliedTable && pendingTable !== null) focusTableCellEditor(this.view, pendingTable.position);
    };

    handleFocusIn = () => {
      if (runtime.hasEditorFocus) {
        return;
      }

      runtime.hasEditorFocus = true;
      recomputeDerivedState(this.view, this.view.state, true);
    };

    handleFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget;

      if (nextTarget instanceof Node && this.view.dom.contains(nextTarget)) {
        return;
      }

      syncBlurDecorations(this.view);
      options.onBlur?.();
    };

    resolvePointerSelectionHead = (event: MouseEvent): number | null => {
      const interactionAnchor = getMarkdownEditorViewMode(this.view.state) === "source"
        ? null
        : resolveBlockPointerSelectionAnchor(this.view, runtime.activeBlockState, event);

      if (interactionAnchor !== null) {
        return interactionAnchor;
      }

      const positionAtCoords = this.view.posAtCoords({
        x: event.clientX,
        y: event.clientY
      });

      return typeof positionAtCoords === "number" ? positionAtCoords : null;
    };

    startBlockPointerDragSelection = (event: MouseEvent, anchor: number) => {
      this.stopBlockPointerDragSelection?.();

      const ownerDocument = this.view.dom.ownerDocument;
      const originX = event.clientX;
      const originY = event.clientY;
      let hasDragged = false;

      const dispatchSelection = (head: number) => {
        this.view.dispatch({
          selection: {
            anchor,
            head
          }
        });
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const movedDistance = Math.hypot(moveEvent.clientX - originX, moveEvent.clientY - originY);

        if (!hasDragged && movedDistance < blockPointerDragThresholdPx) {
          return;
        }

        hasDragged = true;
        const head = this.resolvePointerSelectionHead(moveEvent);

        if (head !== null) {
          moveEvent.preventDefault();
          dispatchSelection(head);
        }
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        if (hasDragged) {
          const head = this.resolvePointerSelectionHead(upEvent);

          if (head !== null) {
            upEvent.preventDefault();
            dispatchSelection(head);
          }
        }

        this.stopBlockPointerDragSelection?.();
      };

      this.stopBlockPointerDragSelection = () => {
        ownerDocument.removeEventListener("mousemove", handleMouseMove, true);
        ownerDocument.removeEventListener("mouseup", handleMouseUp, true);
        this.stopBlockPointerDragSelection = null;
      };

      ownerDocument.addEventListener("mousemove", handleMouseMove, true);
      ownerDocument.addEventListener("mouseup", handleMouseUp, true);
    };

    handleMouseDown = (event: MouseEvent) => {
      const inactiveLinkTarget = resolveInactiveLinkTarget(event);

      if (inactiveLinkTarget) {
        const href = inactiveLinkTarget.getAttribute(INACTIVE_INLINE_LINK_HREF_ATTRIBUTE);

        if (openHref(href)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      const inactiveFootnoteReferenceTarget = resolveInactiveFootnoteReferenceTarget(event);

      if (inactiveFootnoteReferenceTarget) {
        const identifier = inactiveFootnoteReferenceTarget.getAttribute(
          INACTIVE_INLINE_FOOTNOTE_REFERENCE_IDENTIFIER_ATTRIBUTE
        );

        if (jumpToFootnoteDefinition(this.view, identifier)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      const interactionAnchor = getMarkdownEditorViewMode(this.view.state) === "source"
        ? null
        : resolveBlockPointerSelectionAnchor(this.view, runtime.activeBlockState, event);

      if (interactionAnchor !== null) {
        event.preventDefault();
        this.view.dispatch({
          selection: {
            anchor: interactionAnchor,
            head: interactionAnchor
          }
        });
        this.view.focus();
        this.startBlockPointerDragSelection(event, interactionAnchor);
        return;
      }

      const activeElement = document.activeElement;
      const eventTarget = event.target instanceof Element ? event.target : null;

      if (!isTableCellEditor(activeElement)) {
        return;
      }

      if (eventTarget?.closest(".cm-table-widget")) {
        return;
      }

      const nextAnchor = resolveFallbackPointerSelectionAnchor(this.view, event.target, event);

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
      if (this.compositionFinishTimer !== null) clearTimeout(this.compositionFinishTimer);
      pendingTableComposition = null;
      semanticCommands.releaseSession();
      if (tableInteractionView === this.view) {
        tableInteractionView = null;
      }
      this.view.dom.removeEventListener("compositionstart", this.handleCompositionStart);
      this.view.dom.removeEventListener("compositionupdate", this.handleCompositionStart);
      this.view.dom.removeEventListener("compositionend", this.handleCompositionEnd);
      this.view.dom.removeEventListener("focusin", this.handleFocusIn);
      this.view.dom.removeEventListener("focusout", this.handleFocusOut);
      this.view.dom.removeEventListener("mousedown", this.handleMouseDown, true);
      this.stopBlockPointerDragSelection?.();
      this.unsubscribeCodeHighlightParserLoaded();
    }
  });

  return [
    ...(semanticCommands === null ? [] : [semanticCommands.adapter.extension()]),
    createMarkdownEditorViewModeExtension(options.viewMode),
    blockDecorationsField,
    createCanonicalSeparatorField(getMarkdownEditorViewMode),
    lifecyclePlugin,
    whitespaceInputHandler,
    EditorState.transactionFilter.of((transaction) => {
      if (readCompositionState(transaction.startState).active ||
          transaction.isUserEvent("input.type.compose")) return transaction;
      const whitespaceInputSelection = createWhitespaceInputSelectionTransaction(transaction);

      if (whitespaceInputSelection) {
        return whitespaceInputSelection;
      }

      const detachedListBlankLineInsert = createDetachedListBlankLineInsertTransaction(
        transaction,
        { read: () => readStateMarkdownDocument(transaction.startState) }
      );

      if (detachedListBlankLineInsert) {
        return detachedListBlankLineInsert;
      }

      const shouldNormalizeOrderedLists =
        transaction.docChanged && !transaction.annotation(orderedListNormalizationAnnotation);
      const isSourceMode = getMarkdownEditorViewMode(transaction.startState) === "source";
      const shouldNormalizeHiddenSelection =
        !isSourceMode && shouldNormalizeHiddenMarkerSelection(transaction);
      const shouldNormalizeStructuralNavigation =
        !isSourceMode && shouldNormalizeStructuralNavigationSelection(transaction);

      if (!shouldNormalizeOrderedLists && !shouldNormalizeHiddenSelection && !shouldNormalizeStructuralNavigation) {
        return transaction;
      }

      let effectiveSource = transaction.newDoc.toString();
      let effectiveState = transaction.state;
      let effectiveAnchor = transaction.newSelection.main.anchor;
      let effectiveHead = transaction.newSelection.main.head;
      const followUpTransactions: TransactionSpec[] = [];

      if (shouldNormalizeOrderedLists) {
        const normalization = planNormalizeOrderedListScopes(semanticCommands.adapter.readSemanticContext(transaction.state), {
          changedRanges: readTransactionChangedRanges(transaction)
        });

        if (normalization) {
          const normalized = transaction.state.update({ changes: normalization.edits, filter: false });
          effectiveState = normalized.state;
          effectiveSource = normalized.newDoc.toString();
          effectiveAnchor = normalization.selection.anchor;
          effectiveHead = normalization.selection.head;
          followUpTransactions.push({
            changes: normalization.edits,
            selection: {
              anchor: effectiveAnchor,
              head: effectiveHead
            },
            annotations: orderedListNormalizationAnnotation.of(true),
            sequential: true
          });
        }
      }

      if (
        (shouldNormalizeHiddenSelection || shouldNormalizeStructuralNavigation) &&
        effectiveAnchor === effectiveHead &&
        transaction.annotation(Transaction.userEvent) !== "delete.list-marker"
      ) {
        const markdownDocument = readStateMarkdownDocument(effectiveState);
        const previousAnchor = transaction.startState.selection.main.anchor;
        const anchorDelta = effectiveAnchor - previousAnchor;
        const userEvent = transaction.annotation(Transaction.userEvent);
        // Only use direction-aware normalization for single-step keyboard navigation
        // (e.g. arrow keys). Programmatic jumps and mouse clicks use direction=0 so
        // hidden close markers still snap to their left edge as expected.
        const navigationDirection =
          userEvent === "select" && Math.abs(anchorDelta) <= 2
            ? Math.sign(anchorDelta)
            : 0;
        let nextAnchor = effectiveAnchor;
        const shouldPreserveListExitBlankSelection = userEvent === "input.list-exit";

        if (shouldNormalizeStructuralNavigation && !shouldPreserveListExitBlankSelection) {
          nextAnchor =
            normalizeStructuralBlankSelectionAnchor(
              effectiveSource,
              markdownDocument,
              nextAnchor,
              navigationDirection
            ) ?? nextAnchor;
        }

        if (shouldNormalizeHiddenSelection) {
          nextAnchor =
            normalizeHiddenSelectionAnchor(
              effectiveSource,
              createActiveBlockStateFromMarkdownDocument(markdownDocument, {
                anchor: nextAnchor,
                head: nextAnchor
              }).activeBlock,
              nextAnchor,
              navigationDirection
            ) ?? nextAnchor;
        }

        if (nextAnchor !== effectiveAnchor) {
          followUpTransactions.push({
            selection: {
              anchor: nextAnchor,
              head: nextAnchor
            },
            annotations: [
              hiddenMarkerSelectionNormalizationAnnotation.of(true),
              structuralNavigationSelectionNormalizationAnnotation.of(true)
            ],
            sequential: true
          });
        }
      }

      if (followUpTransactions.length === 0) {
        return transaction;
      }

      const userEvent = transaction.annotation(Transaction.userEvent);
      const addToHistory = transaction.annotation(Transaction.addToHistory);

      return [
        {
          changes: transaction.changes,
          selection: transaction.selection ?? undefined,
          effects: transaction.effects,
          annotations: addToHistory === undefined ? undefined : Transaction.addToHistory.of(addToHistory),
          userEvent,
          scrollIntoView: transaction.scrollIntoView
        },
        ...followUpTransactions
      ];
    }),
    history(),
    keymap.of([
      {
        key: "Mod-Enter",
        run: (view) => openLinkAtSelection(view)
      },
      {
        key: "ArrowUp",
        run: (view) => {
          const target = resolveArrowUp(view, runtime.activeBlockState);
          const handled = semanticCommands.run(view, target === null ? planSemanticArrow("up") :
            (context) => planPointerSelection(context, target.anchor)) !== "unhandled";

          if (handled) {
            syncTableInteractionFocus(view, createLiveActiveBlockState(view.state), { force: true });
          }

          return handled;
        }
      },
      {
        key: "ArrowDown",
        run: (view) => {
          const target = resolveArrowDown(view, runtime.activeBlockState);
          const handled = semanticCommands.run(view, target === null ? planSemanticArrow("down") :
            (context) => planPointerSelection(context, target.anchor)) !== "unhandled";

          if (handled) {
            syncTableInteractionFocus(view, createLiveActiveBlockState(view.state), { force: true });
          }

          return handled;
        }
      },
      {
        key: "Backspace",
        run: (view) => semanticCommands.run(view, planSemanticBackspace) !== "unhandled"
      },
      {
        key: "Delete",
        run: (view) => semanticCommands.run(view, planSemanticDelete) !== "unhandled"
      },
      {
        key: "Shift-Enter",
        run: (view) => runMarkdownHardBreak(view)
      },
      {
        key: "Enter",
        run: (view) => semanticCommands.run(view, planSemanticEnter) !== "unhandled"
      },
      {
        key: "Tab",
        run: (view) => semanticCommands.run(view, planSemanticTab) !== "unhandled"
      },
      {
        key: "Shift-Tab",
        run: (view) => semanticCommands.run(view, planSemanticShiftTab) !== "unhandled"
      },
      {
        key: "Alt-ArrowUp",
        run: (view) => runListMoveLineUp(view, runtime.activeBlockState)
      },
      {
        key: "Alt-ArrowDown",
        run: (view) => runListMoveLineDown(view, runtime.activeBlockState)
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
      const didChangeViewMode = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(setMarkdownEditorViewModeEffect))
      );
      const shouldRefreshDecorations = shouldForceRefresh || didChangeViewMode;

      if (update.docChanged) {
        options.onContentChange(update.state.doc.toString());
      }

      if (!update.docChanged && !update.selectionSet && !shouldRefreshDecorations) {
        return;
      }

      if (readCompositionState(update.state).active || update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(finishCompositionEffect)))) {
        runtime.hasPendingDerivedStateFlush = true;
        return;
      }

      const whitespaceInputSelectionAnchor = resolveWhitespaceInputSelectionAnchor(
        update.transactions,
        update.state.selection.main
      );

      if (whitespaceInputSelectionAnchor !== null) {
        update.view.dispatch({
          selection: {
            anchor: whitespaceInputSelectionAnchor,
            head: whitespaceInputSelectionAnchor
          }
        });
        return;
      }

      if (shouldRefreshDecorations) {
        recomputeDerivedState(update.view, update.state, true);
        return;
      }

      recomputeDerivedState(update.view, update.state, {
        reuseMappedDecorations: !update.docChanged && update.selectionSet
      });
    })
  ];
}

function isTypingOrCompositionInputTransaction(transaction: Transaction): boolean {
  const userEvent = transaction.annotation(Transaction.userEvent);

  if (!transaction.docChanged || !userEvent?.startsWith("input.type")) {
    return false;
  }

  const insertion = readSinglePlainTextInsertion(transaction);

  return insertion !== null && insertion.text.length > 0 && !/[\r\n]/u.test(insertion.text);
}

function shouldNormalizeHiddenMarkerSelection(transaction: Transaction): boolean {
  return (
    (transaction.docChanged || transaction.selection !== undefined) &&
    !transaction.annotation(hiddenMarkerSelectionNormalizationAnnotation) &&
    !isTypingOrCompositionInputTransaction(transaction)
  );
}

function shouldNormalizeStructuralNavigationSelection(transaction: Transaction): boolean {
  return (
    !transaction.docChanged &&
    transaction.selection !== undefined &&
    !transaction.annotation(structuralNavigationSelectionNormalizationAnnotation)
  );
}
function readTransactionChangedRanges(
  transaction: Transaction
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];

  transaction.changes.iterChanges((_fromA, _toA, fromB, toB) => {
    ranges.push({ from: fromB, to: toB });
  });

  return ranges;
}

function resolveWhitespaceInputSelectionAnchor(
  transactions: readonly Transaction[],
  currentSelection: ActiveBlockSelection
): number | null {
  for (const transaction of transactions) {
    if (!transaction.docChanged || !transaction.startState.selection.main.empty) {
      continue;
    }

    const insertion = readSinglePlainTextInsertion(transaction);

    if (!insertion || insertion.text.trim().length > 0 || /[\r\n]/u.test(insertion.text)) {
      continue;
    }

    const selection = transaction.startState.selection.main;
    const line = transaction.startState.doc.lineAt(selection.from);

    if (
      insertion.from !== selection.from ||
      selection.from < line.from ||
      selection.from > line.to ||
      line.text.trim().length > 0 ||
      currentSelection.anchor !== insertion.from ||
      currentSelection.head !== insertion.from
    ) {
      continue;
    }

    return insertion.from + insertion.text.length;
  }

  return null;
}

function createDetachedListBlankLineInsertTransaction(
  transaction: Transaction,
  markdownDocumentCache: { read: (source: string) => MarkdownDocument }
): TransactionSpec | null {
  if (!transaction.docChanged || !transaction.startState.selection.main.empty) {
    return null;
  }

  const insertion = readSinglePlainTextInsertion(transaction);

  if (!insertion || insertion.text.trim().length === 0 || /[\r\n]/u.test(insertion.text)) {
    return null;
  }

  const source = transaction.startState.doc.toString();
  const selection = transaction.startState.selection.main;
  const line = transaction.startState.doc.lineAt(selection.from);

  if (
    insertion.from !== selection.from ||
    selection.from < line.from ||
    selection.from > line.to ||
    !/^[ \t]+$/u.test(line.text)
  ) {
    return null;
  }

  const markdownDocument = markdownDocumentCache.read(source);
  const previousList = findPreviousListBlockBeforeWhitespaceLine(source, markdownDocument, line.from);

  if (!previousList) {
    return null;
  }

  const anchor = line.from + insertion.text.length;
  const addToHistory = transaction.annotation(Transaction.addToHistory);

  return {
    changes: {
      from: line.from,
      to: line.to,
      insert: insertion.text
    },
    selection: {
      anchor,
      head: anchor
    },
    annotations: addToHistory === undefined ? undefined : Transaction.addToHistory.of(addToHistory),
    userEvent: transaction.annotation(Transaction.userEvent),
    scrollIntoView: transaction.scrollIntoView
  };
}

function createWhitespaceInputSelectionTransaction(transaction: Transaction): TransactionSpec | null {
  if (!transaction.docChanged || !transaction.startState.selection.main.empty) {
    return null;
  }

  const insertion = readSinglePlainTextInsertion(transaction);

  if (!insertion || insertion.text.trim().length > 0 || /[\r\n]/u.test(insertion.text)) {
    return null;
  }

  const selection = transaction.startState.selection.main;
  const line = transaction.startState.doc.lineAt(selection.from);

  if (
    insertion.from !== selection.from ||
    selection.from < line.from ||
    selection.from > line.to ||
    line.text.trim().length > 0
  ) {
    return null;
  }

  const anchor = insertion.from + insertion.text.length;
  const addToHistory = transaction.annotation(Transaction.addToHistory);

  return {
    changes: transaction.changes,
    selection: {
      anchor,
      head: anchor
    },
    effects: transaction.effects,
    annotations: addToHistory === undefined ? undefined : Transaction.addToHistory.of(addToHistory),
    userEvent: transaction.annotation(Transaction.userEvent),
    scrollIntoView: transaction.scrollIntoView
  };
}

function readSinglePlainTextInsertion(transaction: Transaction): { from: number; text: string } | null {
  let insertion: { from: number; text: string } | null = null;
  let count = 0;

  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    count += 1;

    if (fromA !== toA) {
      return;
    }

    insertion = {
      from: fromA,
      text: inserted.toString()
    };
  });

  return count === 1 ? insertion : null;
}

function findPreviousListBlockBeforeWhitespaceLine(
  source: string,
  markdownDocument: MarkdownDocument,
  lineStart: number
): ListBlock | null {
  let previousBlock: MarkdownBlock | null = null;

  for (const block of markdownDocument.blocks) {
    if (block.startOffset > lineStart) {
      break;
    }

    if (block.endOffset <= lineStart) {
      previousBlock = block;
    }
  }

  if (previousBlock?.type !== "list") {
    return null;
  }

  const gap = source.slice(previousBlock.endOffset, lineStart);

  return /^[\r\n \t]*$/u.test(gap) ? previousBlock : null;
}

function findLinkAtOffset(markdownDocument: MarkdownDocument, offset: number): InlineLink | null {
  for (const block of markdownDocument.blocks) {
    const link = findLinkInBlock(block, offset);

    if (link) {
      return link;
    }
  }

  return null;
}

function findLinkInBlock(block: MarkdownBlock, offset: number): InlineLink | null {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return findLinkInInline(block.inline, offset);
    case "list":
      return findLinkInList(block, offset);
    case "blockquote":
      for (const line of block.lines ?? []) {
        const link = findLinkInInline(line.inline, offset);

        if (link) {
          return link;
        }
      }

      return null;
    default:
      return null;
  }
}

function findLinkInList(block: ListBlock, offset: number): InlineLink | null {
  for (const item of block.items) {
    const link = findLinkInListItem(item, offset);

    if (link) {
      return link;
    }
  }

  return null;
}

function findLinkInListItem(item: ListItemBlock, offset: number): InlineLink | null {
  const inlineLink = findLinkInInline(item.inline, offset);

  if (inlineLink) {
    return inlineLink;
  }

  for (const child of item.children) {
    const childLink = findLinkInList(child, offset);

    if (childLink) {
      return childLink;
    }
  }

  return null;
}

function findLinkInInline(inline: InlineRoot | undefined, offset: number): InlineLink | null {
  if (!inline) {
    return null;
  }

  return findLinkInInlineNode(inline, offset);
}

function findLinkInInlineNode(node: InlineASTNode, offset: number): InlineLink | null {
  if (offset < node.startOffset || offset > node.endOffset) {
    return null;
  }

  switch (node.type) {
    case "link":
      return node.href ? node : null;
    case "root":
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "image":
      for (const child of node.children) {
        const link = findLinkInInlineNode(child, offset);

        if (link) {
          return link;
        }
      }

      return null;
    case "text":
    case "hardBreak":
    case "codeSpan":
    case "inlineMath":
    case "footnoteReference":
      return null;
  }
}

export function refreshMarkdownDecorations(view: EditorView): void {
  view.dispatch({
    effects: forceRefreshMarkdownDecorationsEffect.of(null)
  });
}

