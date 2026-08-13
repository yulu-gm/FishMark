import { Annotation, ChangeSet, Compartment, EditorState, Transaction } from "@codemirror/state";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery
} from "@codemirror/search";
import { EditorView, type ViewUpdate } from "@codemirror/view";

import {
  createFishMarkMarkdownExtensions,
  refreshMarkdownDecorations,
  runTableDelete,
  runTableDeleteColumn,
  runTableDeleteRow,
  runTableInsertColumnLeft,
  runTableInsertColumnRight,
  runTableInsertRowAbove,
  runTableInsertRowBelow,
  runTableSelectCell,
  runTableUpdateCell,
  setMarkdownEditorViewMode,
  type ActiveBlockState,
  type EditorViewMode
} from "@fishmark/editor-core";
import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createPreviewAssetUrl } from "../shared/preview-asset-url";
import type { DocumentTextChange } from "../shared/document-edit";
import { isSameEditorLoadIdentity, type EditorLoadIdentity } from "./editor/editor-load-identity";

export const internalDocumentTransaction = Annotation.define<true>();

export type CodeEditorDocumentChangeFrame = Readonly<{
  identity: EditorLoadIdentity | null;
  baseText: string;
  resultingText: string;
  changes: readonly DocumentTextChange[];
}>;

export type CodeEditorDiscardedDocumentText = Readonly<{
  identity: EditorLoadIdentity | null;
  text: string;
}>;

export type CodeEditorRemotePatchResult =
  | Readonly<{ kind: "applied" }>
  | Readonly<{ kind: "stale-identity" }>
  | Readonly<{ kind: "text-mismatch" }>
  | Readonly<{ kind: "invalid-range" }>
  | Readonly<{ kind: "disposed" }>;

export type CodeEditorCanonicalRestoreResult =
  | Readonly<{ kind: "restored" }>
  | Readonly<{ kind: "stale-identity" }>
  | Readonly<{ kind: "text-mismatch" }>
  | Readonly<{ kind: "disposed" }>;

export type CreateCodeEditorControllerOptions = {
  parent: Element;
  initialContent: string;
  documentPath?: string | null;
  onChange: (content: string) => void;
  onDocumentChangeFrame?: (frame: CodeEditorDocumentChangeFrame) => void;
  onDiscardedDocumentText?: (discarded: CodeEditorDiscardedDocumentText) => void;
  onPendingDocumentChangesChange?: (hasPending: boolean) => void;
  onBlur?: () => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
  importClipboardImage?: (input: { documentPath: string | null }) => Promise<string | null>;
  openExternalLink?: (href: string) => void;
  viewMode?: EditorViewMode;
  readOnly?: boolean;
};

export type CodeEditorController = {
  getContent: () => string;
  getSelection: () => { anchor: number; head: number };
  updateFindReplaceQuery: (query: FindReplaceQueryInput) => FindReplaceSnapshot;
  findNextMatch: () => FindReplaceSnapshot;
  findPreviousMatch: () => FindReplaceSnapshot;
  replaceCurrentMatch: () => FindReplaceSnapshot;
  replaceAllMatches: () => FindReplaceSnapshot;
  clearFindReplaceQuery: () => FindReplaceSnapshot;
  setContent: (content: string) => void;
  replaceDocument: (nextContent: string) => void;
  setDocumentIdentity: (identity: EditorLoadIdentity | null) => void;
  flushPendingDocumentChanges: () => void;
  sealForBarrier: () => Promise<{
    readonly text: string;
    readonly identity: EditorLoadIdentity | null;
  }>;
  applyRemoteDocumentPatch: (input: {
    readonly identity: EditorLoadIdentity;
    readonly expectedBefore: string;
    readonly expectedAfter: string;
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }) => Promise<CodeEditorRemotePatchResult>;
  restoreCanonicalDocument: (input: {
    readonly identity: EditorLoadIdentity;
    readonly expectedBefore: string;
    readonly canonicalText: string;
  }) => Promise<CodeEditorCanonicalRestoreResult>;
  discardPendingDocumentChanges: () => string;
  hasPendingDocumentChanges: () => boolean;
  setDocumentPath: (nextDocumentPath: string | null) => void;
  setViewMode: (nextMode: EditorViewMode) => void;
  setReadOnly: (readOnly: boolean) => void;
  focus: () => void;
  navigateToOffset: (offset: number) => void;
  insertText: (text: string) => void;
  setSelection: (anchor: number, head?: number) => void;
  selectTableCell: (position: { row: number; column: number }) => void;
  editTableCell: (input: { row: number; column: number; text: string }) => void;
  insertTableRowAbove: () => void;
  insertTableRowBelow: () => void;
  insertTableColumnLeft: () => void;
  insertTableColumnRight: () => void;
  deleteTableRow: () => void;
  deleteTableColumn: () => void;
  deleteTable: () => void;
  pressEnter: () => void;
  pressBackspace: () => void;
  pressTab: (shiftKey?: boolean) => void;
  pressArrowUp: () => void;
  pressArrowDown: () => void;
  destroy: () => void;
};

