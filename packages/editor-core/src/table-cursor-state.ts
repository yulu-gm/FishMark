import type { ActiveBlockSelection } from "./active-block";

import type { MarkdownDocument, TableBlock, TableCell } from "@yulora/markdown-engine";

export type TableCursorMode = "inside" | "adjacent-above" | "adjacent-below";

export type TableCursorState = {
  mode: TableCursorMode;
  tableStartOffset: number;
  row: number;
  column: number;
  offsetInCell: number;
};

export function deriveTableCursorState(
  source: string,
  selection: ActiveBlockSelection,
  markdownDocument: MarkdownDocument,
  previousCursor: TableCursorState | null
): TableCursorState | null {
  const tableBlocks = markdownDocument.blocks.filter(
    (block): block is TableBlock => block.type === "table"
  );
  const containingTable = tableBlocks.find(
    (block) => selection.head >= block.startOffset && selection.head < block.endOffset
  );

  if (containingTable) {
    return createInsideTableCursor(containingTable, selection.head);
  }

  const lineNumber = resolveLineNumberAtOffset(source, selection.head);
  const tableBelow = tableBlocks.find((block) => block.startLine === lineNumber + 1);

  if (tableBelow) {
    return {
      mode: "adjacent-above",
      tableStartOffset: tableBelow.startOffset,
      row: 0,
      column: resolveBoundaryColumn(previousCursor, tableBelow.startOffset),
      offsetInCell: 0
    };
  }

  const tableAbove = tableBlocks.find((block) => block.endLine === lineNumber - 1);

  if (tableAbove) {
    return {
      mode: "adjacent-below",
      tableStartOffset: tableAbove.startOffset,
      row: getLastTableRowIndex(tableAbove),
      column: resolveBoundaryColumn(previousCursor, tableAbove.startOffset),
      offsetInCell: 0
    };
  }

  return null;
}

export function isInsideTableCursor(
  tableCursor: TableCursorState | null
): tableCursor is TableCursorState & { mode: "inside" } {
  return tableCursor?.mode === "inside";
}

function createInsideTableCursor(tableBlock: TableBlock, offset: number): TableCursorState {
  const { cell, row, column } = locateTableCell(tableBlock, offset);

  return {
    mode: "inside",
    tableStartOffset: tableBlock.startOffset,
    row,
    column,
    offsetInCell: Math.max(0, offset - cell.contentStartOffset)
  };
}

function locateTableCell(
  tableBlock: TableBlock,
  offset: number
): {
  cell: TableCell;
  row: number;
  column: number;
} {
  const rows: Array<{ row: number; cells: readonly TableCell[] }> = [
    { row: 0, cells: tableBlock.header },
    ...tableBlock.rows.map((cells, index) => ({ row: index + 1, cells }))
  ];

  for (const row of rows) {
    for (const cell of row.cells) {
      if (offset >= cell.startOffset && offset <= cell.endOffset) {
        return {
          cell,
          row: row.row,
          column: cell.columnIndex
        };
      }
    }
  }

  const fallbackCell = tableBlock.header[0] ?? tableBlock.rows[0]?.[0];

  if (!fallbackCell) {
    throw new Error("Expected table to contain at least one cell");
  }

  return {
    cell: fallbackCell,
    row: fallbackCell.rowIndex,
    column: fallbackCell.columnIndex
  };
}

function getLastTableRowIndex(tableBlock: TableBlock): number {
  return tableBlock.rows.length;
}

function resolveBoundaryColumn(
  previousCursor: TableCursorState | null,
  tableStartOffset: number
): number {
  if (previousCursor?.tableStartOffset !== tableStartOffset) {
    return 0;
  }

  return previousCursor.column;
}

function resolveLineNumberAtOffset(source: string, offset: number): number {
  let lineNumber = 1;
  const safeOffset = Math.max(0, Math.min(offset, source.length));

  for (let index = 0; index < safeOffset; index += 1) {
    if (source[index] === "\n") {
      lineNumber += 1;
    }
  }

  return lineNumber;
}
