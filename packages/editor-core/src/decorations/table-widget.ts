import { Decoration, WidgetType } from "@codemirror/view";
import type { Range } from "@codemirror/state";

import type { TableBlock } from "@yulora/markdown-engine";

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
      cellElement.className = "cm-table-widget-cell";
      cellElement.dataset.active =
        this.activePosition?.row === cell.rowIndex &&
        this.activePosition?.column === cell.columnIndex
          ? "true"
          : "false";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "cm-table-widget-input";
      input.value = cell.text;
      input.setAttribute("data-table-cell", `${cell.rowIndex}:${cell.columnIndex}`);

      input.addEventListener("mousedown", () => {
        this.callbacks?.selectCell({
          row: cell.rowIndex,
          column: cell.columnIndex,
          tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
          offsetInCell: input.selectionStart ?? input.value.length
        });
      });

      input.addEventListener("focus", () => {
        this.callbacks?.selectCell({
          row: cell.rowIndex,
          column: cell.columnIndex,
          tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
          offsetInCell: input.selectionStart ?? input.value.length
        }, { restoreDomFocus: false });
      });

      input.addEventListener("click", () => {
        this.callbacks?.selectCell({
          row: cell.rowIndex,
          column: cell.columnIndex,
          tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
          offsetInCell: input.selectionStart ?? input.value.length
        });
      });

      input.addEventListener("input", () => {
        this.callbacks?.updateCell(
          {
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
            offsetInCell: input.selectionStart ?? input.value.length
          },
          input.value
        );
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          this.callbacks?.moveUp({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
            offsetInCell: input.selectionStart ?? 0
          });
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          this.callbacks?.moveDown({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
            offsetInCell: input.selectionStart ?? 0
          });
          return;
        }

        if (
          event.key === "ArrowLeft" &&
          input.selectionStart === input.selectionEnd &&
          (input.selectionStart ?? 0) === 0
        ) {
          event.preventDefault();
          this.callbacks?.moveLeft({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
            offsetInCell: 0
          });
          return;
        }

        if (
          event.key === "ArrowRight" &&
          input.selectionStart === input.selectionEnd &&
          (input.selectionEnd ?? input.value.length) === input.value.length
        ) {
          event.preventDefault();
          this.callbacks?.moveRight({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
            offsetInCell: input.value.length
          });
          return;
        }

        if (event.key === "Tab") {
          event.preventDefault();
          if (event.shiftKey) {
            this.callbacks?.moveToPreviousCell({
              row: cell.rowIndex,
              column: cell.columnIndex,
              tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset)
            });
          } else {
            this.callbacks?.moveToNextCell({
              row: cell.rowIndex,
              column: cell.columnIndex,
              tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset)
            });
          }
          return;
        }

        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          this.callbacks?.moveDownOrExit({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset),
            offsetInCell: input.selectionStart ?? 0
          });
          return;
        }

        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          this.callbacks?.insertRowBelow({
            row: cell.rowIndex,
            column: cell.columnIndex,
            tableStartOffset: resolveWidgetTableStartOffset(input, this.block.startOffset)
          });
        }
      });

      cellElement.appendChild(input);
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
    const expectedInputCount = (this.block.rows.length + 1) * this.block.columnCount;

    if (!tbody || tbody.querySelectorAll("tr").length !== expectedBodyRowCount) {
      return false;
    }

    if (this.block.hasHeader && !thead) {
      return false;
    }

    if (!this.block.hasHeader && thead) {
      return false;
    }

    return root.querySelectorAll("[data-table-cell]").length === expectedInputCount;
  }

  private syncDOM(root: HTMLElement): void {
    root.dataset.tableColumns = String(this.block.columnCount);
    root.dataset.tableStartOffset = String(this.block.startOffset);

    [this.block.header, ...this.block.rows].forEach((cells) => {
      cells.forEach((cell) => {
        const input = root.querySelector<HTMLInputElement>(
          `[data-table-cell="${cell.rowIndex}:${cell.columnIndex}"]`
        );
        const cellElement = input?.closest<HTMLElement>(".cm-table-widget-cell");

        if (!input || !cellElement) {
          return;
        }

        if (input.value !== cell.text) {
          input.value = cell.text;
        }

        cellElement.dataset.active =
          this.activePosition?.row === cell.rowIndex &&
          this.activePosition?.column === cell.columnIndex
            ? "true"
            : "false";
      });
    });
  }
}

function resolveWidgetTableStartOffset(input: HTMLInputElement, fallback: number): number {
  const root = input.closest<HTMLElement>(".cm-table-widget");
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
