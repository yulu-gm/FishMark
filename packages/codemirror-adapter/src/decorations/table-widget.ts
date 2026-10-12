import type { Range } from "@codemirror/state";
import { BlockType, Decoration, WidgetType, type EditorView } from "@codemirror/view";

import {
  computeTableColumnLayout,
  formatTableColumnWidthPercent,
  tableBlockToCanonicalModel,
  type InlineRoot,
  type InlineNode,
  type TableBlock
} from "@fishmark/markdown-engine";

import type { TablePosition } from "../table-context";
import type { WidgetMeasurementTarget } from "./widget-lifecycle";
import { isWidgetMounted } from "./widget-lifecycle";

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
const renderedCellInline = new WeakMap<HTMLElement, InlineRoot | undefined>();
const parkedPlainCellNodes = new WeakMap<HTMLElement, { text: string; nodes: Node[] }>();
const reservedCellContent = new WeakMap<HTMLElement, { text: string; source: string; inline: InlineRoot | undefined }>();

// The editable cell elements are snapshotted per widget root so `destroy` can cancel every
// composition fallback this instance scheduled. The snapshot lives in a `WeakMap` keyed by the root,
// so tearing the widget down drops the last reference to both the array and the instance instead of
// keeping a detached widget (or its DOM) alive.
const mountedCellEditors = new WeakMap<HTMLElement, HTMLElement[]>();

// CodeMirror may reuse a widget's DOM for a *different* widget instance (`WidgetType.updateDOM`).
// From then on the new instance usually owns that DOM, but the old instance keeps the closures it
// registered for the cells it created. Those closures must never reach the model again: every
// dispatch therefore re-proves that the cell's element is still mounted inside this instance's root.
//
// The mount point is the widget root's parent, because the editor view is not reachable from a cell
// element once the widget has been detached. The structural `dom.contains` contract keeps the check
// independent of `@codemirror/view`: the root still has to have a live parent, and the cell element
// still has to be inside it. That combination fails for a torn-down widget and for DOM CodeMirror
// handed to a newer instance.
//
// `isWidgetMounted` would additionally require `container.isConnected`, which is false for an editor
// host that is detached from the document while it is built or moved. That is a legitimate, mounted
// editor (three existing tests build one), so demanding document connectivity would drop real user
// events and change mounted-widget behaviour. The helper is therefore not the right predicate here;
// only its `dom.contains` shape is reused.
function isCellOwnedByRoot(root: HTMLElement, editor: HTMLElement): boolean {
  const parent = root.parentNode;

  if (parent === null || editor.closest(".cm-table-widget") !== root) {
    return false;
  }

  const target: WidgetMeasurementTarget = {
    dom: { contains: (other) => parent.contains(other) },
    requestMeasure: () => undefined
  };

  return target.dom.contains(editor) && target.dom.contains(root);
}

function readLiveCellEditors(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-table-cell]"));
}

function trackLiveCellEditors(root: HTMLElement): void {
  mountedCellEditors.set(root, readLiveCellEditors(root));
}

export type TableWidgetRenderOptions = {
  readonly containerClassName?: string;
  readonly containerDepth?: number;
};

const mountedTableMeasurements = new WeakMap<HTMLElement, {
  owner: TableWidget;
  source: string;
  block: TableBlock;
  renderOptions: TableWidgetRenderOptions;
}>();

// State decorations are rebuilt before CodeMirror updates widget DOM. Preserve
// the currently mounted table's height for that synchronous estimate, rather
// than temporarily replacing a tall table with the default one-line estimate.
// The caller supplies the actual view, so even shared callbacks cannot mix views.
export function readMountedTableWidgetHeight(
  view: { readonly dom: HTMLElement; requestMeasure(): void },
  block: TableBlock,
  source: string,
  renderOptions: TableWidgetRenderOptions
): number {
  const root = view.dom.querySelector<HTMLElement>(
    `.cm-table-widget[data-table-start-offset="${block.startOffset}"]`
  );
  const mounted = root ? mountedTableMeasurements.get(root) : undefined;
  if (!root || !mounted || !isWidgetMounted(view, root) ||
    mounted.source !== source || mounted.block.id !== block.id ||
    mounted.block.startOffset !== block.startOffset ||
    mounted.block.endOffset !== block.endOffset ||
    mounted.renderOptions.containerClassName !== renderOptions.containerClassName ||
    mounted.renderOptions.containerDepth !== renderOptions.containerDepth) return -1;
  const height = root.getBoundingClientRect().height;
  return Number.isFinite(height) && height > 0 ? height : -1;
}

