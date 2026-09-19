import {
  childrenOf,
  formatTableMarkdownWithOffsets,
  type MarkdownLeafNode,
  type MarkdownNode,
  type TableAlignment
} from "@fishmark/markdown-engine";

import type { EditorSemanticContext } from "../context/editor-semantic-context";
import {
  createEditTransactionPlan,
  type EditTransactionPlan,
  type TextEditOperation
} from "../transactions/edit-transaction-plan";
import { lineContainerChain } from "./line-structure";

// Table operations run against the canonical table node, rebuild the canonical spelling, and
// replace exactly the table's source range. Selection-only moves never rewrite the document.
export type TablePlanKind =
  | "cell-move"
  | "row-insert"
  | "column-insert"
  | "row-delete"
  | "column-delete"
  | "table-delete"
  | "cell-update"
  | "table-exit";

export interface TableDecision {
  readonly kind: TablePlanKind;
  readonly plan: EditTransactionPlan;
}

export interface TablePosition {
  readonly row: number;
  readonly column: number;
  readonly offsetInCell?: number;
}

export interface TableSnapshot {
  readonly node: MarkdownLeafNode;
  readonly hasHeader: boolean;
  readonly rowSeparator: "compact" | "loose";
  readonly alignments: readonly TableAlignment[];
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly columnCount: number;
}

export function readTableSnapshot(context: EditorSemanticContext): TableSnapshot | null {
  const node = tableNodeAt(context);

  if (node === null || node.data.kind !== "table") {
    return null;
  }

  const data = node.data;

  return {
    node,
    hasHeader: data.hasHeader,
    rowSeparator: data.rowSeparator,
    alignments: data.alignments.map((alignment) => alignment ?? "none"),
    header: data.header.map((cell) => cell.text),
    rows: data.rows.map((row) => row.map((cell) => cell.text)),
    columnCount: data.columnCount
  };
}

export function tablePositionAt(context: EditorSemanticContext): TablePosition | null {
  const cursor = context.tableAt(context.selectionContext.activeOffset);

  if (cursor === null) {
    return readTableSnapshot(context) === null ? null : { row: 0, column: 0, offsetInCell: 0 };
  }

  return {
    row: cursor.rowIndex,
    column: cursor.columnIndex,
    offsetInCell: context.selectionContext.from - cursor.cell.content.startOffset
  };
}

export function planTableMoveToCell(
  context: EditorSemanticContext,
  target: TablePosition
): EditTransactionPlan | null {
  const snapshot = readTableSnapshot(context);

  if (snapshot === null) {
    return null;
  }

  const anchor = anchorForPosition(context, snapshot, target);

  if (anchor === null) {
    return null;
  }

  return createEditTransactionPlan({
    context,
    commandId: "table-edit",
    intent: "navigation",
    edits: [],
    selection: { anchor, head: anchor }
  });
}

export function planTableNextCell(context: EditorSemanticContext): EditTransactionPlan | null {
  const position = tablePositionAt(context);

  if (position === null) {
    return null;
  }

  const next = nextPosition(readTableSnapshot(context)!, position);

  return planTableMoveToCell(context, next);
}

export function planTablePreviousCell(context: EditorSemanticContext): EditTransactionPlan | null {
  const position = tablePositionAt(context);

  if (position === null) {
    return null;
  }

  const next = previousPosition(readTableSnapshot(context)!, position);

  return planTableMoveToCell(context, next);
}

export function planTableMoveHorizontal(context: EditorSemanticContext, direction: "left" | "right"): EditTransactionPlan | null {
  const cursor = context.tableAt(context.selectionContext.activeOffset);
  if (cursor === null || !context.selectionContext.empty) return null;
  const offset = context.selectionContext.activeOffset;
  if (direction === "left" ? offset > cursor.cell.content.startOffset : offset < cursor.cell.content.endOffset) return null;
  const snapshot = readTableSnapshot(context)!;
  const position = tablePositionAt(context)!;
  const target = direction === "left" ? previousPosition(snapshot, position) : nextPosition(snapshot, position);
  return planTableMoveToCell(context, { ...target, offsetInCell: direction === "left" ? Number.MAX_SAFE_INTEGER : 0 });
}

