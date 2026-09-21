import type { EditorState } from "@codemirror/state";

import { isMarkdownLeafNode, tableBlockToCanonicalModel, type CanonicalTableModel, type TableBlock, type TableCell } from "@fishmark/markdown-engine";

import type { ActiveBlockState } from "@fishmark/editor-model";
import { canonicalLeafView } from "./decorations/canonical-leaf-view";

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

  const tableBlock = findActiveTableBlock(activeState);

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

// The widget/command DTO is built from the canonical table node the cursor points at, so no second
// document tree is needed to resolve a table.
export function findActiveTableBlock(activeState: ActiveBlockState): TableBlock | null {
  const tableNodeId = activeState.tableCursor?.tableNodeId ?? null;
  const node = tableNodeId === null ? null : activeState.snapshot.nodeById(tableNodeId);

  if (node === null || !isMarkdownLeafNode(node) || node.data.kind !== "table") {
    return null;
  }

  return canonicalLeafView(node, activeState.snapshot) as TableBlock;
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
