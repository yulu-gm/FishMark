import type { EditorView } from "@codemirror/view";

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
  computeExitTableAbove,
  computeExitTableBelow,
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
  isExitSelectionTarget,
  type TableExitTarget,
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

  return applyTableSemanticEdit(view, activeState, computeMoveToTableRowAbove(ctx) ?? computeExitTableAbove(ctx));
}

export function runTableMoveDown(view: EditorView, activeState: ActiveBlockState): boolean {
  const ctx = readTableContext(view.state, activeState);

  return applyTableSemanticEdit(view, activeState, computeMoveToTableRowBelow(ctx) ?? computeExitTableBelow(ctx));
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
  if (!edit) {
    return false;
  }

  // Exit edits can target a location outside any table and may carry their own insert payload,
  // so they short-circuit the cell-lookup path entirely.
  if (isExitSelectionTarget(edit.selectionTarget)) {
    return dispatchExit(view, edit.selectionTarget);
  }

  const selectionAnchor = resolveSelectionAnchor(activeState, edit);

  if (selectionAnchor === null) {
    return false;
  }

  view.dispatch(
    edit.changes
      ? {
          changes: edit.changes,
          selection: { anchor: selectionAnchor, head: selectionAnchor }
        }
      : {
          selection: { anchor: selectionAnchor, head: selectionAnchor }
        }
  );

  return true;
}

function dispatchExit(view: EditorView, target: TableExitTarget): boolean {
  view.dispatch(
    target.insert
      ? {
          changes: target.insert,
          selection: { anchor: target.anchor, head: target.anchor }
        }
      : {
          selection: { anchor: target.anchor, head: target.anchor }
        }
  );

  return true;
}

function resolveSelectionAnchor(activeState: ActiveBlockState, edit: TableSemanticEdit): number | null {
  // Mutating edits pre-compute the caret offset while they format the new table markdown, so we
  // never need to re-parse the inserted text to resolve a cell location.
  if (edit.resolvedAnchor !== undefined) {
    return edit.resolvedAnchor;
  }

  // Navigation-only edits resolve against the tableBlock already cached on the active state.
  const tableBlock = findTableBlockByStartOffset(activeState, activeState.tableCursor?.tableStartOffset);

  if (!tableBlock) {
    return null;
  }

  const selectionTarget = edit.selectionTarget as TablePosition;
  const targetCell = getTableCell(tableBlock, selectionTarget);

  if (!targetCell) {
    return null;
  }

  const cellLength = Math.max(targetCell.contentEndOffset - targetCell.contentStartOffset, 0);
  const offsetInCell = Math.max(0, Math.min(selectionTarget.offsetInCell ?? 0, cellLength));

  return targetCell.contentStartOffset + offsetInCell;
}