// A previously measured table can have just left the viewport. Its DOM is then
// absent, but this view's height map still holds its measured block height.
// Reuse that public BlockInfo only for the exact same source, range and context;
// otherwise a rebuild would collapse the offscreen table to a one-line estimate.
export function readTableWidgetHeightEstimate(
  view: Pick<EditorView, "dom" | "requestMeasure" | "lineBlockAt" | "contentHeight" | "documentPadding">,
  block: TableBlock,
  source: string,
  renderOptions: TableWidgetRenderOptions
): number {
  const mountedHeight = readMountedTableWidgetHeight(view, block, source, renderOptions);
  if (mountedHeight > 0) return mountedHeight;
  // The pinned CM view compresses offscreen heights at 7,000,000px. Its public
  // BlockInfo is then in DOM coordinates, unsuitable for an unscaled estimate.
  // Conservatively reject that boundary (including rounding near the limit).
  const padding = view.documentPadding;
  const documentHeight = view.contentHeight - padding.top - padding.bottom;
  if (!Number.isFinite(documentHeight) || documentHeight >= 6999999) return -1;
  const previous = view.lineBlockAt(block.startOffset);
  if (previous.type !== BlockType.WidgetRange || previous.from !== block.startOffset ||
    previous.to !== block.endOffset || !(previous.widget instanceof TableWidget) ||
    !previous.widget.matchesHeightSource(block, source, renderOptions)) return -1;
  return Number.isFinite(previous.height) && previous.height > 0 ? previous.height : -1;
}

export class TableWidget extends WidgetType {
  constructor(
    private readonly block: TableBlock,
    private readonly activePosition: TablePosition | null,
    private readonly callbacks: TableWidgetCallbacks | null,
    private readonly source: string,
    private readonly renderOptions: TableWidgetRenderOptions = {},
    private readonly mountedHeight = -1
  ) {
    super();
  }

  override get estimatedHeight(): number {
    return this.mountedHeight;
  }

  matchesHeightSource(block: TableBlock, source: string, renderOptions: TableWidgetRenderOptions): boolean {
    return this.source === source && this.block.id === block.id &&
      this.block.startOffset === block.startOffset && this.block.endOffset === block.endOffset &&
      this.renderOptions.containerClassName === renderOptions.containerClassName &&
      this.renderOptions.containerDepth === renderOptions.containerDepth;
  }

  override eq(other: TableWidget): boolean {
    return (
      other.block.id === this.block.id &&
      other.block.endOffset === this.block.endOffset &&
      other.activePosition?.row === this.activePosition?.row &&
      other.activePosition?.column === this.activePosition?.column &&
      other.source === this.source &&
      other.renderOptions.containerClassName === this.renderOptions.containerClassName &&
      other.renderOptions.containerDepth === this.renderOptions.containerDepth
    );
  }

  override updateDOM(dom: HTMLElement): boolean {
    if (!this.canReuseDOM(dom)) {
      return false;
    }

    this.syncDOM(dom);
    this.trackMeasurement(dom);
    return true;
  }

  override toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-table-widget";
    applyTableWidgetRenderOptions(root, this.renderOptions);
    root.dataset.tableColumns = String(this.block.columnCount);
    root.dataset.tableStartOffset = String(this.block.startOffset);

    const table = document.createElement("table");
    table.className = "cm-table-widget-table";
    root.appendChild(table);
    table.appendChild(createTableColumnGroup(document, this.block, root));

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    if (this.block.hasHeader) {
      const thead = document.createElement("thead");
      table.insertBefore(thead, tbody);
      thead.appendChild(this.renderRow(root, this.block.header, true));
    } else {
      tbody.appendChild(this.renderRow(root, this.block.header, false));
    }

    this.block.rows.forEach((row) => {
      tbody.appendChild(this.renderRow(root, row, false));
    });

