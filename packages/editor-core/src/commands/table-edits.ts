import {
  formatTableMarkdownWithOffsets,
  type CanonicalTableModel,
  type FormattedTableWithOffsets
} from "@yulora/markdown-engine";

import type { TableContext, TablePosition } from "./table-context";

export type TableSemanticEditChange = {
  from: number;
  to: number;
  insert: string;
};

/**
 * Describes the caret destination for an edit that leaves the table entirely.
 * `anchor` is a raw document offset; `insert` (optional) carries a trailing
 * newline or similar padding that must be applied together with the caret move.
 */
export type TableExitTarget = {
  kind: "outside";
  anchor: number;
  insert?: TableSemanticEditChange;
};

export type TableSemanticEdit = {
  changes: TableSemanticEditChange | null;
  selectionTarget: TablePosition | TableExitTarget;
  /**
   * Absolute document offset of the caret after the edit has been applied. When present, the
   * consumer should use this directly instead of re-parsing the inserted markdown to locate the
   * target cell. Exit edits (where `selectionTarget.kind === "outside"`) do not need this.
   */
  resolvedAnchor?: number;
};

export function isExitSelectionTarget(
  target: TableSemanticEdit["selectionTarget"]
): target is TableExitTarget {
  return (target as TableExitTarget).kind === "outside";
}

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

/**
 * Plan a caret move that leaves the table upward.
 *
 * If the table is the very first line of the document, the edit prepends a newline and parks
 * the caret at the document start; otherwise it selects the previous line's start offset.
 */
export function computeExitTableAbove(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  return {
    changes: null,
    selectionTarget: resolveExitAboveTarget(ctx.source, ctx.block.startOffset)
  };
}

/**
 * Plan a caret move that leaves the table downward.
 *
 * If the table is the last line of the document, the edit appends a newline and places the
 * caret past it; otherwise it selects the following line's start offset.
 */
export function computeExitTableBelow(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  return {
    changes: null,
    selectionTarget: resolveExitBelowTarget(ctx.source, ctx.block.endOffset)
  };
}

function resolveExitAboveTarget(source: string, tableStartOffset: number): TableExitTarget {
  const lineStart = findLineStartAt(source, tableStartOffset);

  if (lineStart > 0) {
    const previousLineStart = findLineStartAt(source, lineStart - 1);
    return { kind: "outside", anchor: previousLineStart };
  }

  return {
    kind: "outside",
    anchor: 0,
    insert: { from: 0, to: 0, insert: "\n" }
  };
}

function resolveExitBelowTarget(source: string, tableEndOffset: number): TableExitTarget {
  const nextNewline = source.indexOf("\n", tableEndOffset);

  if (nextNewline !== -1) {
    return { kind: "outside", anchor: nextNewline + 1 };
  }

  return {
    kind: "outside",
    anchor: source.length + 1,
    insert: { from: source.length, to: source.length, insert: "\n" }
  };
}

function findLineStartAt(source: string, offset: number): number {
  const previousNewline = source.lastIndexOf("\n", Math.max(offset - 1, 0));
  return previousNewline === -1 ? 0 : previousNewline + 1;
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

  return buildWholeTableReplacement(
    ctx,
    nextModel,
    clampPosition(ctx, { row: insertionRow, column: ctx.position.column }, { model: nextModel })
  );
}

export function computeInsertTableRowAbove(ctx: TableContext | null): TableSemanticEdit | null {
  if (!ctx) {
    return null;
  }

  const insertionRow = ctx.model.hasHeader ? Math.max(ctx.position.row, 1) : Math.max(ctx.position.row, 0);
  const nextModel = insertEmptyRow(ctx.model, insertionRow);

  return buildWholeTableReplacement(
    ctx,
    nextModel,
    clampPosition(ctx, { row: insertionRow, column: ctx.position.column }, { model: nextModel })
  );
}

export function computeUpdateTableCell(
  ctx: TableContext | null,
  selectionTarget: TablePosition,
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

  // Header row deletion is rejected when the table has an explicit header and at least one body row.
  if (ctx.position.row === 0 && ctx.model.hasHeader && ctx.model.rows.length > 0) {
    return null;
  }

  // Only a header row remains alongside the cursor row → drop every body row.
  if (ctx.model.hasHeader && ctx.model.rows.length <= 1 && ctx.position.row > 0) {
    return buildWholeTableReplacement(
      ctx,
      cloneCanonicalModel(ctx.model, { rows: [] }),
      clampPosition(ctx, { row: 0, column: ctx.position.column })
    );
  }

  // No-header table deleting the first row → promote the next row to the header-shaped slot.
  if (!ctx.model.hasHeader && ctx.position.row === 0) {
    const [nextHeader = createBlankRow(ctx.columnCount), ...remainingRows] = ctx.model.rows;

    return buildWholeTableReplacement(
      ctx,
      cloneCanonicalModel(ctx.model, { header: nextHeader, rows: remainingRows }),
      clampPosition(ctx, { row: 0, column: ctx.position.column })
    );
  }

  const rowOffset = ctx.model.hasHeader ? 1 : 0;
  const rows = ctx.model.rows.filter((_, index) => index !== ctx.position.row - rowOffset);

  return buildWholeTableReplacement(
    ctx,
    cloneCanonicalModel(ctx.model, { rows }),
    clampPosition(ctx, { row: ctx.position.row, column: ctx.position.column }, { model: cloneCanonicalModel(ctx.model, { rows }) })
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
  const nextModel = cloneCanonicalModel(ctx.model, {
    alignments: ctx.model.alignments.filter((_, index) => index !== columnIndex),
    header: ctx.model.header.filter((_, index) => index !== columnIndex),
    rows: ctx.model.rows.map((row) => row.filter((_, index) => index !== columnIndex))
  });

  return buildWholeTableReplacement(
    ctx,
    nextModel,
    clampPosition(ctx, { row: ctx.position.row, column: columnIndex }, { model: nextModel })
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
    },
    resolvedAnchor: ctx.block.startOffset
  };
}

