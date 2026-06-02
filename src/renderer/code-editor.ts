import { EditorState } from "@codemirror/state";
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
import { EditorView } from "@codemirror/view";

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

export type CreateCodeEditorControllerOptions = {
  parent: Element;
  initialContent: string;
  documentPath?: string | null;
  onChange: (content: string) => void;
  onBlur?: () => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
  importClipboardImage?: (input: { documentPath: string | null }) => Promise<string | null>;
  openExternalLink?: (href: string) => void;
  viewMode?: EditorViewMode;
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
  replaceDocument: (nextContent: string) => void;
  setDocumentPath: (nextDocumentPath: string | null) => void;
  setViewMode: (nextMode: EditorViewMode) => void;
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
  let isDestroyed = false;
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
        createFishMarkMarkdownExtensions({
          parseMarkdownDocument,
          onContentChange: options.onChange,
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
    replaceDocument(nextContent: string) {
      const nextState = createState(nextContent);
      view.setState(nextState);
    },
    setDocumentPath(nextDocumentPath: string | null) {
      currentDocumentPath = nextDocumentPath;
      refreshMarkdownDecorations(view);
    },
    setViewMode(nextMode: EditorViewMode) {
      currentViewMode = nextMode;
      setMarkdownEditorViewMode(view, nextMode);
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