    trackLiveCellEditors(root);
    this.trackMeasurement(root);
    return root;
  }

  // CodeMirror calls this when the widget leaves the document. Cancelling the composition fallbacks
  // here means a teardown never leaves a timer that would dispatch a cell update for a widget (or a
  // document revision) that no longer exists.
  override destroy(dom: HTMLElement): void {
    if (mountedTableMeasurements.get(dom)?.owner === this) mountedTableMeasurements.delete(dom);
    const editors = mountedCellEditors.get(dom) ?? readLiveCellEditors(dom);

    editors.forEach((editor) => {
      delete editor.dataset.tableCellPendingCompositionCommit;
      clearPendingCompositionCommitFallback(editor);
    });
    mountedCellEditors.delete(dom);
  }

  override ignoreEvent(): boolean {
    return true;
  }

  private trackMeasurement(root: HTMLElement): void {
    mountedTableMeasurements.set(root, { owner: this, source: this.source,
      block: this.block, renderOptions: this.renderOptions });
  }

  private renderRow(
    root: HTMLElement,
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
      syncTableCellEditor(editor, cell.text, {
        inline: cell.inline,
        source: this.source,
        renderMode: isActive ? "plain" : "preview"
      });

      const readCurrentPosition = (): TablePosition => ({
        row: cell.rowIndex,
        column: cell.columnIndex,
        tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
        offsetInCell: readEditableSelection(editor).start
      });

      // The single liveness question every dispatch for this cell asks. A widget whose DOM was
      // detached, or handed to a newer instance, drops the event instead of writing through the
      // `tableStartOffset` it recorded for a document revision that may no longer exist.
      const isCellLive = () => isCellOwnedByRoot(root, editor);
      let historyPreviewNodes: Node[] | null = null;

      const commitEditorInput = () => {
        if (!isCellLive()) {
          return;
        }

        this.callbacks?.updateCell(readCurrentPosition(), readTableCellText(editor));
      };

      editor.addEventListener("mousedown", () => {
        if (!isCellLive()) {
          return;
        }

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
        if (!isCellLive()) {
          return;
        }

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
        if (!isCellLive()) {
          return;
        }

        this.callbacks?.selectCell({
          row: cell.rowIndex,
          column: cell.columnIndex,
          tableStartOffset: resolveWidgetTableStartOffset(editor, this.block.startOffset),
          offsetInCell: readEditableSelection(editor).start
        }, { restoreDomFocus: false });
      });

      editor.addEventListener("compositionstart", () => {
        if (!isCellLive()) {
          return;
        }

        editor.dataset.tableCellComposing = "true";
        delete editor.dataset.tableCellPendingCompositionCommit;
        clearPendingCompositionCommitFallback(editor);
      });

      editor.addEventListener("compositionend", () => {
        if (!isCellLive()) {
          return;
        }

        delete editor.dataset.tableCellComposing;
        editor.dataset.tableCellPendingCompositionCommit = "true";
        schedulePendingCompositionCommitFallback(editor, commitEditorInput);
      });

      editor.addEventListener("beforeinput", (event) => {
        if (
          !isCellLive() || !(event instanceof InputEvent) || event.isComposing ||
          editor.dataset.tableCellComposing === "true" ||
          (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") ||
          readTableCellRenderMode(editor) !== "preview"
        ) {
          return;
        }
        // Chromium can target the last edited cell while another cell has focus.
        // Give its original editing nodes back before the native command runs.
        const previewNodes = Array.from(editor.childNodes);
        if (restoreParkedPlainCellNodes(editor, editor.dataset.tableCellText ?? "")) {
          historyPreviewNodes = previewNodes;
        }
      });

      editor.addEventListener("input", (event) => {
        if (!isCellLive()) {
          return;
        }

        if (editor.dataset.tableCellComposing === "true") {
          return;
        }

        delete editor.dataset.tableCellPendingCompositionCommit;
        clearPendingCompositionCommitFallback(editor);
        const previewNodes = historyPreviewNodes;
        historyPreviewNodes = null;
        if (
          event instanceof InputEvent &&
          (event.inputType === "historyUndo" || event.inputType === "historyRedo") &&
          readTableCellText(editor) === editor.dataset.tableCellText
        ) {
          if (previewNodes) {
            parkedPlainCellNodes.set(editor, { text: readTableCellText(editor), nodes: Array.from(editor.childNodes) });
            editor.replaceChildren(...previewNodes);
            editor.dataset.tableCellRenderMode = "preview";
          }
          return;
        }
        commitEditorInput();
      });

      editor.addEventListener("keydown", (event) => {
        if (!isCellLive()) {
          return;
        }

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

      const layout = document.createElement("div");
      layout.className = "cm-table-widget-cell-layout";
      for (const mode of ["source", "preview"]) {
        const reservation = document.createElement("div");
        reservation.className = `cm-table-widget-height-${mode}`;
        reservation.contentEditable = "false";
        reservation.setAttribute("aria-hidden", "true");
        reservation.inert = true;
        layout.appendChild(reservation);
      }
      syncTableCellHeightReservation(layout, cell.text, cell.inline, this.source);
      layout.appendChild(editor);
      cellElement.appendChild(layout);
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

    const editors = Array.from(root.querySelectorAll<HTMLElement>("[data-table-cell]"));
    return editors.length === expectedEditorCount && editors.every((editor) =>
      editor.parentElement?.classList.contains("cm-table-widget-cell-layout") &&
      editor.parentElement.querySelector(".cm-table-widget-height-source") &&
      editor.parentElement.querySelector(".cm-table-widget-height-preview"));
  }

  private syncDOM(root: HTMLElement): void {
    applyTableWidgetRenderOptions(root, this.renderOptions);
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

        syncTableCellEditor(editor, cell.text, {
          inline: cell.inline,
          source: this.source,
          renderMode: isActive ? "plain" : "preview"
        });
        syncTableCellHeightReservation(editor.parentElement!, cell.text, cell.inline, this.source);
        cellElement.dataset.active = isActive ? "true" : "false";
      });
    });
  }
}

