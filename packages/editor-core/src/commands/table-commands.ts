import type { EditorView } from "@codemirror/view";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import type { ActiveBlockState } from "../active-block";
import {
  findTableBlockByStartOffset,
  getTableCell,
  readTableContext,
  type TablePosition
} from "./table-context";
import {
  computeDeleteTable,
  computeDeleteTableColumn,
  computeDeleteTableRow,
  computeInsertTableColumnLeft,
  computeInsertTableColumnRight,
  computeInsertTableRowAbove,
  computeInsertTableRowBelow,
  computeMoveToNextTableCellAtBoundary,
  computeMoveToNextTableCell,
  computeMoveToPreviousTableCellAtBoundary,
  computeMoveToPreviousTableCell,
  computeMoveToTableRowAbove,
  computeMoveToTableRowBelow,
  computeUpdateTableCell,
  type TableSemanticEdit
} from "./table-edits";

export function runTableNextCell(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeMoveToNextTableCell(readTableContext(view.state, activeState))
  );
}

export function runTablePreviousCell(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeMoveToPreviousTableCell(readTableContext(view.state, activeState))
  );
}

export function runTableMoveUp(view: EditorView, activeState: ActiveBlockState): boolean {
  const ctx = readTableContext(view.state, activeState);

  if (!ctx) {
    return false;
  }

  const moveUpEdit = computeMoveToTableRowAbove(ctx);

  if (moveUpEdit) {
    return applyTableSemanticEdit(view, activeState, moveUpEdit);
  }

  const exitTarget = resolveTableExitAboveTarget(view, ctx.block.startOffset);

  view.dispatch(
    exitTarget.insert === null
      ? {
          selection: {
            anchor: exitTarget.anchor,
            head: exitTarget.anchor
          }
        }
      : {
          changes: {
            from: exitTarget.insert.from,
            to: exitTarget.insert.to,
            insert: exitTarget.insert.text
          },
          selection: {
            anchor: exitTarget.anchor,
            head: exitTarget.anchor
          }
        }
  );

  return true;
}

export function runTableMoveDown(view: EditorView, activeState: ActiveBlockState): boolean {
  const ctx = readTableContext(view.state, activeState);

  if (!ctx) {
    return false;
  }

  const moveDownEdit = computeMoveToTableRowBelow(ctx);

  if (moveDownEdit) {
    return applyTableSemanticEdit(view, activeState, moveDownEdit);
  }

  const exitTarget = resolveTableExitTarget(view, ctx.block.endOffset);

  view.dispatch(
    exitTarget.insert === null
      ? {
          selection: {
            anchor: exitTarget.anchor,
            head: exitTarget.anchor
          }
        }
      : {
          changes: {
            from: exitTarget.insert.from,
            to: exitTarget.insert.to,
            insert: exitTarget.insert.text
          },
          selection: {
            anchor: exitTarget.anchor,
            head: exitTarget.anchor
          }
        }
  );

  return true;
}

export function runTableEnterFromLineAbove(view: EditorView, activeState: ActiveBlockState): boolean {
  if (activeState.tableCursor?.mode !== "adjacent-above") {
    return false;
  }

  return runTableSelectCell(view, activeState, {
    row: activeState.tableCursor.row,
    column: activeState.tableCursor.column,
    tableStartOffset: activeState.tableCursor.tableStartOffset,
    offsetInCell: activeState.tableCursor.offsetInCell
  });
}

export function runTableEnterFromLineBelow(view: EditorView, activeState: ActiveBlockState): boolean {
  if (activeState.tableCursor?.mode !== "adjacent-below") {
    return false;
  }

  return runTableSelectCell(view, activeState, {
    row: activeState.tableCursor.row,
    column: activeState.tableCursor.column,
    tableStartOffset: activeState.tableCursor.tableStartOffset,
    offsetInCell: activeState.tableCursor.offsetInCell
  });
}

export function runTableMoveLeft(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeMoveToPreviousTableCellAtBoundary(readTableContext(view.state, activeState))
  );
}

export function runTableMoveRight(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeMoveToNextTableCellAtBoundary(readTableContext(view.state, activeState))
  );
}

export function runTableMoveDownOrExit(view: EditorView, activeState: ActiveBlockState): boolean {
  return runTableMoveDown(view, activeState);
}

export function runTableInsertRowBelow(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeInsertTableRowBelow(readTableContext(view.state, activeState))
  );
}

export function runTableInsertRowAbove(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeInsertTableRowAbove(readTableContext(view.state, activeState))
  );
}

export function runTableInsertColumnLeft(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeInsertTableColumnLeft(readTableContext(view.state, activeState))
  );
}

export function runTableInsertColumnRight(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeInsertTableColumnRight(readTableContext(view.state, activeState))
  );
}

export function runTableDeleteRow(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeDeleteTableRow(readTableContext(view.state, activeState))
  );
}

