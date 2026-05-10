import type { Range } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";

import {
  computeTableColumnLayout,
  formatTableColumnWidthPercent,
  parseInlineAst,
  tableBlockToCanonicalModel,
  type InlineNode,
  type TableBlock
} from "@fishmark/markdown-engine";

import type { TablePosition } from "../commands/table-context";

export type TableWidgetCallbacks = {
  selectCell: (position: TablePosition, options?: { restoreDomFocus?: boolean }) => void;
  updateCell: (position: TablePosition, text: string) => void;
  moveToNextCell: (position: TablePosition) => void;
  moveToPreviousCell: (position: TablePosition) => void;
  moveUp: (position: TablePosition) => void;
  moveDown: (position: TablePosition) => void;
  moveLeft: (position: TablePosition) => void;
  moveRight: (position: TablePosition) => void;
  moveDownOrExit: (position: TablePosition) => void;
  insertRowBelow: (position: TablePosition) => void;
};

const INLINE_CONTAINER_CLASS_BY_TYPE = {
  strong: "cm-inactive-inline-strong",
  emphasis: "cm-inactive-inline-emphasis",
  strikethrough: "cm-inactive-inline-strikethrough"
} as const;

type TableCellRenderMode = "plain" | "preview";
const compositionCommitFallbackTimers = new WeakMap<HTMLElement, number>();

export class TableWidget extends WidgetType {
  constructor(
    private readonly block: TableBlock,
    private readonly activePosition: TablePosition | null,
    private readonly callbacks: TableWidgetCallbacks | null
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return (
      other.block.id === this.block.id &&
      other.block.endOffset === this.block.endOffset &&
      other.activePosition?.row === this.activePosition?.row &&
      other.activePosition?.column === this.activePosition?.column
    );
  }

  override updateDOM(dom: HTMLElement): boolean {
    if (!this.canReuseDOM(dom)) {
      return false;
    }

    this.syncDOM(dom);
    return true;
  }

  override toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-table-widget";
    root.dataset.tableColumns = String(this.block.columnCount);
    root.dataset.tableStartOffset = String(this.block.startOffset);

    const table = document.createElement("table");
    table.className = "cm-table-widget-table";
    root.appendChild(table);
    table.appendChild(createTableColumnGroup(document, this.block));

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    if (this.block.hasHeader) {
      const thead = document.createElement("thead");
      table.insertBefore(thead, tbody);
      thead.appendChild(this.renderRow(this.block.header, true));
    } else {
      tbody.appendChild(this.renderRow(this.block.header, false));
    }

    this.block.rows.forEach((row) => {
      tbody.appendChild(this.renderRow(row, false));
    });