function buildWholeTableReplacement(
  ctx: TableContext,
  model: CanonicalTableModel,
  selectionTarget: TablePosition
): TableSemanticEdit {
  const formatted = formatTableMarkdownWithOffsets(model);

  return {
    changes: {
      from: ctx.block.startOffset,
      to: ctx.block.endOffset,
      insert: formatted.text
    },
    selectionTarget,
    resolvedAnchor: resolveAnchorFromFormattedTable(ctx.block.startOffset, formatted, selectionTarget)
  };
}

function resolveAnchorFromFormattedTable(
  baseOffset: number,
  formatted: FormattedTableWithOffsets,
  selectionTarget: TablePosition
): number {
  const cellOffset =
    selectionTarget.row === 0
      ? formatted.cells.header[selectionTarget.column]
      : formatted.cells.rows[selectionTarget.row - 1]?.[selectionTarget.column];

  if (!cellOffset) {
    return baseOffset;
  }

  const cellLength = Math.max(cellOffset.contentEndOffset - cellOffset.contentStartOffset, 0);
  const offsetInCell = Math.max(0, Math.min(selectionTarget.offsetInCell ?? 0, cellLength));

  return baseOffset + cellOffset.contentStartOffset + offsetInCell;
}

function insertEmptyRow(model: CanonicalTableModel, rowIndex: number): CanonicalTableModel {
  const blankRow = createBlankRow(model.header.length);

  if (!model.hasHeader && rowIndex === 0) {
    return cloneCanonicalModel(model, {
      header: blankRow,
      rows: [model.header, ...model.rows]
    });
  }

  const rows = [...model.rows];
  rows.splice(Math.max(rowIndex - 1, 0), 0, blankRow);

  return cloneCanonicalModel(model, { rows });
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

  return cloneCanonicalModel(model, {
    alignments: nextAlignments,
    header: nextHeader,
    rows: nextRows
  });
}

function replaceCellText(
  model: CanonicalTableModel,
  selectionTarget: TablePosition,
  text: string
): CanonicalTableModel {
  if (selectionTarget.row === 0) {
    const nextHeader = [...model.header];
    nextHeader[selectionTarget.column] = text;
    return cloneCanonicalModel(model, { header: nextHeader });
  }

  const nextRows = model.rows.map((row) => [...row]);
  const row = nextRows[selectionTarget.row - (model.hasHeader ? 1 : 0)];

  if (row) {
    row[selectionTarget.column] = text;
  }

  return cloneCanonicalModel(model, { rows: nextRows });
}

/**
 * Shallow-clone a canonical table model, replacing only the fields in `overrides`.
 * All arrays are defensively copied so downstream mutation stays local to the clone.
 */
function cloneCanonicalModel(
  model: CanonicalTableModel,
  overrides: {
    hasHeader?: boolean;
    rowSeparator?: CanonicalTableModel["rowSeparator"];
    alignments?: readonly CanonicalTableModel["alignments"][number][];
    header?: readonly string[];
    rows?: readonly (readonly string[])[];
  } = {}
): CanonicalTableModel {
  return {
    hasHeader: overrides.hasHeader ?? model.hasHeader,
    rowSeparator: overrides.rowSeparator ?? model.rowSeparator,
    alignments: [...(overrides.alignments ?? model.alignments)],
    header: [...(overrides.header ?? model.header)],
    rows: (overrides.rows ?? model.rows).map((row) => [...row])
  };
}

function createBlankRow(columnCount: number): string[] {
  return Array.from({ length: columnCount }, () => "");
}

/**
 * Clamp a target position so that it lies within the supplied model (defaulting to the context's
 * current model). Centralises the "row ≤ body-count, column ≤ columnCount − 1" rule that every
 * mutating edit has to enforce.
 */
function clampPosition(
  ctx: TableContext,
  target: { row: number; column: number; offsetInCell?: number },
  options: { model?: CanonicalTableModel } = {}
): TablePosition {
  const model = options.model ?? ctx.model;
  const totalRows = getTotalRowCount(model);
  const columnCount = Math.max(model.alignments.length, model.header.length, 1);

  const clamped: TablePosition = {
    row: Math.max(0, Math.min(target.row, Math.max(totalRows - 1, 0))),
    column: Math.max(0, Math.min(target.column, columnCount - 1))
  };

  if (target.offsetInCell !== undefined) {
    clamped.offsetInCell = target.offsetInCell;
  }

  return clamped;
}

function getNextTablePosition(ctx: TableContext): TablePosition {
  const totalRows = getTotalRowCount(ctx.model);
  const flatIndex = ctx.position.row * ctx.columnCount + ctx.position.column;
  const lastFlatIndex = totalRows * ctx.columnCount - 1;
  const nextFlatIndex = flatIndex >= lastFlatIndex ? 0 : flatIndex + 1;

  return {
    row: Math.floor(nextFlatIndex / ctx.columnCount),
    column: nextFlatIndex % ctx.columnCount
  };
}

function getPreviousTablePosition(ctx: TableContext): TablePosition {
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