export function runTableDeleteColumn(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeDeleteTableColumn(readTableContext(view.state, activeState))
  );
}

export function runTableDelete(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeDeleteTable(readTableContext(view.state, activeState))
  );
}

export function runTableSelectCell(
  view: EditorView,
  activeState: ActiveBlockState,
  selectionTarget: TablePosition
): boolean {
  const tableBlock = findTableBlockByStartOffset(activeState, selectionTarget.tableStartOffset);
  const targetCell = tableBlock ? getTableCell(tableBlock, selectionTarget) : null;

  if (!targetCell) {
    return false;
  }

  const cellLength = Math.max(targetCell.contentEndOffset - targetCell.contentStartOffset, 0);
  const offsetInCell = Math.max(0, Math.min(selectionTarget.offsetInCell ?? 0, cellLength));
  const nextAnchor = targetCell.contentStartOffset + offsetInCell;

  view.dispatch({
    selection: {
      anchor: nextAnchor,
      head: nextAnchor
    }
  });

  return true;
}

export function runTableUpdateCell(
  view: EditorView,
  activeState: ActiveBlockState,
  selectionTarget: TablePosition,
  text: string
): boolean {
  return applyTableSemanticEdit(
    view,
    activeState,
    computeUpdateTableCell(readTableContext(view.state, activeState), selectionTarget, text)
  );
}

function applyTableSemanticEdit(
  view: EditorView,
  activeState: ActiveBlockState,
  edit: TableSemanticEdit | null
): boolean {
  const tableBlock = findTableBlockByStartOffset(activeState, activeState.tableCursor?.tableStartOffset);

  if (!tableBlock || !edit) {
    return false;
  }

  const selectionAnchor = resolveSelectionAnchor(tableBlock, edit);

  if (selectionAnchor === null) {
    return false;
  }

  view.dispatch(
    edit.changes
      ? {
          changes: edit.changes,
          selection: {
            anchor: selectionAnchor,
            head: selectionAnchor
          }
        }
      : {
          selection: {
            anchor: selectionAnchor,
            head: selectionAnchor
          }
        }
  );

  return true;
}

function resolveSelectionAnchor(
  tableBlock: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "table" }>,
  edit: TableSemanticEdit
): number | null {
  if (!edit.changes) {
    const targetCell = getTableCell(tableBlock, edit.selectionTarget);
    if (!targetCell) {
      return null;
    }

    const cellLength = Math.max(targetCell.contentEndOffset - targetCell.contentStartOffset, 0);
    const offsetInCell = Math.max(0, Math.min(edit.selectionTarget.offsetInCell ?? 0, cellLength));

    return targetCell.contentStartOffset + offsetInCell;
  }

  const replacementSource = typeof edit.changes.insert === "string" ? edit.changes.insert : null;

  return resolveSelectionAnchorFromSource(
    tableBlock.startOffset,
    edit.selectionTarget,
    replacementSource
  );
}

function resolveSelectionAnchorFromSource(
  baseOffset: number,
  selectionTarget: TablePosition,
  source: string | null
): number | null {
  const parsedTable =
    source === null ? null : parseMarkdownDocument(source).blocks.find((block) => block.type === "table");

  if (source !== null && parsedTable?.type === "table") {
    const targetCell = getTableCell(parsedTable, selectionTarget);
    if (!targetCell) {
      return baseOffset;
    }

    const cellLength = Math.max(targetCell.contentEndOffset - targetCell.contentStartOffset, 0);
    const offsetInCell = Math.max(0, Math.min(selectionTarget.offsetInCell ?? 0, cellLength));

    return baseOffset + targetCell.contentStartOffset + offsetInCell;
  }

  return baseOffset;
}

function resolveTableExitTarget(
  view: EditorView,
  tableEndOffset: number
): {
  anchor: number;
  insert: { from: number; to: number; text: string } | null;
} {
  const currentLine = view.state.doc.lineAt(tableEndOffset);

  if (currentLine.number < view.state.doc.lines) {
    return {
      anchor: view.state.doc.line(currentLine.number + 1).from,
      insert: null
    };
  }

  return {
    anchor: view.state.doc.length + 1,
    insert: {
      from: view.state.doc.length,
      to: view.state.doc.length,
      text: "\n"
    }
  };
}

function resolveTableExitAboveTarget(
  view: EditorView,
  tableStartOffset: number
): {
  anchor: number;
  insert: { from: number; to: number; text: string } | null;
} {
  const currentLine = view.state.doc.lineAt(tableStartOffset);

  if (currentLine.number > 1) {
    return {
      anchor: view.state.doc.line(currentLine.number - 1).from,
      insert: null
    };
  }

  return {
    anchor: 0,
    insert: {
      from: 0,
      to: 0,
      text: "\n"
    }
  };
}