    return root;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  private renderRow(
    cells: readonly TableBlock["header"][number][],
    isHeader: boolean
  ): HTMLTableRowElement {
    const rowElement = document.createElement("tr");
    rowElement.className = isHeader ? "cm-table-widget-row cm-table-widget-row-header" : "cm-table-widget-row";

    cells.forEach((cell) => {
      const cellElement = document.createElement(isHeader ? "th" : "td");
      const isActive =
        this.activePosition?.row === cell.rowIndex &&
        this.activePosition?.column === cell.columnIndex;
      cellElement.className = "cm-table-widget-cell";
      cellElement.dataset.active = isActive ? "true" : "false";

      const editor = document.createElement("div");
      editor.className = "cm-table-widget-input";
      editor.contentEditable = "true";
      editor.spellcheck = false;
      editor.tabIndex = 0;
      editor.setAttribute("role", "textbox");
      editor.setAttribute("data-table-cell", `${cell.rowIndex}:${cell.columnIndex}`);
      editor.setAttribute("data-table-cell-preview", `${cell.rowIndex}:${cell.columnIndex}`);
      installEditorInputFacade(editor);
      syncTableCellEditor(editor, cell.text, { renderMode: isActive ? "plain" : "preview" });

      const readCurrentPosition = (): TablePosition => ({
        row: cell.rowIndex,
        column: cell.columnIndex,
        tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
        offsetInCell: readEditableSelection(editor).start
      });

      const commitEditorInput = () => {
        this.callbacks?.updateCell(readCurrentPosition(), readTableCellText(editor));
      };

      editor.addEventListener("mousedown", () => {
        if (editor.ownerDocument.activeElement !== editor) {
          editor.focus({ preventScroll: true });
        }

        this.callbacks?.selectCell({
          row: cell.rowIndex,
          column: cell.columnIndex,
          tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
          offsetInCell: readEditableSelection(editor).start
        }, { restoreDomFocus: false });
      });

      editor.addEventListener("focus", () => {
        this.callbacks?.selectCell(
          {
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
            offsetInCell: readEditableSelection(editor).start
          },
          { restoreDomFocus: false }
        );
      });

      editor.addEventListener("click", () => {
        this.callbacks?.selectCell({
          row: cell.rowIndex,
          column: cell.columnIndex,
          tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
          offsetInCell: readEditableSelection(editor).start
        }, { restoreDomFocus: false });
      });

      editor.addEventListener("compositionstart", () => {
        editor.dataset.tableCellComposing = "true";
        delete editor.dataset.tableCellPendingCompositionCommit;
        clearPendingCompositionCommitFallback(editor);
      });

      editor.addEventListener("compositionend", () => {
        delete editor.dataset.tableCellComposing;
        editor.dataset.tableCellPendingCompositionCommit = "true";
        schedulePendingCompositionCommitFallback(editor, commitEditorInput);
      });

      editor.addEventListener("input", () => {
        if (editor.dataset.tableCellComposing === "true") {
          return;
        }

        delete editor.dataset.tableCellPendingCompositionCommit;
        clearPendingCompositionCommitFallback(editor);
        commitEditorInput();
      });

      editor.addEventListener("keydown", (event) => {
        // Do not hijack navigation/confirm keys while an IME composition is
        // active. Pressing Arrow/Enter/Tab/Space during candidate selection
        // would otherwise leak into table navigation and tear the caret out
        // of the cell while the IME is still committing characters.
        if (event.isComposing || event.keyCode === 229) {
          return;
        }

        const selection = readEditableSelection(editor);

        if (event.key === "ArrowUp") {
          event.preventDefault();
          this.callbacks?.moveUp({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
            offsetInCell: selection.start
          });
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          this.callbacks?.moveDown({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
            offsetInCell: selection.start
          });
          return;
        }

        if (event.key === "ArrowLeft" && selection.start === selection.end && selection.start === 0) {
          event.preventDefault();
          this.callbacks?.moveLeft({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
            offsetInCell: 0
          });
          return;
        }

        if (
          event.key === "ArrowRight" &&
          selection.start === selection.end &&
          selection.end === readTableCellText(editor).length
        ) {
          event.preventDefault();
          this.callbacks?.moveRight({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
            offsetInCell: selection.end
          });
          return;
        }

        if (event.key === "Tab") {
          event.preventDefault();
          if (event.shiftKey) {
            this.callbacks?.moveToPreviousCell({
              row: cell.rowIndex,
              column: cell.columnIndex,
              tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset)
            });
          } else {
            this.callbacks?.moveToNextCell({
              row: cell.rowIndex,
              column: cell.columnIndex,
              tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset)
            });
          }
          return;
        }

        if (event.key === "Enter" && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const text = readTableCellText(editor);
          const insert = "<br>";
          const from = Math.min(selection.start, selection.end);
          const to = Math.max(selection.start, selection.end);

          this.callbacks?.updateCell(
            {
              row: cell.rowIndex,
              column: cell.columnIndex,
              tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
              offsetInCell: from + insert.length
            },
            `${text.slice(0, from)}${insert}${text.slice(to)}`
          );
          return;
        }

        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          this.callbacks?.moveDownOrExit({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
            offsetInCell: selection.start
          });
          return;
        }

        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this.callbacks?.insertRowBelow({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset)
          });
        }
      });

      cellElement.appendChild(editor);
      rowElement.appendChild(cellElement);
    });

    return rowElement;
  }

  private canReuseDOM(root: HTMLElement): boolean {
    if (!root.classList.contains("cm-table-widget")) {
      return false;
    }

    const tbody = root.querySelector("tbody");
    const thead = root.querySelector("thead");
    const expectedBodyRowCount = this.block.hasHeader ? this.block.rows.length : this.block.rows.length + 1;
    const expectedEditorCount = (this.block.rows.length + 1) * this.block.columnCount;

    if (!tbody || tbody.querySelectorAll("tr").length !== expectedBodyRowCount) {
      return false;
    }

    if (this.block.hasHeader && !thead) {
      return false;
    }

    if (!this.block.hasHeader && thead) {
      return false;
    }

    return root.querySelectorAll("[data-table-cell]").length === expectedEditorCount;
  }

  private syncDOM(root: HTMLElement): void {
    root.dataset.tableColumns = String(this.block.columnCount);
    root.dataset.tableStartOffset = String(this.block.startOffset);
    syncTableColumnGroup(root, this.block);

    [this.block.header, ...this.block.rows].forEach((cells) => {
      cells.forEach((cell) => {
        const editor = root.querySelector<HTMLElement>(
          `[data-table-cell="${cell.rowIndex}:${cell.columnIndex}"]`
        );
        const cellElement = editor?.closest<HTMLElement>(".cm-table-widget-cell");

        if (!editor || !cellElement) {
          return;
        }

        const isActive =
          this.activePosition?.row === cell.rowIndex &&
          this.activePosition?.column === cell.columnIndex;

        syncTableCellEditor(editor, cell.text, { renderMode: isActive ? "plain" : "preview" });
        cellElement.dataset.active = isActive ? "true" : "false";
      });
    });
  }
}

