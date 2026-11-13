import {
  Annotation,
  ChangeSet,
  Compartment,
  EditorState,
  Transaction,
  type Extension
} from "@codemirror/state";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import { isolateHistory, undo, redo, selectAll } from "@codemirror/commands";

import {
  createFishMarkMarkdownExtensions,
  readEditorSelection,
  readEditorStructureCache,
  selectTableCellContents,
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
  setHeadingPresentation,
  type HeadingPresentationMode,
  type SemanticCommandBindings,
  type EditorViewMode
} from "@fishmark/codemirror-adapter";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import {
  createActiveBlockState,
  createEditorDerivedSnapshotFromCache,
  createVisibleLine,
  planPrintableInput,
  type ActiveBlockState
} from "@fishmark/editor-model";
import { readCompositionState } from "@fishmark/codemirror-adapter";

import { createPreviewAssetUrl } from "../shared/preview-asset-url";
import type { DocumentTextChange } from "../shared/document-edit";
import { isWorkspaceReadingPosition, type WorkspaceReadingPosition } from "../shared/workspace";
import { isSameEditorLoadIdentity, type EditorLoadIdentity } from "./application/editor-load-identity";
import type { PlainTextPasteInput } from "../shared/plain-text-paste";
import { editorScrollbarPointerAxis } from "./editor/editor-pointer-utils";
import { createEditorScrollbars } from "./editor/editor-scrollbars";

export const internalDocumentTransaction = Annotation.define<true>();

import type { CodeEditorDocumentChangeFrame, CodeEditorDiscardedDocumentText, CodeEditorRemotePatchResult, CodeEditorCanonicalRestoreResult } from "./application/editor-port";
export type { CodeEditorDocumentChangeFrame, CodeEditorDiscardedDocumentText, CodeEditorRemotePatchResult, CodeEditorCanonicalRestoreResult } from "./application/editor-port";

export type CreateCodeEditorControllerOptions = {
  parent: Element;
  initialContent: string;
  documentPath?: string | null;
  onChange: (content: string) => void;
  onDocumentChangeFrame?: (frame: CodeEditorDocumentChangeFrame) => void;
  onUserDocumentEdit?: () => void;
  onDiscardedDocumentText?: (discarded: CodeEditorDiscardedDocumentText) => void;
  onPendingDocumentChangesChange?: (hasPending: boolean) => void;
  onBlur?: () => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
  importClipboardImage?: (input: { tabId: string }) => Promise<string | null>;
  requestPlainTextPaste?: (input: PlainTextPasteInput) => Promise<string | null>;
  openExternalLink?: (href: string) => void;
  headingPresentationMode?: HeadingPresentationMode;
  viewMode?: EditorViewMode;
  readOnly?: boolean;
};