export function planTableBackspaceFromBelow(context: EditorSemanticContext): EditTransactionPlan | null {
  const selection = context.selectionContext;
  const line = context.lineAt(selection.activeOffset);
  if (!selection.empty || line === null || selection.activeOffset !== line.range.startOffset || line.contentEndOffset !== line.range.startOffset) return null;
  for (const node of [...context.snapshot.tree.nodesById.values()].reverse()) {
    if (node.data.kind !== "table" || node.source.endOffset > line.range.startOffset) continue;
    const gap = context.source.slice(node.source.endOffset, line.range.startOffset);
    if (!/^(?:\r?\n){1,2}$/u.test(gap)) return null;
    const cell = (node.data.rows.at(-1) ?? node.data.header).at(-1);
    if (cell === undefined) return null;
    const anchor = cell.content.endOffset;
    return createEditTransactionPlan({ context, commandId: "table-edit", intent: "navigation", edits: [], selection: { anchor, head: anchor } });
  }
  return null;
}

export function planTableMoveVertical(context: EditorSemanticContext, direction: "up" | "down"): EditTransactionPlan | null {
  const position = tablePositionAt(context);
  const snapshot = readTableSnapshot(context);
  if (position === null || snapshot === null) return null;
  const row = position.row + (direction === "down" ? 1 : -1);
  if (row >= 0 && row < totalRowCount(snapshot)) return planTableMoveToCell(context, { ...position, row });
  if (direction === "down") return planTableExitBelow(context);
  const first = context.lineAt(snapshot.node.source.startOffset);
  if (first === null) return null;
  let previous = context.lines.lines[first.lineNumber - 2];
  if (previous !== undefined && previous.lineNumber > 1 && previous.contentEndOffset === previous.range.startOffset) {
    const above = context.lines.lines[previous.lineNumber - 2]!;
    if (above.contentEndOffset > above.range.startOffset) previous = above;
  }
  if (previous !== undefined) {
    const anchor = previous.contentEndOffset;
    return createEditTransactionPlan({ context, commandId: "table-edit", intent: "navigation", edits: [], selection: { anchor, head: anchor } });
  }
  return null;
}

export function planTableInsertRowBelow(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideInsertRow(context, "below")?.plan ?? null;
}

export function planTableInsertRowAbove(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideInsertRow(context, "above")?.plan ?? null;
}

export function planTableInsertColumnLeft(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideInsertColumn(context, "left")?.plan ?? null;
}

export function planTableInsertColumnRight(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideInsertColumn(context, "right")?.plan ?? null;
}

export function planTableDeleteRow(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideDeleteRow(context)?.plan ?? null;
}

export function planTableDeleteColumn(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideDeleteColumn(context)?.plan ?? null;
}

export function planTableDelete(context: EditorSemanticContext): EditTransactionPlan | null {
  return decideDeleteTable(context)?.plan ?? null;
}

export function planTableUpdateCell(
  context: EditorSemanticContext,
  target: TablePosition,
  text: string
): EditTransactionPlan | null {
  const snapshot = readTableSnapshot(context);

  if (snapshot === null) {
    return null;
  }

  const header = [...snapshot.header];
  const rows = snapshot.rows.map((row) => [...row]);

  if (target.row === 0) {
    header[target.column] = text;
  } else {
    const row = rows[target.row - (snapshot.hasHeader ? 1 : 0)];

    if (row === undefined) {
      return null;
    }

    row[target.column] = text;
  }

  return replaceTable(context, snapshot, { header, rows }, target, "cell-update").plan;
}

// Enter at the table boundary leaves the table: the caret moves outside it, and at the end of the
// document a structural blank line is added so the caret has somewhere real to land.
export function planTableExitBelow(context: EditorSemanticContext): EditTransactionPlan | null {
  const snapshot = readTableSnapshot(context);

  if (snapshot === null) {
    return null;
  }

  const tableEnd = snapshot.node.source.endOffset;
  const nextBreak = context.source.indexOf("\n", tableEnd);

  if (nextBreak === -1 || nextBreak === context.source.length - 1) {
    const insert = nextBreak === -1 ? "\n\n" : "\n";

    return createEditTransactionPlan({
      context,
      commandId: "enter",
      intent: "structural",
      edits: [{ from: context.source.length, to: context.source.length, insert }],
      selection: {
        anchor: context.source.length + insert.length,
        head: context.source.length + insert.length
      }
    });
  }

  // A single structural blank line below the table is skipped so the caret lands on real content.
  const nextLineStart = nextBreak + 1;
  const nextLine = context.lineAt(nextLineStart);
  const anchor = nextLine !== null && nextLine.contentEndOffset === nextLine.range.startOffset && nextLine.range.endOffset > nextLineStart
    ? nextLine.range.endOffset : nextLineStart;

  return createEditTransactionPlan({
    context,
    commandId: "enter",
    intent: "navigation",
    edits: [],
    selection: { anchor, head: anchor }
  });
}

