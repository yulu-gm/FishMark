import type { EditorState } from "@codemirror/state";

import type { TableBlock, TableCell } from "@yulora/markdown-engine";
import { tableBlockToCanonicalModel, type CanonicalTableModel } from "@yulora/markdown-engine";

import type { ActiveBlockState } from "../active-block";

export type TablePosition = {
  row: number;
  column: number;
  tableStartOffset?: number;
  offsetInCell?: number;
};

export type TableContext = {
  source: string;
  block: TableBlock;
  cell: TableCell;
  position: TablePosition;
  columnCount: number;
  model: CanonicalTableModel;
};

export function readTableContext(
  state: EditorState,
  activeState: ActiveBlockState
): TableContext | null {
  if (activeState.tableCursor?.mode !== "inside") {
    return null;
  }

  const tableBlock = findTableBlockByStartOffset(activeState, activeState.tableCursor.tableStartOffset);

  if (!tableBlock) {
    return null;
  }

  const position = activeState.tableCursor;
  const cell = getTableCell(tableBlock, position);

  if (!cell) {
    return null;
  }

  return {
    source: state.doc.toString(),
    block: tableBlock,
    cell,
    position: {
      ...position
    },
    columnCount: tableBlock.columnCount,
    model: tableBlockToCanonicalModel(tableBlock)
  };
}

export function getTableCell(
  block: TableBlock,
  position: TablePosition
): TableCell | null {
  if (position.row === 0) {
    return block.header[position.column] ?? null;
  }

  return block.rows[position.row - 1]?.[position.column] ?? null;
}

export function findTableBlockByStartOffset(
  activeState: ActiveBlockState,
  tableStartOffset: number | undefined
): TableBlock | null {
  if (typeof tableStartOffset !== "number") {
    return null;
  }

  return (
    activeState.blockMap.blocks.find(
      (block): block is TableBlock =>
        block.type === "table" && block.startOffset === tableStartOffset
    ) ?? null
  );
}

export function locateTablePosition(block: TableBlock, offset: number): TablePosition {
  const allRows: Array<{ row: number; cells: readonly TableCell[] }> = [
    { row: 0, cells: block.header },
    ...block.rows.map((cells, index) => ({ row: index + 1, cells }))
  ];

  for (const row of allRows) {
    for (const cell of row.cells) {
      if (offset >= cell.startOffset && offset <= cell.endOffset) {
        return {
          row: row.row,
          column: cell.columnIndex
        };
      }
    }
  }

  const firstCell = block.header[0];

  return {
    row: firstCell?.rowIndex ?? 0,
    column: firstCell?.columnIndex ?? 0
  };
}