export type FindReplaceQueryInput = {
  search: string;
  replace: string;
};

export type FindReplaceSnapshot = {
  matchCount: number;
  currentMatchIndex: number | null;
};

export function createCodeEditorController(
  options: CreateCodeEditorControllerOptions
): CodeEditorController {
  let currentDocumentPath = options.documentPath ?? null;
  let currentViewMode = options.viewMode ?? "wysiwym";
  let currentReadOnly = options.readOnly ?? false;
  const readOnlyCompartment = new Compartment();
  let isDestroyed = false;
  let documentIdentity: EditorLoadIdentity | null = null;
  let pendingDocumentChanges: {
    identity: EditorLoadIdentity | null;
    baseText: string;
    resultingText: string;
    changes: ChangeSet;
  } | null = null;
  let pendingFrameHandle: number | null = null;
  let pendingFrameEpoch = 0;
  let isComposing = false;
  let compositionCheckpointPending = false;
  let hasPendingDocumentChanges = false;
  const compositionSealWaiters = new Set<() => void>();

  const notifyPendingDocumentChanges = () => {
    const nextValue = pendingDocumentChanges !== null;
    if (nextValue === hasPendingDocumentChanges) return;
    hasPendingDocumentChanges = nextValue;
    try {
      options.onPendingDocumentChangesChange?.(nextValue);
    } catch {
      // An observer must not break CodeMirror's document update lifecycle.
    }
  };

  const cancelPendingFrame = () => {
    if (pendingFrameHandle === null) return;
    cancelAnimationFrame(pendingFrameHandle);
    pendingFrameHandle = null;
    pendingFrameEpoch += 1;
  };

  const reportDiscardedDocumentText = (
    identity: EditorLoadIdentity | null,
    text: string
  ) => {
    try {
      options.onDiscardedDocumentText?.(Object.freeze({ identity, text }));
    } catch {
      // Recovery reporting is best-effort and must not interrupt the editor lifecycle.
    }
  };

  const emitPendingDocumentChanges = () => {
    cancelPendingFrame();
    if (pendingDocumentChanges === null || isDestroyed || isComposing) return;

    const pending = pendingDocumentChanges;
    pendingDocumentChanges = null;
    const changes: DocumentTextChange[] = [];
    pending.changes.iterChanges((from, to, _fromB, _toB, insert) => {
      changes.push(Object.freeze({ from, to, insert: insert.toString() }));
    });
    if (changes.length === 0) {
      notifyPendingDocumentChanges();
      return;
    }
    try {
      options.onDocumentChangeFrame?.(Object.freeze({
        identity: pending.identity,
        baseText: pending.baseText,
        resultingText: pending.resultingText,
        changes: Object.freeze(changes)
      }));
    } catch {
      reportDiscardedDocumentText(pending.identity, pending.resultingText);
    }
    notifyPendingDocumentChanges();
  };

  const discardPendingDocumentChanges = () => {
    const exactText = view.state.doc.toString();
    const hadPendingChanges = pendingDocumentChanges !== null;
    cancelPendingFrame();
    pendingDocumentChanges = null;
    compositionCheckpointPending = false;
    notifyPendingDocumentChanges();
    resolveCompositionSeals();
    if (hadPendingChanges) {
      reportDiscardedDocumentText(documentIdentity, exactText);
    }
    return exactText;
  };

  const abortCompositionCheckpoint = () => {
    isComposing = false;
    compositionCheckpointPending = false;
    cancelPendingFrame();
    resolveCompositionSeals();
  };

  const schedulePendingDocumentChanges = () => {
    if (
      pendingFrameHandle !== null ||
      isComposing ||
      isDestroyed ||
      (pendingDocumentChanges === null && compositionSealWaiters.size === 0)
    ) {
      return;
    }
    const frameEpoch = ++pendingFrameEpoch;
    pendingFrameHandle = requestAnimationFrame(() => {
      if (frameEpoch !== pendingFrameEpoch || isDestroyed) return;
      pendingFrameHandle = null;
      emitPendingDocumentChanges();
      if (!isComposing) {
        compositionCheckpointPending = false;
        resolveCompositionSeals();
      }
    });
  };

  const resolveCompositionSeals = () => {
    for (const resolve of compositionSealWaiters) resolve();
    compositionSealWaiters.clear();
  };

  const scheduleCompositionCheckpoint = () => {
    schedulePendingDocumentChanges();
  };

  const observeDocumentTransaction = (transaction: Transaction): boolean =>
    transaction.annotation(internalDocumentTransaction) !== true;

  const appendObservedDocumentChanges = (
    baseText: string,
    resultingText: string,
    changes: ChangeSet
  ) => {
    pendingDocumentChanges = {
      identity: pendingDocumentChanges?.identity ?? (documentIdentity === null
        ? null
        : Object.freeze({ ...documentIdentity })),
      baseText: pendingDocumentChanges?.baseText ?? baseText,
      resultingText,
      changes: pendingDocumentChanges === null
        ? changes
        : pendingDocumentChanges.changes.compose(changes)
    };
    notifyPendingDocumentChanges();
  };

  const observeDocumentUpdate = (update: ViewUpdate) => {
    if (!update.docChanged) return;
    const containsInternalDocumentTransaction = update.transactions.some(
      (transaction) => transaction.docChanged && !observeDocumentTransaction(transaction)
    );
    if (!containsInternalDocumentTransaction) {
      appendObservedDocumentChanges(
        update.startState.doc.toString(),
        update.state.doc.toString(),
        update.changes
      );
      schedulePendingDocumentChanges();
      return;
    }

    for (const transaction of update.transactions) {
      if (!transaction.docChanged) continue;
      if (!observeDocumentTransaction(transaction)) {
        emitPendingDocumentChanges();
        pendingDocumentChanges = null;
        notifyPendingDocumentChanges();
        continue;
      }
      appendObservedDocumentChanges(
        transaction.startState.doc.toString(),
        transaction.state.doc.toString(),
        transaction.changes
      );
    }
    schedulePendingDocumentChanges();
  };

  let activeBlockState: ActiveBlockState = {
    blockMap: parseMarkdownDocument(""),
    activeBlock: null,
    selection: {
      anchor: 0,
      head: 0
    },
    tableCursor: null
  };

  const createState = (content: string) =>
    EditorState.create({
      doc: content,
      extensions: [
        readOnlyCompartment.of([
          EditorState.readOnly.of(currentReadOnly),
          EditorView.editable.of(!currentReadOnly)
        ]),
        EditorState.transactionFilter.of((transaction) =>
          transaction.docChanged && transaction.startState.readOnly
            ? []
            : transaction
        ),
        EditorView.updateListener.of(observeDocumentUpdate),
        createFishMarkMarkdownExtensions({
          parseMarkdownDocument,
          onContentChange: (nextContent) => {
            options.onChange(nextContent);
          },
          onActiveBlockChange: (nextState) => {
            activeBlockState = nextState;
            options.onActiveBlockChange?.(nextState);
          },
          resolveImagePreviewUrl: (href) => resolveImagePreviewUrl(currentDocumentPath, href),
          onOpenLink: (href) => options.openExternalLink?.(href),
          onBlur: options.onBlur,
          viewMode: currentViewMode
        }),
        search({
          createPanel: () => {
            const dom = document.createElement("div");

            dom.hidden = true;
            dom.setAttribute("aria-hidden", "true");
            return { dom, top: true };
          }
        })
      ]
    });

  const initialState = createState(options.initialContent);
  const view = new EditorView({
    state: initialState,
    parent: options.parent
  });

  const handleCompositionStart = () => {
    isComposing = true;
  };

  const handleCompositionEnd = () => {
    if (!isComposing) return;
    isComposing = false;
    compositionCheckpointPending = true;
    scheduleCompositionCheckpoint();
  };

  const handlePaste = (event: ClipboardEvent) => {
    if (!options.importClipboardImage) {
      return;
    }

    const clipboardData = event.clipboardData;
    const clipboardItems = Array.from(clipboardData?.items ?? []);
    const hasDomImage = clipboardItems.some((item) => item.type.startsWith("image/"));

    if (!hasDomImage && (!clipboardData || hasPasteableClipboardText(clipboardData))) {
      return;
    }

    event.preventDefault();

    const selection = view.state.selection.main;

    void options
      .importClipboardImage({
        documentPath: currentDocumentPath
      })
      .then((markdown) => {
        if (!markdown || isDestroyed) {
          return;
        }

        const nextAnchor = selection.from + markdown.length;

        view.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: markdown
          },
          selection: {
            anchor: nextAnchor,
            head: nextAnchor
          }
        });
      });
  };

  view.contentDOM.addEventListener("compositionstart", handleCompositionStart);
  view.contentDOM.addEventListener("compositionend", handleCompositionEnd);
  view.dom.addEventListener("paste", handlePaste);

  const readFindReplaceSnapshot = (): FindReplaceSnapshot => {
    const query = getSearchQuery(view.state);

    if (!query.valid || query.search.length === 0) {
      return {
        matchCount: 0,
        currentMatchIndex: null
      };
    }

    let matchCount = 0;
    let currentMatchIndex: number | null = null;
    const selection = view.state.selection.main;

    const cursor = query.getCursor(view.state);
    let nextMatch = cursor.next();

    while (!nextMatch.done) {
      const match = nextMatch.value;
      matchCount += 1;

      if (match.from === selection.from && match.to === selection.to) {
        currentMatchIndex = matchCount;
      }

      nextMatch = cursor.next();
    }

    return {
      matchCount,
      currentMatchIndex
    };
  };

  const ensureSearchPanelOpen = () => {
    if (!searchPanelOpen(view.state)) {
      openSearchPanel(view);
    }
  };

  const updateSearchQuery = (input: FindReplaceQueryInput): FindReplaceSnapshot => {
    const trimmedSearch = input.search;
    const query = new SearchQuery({
      search: trimmedSearch,
      replace: input.replace,
      literal: true
    });

    if (trimmedSearch.length === 0) {
      view.dispatch({
        effects: setSearchQuery.of(query)
      });
      closeSearchPanel(view);
      return readFindReplaceSnapshot();
    }

    ensureSearchPanelOpen();
    view.dispatch({
      effects: setSearchQuery.of(query)
    });

    let snapshot = readFindReplaceSnapshot();

    if (snapshot.matchCount > 0 && snapshot.currentMatchIndex === null) {
      findNext(view);
      snapshot = readFindReplaceSnapshot();
    }

    return snapshot;
  };

  const selectNextMatchWhenNeeded = (snapshot: FindReplaceSnapshot): FindReplaceSnapshot => {
    if (snapshot.matchCount === 0 || snapshot.currentMatchIndex !== null) {
      return snapshot;
    }

    findNext(view);
    return readFindReplaceSnapshot();
  };

  const dispatchEditorKeydown = (
    key: string,
    options: Pick<KeyboardEventInit, "shiftKey"> = {}
  ) => {
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...options
      })
    );
  };

  const sealForBarrier = (): Promise<{
    readonly text: string;
    readonly identity: EditorLoadIdentity | null;
  }> => {
    const snapshot = () => Object.freeze({
      text: view.state.doc.toString(),
      identity: documentIdentity === null ? null : Object.freeze({ ...documentIdentity })
    });
    if (!isComposing && !compositionCheckpointPending) {
      emitPendingDocumentChanges();
      return Promise.resolve(snapshot());
    }
    return new Promise<ReturnType<typeof snapshot>>((resolve) => {
      compositionSealWaiters.add(() => resolve(snapshot()));
      scheduleCompositionCheckpoint();
    });
  };

  const applyRemoteDocumentPatch = async (input: {
    readonly identity: EditorLoadIdentity;
    readonly expectedBefore: string;
    readonly expectedAfter: string;
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }): Promise<CodeEditorRemotePatchResult> => {
    if (isDestroyed) return Object.freeze({ kind: "disposed" });
    if (documentIdentity === null || !isSameEditorLoadIdentity(documentIdentity, input.identity)) {
      return Object.freeze({ kind: "stale-identity" });
    }
    await sealForBarrier();
    if (isDestroyed) return Object.freeze({ kind: "disposed" });
    if (documentIdentity === null || !isSameEditorLoadIdentity(documentIdentity, input.identity)) {
      return Object.freeze({ kind: "stale-identity" });
    }
    if (
      !Number.isSafeInteger(input.from) ||
      !Number.isSafeInteger(input.to) ||
      input.from < 0 ||
      input.from > input.to ||
      input.to > view.state.doc.length
    ) return Object.freeze({ kind: "invalid-range" });
    const currentText = view.state.doc.toString();
    if (
      currentText !== input.expectedBefore ||
      currentText.slice(0, input.from) + input.insert + currentText.slice(input.to) !== input.expectedAfter
    ) return Object.freeze({ kind: "text-mismatch" });
    view.dispatch({
      changes: { from: input.from, to: input.to, insert: input.insert },
      annotations: [
        internalDocumentTransaction.of(true),
        Transaction.addToHistory.of(false)
      ]
    });
    return Object.freeze({ kind: "applied" });
  };

  const restoreCanonicalDocument = async (input: {
    readonly identity: EditorLoadIdentity;
    readonly expectedBefore: string;
    readonly canonicalText: string;
  }): Promise<CodeEditorCanonicalRestoreResult> => {
    if (isDestroyed) return Object.freeze({ kind: "disposed" });
    if (documentIdentity === null || !isSameEditorLoadIdentity(documentIdentity, input.identity)) {
      return Object.freeze({ kind: "stale-identity" });
    }
    await sealForBarrier();
    if (isDestroyed) return Object.freeze({ kind: "disposed" });
    if (documentIdentity === null || !isSameEditorLoadIdentity(documentIdentity, input.identity)) {
      return Object.freeze({ kind: "stale-identity" });
    }
    if (view.state.doc.toString() !== input.expectedBefore) {
      return Object.freeze({ kind: "text-mismatch" });
    }
    // A recovery boundary deliberately starts a fresh editor history.
    view.setState(createState(input.canonicalText));
    return Object.freeze({ kind: "restored" });
  };

  return {
    getContent: () => view.state.doc.toString(),
    getSelection: () => ({
      anchor: view.state.selection.main.anchor,
      head: view.state.selection.main.head
    }),
    updateFindReplaceQuery: updateSearchQuery,
    findNextMatch() {
      findNext(view);
      return readFindReplaceSnapshot();
    },
    findPreviousMatch() {
      findPrevious(view);
      return readFindReplaceSnapshot();
    },
    replaceCurrentMatch() {
      replaceNext(view);
      return selectNextMatchWhenNeeded(readFindReplaceSnapshot());
    },
    replaceAllMatches() {
      replaceAll(view);
      return readFindReplaceSnapshot();
    },
    clearFindReplaceQuery() {
      const query = new SearchQuery({
        search: "",
        replace: "",
        literal: true
      });

      view.dispatch({
        effects: setSearchQuery.of(query)
      });
      closeSearchPanel(view);
      return readFindReplaceSnapshot();
    },
    setContent(content: string) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content
        },
        selection: { anchor: 0 }
      });
    },
    replaceDocument(nextContent: string) {
      if (isComposing || compositionCheckpointPending) {
        discardPendingDocumentChanges();
        abortCompositionCheckpoint();
      } else {
        emitPendingDocumentChanges();
      }
      view.setState(createState(nextContent));
    },
    setDocumentIdentity(nextIdentity: EditorLoadIdentity | null) {
      if (isComposing || compositionCheckpointPending) {
        discardPendingDocumentChanges();
        abortCompositionCheckpoint();
      } else {
        emitPendingDocumentChanges();
      }
      documentIdentity = nextIdentity === null ? null : Object.freeze({ ...nextIdentity });
    },
    flushPendingDocumentChanges() {
      emitPendingDocumentChanges();
    },
    sealForBarrier,
    applyRemoteDocumentPatch,
    restoreCanonicalDocument,
    discardPendingDocumentChanges() {
      const exactText = discardPendingDocumentChanges();
      abortCompositionCheckpoint();
      return exactText;
    },
    hasPendingDocumentChanges() {
      return pendingDocumentChanges !== null;
    },
    setDocumentPath(nextDocumentPath: string | null) {
      currentDocumentPath = nextDocumentPath;
      refreshMarkdownDecorations(view);
    },
    setViewMode(nextMode: EditorViewMode) {
      currentViewMode = nextMode;
      setMarkdownEditorViewMode(view, nextMode);
    },
    setReadOnly(readOnly: boolean) {
      if (currentReadOnly === readOnly) {
        return;
      }
      currentReadOnly = readOnly;
      view.dispatch({
        effects: readOnlyCompartment.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly)
        ])
      });
    },
    focus() {
      view.focus();
    },
    navigateToOffset(offset: number) {
      const nextOffset = Math.max(0, Math.min(offset, view.state.doc.length));

      view.dispatch({
        selection: {
          anchor: nextOffset,
          head: nextOffset
        },
        effects: EditorView.scrollIntoView(nextOffset, {
          y: "center",
          yMargin: 24
        })
      });
      view.focus();
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
    selectTableCell(position) {
      runTableSelectCell(view, activeBlockState, position);
    },
    editTableCell({ row, column, text }) {
      runTableUpdateCell(view, activeBlockState, { row, column }, text);
    },
    insertTableRowAbove() {
      runTableInsertRowAbove(view, activeBlockState);
    },
    insertTableRowBelow() {
      runTableInsertRowBelow(view, activeBlockState);
    },
    insertTableColumnLeft() {
      runTableInsertColumnLeft(view, activeBlockState);
    },
    insertTableColumnRight() {
      runTableInsertColumnRight(view, activeBlockState);
    },
    deleteTableRow() {
      runTableDeleteRow(view, activeBlockState);
    },
    deleteTableColumn() {
      runTableDeleteColumn(view, activeBlockState);
    },
    deleteTable() {
      runTableDelete(view, activeBlockState);
    },
    pressEnter() {
      dispatchEditorKeydown("Enter");
    },
    pressBackspace() {
      dispatchEditorKeydown("Backspace");
    },
    pressTab(shiftKey = false) {
      dispatchEditorKeydown("Tab", { shiftKey });
    },
    pressArrowUp() {
      dispatchEditorKeydown("ArrowUp");
    },
    pressArrowDown() {
      dispatchEditorKeydown("ArrowDown");
    },
    destroy() {
      isDestroyed = true;
      const exactText = view.state.doc.toString();
      const shouldReportDiscard = pendingDocumentChanges !== null;
      cancelPendingFrame();
      pendingDocumentChanges = null;
      compositionCheckpointPending = false;
      isComposing = false;
      notifyPendingDocumentChanges();
      resolveCompositionSeals();
      if (shouldReportDiscard) {
        reportDiscardedDocumentText(documentIdentity, exactText);
      }
      view.contentDOM.removeEventListener("compositionstart", handleCompositionStart);
      view.contentDOM.removeEventListener("compositionend", handleCompositionEnd);
      view.dom.removeEventListener("paste", handlePaste);
      view.destroy();
    }
  };
}