function createTableColumnGroup(document: Document, block: TableBlock): HTMLTableColElement {
  const colgroup = document.createElement("colgroup");

  colgroup.className = "cm-table-widget-column-group";
  syncTableColumnElements(colgroup, block);
  return colgroup;
}

function syncTableColumnGroup(root: HTMLElement, block: TableBlock): void {
  const table = root.querySelector<HTMLTableElement>(".cm-table-widget-table");

  if (!table) {
    return;
  }

  let colgroup = table.querySelector<HTMLTableColElement>(".cm-table-widget-column-group");

  if (!colgroup) {
    colgroup = createTableColumnGroup(table.ownerDocument, block);
    table.insertBefore(colgroup, table.firstChild);
    return;
  }

  syncTableColumnElements(colgroup, block);
}

function syncTableColumnElements(colgroup: HTMLElement, block: TableBlock): void {
  const layout = computeTableColumnLayout(tableBlockToCanonicalModel(block));

  while (colgroup.children.length > layout.length) {
    colgroup.lastElementChild?.remove();
  }

  layout.forEach((column) => {
    let element = colgroup.children[column.columnIndex] as HTMLTableColElement | undefined;

    if (!element) {
      element = colgroup.ownerDocument.createElement("col");
      colgroup.appendChild(element);
    }

    element.className = "cm-table-widget-column";
    element.dataset.columnIndex = String(column.columnIndex);
    element.style.width = formatTableColumnWidthPercent(column.widthPercent);
  });
}

function syncTableCellEditor(
  editor: HTMLElement,
  text: string,
  options: {
    renderMode?: TableCellRenderMode;
  } = {}
): void {
  const nextRenderMode = options.renderMode ?? readTableCellRenderMode(editor);

  if (
    editor.dataset.tableCellText === text &&
    readTableCellRenderMode(editor) === nextRenderMode
  ) {
    return;
  }

  // If the user just typed into a plain (active) cell, the DOM already reflects
  // the target text. Rebuilding children here would destroy the native caret
  // mid-keystroke, so just refresh the cached snapshot and leave the DOM alone.
  // We only take this shortcut when the element was previously rendered in
  // plain mode (so we know it has a valid structure), not on first render.
  if (
    nextRenderMode === "plain" &&
    editor.dataset.tableCellRenderMode === "plain" &&
    (editor.textContent ?? "") === text
  ) {
    editor.dataset.tableCellText = text;
    return;
  }

  editor.replaceChildren(
    nextRenderMode === "plain"
      ? buildPlainTextFragment(editor.ownerDocument, text)
      : buildInlinePreviewFragment(editor.ownerDocument, text)
  );
  editor.dataset.tableCellText = text;
  editor.dataset.tableCellRenderMode = nextRenderMode;
}

function readTableCellRenderMode(editor: HTMLElement): TableCellRenderMode {
  return editor.dataset.tableCellRenderMode === "preview" ? "preview" : "plain";
}

function clearPendingCompositionCommitFallback(editor: HTMLElement): void {
  const timerId = compositionCommitFallbackTimers.get(editor);

  if (timerId === undefined) {
    return;
  }

  const view = editor.ownerDocument.defaultView;
  if (view) {
    view.clearTimeout(timerId);
  }
  compositionCommitFallbackTimers.delete(editor);
}

