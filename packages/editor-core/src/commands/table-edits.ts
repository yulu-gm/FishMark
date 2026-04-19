import { formatTableMarkdown, type CanonicalTableModel } from "@yulora/markdown-engine";

import type { TableContext, TablePosition } from "./table-context";

export type TableSelectionTarget = TablePosition & {
  offsetInCell?: number;
};

export type TableSemanticEdit = {
  changes:
    | {
        from: number;
        to: number;
        insert: string;
      }
    | null;
  selectionTarget: TableSelectionTarget;
};

export function computeMoveToNextTableCell(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  return {
    changes: null,
    selectionTarget: getNextTablePosition(ctx)
  };
}

export function computeMoveToPreviousTableCell(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  return {
    changes: null,
    selectionTarget: getPreviousTablePosition(ctx)
  };
}

export function computeMoveToTableRowAbove(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx || ctx.position.row <= 0) {
    return null;
  }

  return {
    changes: null,
    selectionTarget: {
      row: ctx.position.row - 1,
      column: ctx.position.column,
      offsetInCell: ctx.position.offsetInCell
    }
  };
}

export function computeMoveToTableRowBelow(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx || ctx.position.row >= getTotalRowCount(ctx.model) - 1) {
    return null;
  }

  return {
    changes: null,
    selectionTarget: {
      row: ctx.position.row + 1,
      column: ctx.position.column,
      offsetInCell: ctx.position.offsetInCell
    }
  };
}

export function computeMoveToPreviousTableCellAtBoundary(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx || (ctx.position.offsetInCell ?? 0) > 0) {
    return null;
  }

  const currentFlatIndex = ctx.position.row * ctx.columnCount + ctx.position.column;

  if (currentFlatIndex <= 0) {
    return null;
  }

  const previousFlatIndex = currentFlatIndex - 1;

  return {
    changes: null,
    selectionTarget: {
      row: Math.floor(previousFlatIndex / ctx.columnCount),
      column: previousFlatIndex % ctx.columnCount,
      offsetInCell: Number.MAX_SAFE_INTEGER
    }
  };
}

export function computeMoveToNextTableCellAtBoundary(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  const cellLength = Math.max(ctx.cell.contentEndOffset - ctx.cell.contentStartOffset, 0);

  if ((ctx.position.offsetInCell ?? cellLength) < cellLength) {
    return null;
  }

  const totalRows = getTotalRowCount(ctx.model);
  const currentFlatIndex = ctx.position.row * ctx.columnCount + ctx.position.column;
  const lastFlatIndex = totalRows * ctx.columnCount - 1;

  if (currentFlatIndex >= lastFlatIndex) {
    return null;
  }

  const nextFlatIndex = currentFlatIndex + 1;

  return {
    changes: null,
    selectionTarget: {
      row: Math.floor(nextFlatIndex / ctx.columnCount),
      column: nextFlatIndex % ctx.columnCount,
      offsetInCell: 0
    }
  };
}

export function computeInsertTableRowBelow(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  const insertionRow = Math.min(ctx.position.row + 1, getTotalRowCount(ctx.model));
  const nextModel = insertEmptyRow(ctx.model, insertionRow);

  return buildWholeTableReplacement(ctx, nextModel, {
    row: insertionRow,
    column: Math.min(ctx.position.column, ctx.columnCount - 1)
  });
}

export function computeInsertTableRowAbove(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  const insertionRow = ctx.model.hasHeader ? Math.max(ctx.position.row, 1) : Math.max(ctx.position.row, 0);
  const nextModel = insertEmptyRow(ctx.model, insertionRow);

  return buildWholeTableReplacement(ctx, nextModel, {
    row: insertionRow,
    column: Math.min(ctx.position.column, ctx.columnCount - 1)
  });
}

export function computeUpdateTableCell(
  ctx: TableContext | null,
  selectionTarget: TableSelectionTarget,
  text: string
): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  const nextModel = replaceCellText(ctx.model, selectionTarget, text);

  return buildWholeTableReplacement(ctx, nextModel, selectionTarget);
}

export function computeInsertTableColumnLeft(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  const insertionColumn = ctx.position.column;
  const nextModel = insertEmptyColumn(ctx.model, insertionColumn);

  return buildWholeTableReplacement(ctx, nextModel, {
    row: ctx.position.row,
    column: insertionColumn
  });
}

export function computeInsertTableColumnRight(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  const insertionColumn = ctx.position.column + 1;
  const nextModel = insertEmptyColumn(ctx.model, insertionColumn);

  return buildWholeTableReplacement(ctx, nextModel, {
    row: ctx.position.row,
    column: insertionColumn
  });
}

export function computeDeleteTableRow(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  if (getTotalRowCount(ctx.model) <= 1) {
    return computeDeleteTable(ctx);
  }

  if (ctx.model.hasHeader && ctx.model.rows.length <= 1 && ctx.position.row > 0) {
    return buildWholeTableReplacement(ctx, {
      hasHeader: ctx.model.hasHeader,
      rowSeparator: ctx.model.rowSeparator,
      alignments: [...ctx.model.alignments],
      header: [...ctx.model.header],
      rows: []
    }, { row: 0, column: Math.min(ctx.position.column, ctx.columnCount - 1) });
  }

  if (ctx.position.row === 0 && ctx.model.hasHeader) {
    return null;
  }

  if (!ctx.model.hasHeader && ctx.position.row === 0) {
    const [nextHeader = Array.from({ length: ctx.columnCount }, () => ""), ...remainingRows] = ctx.model.rows;

    return buildWholeTableReplacement(
      ctx,
      {
        hasHeader: false,
        rowSeparator: ctx.model.rowSeparator,
        alignments: [...ctx.model.alignments],
        header: [...nextHeader],
        rows: remainingRows.map((row) => [...row])
      },
      {
        row: 0,
        column: Math.min(ctx.position.column, ctx.columnCount - 1)
      }
    );
  }

  const rowOffset = ctx.model.hasHeader ? 1 : 0;
  const rows = ctx.model.rows.filter((_, index) => index !== ctx.position.row - rowOffset);

  return buildWholeTableReplacement(
    ctx,
    {
      hasHeader: ctx.model.hasHeader,
      rowSeparator: ctx.model.rowSeparator,
      alignments: [...ctx.model.alignments],
      header: [...ctx.model.header],
      rows
    },
    {
      row: Math.min(ctx.position.row, rows.length),
      column: Math.min(ctx.position.column, ctx.columnCount - 1)
    }
  );
}

