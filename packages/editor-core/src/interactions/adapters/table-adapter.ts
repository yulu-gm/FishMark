import { findTableBlockByStartOffset, getTableCell } from "../../commands/table-context";
import type { BlockInteractionAdapter, VerticalInteractionContext } from "../types";

function resolveTableBoundaryAnchor(context: VerticalInteractionContext): number | null {
  const tableCursor = context.activeState.tableCursor;

  if (!tableCursor || tableCursor.mode === "inside") {
    return null;
  }

  const tableBlock = findTableBlockByStartOffset(context.activeState, tableCursor.tableStartOffset);
  const cell = tableBlock ? getTableCell(tableBlock, tableCursor) : null;

  if (!cell) {
    return null;
  }

  const cellLength = Math.max(cell.contentEndOffset - cell.contentStartOffset, 0);
  const offsetInCell = Math.max(0, Math.min(tableCursor.offsetInCell ?? 0, cellLength));

  return cell.contentStartOffset + offsetInCell;
}

export const tableAdapter: BlockInteractionAdapter = {
  resolveArrowUp(context) {
    if (context.activeState.tableCursor?.mode !== "adjacent-below") {
      return null;
    }

    return resolveTableBoundaryAnchor(context);
  },
  resolveArrowDown(context) {
    if (context.activeState.tableCursor?.mode !== "adjacent-above") {
      return null;
    }

    return resolveTableBoundaryAnchor(context);
  }
};