function schedulePendingCompositionCommitFallback(
  editor: HTMLElement,
  commit: () => void
): void {
  clearPendingCompositionCommitFallback(editor);

  const view = editor.ownerDocument.defaultView;
  if (!view) {
    return;
  }

  const timerId = view.setTimeout(() => {
    compositionCommitFallbackTimers.delete(editor);

    if (editor.dataset.tableCellPendingCompositionCommit !== "true") {
      return;
    }

    delete editor.dataset.tableCellPendingCompositionCommit;
    commit();
  }, 0);

  compositionCommitFallbackTimers.set(editor, timerId);
}

function buildPlainTextFragment(document: Document, text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();

  if (text.length === 0) {
    fragment.appendChild(document.createElement("br"));
    return fragment;
  }

  fragment.appendChild(document.createTextNode(text));
  return fragment;
}

function buildInlinePreviewFragment(document: Document, text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const inline = parseInlineAst(text, 0, text.length);

  inline.children.forEach((node) => {
    appendInlineNode(fragment, document, text, node);
  });

  if (!fragment.hasChildNodes()) {
    fragment.appendChild(document.createElement("br"));
  }

  return fragment;
}

function appendInlineNode(
  parent: Node,
  document: Document,
  source: string,
  node: InlineNode
): void {
  if (shouldRenderNodeAsPlainText(node)) {
    appendDecoratedPlainText(parent, document, source.slice(node.startOffset, node.endOffset));
    return;
  }

  switch (node.type) {
    case "text":
      appendDecoratedPlainText(parent, document, node.value);
      return;
    case "hardBreak":
      parent.appendChild(document.createElement("br"));
      return;
    case "codeSpan":
      appendMarker(parent, document, source.slice(node.openMarker.startOffset, node.openMarker.endOffset));
      appendInlineContent(parent, document, "cm-inactive-inline-code", node.text);
      appendMarker(parent, document, source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset));
      return;
    case "strong":
    case "emphasis":
    case "strikethrough": {
      appendMarker(parent, document, source.slice(node.openMarker.startOffset, node.openMarker.endOffset));
      const content = document.createElement("span");
      content.className = INLINE_CONTAINER_CLASS_BY_TYPE[node.type];
      node.children.forEach((child) => appendInlineNode(content, document, source, child));
      parent.appendChild(content);
      appendMarker(parent, document, source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset));
      return;
    }
    case "link":
    case "image":
      appendMarker(parent, document, source.slice(node.openMarker.startOffset, node.openMarker.endOffset));
      node.children.forEach((child) => appendInlineNode(parent, document, source, child));
      appendMarker(parent, document, source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset));
      appendDecoratedPlainText(parent, document, source.slice(node.closeMarker.endOffset, node.endOffset));
      return;
  }
}

function shouldRenderNodeAsPlainText(node: InlineNode): boolean {
  switch (node.type) {
    case "text":
      return false;
    case "hardBreak":
      return false;
    case "codeSpan":
      return (
        node.text.length === 0 ||
        node.openMarker.endOffset >= node.closeMarker.startOffset
      );
    case "strong":
    case "emphasis":
    case "strikethrough":
      return (
        node.children.length === 0 ||
        node.openMarker.endOffset >= node.closeMarker.startOffset
      );
    case "link":
    case "image":
      return false;
  }
}

function appendInlineContent(
  parent: Node,
  document: Document,
  className: string,
  text: string
): void {
  const content = document.createElement("span");
  content.className = className;
  content.textContent = text;
  parent.appendChild(content);
}

function appendMarker(parent: Node, document: Document, text: string): void {
  if (text.length === 0) {
    return;
  }

  const marker = document.createElement("span");
  marker.className = "cm-inactive-inline-marker";
  marker.textContent = text;
  parent.appendChild(marker);
}