const PASTEABLE_TEXT_TYPES = new Set(["text/plain", "text/html", "text/uri-list"]);

function hasPasteableClipboardText(clipboardData: DataTransfer): boolean {
  const clipboardTypes = Array.from(clipboardData.types ?? []).map((type) => type.toLowerCase());

  if (clipboardTypes.some((type) => PASTEABLE_TEXT_TYPES.has(type))) {
    return true;
  }

  for (const type of PASTEABLE_TEXT_TYPES) {
    try {
      if (clipboardData.getData(type).length > 0) {
        return true;
      }
    } catch {
      // Some DOM implementations throw for unsupported MIME types.
    }
  }

  return false;
}

function resolveImagePreviewUrl(documentPath: string | null, href: string | null): string | null {
  if (!href) {
    return null;
  }

  if (/^(https?:|data:)/i.test(href)) {
    return href;
  }

  if (/^file:/i.test(href)) {
    const localFilePath = tryResolveFilePathFromFileUrl(href);
    return localFilePath ? createPreviewAssetUrl(localFilePath) : href;
  }

  const localFilePath = resolveLocalImageFilePath(documentPath, href);
  return localFilePath ? createPreviewAssetUrl(localFilePath) : null;
}

function toFileUrl(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const absolutePath = /^[a-zA-Z]:\//.test(normalizedPath)
    ? `/${normalizedPath}`
    : normalizedPath;

  return encodeURI(`file://${absolutePath}`);
}

function resolveLocalImageFilePath(documentPath: string | null, href: string): string | null {
  const normalizedHref = href.replace(/\\/g, "/");

  if (/^[a-zA-Z]:\//.test(normalizedHref) || normalizedHref.startsWith("/")) {
    return normalizedHref;
  }

  if (!documentPath) {
    return null;
  }

  try {
    const absoluteUrl = new URL(href, toFileUrl(documentPath)).toString();
    return tryResolveFilePathFromFileUrl(absoluteUrl);
  } catch {
    return null;
  }
}

function tryResolveFilePathFromFileUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);

    if (url.protocol !== "file:") {
      return null;
    }

    const decodedPath = decodeURIComponent(url.pathname);

    if (/^\/[a-zA-Z]:\//.test(decodedPath)) {
      return decodedPath.slice(1);
    }

    if (url.hostname) {
      return `//${url.hostname}${decodedPath}`;
    }

    return decodedPath;
  } catch {
    return null;
  }
}