function decideInsertRow(
  context: EditorSemanticContext,
  where: "above" | "below"
): TableDecision | null {
  const snapshot = readTableSnapshot(context);
  const position = tablePositionAt(context);

  if (snapshot === null || position === null) {
    return null;
  }

  const blank = createBlankRow(snapshot.columnCount);
  const header = [...snapshot.header];
  let rows = snapshot.rows.map((row) => [...row]);
  let insertionRow = position.row;
  let selectionRow: number;

  if (where === "below") {
    insertionRow = position.row + 1;
  }

  if (!snapshot.hasHeader) {
    // Without a header the first source row doubles as the header-shaped slot.
    if (insertionRow === 0) {
      rows = [header, ...rows];
      selectionRow = 0;
      header.splice(0, header.length, ...blank);
    } else {
      rows.splice(insertionRow - 1, 0, blank);
      selectionRow = insertionRow;
    }
  } else {
    rows.splice(Math.max(insertionRow - 1, 0), 0, blank);
    selectionRow = insertionRow;
  }

  return {
    kind: "row-insert",
    plan: replaceTable(
      context,
      snapshot,
      { header, rows },
      { row: selectionRow, column: position.column },
      "row-insert"
    ).plan
  };
}

function decideInsertColumn(
  context: EditorSemanticContext,
  where: "left" | "right"
): TableDecision | null {
  const snapshot = readTableSnapshot(context);
  const position = tablePositionAt(context);

  if (snapshot === null || position === null) {
    return null;
  }

  const insertionColumn = where === "left" ? position.column : position.column + 1;
  const alignments = [...snapshot.alignments];
  alignments.splice(insertionColumn, 0, "left");
  const header = insertAt([...snapshot.header], insertionColumn, "");
  const rows = snapshot.rows.map((row) => insertAt([...row], insertionColumn, ""));

  return {
    kind: "column-insert",
    plan: replaceTable(
      context,
      { ...snapshot, alignments },
      { header, rows },
      { row: position.row, column: insertionColumn },
      "column-insert"
    ).plan
  };
}

function decideDeleteRow(context: EditorSemanticContext): TableDecision | null {
  const snapshot = readTableSnapshot(context);
  const position = tablePositionAt(context);

  if (snapshot === null || position === null) {
    return null;
  }

  if (totalRowCount(snapshot) <= 1) {
    return decideDeleteTable(context);
  }

  // The header row is structural while body rows exist.
  if (snapshot.hasHeader && position.row === 0 && snapshot.rows.length > 0) {
    return null;
  }

  const header = [...snapshot.header];
  let rows = snapshot.rows.map((row) => [...row]);
  let selectionRow = position.row;

  if (!snapshot.hasHeader && position.row === 0) {
    const [promoted = createBlankRow(snapshot.columnCount), ...rest] = rows;
    header.splice(0, header.length, ...promoted);
    rows = rest;
    selectionRow = 0;
  } else {
    const index = position.row - (snapshot.hasHeader ? 1 : 0);
    rows.splice(index, 1);
    selectionRow = Math.max(0, Math.min(position.row, header.length + rows.length));
  }

  return {
    kind: "row-delete",
    plan: replaceTable(
      context,
      snapshot,
      { header, rows },
      { row: Math.min(selectionRow, snapshot.hasHeader ? rows.length : rows.length + 1), column: position.column },
      "row-delete"
    ).plan
  };
}

function decideDeleteColumn(context: EditorSemanticContext): TableDecision | null {
  const snapshot = readTableSnapshot(context);
  const position = tablePositionAt(context);

  if (snapshot === null || position === null) {
    return null;
  }

  if (snapshot.columnCount <= 1) {
    return decideDeleteTable(context);
  }

  const keep = (_: unknown, index: number): boolean => index !== position.column;
  const alignments = snapshot.alignments.filter(keep);

  return {
    kind: "column-delete",
    plan: replaceTable(
      context,
      { ...snapshot, alignments },
      {
        header: snapshot.header.filter(keep),
        rows: snapshot.rows.map((row) => row.filter(keep))
      },
      { row: position.row, column: Math.max(0, position.column - 1) },
      "column-delete"
    ).plan
  };
}