// These inert siblings reserve the greater preview/source height at the current
// column width. They never enter the editable subtree or its native undo history,
// and focus changes reuse their nodes. Only canonical content changes redraw them.
function syncTableCellHeightReservation(
  layout: HTMLElement, text: string, inline: InlineRoot | undefined, source: string
): void {
  const previous = reservedCellContent.get(layout);
  if (previous?.text === text && previous.inline === inline && previous.source === source) return;
  const plain = layout.querySelector<HTMLElement>(".cm-table-widget-height-source")!;
  const preview = layout.querySelector<HTMLElement>(".cm-table-widget-height-preview")!;
  plain.replaceChildren(buildPlainTextFragment(layout.ownerDocument, text));
  preview.replaceChildren(inline ? buildInlinePreviewFragment(layout.ownerDocument, source, inline) :
    buildPlainTextFragment(layout.ownerDocument, text));
  reservedCellContent.set(layout, { text, source, inline });
}

function applyTableWidgetRenderOptions(
  root: HTMLElement,
  renderOptions: TableWidgetRenderOptions
): void {
  const previousContainerClassName = root.dataset.containerClassName;

  if (previousContainerClassName) {
    root.classList.remove(previousContainerClassName);
    delete root.dataset.containerClassName;
  }

  for (const className of Array.from(root.classList)) {
    if (
      className === "cm-table-widget-blockquote" ||
      className.startsWith("cm-table-widget-blockquote-depth-")
    ) {
      root.classList.remove(className);
    }
  }

  delete root.dataset.containerDepth;

  if (renderOptions.containerClassName) {
    root.classList.add(renderOptions.containerClassName);
    root.dataset.containerClassName = renderOptions.containerClassName;
  }

  if (typeof renderOptions.containerDepth === "number") {
    root.dataset.containerDepth = String(renderOptions.containerDepth);
    root.classList.add(
      `cm-table-widget-blockquote-depth-${Math.max(1, Math.min(renderOptions.containerDepth, 4))}`
    );
  }
}

function createTableColumnGroup(document: Document, block: TableBlock, root: HTMLElement): HTMLTableColElement {
  const colgroup = document.createElement("colgroup");

  colgroup.className = "cm-table-widget-column-group";
  syncTableColumnElements(colgroup, block, root);
  return colgroup;
}

function syncTableColumnGroup(root: HTMLElement, block: TableBlock): void {
  const table = root.querySelector<HTMLTableElement>(".cm-table-widget-table");

  if (!table) {
    return;
  }

  let colgroup = table.querySelector<HTMLTableColElement>(".cm-table-widget-column-group");

  if (!colgroup) {
    colgroup = createTableColumnGroup(table.ownerDocument, block, root);
    table.insertBefore(colgroup, table.firstChild);
    return;
  }

  syncTableColumnElements(colgroup, block, root);
}