export type CodeEditorController = {
  getContent: () => string;
  getSelection: () => { anchor: number; head: number };
  captureReadingPosition: () => WorkspaceReadingPosition;
  restoreReadingPosition: (position: WorkspaceReadingPosition) => boolean;
  captureViewState: () => CodeEditorViewState;
  restoreViewState: (snapshot: CodeEditorViewState) => boolean;
  prepareFindReplace: () => Promise<void>;
  updateFindReplaceQuery: (query: FindReplaceQueryInput) => FindReplaceSnapshot;
  findNextMatch: () => FindReplaceSnapshot;
  findPreviousMatch: () => FindReplaceSnapshot;
  selectFindReplaceMatch: (match: FindReplaceMatch) => FindReplaceSnapshot;
  subscribeFindReplace: (listener: (snapshot: FindReplaceSnapshot) => void) => () => void;
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
  setHeadingPresentationMode: (mode: HeadingPresentationMode) => void;
  setReadOnly: (readOnly: boolean) => void;
  focus: () => void;
  runHistory: (direction: "undo" | "redo") => boolean;
  runSelectAll: () => boolean;
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

// Renderer-local, short-lived state for an open tab. Retain the immutable text
// and scroll anchor, not an EditorState, history, DOM or main-process payload.
export type CodeEditorViewState = Readonly<{
  doc: EditorState["doc"];
  selection: EditorState["selection"];
  scroll: ReturnType<EditorView["scrollSnapshot"]>;
}>;

export type FindReplaceQueryInput = {
  search: string;
  replace: string;
};

export type FindReplaceSnapshot = {
  matchCount: number;
  currentMatchIndex: number | null;
  matches: readonly FindReplaceMatch[];
};

export type FindReplaceMatch = {
  from: number;
  to: number;
  line: number;
  column: number;
  snippet: string;
};

export const emptyFindReplaceSnapshot: FindReplaceSnapshot = {
  matchCount: 0, currentMatchIndex: null, matches: []
};

export function createCodeEditorController(
  options: CreateCodeEditorControllerOptions
): CodeEditorController {
  let currentDocumentPath = options.documentPath ?? null;
  let currentViewMode = options.viewMode ?? "wysiwym";
  let currentHeadingPresentationMode = options.headingPresentationMode ?? "editing";
  let currentReadOnly = options.readOnly ?? false;
  const readOnlyCompartment = new Compartment();
  const searchCompartment = new Compartment();
  let searchExtension: Extension = [];
  let searchRuntime: typeof import("./search-runtime") | null = null;
  let searchRuntimePromise: Promise<typeof import("./search-runtime")> | null = null;
  let isDestroyed = false;
  let pendingReadingPosition: WorkspaceReadingPosition | null = null;
  let readingPositionCancelled = false;
  let semanticCommands: SemanticCommandBindings;
  let documentIdentity: EditorLoadIdentity | null = null;
  let asyncPasteRequest = 0;
  let asyncPasteVersion = 0;
  let pendingDocumentChanges: {
    identity: EditorLoadIdentity | null;
    baseText: string;
    resultingText: string;
    changes: ChangeSet;
  } | null = null;
  let pendingFrameHandle: number | null = null;
  let pendingFrameEpoch = 0;
  let navigationMeasureFrame: number | null = null;
  let navigationMeasureEpoch = 0;
  let isComposing = false;
  let compositionCheckpointPending = false;
  let hasPendingDocumentChanges = false;
  const compositionSealWaiters = new Set<() => void>();
  const searchListeners = new Set<(snapshot: FindReplaceSnapshot) => void>();
  let searchNotificationQueued = false;
  const notifySearch = () => {
    if (searchNotificationQueued || !searchListeners.size) return;
    searchNotificationQueued = true;
    queueMicrotask(() => {
      searchNotificationQueued = false;
      if (isDestroyed || !searchListeners.size) return;
      const snapshot = readFindReplaceSnapshot();
      for (const listener of searchListeners) listener(snapshot);
    });
  };

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

  const cancelNavigationMeasure = () => {
    if (navigationMeasureFrame !== null) cancelAnimationFrame(navigationMeasureFrame);
    navigationMeasureFrame = null;
    navigationMeasureEpoch += 1;
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
    if (pendingDocumentChanges === null || isDestroyed || isComposing || readCompositionState(view.state).active) return;

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
      readCompositionState(view.state).active ||
      isDestroyed ||
      (pendingDocumentChanges === null && compositionSealWaiters.size === 0 && !compositionCheckpointPending)
    ) {
      return;
    }
    const frameEpoch = ++pendingFrameEpoch;
    pendingFrameHandle = requestAnimationFrame(() => {
      if (frameEpoch !== pendingFrameEpoch || isDestroyed) return;
      pendingFrameHandle = null;
      emitPendingDocumentChanges();
      if (!isComposing && !readCompositionState(view.state).active) {
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

  // Presentation follows accepted user edits, never document loads or remote patches.
  // Keep provisional composition text from changing shell geometry until it is sealed.
  let pendingUserCompositionBase: EditorState["doc"] | null = null;
  const observeUserDocumentEdit = (update: ViewUpdate) => {
    if (update.transactions.some((transaction) =>
      transaction.docChanged && !observeDocumentTransaction(transaction))) {
      pendingUserCompositionBase = null;
      return;
    }
    const userEdit = update.transactions.some((transaction) => transaction.docChanged &&
      (transaction.isUserEvent("input") || transaction.isUserEvent("delete")));
    if (readCompositionState(update.state).active) {
      if (userEdit) pendingUserCompositionBase ??= update.startState.doc;
      return;
    }
    const changedComposition = pendingUserCompositionBase !== null &&
      !pendingUserCompositionBase.eq(update.state.doc);
    pendingUserCompositionBase = null;
    if (userEdit || changedComposition) options.onUserDocumentEdit?.();
  };

  const observeDocumentUpdate = (update: ViewUpdate) => {
    if (update.docChanged || update.selectionSet ||
        (!readCompositionState(update.startState).active && readCompositionState(update.state).active)) {
      invalidateAsyncPaste();
    }
    if (pendingReadingPosition !== null && update.docChanged) {
      pendingReadingPosition = { ...pendingReadingPosition, anchor: update.changes.mapPos(pendingReadingPosition.anchor) };
      readingPositionCancelled = true;
    }
    if (update.docChanged || update.selectionSet || update.transactions.some(transaction => transaction.effects.length)) {
      notifySearch();
    }
    observeUserDocumentEdit(update);
    if (!update.docChanged) {
      // Composition can finish without another text change. The adapter's finish
      // transaction, not the DOM compositionend event, releases pending barriers.
      if (compositionCheckpointPending && !readCompositionState(update.state).active) {
        scheduleCompositionCheckpoint();
      }
      return;
    }
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

  // The host holds the canonical empty-document state until the view reports its first update.
  let activeBlockState: ActiveBlockState = createActiveBlockState(
    createEditorDerivedSnapshotFromCache(createDocumentStructureCache("")),
    { anchor: 0, head: 0 }
  );

  const createState = (content: string) =>
    EditorState.create({
      doc: content,
      extensions: [
        createEditorScrollbars(),
        EditorView.scrollHandler.of((current, range) => {
          const position = pendingReadingPosition;
          if (position === null) return false;
          if (range.head !== position.anchor) { pendingReadingPosition = null; return false; }
          pendingReadingPosition = null;
          if (readingPositionCancelled) return true;
          const block = current.lineBlockAt(position.anchor);
          current.scrollDOM.scrollTop = block.top - position.relativeY;
          current.scrollDOM.scrollLeft = position.scrollLeft;
          return true;
        }),
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
        keymap.of([{ key: "Mod-Shift-v", mac: "Mod-Alt-Shift-v", run: () => {
          if (!options.requestPlainTextPaste) return false;
          void pastePlainText("shortcut"); return true;
        } }]),
        createFishMarkMarkdownExtensions({
          scrollbarPointerAxis: editorScrollbarPointerAxis,
          onSemanticCommands: (commands) => { semanticCommands = commands; },
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
          headingPresentationMode: currentHeadingPresentationMode,
          onUserEditIntent: () => { currentHeadingPresentationMode = "editing"; options.onUserDocumentEdit?.(); },
          viewMode: currentViewMode
        }),
        searchCompartment.of(searchExtension)
      ]
    });

  const initialState = createState(options.initialContent);
  const view = new EditorView({
    state: initialState,
    parent: options.parent
  });

  function invalidateAsyncPaste() {
    asyncPasteVersion++;
  }

  function canApplyAsyncPaste() {
    return !isDestroyed && !currentReadOnly && !view.state.readOnly &&
      !isComposing && !compositionCheckpointPending && !readCompositionState(view.state).active;
  }

  function beginAsyncPaste() {
    if (documentIdentity === null || !canApplyAsyncPaste()) return null;
    // 两种异步粘贴共用请求顺序。新请求一发出，旧结果就不能再替换选区。
    return { identity: documentIdentity, state: view.state, version: asyncPasteVersion, request: ++asyncPasteRequest };
  }

  function applyAsyncPaste(paste: NonNullable<ReturnType<typeof beginAsyncPaste>>, text: string | null) {
    // 即使撤销编辑或移回选区，版本也会保留等待期间发生过的变化。
    if (!text || !canApplyAsyncPaste() || paste.request !== asyncPasteRequest ||
        paste.version !== asyncPasteVersion || view.state.doc !== paste.state.doc ||
        !view.state.selection.eq(paste.state.selection) || documentIdentity === null ||
        !isSameEditorLoadIdentity(paste.identity, documentIdentity)) return;
    view.dispatch({ ...view.state.replaceSelection(text), userEvent: "input.paste", annotations: isolateHistory.of("full"), scrollIntoView: true });
  }

  async function pastePlainText(source: PlainTextPasteInput["source"]): Promise<void> {
    if (!options.requestPlainTextPaste) return;
    const paste = beginAsyncPaste();
    if (paste === null) return;
    const text = await options.requestPlainTextPaste({ tabId: paste.identity.tabId, source });
    if (view.root.activeElement === view.contentDOM) applyAsyncPaste(paste, text);
  }
  const handleContextMenu = (event: MouseEvent) => {
    if (!options.requestPlainTextPaste || currentReadOnly || !view.contentDOM.contains(event.target as Node)) return;
    event.preventDefault(); void pastePlainText("context-menu");
  };
  view.contentDOM.addEventListener("contextmenu", handleContextMenu);

  const handleCompositionStart = () => {
    invalidateAsyncPaste();
    isComposing = true;
  };

  const handleCompositionEnd = () => {
    if (!isComposing) return;
    isComposing = false;
    compositionCheckpointPending = true;
    scheduleCompositionCheckpoint();
  };

  const handlePaste = (event: ClipboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    const clipboardData = event.clipboardData;
    // 表格单元格优先处理剪贴板文本，避免同一次粘贴又启动图片导入。
    const cell = event.target instanceof Element ? event.target.closest("[data-table-cell]") : null;
    if (clipboardData && cell instanceof HTMLElement && cell.contentEditable === "true" &&
        !view.state.readOnly &&
        (clipboardData.getData("text/html").length > 0 || clipboardData.getData("text/plain").length > 0)) {
      return;
    }
    const html = clipboardData?.getData?.("text/html") ?? "";
    if (html && !cell && view.contentDOM.contains(event.target as Node)) {
      const snapshot = createEditorDerivedSnapshotFromCache(readEditorStructureCache(view.state));
      const selection = view.state.selection.main;
      // 源码模式和代码块保留剪贴板纯文本；网页格式不能改写正在输入的代码。
      if (currentViewMode === "source" || [selection.from, selection.to].some(offset =>
        snapshot.nodeAt(offset)?.kind === "code-fence")) return;
      const paste = beginAsyncPaste();
      if (paste === null) return;
      const text = clipboardData?.getData("text/plain") ?? "";
      event.preventDefault();
      // 转换器按需加载；等待期间发生的编辑、失焦或切换文档同样使本次粘贴失效。
      void import("./html-paste").then(({ convertHtmlPasteToMarkdown }) =>
        applyAsyncPaste(paste, convertHtmlPasteToMarkdown(html) ?? text)
      ).catch(() => applyAsyncPaste(paste, text));
      return;
    }
    if (!options.importClipboardImage) return;
    const clipboardItems = Array.from(clipboardData?.items ?? []);
    const hasDomImage = clipboardItems.some((item) => item.type.startsWith("image/"));

    if (!hasDomImage && (!clipboardData || hasPasteableClipboardText(clipboardData))) {
      return;
    }

    event.preventDefault();

    const paste = beginAsyncPaste();
    if (paste === null) return;

    void options.importClipboardImage({ tabId: paste.identity.tabId })
      .then((markdown) => applyAsyncPaste(paste, markdown));
  };

  view.contentDOM.addEventListener("compositionstart", handleCompositionStart);
  view.contentDOM.addEventListener("compositionend", handleCompositionEnd);
  view.contentDOM.addEventListener("blur", invalidateAsyncPaste);
  // 在 CodeMirror 读取纯文本前拦截图片事件，避免空文本提前删除选区。
  view.dom.addEventListener("paste", handlePaste, true);

  const ensureSearchRuntime = async (): Promise<typeof import("./search-runtime") | null> => {
    if (searchRuntime) {
      return searchRuntime;
    }

    searchRuntimePromise ??= import("./search-runtime");
    const runtime = await searchRuntimePromise;

    if (isDestroyed) {
      return null;
    }

    if (!searchRuntime) {
      searchRuntime = runtime;
      searchExtension = runtime.createFishmarkSearchExtension();
      view.dispatch({
        effects: searchCompartment.reconfigure(searchExtension)
      });
    }

    return searchRuntime;
  };

  const readFindReplaceSnapshot = (): FindReplaceSnapshot => {
    return searchRuntime?.readFindReplaceSnapshot(view) ?? emptyFindReplaceSnapshot;
  };

  const updateSearchQuery = (input: FindReplaceQueryInput): FindReplaceSnapshot => {
    const runtime = searchRuntime;

    if (!runtime) {
      return emptyFindReplaceSnapshot;
    }

    const trimmedSearch = input.search;
    const query = new runtime.SearchQuery({
      search: trimmedSearch,
      replace: input.replace,
      literal: true
    });

    if (trimmedSearch.length === 0) {
      view.dispatch({
        effects: runtime.setSearchQuery.of(query)
      });
      runtime.closeSearchPanel(view);
      return readFindReplaceSnapshot();
    }

    if (!runtime.searchPanelOpen(view.state)) runtime.openSearchPanel(view);
    view.dispatch({
      effects: runtime.setSearchQuery.of(query)
    });

    return selectNextMatchWhenNeeded(readFindReplaceSnapshot());
  };

  const selectNextMatchWhenNeeded = (snapshot: FindReplaceSnapshot): FindReplaceSnapshot => {
    const runtime = searchRuntime;

    if (!runtime || snapshot.matchCount === 0 || snapshot.currentMatchIndex !== null) {
      return snapshot;
    }

    runtime.findNext(view);
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
    if (!isComposing && !compositionCheckpointPending && !readCompositionState(view.state).active) {
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
    pendingUserCompositionBase = null;
    pendingReadingPosition = null;
    view.setState(createState(input.canonicalText));
    notifySearch();
    semanticCommands.bindSession(view, documentIdentity?.tabId);
    return Object.freeze({ kind: "restored" });
  };

  return {
    getContent: () => view.state.doc.toString(),
    getSelection: () => readEditorSelection(view),
    captureReadingPosition() {
      view.lineBlockAtHeight(0);
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      return { anchor: block.from, relativeY: block.top - view.scrollDOM.scrollTop, scrollLeft: view.scrollDOM.scrollLeft };
    },
    restoreReadingPosition(position) {
      if (isDestroyed || !isWorkspaceReadingPosition(position, view.state.doc.length)) return false;
      view.lineBlockAtHeight(0);
      if (!view.inView) return false;
      pendingReadingPosition = position;
      readingPositionCancelled = false;
      view.dispatch({ effects: EditorView.scrollIntoView(position.anchor, { y: "start", x: "nearest" }) });
      // Settle the public scroll request before a subsequent wheel/edit can
      // establish a newer intent. Hidden views swallow rather than defer it.
      view.lineBlockAtHeight(0);
      readingPositionCancelled = true;
      return true;
    },
    captureViewState() {
      // A rapid second switch may precede the previous scroll effect's measure.
      // A public layout read settles that work before snapshotting DOM scroll.
      view.lineBlockAtHeight(0);
      return { doc: view.state.doc, selection: view.state.selection, scroll: view.scrollSnapshot() };
    },
    restoreViewState(snapshot) {
      if (isDestroyed || !snapshot.doc.eq(view.state.doc)) return false;
      // Selection and scroll only; this does not create a document edit.
      view.dispatch({ selection: snapshot.selection, effects: snapshot.scroll });
      return true;
    },
    async prepareFindReplace() {
      await ensureSearchRuntime();
    },
    updateFindReplaceQuery: updateSearchQuery,
    findNextMatch() {
      const runtime = searchRuntime;
      if (!runtime) return emptyFindReplaceSnapshot;
      runtime.findNext(view);
      return readFindReplaceSnapshot();
    },
    findPreviousMatch() {
      const runtime = searchRuntime;
      if (!runtime) return emptyFindReplaceSnapshot;
      runtime.findPrevious(view);
      return readFindReplaceSnapshot();
    },
    selectFindReplaceMatch(match) {
      searchRuntime?.selectFindReplaceMatch(view, match);
      return readFindReplaceSnapshot();
    },
    subscribeFindReplace(listener) {
      searchListeners.add(listener);
      listener(readFindReplaceSnapshot());
      return () => { searchListeners.delete(listener); };
    },
    replaceCurrentMatch() {
      const runtime = searchRuntime;
      if (!runtime) return emptyFindReplaceSnapshot;
      runtime.replaceNext(view);
      return selectNextMatchWhenNeeded(readFindReplaceSnapshot());
    },
    replaceAllMatches() {
      const runtime = searchRuntime;
      if (!runtime) return emptyFindReplaceSnapshot;
      runtime.replaceAll(view);
      return readFindReplaceSnapshot();
    },
    clearFindReplaceQuery() {
      return updateSearchQuery({ search: "", replace: "" });
    },
    setContent(content: string) {
      cancelNavigationMeasure();
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
      invalidateAsyncPaste();
      cancelNavigationMeasure();
      if (isComposing || compositionCheckpointPending || readCompositionState(view.state).active) {
        discardPendingDocumentChanges();
        abortCompositionCheckpoint();
      } else {
        emitPendingDocumentChanges();
      }
      pendingUserCompositionBase = null;
      pendingReadingPosition = null;
      view.setState(createState(nextContent));
      notifySearch();
      semanticCommands.bindSession(view, documentIdentity?.tabId);
    },
    setDocumentIdentity(nextIdentity: EditorLoadIdentity | null) {
      invalidateAsyncPaste();
      cancelNavigationMeasure();
      if (isComposing || compositionCheckpointPending || readCompositionState(view.state).active) {
        discardPendingDocumentChanges();
        abortCompositionCheckpoint();
      } else {
        emitPendingDocumentChanges();
      }
      documentIdentity = nextIdentity === null ? null : Object.freeze({ ...nextIdentity });
      searchRuntime?.invalidateFindReplaceResults(view);
      semanticCommands.bindSession(view, documentIdentity?.tabId);
      view.dispatch({ effects: semanticCommands.adapter.resetComposition() });
      // A barrier release rebinds the same document to a new epoch without a text
      // or selection transaction. Publish its snapshot to the new load owner too.
      options.onActiveBlockChange?.(activeBlockState);
    },
    flushPendingDocumentChanges() {
      emitPendingDocumentChanges();
      if (!isComposing && !readCompositionState(view.state).active) {
        compositionCheckpointPending = false;
        resolveCompositionSeals();
      }
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
    setHeadingPresentationMode(mode: HeadingPresentationMode) {
      cancelNavigationMeasure();
      currentHeadingPresentationMode = mode;
      setHeadingPresentation(view, mode);
    },
    setViewMode(nextMode: EditorViewMode) {
      cancelNavigationMeasure();
      currentViewMode = nextMode;
      setMarkdownEditorViewMode(view, nextMode);
    },
    setReadOnly(readOnly: boolean) {
      if (currentReadOnly === readOnly) {
        return;
      }
      currentReadOnly = readOnly;
      invalidateAsyncPaste();
      view.dispatch({
        effects: readOnlyCompartment.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly)
        ])
      });
    },
    runSelectAll() {
      const active = view.dom.ownerDocument.activeElement;
      if (!view.dom.contains(active)) return false;
      if (!selectTableCellContents(active)) selectAll(view);
      return true;
    },
    runHistory(direction) {
      // Search/settings fields keep their own browser editing history.
      if (!view.dom.contains(view.dom.ownerDocument.activeElement)) return false;
      if (!currentReadOnly && !isComposing && !compositionCheckpointPending && !readCompositionState(view.state).active) {
        (direction === "undo" ? undo : redo)(view);
      }
      return true;
    },
    focus() {
      view.focus();
    },
    navigateToOffset(offset: number) {
      cancelNavigationMeasure();
      const nextOffset = Math.max(0, Math.min(offset, view.state.doc.length));
      const snapshot = activeBlockState.snapshot;
      const heading = snapshot.nodeAt(nextOffset);
      const line = snapshot.lineAt(nextOffset);
      // Outline offsets identify the source heading. Its hidden prefix has no
      // DOM rectangle, so reveal the visible title while retaining selection.
      const isHeadingNavigation = currentViewMode !== "source" && heading?.kind === "heading" &&
        heading.source.startOffset === nextOffset && line !== null;
      const revealOffset = isHeadingNavigation
        ? createVisibleLine({ snapshot, lineStart: line.range.startOffset,
          lineEnd: line.contentEndOffset }).visibleStartAnchor
        : nextOffset;

      view.dispatch({
        selection: {
          anchor: nextOffset,
          head: nextOffset
        },
        effects: EditorView.scrollIntoView(revealOffset, {
          y: "center",
          yMargin: 24
        })
      });
      view.focus();
      if (isHeadingNavigation) {
        const epoch = navigationMeasureEpoch, doc = view.state.doc;
        const selection = view.state.selection, identity = documentIdentity;
        // A distant virtual viewport can exhaust CodeMirror's per-frame layout
        // limit before consuming its scroll effect. Allow one subsequent frame
        // to finish measuring; never replay selection or the reveal effect.
        navigationMeasureFrame = requestAnimationFrame(() => {
          if (epoch !== navigationMeasureEpoch) return;
          navigationMeasureFrame = null;
          if (!isDestroyed && view.state.doc === doc && documentIdentity === identity &&
            view.state.selection.eq(selection)) view.requestMeasure();
        });
      }
    },
    insertText(text: string) {
      semanticCommands.run(view, context => planPrintableInput(context, text));
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
      pendingReadingPosition = null;
      isDestroyed = true;
      cancelNavigationMeasure();
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
      view.contentDOM.removeEventListener("blur", invalidateAsyncPaste);
      view.dom.removeEventListener("paste", handlePaste, true);
      view.contentDOM.removeEventListener("contextmenu", handleContextMenu);
      semanticCommands.releaseSession();
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
