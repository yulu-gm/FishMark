import type { ActiveBlockSelection } from "./active-block";

import type { MarkdownDocument, TableBlock, TableCell } from "@fishmark/markdown-engine";

import { walkMarkdownBlocks } from "./context/block-tree";
import type { MarkdownBlockTreeEntry } from "./context/block-tree";

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
  const blockEntries = walkMarkdownBlocks(markdownDocument.blocks);
  const tableEntries = blockEntries.filter(isTableBlockEntry);
  const containingTable = tableEntries
    .map((entry) => entry.block)
    .find((block) => selection.head >= block.startOffset && selection.head < block.endOffset);

  if (containingTable) {
    return createInsideTableCursor(containingTable, selection.head);
  }

  const lineNumber = resolveLineNumberAtOffset(source, selection.head);
  const cursorParents = resolveCursorParentBlocks(blockEntries, selection.head, lineNumber);
  const tableBelow = tableEntries.find(
    (entry) =>
      shareParentBlocks(cursorParents, entry.parents) &&
      (entry.block.startLine === lineNumber + 1 ||
        (entry.block.startLine === lineNumber + 2 &&
          isBlankSourceLineForParentBlocks(source, lineNumber + 1, blockEntries, cursorParents)))
  );

  if (tableBelow) {
    return {
      mode: "adjacent-above",
      tableStartOffset: tableBelow.block.startOffset,
      row: 0,
      column: resolveBoundaryColumn(previousCursor, tableBelow.block.startOffset),
      offsetInCell: 0
    };
  }

  const tableAbove = tableEntries.find(
    (entry) =>
      shareParentBlocks(cursorParents, entry.parents) &&
      (entry.block.endLine === lineNumber - 1 ||
        (entry.block.endLine === lineNumber - 2 &&
          isBlankSourceLineForParentBlocks(source, lineNumber - 1, blockEntries, cursorParents)))
  );

  if (tableAbove) {
    return {
      mode: "adjacent-below",
      tableStartOffset: tableAbove.block.startOffset,
      row: getLastTableRowIndex(tableAbove.block),
      column: resolveBoundaryColumn(previousCursor, tableAbove.block.startOffset),
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

type TableBlockEntry = MarkdownBlockTreeEntry & {
  readonly block: TableBlock;
};

function isTableBlockEntry(entry: MarkdownBlockTreeEntry): entry is TableBlockEntry {
  return entry.block.type === "table";
}

function resolveCursorParentBlocks(
  entries: readonly MarkdownBlockTreeEntry[],
  offset: number,
  lineNumber: number
): MarkdownBlockTreeEntry["parents"] {
  const containingEntry = entries
    .filter(
      (entry) =>
        lineNumber >= entry.block.startLine &&
        lineNumber <= entry.block.endLine &&
        offset >= entry.block.startOffset &&
        offset <= entry.block.endOffset
    )
    .at(-1);

  if (!containingEntry) {
    return [];
  }

  if (containingEntry.block.type === "blockquote" || containingEntry.block.type === "list") {
    return [...containingEntry.parents, containingEntry.block];
  }

  return containingEntry.parents;
}

function shareParentBlocks(
  leftParents: MarkdownBlockTreeEntry["parents"],
  rightParents: MarkdownBlockTreeEntry["parents"]
): boolean {
  return (
    leftParents.length === rightParents.length &&
    leftParents.every((parent, index) => parent === rightParents[index])
  );
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

function isBlankSourceLineForParentBlocks(
  source: string,
  lineNumber: number,
  entries: readonly MarkdownBlockTreeEntry[],
  expectedParents: MarkdownBlockTreeEntry["parents"]
): boolean {
  if (lineNumber < 1) {
    return false;
  }

  let currentLineNumber = 1;
  let cursor = 0;

  while (cursor <= source.length) {
    const lineEnd = source.indexOf("\n", cursor);
    const endOffset = lineEnd === -1 ? source.length : lineEnd;

    if (currentLineNumber === lineNumber) {
      const contentEnd = endOffset > cursor && source[endOffset - 1] === "\r" ? endOffset - 1 : endOffset;

      const trimmedLine = source.slice(cursor, contentEnd).trim();

      if (trimmedLine.length === 0) {
        return true;
      }

      if (!/^(?:>\s*)+$/.test(trimmedLine)) {
        return false;
      }

      return shareParentBlocks(expectedParents, resolveCursorParentBlocks(entries, cursor, lineNumber));
    }

    if (lineEnd === -1) {
      break;
    }

    cursor = lineEnd + 1;
    currentLineNumber += 1;
  }

  return false;
}