function syncTableColumnElements(colgroup: HTMLElement, block: TableBlock, root: HTMLElement): void {
  const layout = computeTableColumnLayout(tableBlockToCanonicalModel(block));

  // Preserve the existing column ratios, but ensure even the smallest column
  // can contain its editable padding and one character. Grid-item hit testing
  // otherwise lets a later narrow cell cover its neighbour's overflow glyph.
  const percentages = layout.map(column =>
    Number.parseFloat(formatTableColumnWidthPercent(column.widthPercent)) || column.widthPercent);
  const minimumPercent = percentages.reduce((minimum, percent) => Math.min(minimum, percent), Infinity);
  const totalPercent = percentages.reduce((total, percent) => total + percent, 0);
  if (Number.isFinite(minimumPercent) && minimumPercent > 0) {
    root.style.setProperty("--fishmark-table-min-width-columns", String(Math.max(100, totalPercent) / minimumPercent));
  } else {
    root.style.removeProperty("--fishmark-table-min-width-columns");
  }

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
    inline?: InlineRoot;
    source?: string;
    renderMode?: TableCellRenderMode;
  } = {}
): void {
  const nextRenderMode = options.renderMode ?? readTableCellRenderMode(editor);

  if (
    editor.dataset.tableCellText === text &&
    readTableCellRenderMode(editor) === nextRenderMode &&
    (nextRenderMode === "plain" || renderedCellInline.get(editor) === options.inline)
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

  const parked = parkedPlainCellNodes.get(editor);
  if (
    nextRenderMode === "preview" &&
    editor.dataset.tableCellRenderMode === "plain" &&
    readTableCellText(editor) === text
  ) {
    // Chromium's editing history refers to the original editable nodes. Preserve
    // those nodes while rendering an inactive preview, then put them back on focus.
    parkedPlainCellNodes.set(editor, { text, nodes: Array.from(editor.childNodes) });
  } else if (parked?.text !== text) {
    parkedPlainCellNodes.delete(editor);
  }
  if (nextRenderMode !== "plain" || !restoreParkedPlainCellNodes(editor, text)) {
    editor.replaceChildren(
      nextRenderMode === "plain"
        ? buildPlainTextFragment(editor.ownerDocument, text)
        : buildInlinePreviewFragment(editor.ownerDocument, options.source ?? "", options.inline)
    );
  }
  editor.dataset.tableCellText = text;
  editor.dataset.tableCellRenderMode = nextRenderMode;
  renderedCellInline.set(editor, options.inline);
}

function restoreParkedPlainCellNodes(editor: HTMLElement, text: string): boolean {
  const parked = parkedPlainCellNodes.get(editor);
  if (!parked) return false;
  parkedPlainCellNodes.delete(editor);
  // Detached nodes remain mutable; canonical source still decides whether they
  // can be reused. Never restore a stale browser mutation over document history.
  if (parked.text !== text || parked.nodes.map((node) => node.textContent ?? "").join("") !== text) return false;
  editor.replaceChildren(...parked.nodes);
  editor.dataset.tableCellRenderMode = "plain";
  return true;
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

function buildInlinePreviewFragment(
  document: Document,
  source: string,
  inline: InlineRoot | undefined
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (!inline) throw new Error("Table preview requires canonical cell inline metadata");

  inline.children.forEach((node) => {
    appendInlineNode(fragment, document, source, node);
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
    case "footnoteReference":
      appendMarker(parent, document, source.slice(node.openMarker.startOffset, node.openMarker.endOffset));
      appendInlineContent(parent, document, "cm-inactive-inline-footnote-reference", node.label);
      appendMarker(parent, document, source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset));
      return;
    case "codeSpan":
      appendMarker(parent, document, source.slice(node.openMarker.startOffset, node.openMarker.endOffset));
      appendInlineContent(parent, document, "cm-inactive-inline-code", node.text);
      appendMarker(parent, document, source.slice(node.closeMarker.startOffset, node.closeMarker.endOffset));
      return;
    case "inlineMath":
      appendMarker(parent, document, source.slice(node.openMarker.startOffset, node.openMarker.endOffset));
      appendInlineContent(parent, document, "cm-inactive-inline-math", node.value);
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
    case "footnoteReference":
      return false;
    case "codeSpan":
      return (
        node.text.length === 0 ||
        node.openMarker.endOffset >= node.closeMarker.startOffset
      );
    case "inlineMath":
      return (
        node.value.length === 0 ||
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

export function readEditableSelection(editor: HTMLElement): { start: number; end: number } {
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
  callbacks: TableWidgetCallbacks | null,
  source: string,
  renderOptions: TableWidgetRenderOptions = {},
  mountedHeight = -1
): Range<Decoration> {
  return Decoration.replace({
    block: true,
    widget: new TableWidget(block, activePosition, callbacks, source, renderOptions, mountedHeight)
  }).range(block.startOffset, block.endOffset);
}