export function computeDeleteTableColumn(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  if (ctx.columnCount <= 1) {
    return computeDeleteTable(ctx);
  }

  const columnIndex = ctx.position.column;
  const alignments = ctx.model.alignments.filter((_, index) => index !== columnIndex);
  const header = ctx.model.header.filter((_, index) => index !== columnIndex);
  const rows = ctx.model.rows.map((row) => row.filter((_, index) => index !== columnIndex));

  return buildWholeTableReplacement(
    ctx,
    {
      hasHeader: ctx.model.hasHeader,
      rowSeparator: ctx.model.rowSeparator,
      alignments,
      header,
      rows
    },
    {
      row: Math.min(ctx.position.row, ctx.model.rows.length),
      column: Math.max(0, Math.min(columnIndex, alignments.length - 1))
    }
  );
}

export function computeDeleteTable(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  return {
    changes: {
      from: ctx.block.startOffset,
      to: ctx.block.endOffset,
      insert: ""
    },
    selectionTarget: {
      row: 0,
      column: 0
    }
  };
}

function buildWholeTableReplacement(
  ctx: TableContext,
  model: CanonicalTableModel,
  selectionTarget: TableSelectionTarget
): TableSemanticEdit {
  return {
    changes: {
      from: ctx.block.startOffset,
      to: ctx.block.endOffset,
      insert: formatTableMarkdown(model)
    },
    selectionTarget
  };
}

function insertEmptyRow(model: CanonicalTableModel, rowIndex: number): CanonicalTableModel {
  const blankRow = Array.from({ length: model.header.length }, () => "");

  if (!model.hasHeader && rowIndex === 0) {
    return {
      hasHeader: false,
      rowSeparator: model.rowSeparator,
      alignments: [...model.alignments],
      header: blankRow,
      rows: [[...model.header], ...model.rows.map((row) => [...row])]
    };
  }

  const rows = [...model.rows];
  rows.splice(Math.max(rowIndex - 1, 0), 0, blankRow);

  return {
    hasHeader: model.hasHeader,
    rowSeparator: model.rowSeparator,
    alignments: [...model.alignments],
    header: [...model.header],
    rows
  };
}

function insertEmptyColumn(model: CanonicalTableModel, columnIndex: number): CanonicalTableModel {
  const nextAlignments = [...model.alignments];
  nextAlignments.splice(columnIndex, 0, model.hasHeader ? "left" : "none");

  const nextHeader = [...model.header];
  nextHeader.splice(columnIndex, 0, "");

  const nextRows = model.rows.map((row) => {
    const nextRow = [...row];
    nextRow.splice(columnIndex, 0, "");
    return nextRow;
  });

  return {
    hasHeader: model.hasHeader,
    rowSeparator: model.rowSeparator,
    alignments: nextAlignments,
    header: nextHeader,
    rows: nextRows
  };
}

function replaceCellText(
  model: CanonicalTableModel,
  selectionTarget: TableSelectionTarget,
  text: string
): CanonicalTableModel {
  if (selectionTarget.row === 0) {
    const nextHeader = [...model.header];
    nextHeader[selectionTarget.column] = text;

    return {
      hasHeader: model.hasHeader,
      rowSeparator: model.rowSeparator,
      alignments: [...model.alignments],
      header: nextHeader,
      rows: model.rows.map((row) => [...row])
    };
  }

  const nextRows = model.rows.map((row) => [...row]);
  const row = nextRows[selectionTarget.row - (model.hasHeader ? 1 : 0)];

  if (row) {
    row[selectionTarget.column] = text;
  }

  return {
    hasHeader: model.hasHeader,
    rowSeparator: model.rowSeparator,
    alignments: [...model.alignments],
    header: [...model.header],
    rows: nextRows
  };
}

function getNextTablePosition(ctx: TableContext): TableSelectionTarget {
  const totalRows = getTotalRowCount(ctx.model);
  const flatIndex = ctx.position.row * ctx.columnCount + ctx.position.column;
  const lastFlatIndex = totalRows * ctx.columnCount - 1;
  const nextFlatIndex = flatIndex >= lastFlatIndex ? 0 : flatIndex + 1;

  return {
    row: Math.floor(nextFlatIndex / ctx.columnCount),
    column: nextFlatIndex % ctx.columnCount
  };
}

function getPreviousTablePosition(ctx: TableContext): TableSelectionTarget {
  const totalRows = getTotalRowCount(ctx.model);
  const flatIndex = ctx.position.row * ctx.columnCount + ctx.position.column;
  const lastFlatIndex = totalRows * ctx.columnCount - 1;
  const previousFlatIndex = flatIndex <= 0 ? lastFlatIndex : flatIndex - 1;

  return {
    row: Math.floor(previousFlatIndex / ctx.columnCount),
    column: previousFlatIndex % ctx.columnCount
  };
}

function getTotalRowCount(model: CanonicalTableModel): number {
  return model.rows.length + 1;
}