function appendDecoratedPlainText(parent: Node, document: Document, text: string): void {
  if (text.length === 0) {
    return;
  }

  const matches = Array.from(text.matchAll(/[\p{Script=Han}\u3000-\u303F\uFF00-\uFFEF]+/gu));

  if (matches.length === 0) {
    parent.appendChild(document.createTextNode(text));
    return;
  }

  let cursor = 0;

  for (const match of matches) {
    if (typeof match.index !== "number") {
      continue;
    }

    if (match.index > cursor) {
      parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
    }

    const cjkSpan = document.createElement("span");
    cjkSpan.className = "cm-fishmark-cjk-font";
    cjkSpan.textContent = match[0];
    parent.appendChild(cjkSpan);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parent.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

function readTableCellText(editor: HTMLElement): string {
  // Always read the live DOM. `dataset.tableCellText` is just a snapshot of the
  // last synced render; during typing it lags behind what the user just entered,
  // so relying on it here would make input/selection handlers see stale text.
  return editor.textContent ?? "";
}

function readEditableSelection(editor: HTMLElement): { start: number; end: number } {
  const selection = editor.ownerDocument.getSelection();
  const contentLength = readTableCellText(editor).length;

  if (!selection || selection.rangeCount === 0) {
    return { start: contentLength, end: contentLength };
  }

  const range = selection.getRangeAt(0);

  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return { start: contentLength, end: contentLength };
  }

  return {
    start: measureRangeTextLength(editor, range.startContainer, range.startOffset),
    end: measureRangeTextLength(editor, range.endContainer, range.endOffset)
  };
}

function measureRangeTextLength(editor: HTMLElement, node: Node, offset: number): number {
  // Walk only text nodes so placeholder <br> elements (used for empty cells)
  // do not get counted as a newline by Range.toString().
  if (node.nodeType === Node.TEXT_NODE) {
    const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let total = 0;
    let current = walker.nextNode();

    while (current) {
      if (current === node) {
        return total + offset;
      }
      total += current.textContent?.length ?? 0;
      current = walker.nextNode();
    }

    return total;
  }

  // Element node: offset is a child index. Sum the text length of the children
  // before that index.
  let total = 0;
  for (let i = 0; i < offset && i < node.childNodes.length; i += 1) {
    const child = node.childNodes[i];
    total += (child?.textContent ?? "").length;
  }

  // Add text length of preceding siblings up the ancestor chain.
  let ancestor: Node | null = node;
  while (ancestor && ancestor !== editor) {
    let sibling = ancestor.previousSibling;
    while (sibling) {
      total += (sibling.textContent ?? "").length;
      sibling = sibling.previousSibling;
    }
    ancestor = ancestor.parentNode;
  }

  return total;
}

function installEditorInputFacade(editor: HTMLElement): void {
  const facadeEditor = editor as HTMLElement & {
    value?: string;
    selectionStart?: number;
    selectionEnd?: number;
    setSelectionRange?: (start: number, end: number) => void;
  };

  if (typeof facadeEditor.setSelectionRange === "function") {
    return;
  }

  Object.defineProperties(facadeEditor, {
    value: {
      configurable: true,
      enumerable: false,
      get() {
        return readTableCellText(editor);
      },
      set(nextValue: string) {
        syncTableCellEditor(editor, nextValue);
      }
    },
    selectionStart: {
      configurable: true,
      enumerable: false,
      get() {
        return readEditableSelection(editor).start;
      }
    },
    selectionEnd: {
      configurable: true,
      enumerable: false,
      get() {
        return readEditableSelection(editor).end;
      }
    },
    setSelectionRange: {
      configurable: true,
      enumerable: false,
      value(start: number, end: number) {
        setEditableSelection(editor, start, end);
      }
    }
  });
}

function setEditableSelection(editor: HTMLElement, start: number, end: number): void {
  const selection = editor.ownerDocument.getSelection();

  if (!selection) {
    return;
  }

  const contentLength = readTableCellText(editor).length;
  const clampedStart = Math.max(0, Math.min(start, contentLength));
  const clampedEnd = Math.max(clampedStart, Math.min(end, contentLength));
  const startTarget = resolveSelectionTarget(editor, clampedStart);
  const endTarget = resolveSelectionTarget(editor, clampedEnd);
  const range = editor.ownerDocument.createRange();

  range.setStart(startTarget.node, startTarget.offset);
  range.setEnd(endTarget.node, endTarget.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function resolveSelectionTarget(
  editor: HTMLElement,
  offset: number
): { node: Node; offset: number } {
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textLength = currentNode.textContent?.length ?? 0;

    if (consumed + textLength >= offset) {
      return {
        node: currentNode,
        offset: offset - consumed
      };
    }

    consumed += textLength;
    currentNode = walker.nextNode();
  }

  return {
    node: editor,
    offset: editor.childNodes.length
  };
}

function resolveWidgetTableStartOffset(editor: HTMLElement, fallback: number): number {
  const root = editor.closest<HTMLElement>(".cm-table-widget");
  const value = root?.dataset.tableStartOffset;
  const parsed = value ? Number(value) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createTableWidgetDecoration(
  block: TableBlock,
  activePosition: TablePosition | null,
  callbacks: TableWidgetCallbacks | null
): Range<Decoration> {
  return Decoration.replace({
    block: true,
    widget: new TableWidget(block, activePosition, callbacks)
  }).range(block.startOffset, block.endOffset);
}
