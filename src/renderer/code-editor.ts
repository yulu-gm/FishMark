import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import {
  createYuloraMarkdownExtensions,
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
  type ActiveBlockState
} from "@yulora/editor-core";
import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createPreviewAssetUrl } from "../shared/preview-asset-url";

export type CreateCodeEditorControllerOptions = {
  parent: Element;
  initialContent: string;
  documentPath?: string | null;
  onChange: (content: string) => void;
  onBlur?: () => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
  importClipboardImage?: (input: { documentPath: string | null }) => Promise<string | null>;
};

export type CodeEditorController = {
  getContent: () => string;
  getSelection: () => { anchor: number; head: number };
  replaceDocument: (nextContent: string) => void;
  setDocumentPath: (nextDocumentPath: string | null) => void;
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

export function createCodeEditorController(
  options: CreateCodeEditorControllerOptions
): CodeEditorController {
  let currentDocumentPath = options.documentPath ?? null;
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
      extensions: createYuloraMarkdownExtensions({
        parseMarkdownDocument,
        onContentChange: options.onChange,
        onActiveBlockChange: (nextState) => {
          activeBlockState = nextState;
          options.onActiveBlockChange?.(nextState);
        },
        resolveImagePreviewUrl: (href) => resolveImagePreviewUrl(currentDocumentPath, href),
        onBlur: options.onBlur
      })
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

    const clipboardItems = Array.from(event.clipboardData?.items ?? []);

    if (!clipboardItems.some((item) => item.type.startsWith("image/"))) {
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
    replaceDocument(nextContent: string) {
      const nextState = createState(nextContent);
      view.setState(nextState);
    },
    setDocumentPath(nextDocumentPath: string | null) {
      currentDocumentPath = nextDocumentPath;
      refreshMarkdownDecorations(view);
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