function decideDeleteTable(context: EditorSemanticContext): TableDecision | null {
  const snapshot = readTableSnapshot(context);

  if (snapshot === null) {
    return null;
  }

  return {
    kind: "table-delete",
    plan: createEditTransactionPlan({
      context,
      commandId: "table-edit",
      intent: "structural",
      edits: [{ from: snapshot.node.source.startOffset, to: snapshot.node.source.endOffset, insert: "" }],
      selection: {
        anchor: snapshot.node.source.startOffset,
        head: snapshot.node.source.startOffset
      }
    })
  };
}

function replaceTable(
  context: EditorSemanticContext,
  snapshot: Pick<TableSnapshot, "node" | "hasHeader" | "rowSeparator" | "alignments">,
  model: { readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] },
  target: TablePosition,
  kind: TablePlanKind
): TableDecision {
  const formatted = formatTableMarkdownWithOffsets({
    hasHeader: snapshot.hasHeader,
    rowSeparator: snapshot.rowSeparator,
    alignments: snapshot.alignments,
    header: model.header,
    rows: model.rows
  });
  const base = snapshot.node.source.startOffset;
  const anchor = resolveAnchor(base, formatted, target);
  const edits: TextEditOperation[] = [
    { from: base, to: snapshot.node.source.endOffset, insert: formatted.text }
  ];

  return {
    kind,
    plan: createEditTransactionPlan({
      context,
      commandId: "table-edit",
      intent: "structural",
      edits,
      selection: { anchor, head: anchor }
    })
  };
}

function resolveAnchor(
  base: number,
  formatted: ReturnType<typeof formatTableMarkdownWithOffsets>,
  target: TablePosition
): number {
  const cell = target.row === 0
    ? formatted.cells.header[target.column]
    : formatted.cells.rows[target.row - 1]?.[target.column];

  if (cell === undefined) {
    return base;
  }

  const length = Math.max(0, cell.contentEndOffset - cell.contentStartOffset);
  const offsetInCell = Math.max(0, Math.min(target.offsetInCell ?? 0, length));

  return base + cell.contentStartOffset + offsetInCell;
}

function anchorForPosition(
  context: EditorSemanticContext,
  snapshot: TableSnapshot,
  target: TablePosition
): number | null {
  void context;
  const data = snapshot.node.data;

  if (data.kind !== "table") {
    return null;
  }

  const rowIndex = target.row === 0 ? null : target.row - (snapshot.hasHeader ? 1 : 0);
  const cell = rowIndex === null ? data.header[target.column] : data.rows[rowIndex]?.[target.column];

  if (cell === undefined) {
    return null;
  }

  const length = Math.max(0, cell.content.endOffset - cell.content.startOffset);
  const offsetInCell = Math.max(0, Math.min(target.offsetInCell ?? 0, length));

  return cell.content.startOffset + offsetInCell;
}

function nextPosition(snapshot: TableSnapshot, position: TablePosition): TablePosition {
  const columnCount = snapshot.columnCount;

  if (position.column + 1 < columnCount) {
    return { row: position.row, column: position.column + 1 };
  }

  const lastRow = totalRowCount(snapshot) - 1;

  return { row: Math.min(position.row + 1, lastRow), column: 0 };
}

function previousPosition(snapshot: TableSnapshot, position: TablePosition): TablePosition {
  if (position.column > 0) {
    return { row: position.row, column: position.column - 1 };
  }

  return { row: Math.max(0, position.row - 1), column: Math.max(0, snapshot.columnCount - 1) };
}

function totalRowCount(snapshot: TableSnapshot): number {
  return (snapshot.hasHeader ? 1 : 0) + snapshot.rows.length;
}

function createBlankRow(columnCount: number): string[] {
  return Array.from({ length: Math.max(columnCount, 1) }, () => "");
}

function insertAt(row: string[], index: number, value: string): string[] {
  row.splice(index, 0, value);

  return row;
}

function tableNodeAt(context: EditorSemanticContext): MarkdownLeafNode | null {
  const line = context.lineAt(context.selectionContext.activeOffset);

  if (line === null) {
    return null;
  }

  const chain = lineContainerChain(context, line);

  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const node: MarkdownNode = chain[index]!;

    if (node.kind === "table") {
      return node;
    }
  }

  const active = context.selection.activeNode;

  return active !== null && active.kind === "table" ? active : null;
}

export { childrenOf };

