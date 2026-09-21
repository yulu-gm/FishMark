import { isMarkdownContainerNode, type MarkdownNode } from "@fishmark/markdown-engine";
import { buildRenderPlan } from "@fishmark/markdown-presentation";
import type { EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";
import type { ActiveBlockSelection } from "./active-block";

export type TableCursorMode = "inside" | "adjacent-above" | "adjacent-below";
export type TableCursorState = {
  mode: TableCursorMode;
  /** Canonical id of the table node this cursor points at. */
  tableNodeId: string;
  tableStartOffset: number;
  row: number;
  column: number;
  offsetInCell: number;
};

export function deriveTableCursorState(
  snapshot: EditorDerivedSnapshot,
  selection: ActiveBlockSelection,
  previousCursor: TableCursorState | null
): TableCursorState | null {
  const node = snapshot.nodeAt(selection.head);
  if (node?.kind === "table" && node.data.kind === "table") {
    const located = snapshot.tableAt(selection.head);
    const cell = located?.cell ?? node.data.header[0] ?? node.data.rows[0]?.[0];
    if (!cell) return null;
    return { mode: "inside", tableNodeId: node.id, tableStartOffset: resolveProjectedTableStart(snapshot, node), row: cell.rowIndex,
      column: cell.columnIndex, offsetInCell: Math.max(0, selection.head - cell.content.startOffset) };
  }
  const line = snapshot.lineAt(selection.head);
  if (!line) return null;
  const plan = buildRenderPlan(snapshot.tree, snapshot);
  const parentsOf = (owner: MarkdownNode | null): readonly string[] => {
    if (!owner) return [];
    const parents = plan.ancestorsOf(owner.id).filter((entry) => entry.node.kind !== "document").map((entry) => entry.node.id);
    return isMarkdownContainerNode(owner) && owner.kind !== "document" ? [...parents, owner.id] : parents;
  };
  const parents = parentsOf(node);
  const sameParents = (owner: MarkdownNode | null): boolean => {
    const other = parentsOf(owner);
    return parents.length === other.length && parents.every((id, index) => id === other[index]);
  };
  // Adjacency is a local physical-line query; no source scan or rich-tree walk.
  for (const direction of [1, -1]) {
    for (let distance = 1; distance <= 2; distance += 1) {
      const candidate = snapshot.document.lines[line.lineNumber - 1 + direction * distance];
      if (!candidate) break;
      const target = candidate.nodeId === null ? null : snapshot.nodeById(candidate.nodeId);
      if (target?.kind === "table" && target.data.kind === "table" && sameParents(target)) {
        const tableStartOffset = resolveProjectedTableStart(snapshot, target);
        return { mode: direction > 0 ? "adjacent-above" : "adjacent-below", tableNodeId: target.id, tableStartOffset,
          row: direction > 0 ? 0 : target.data.rows.length,
          column: previousCursor?.tableStartOffset === tableStartOffset ? previousCursor.column : 0,
          offsetInCell: 0 };
      }
      if (candidate.contentStartOffset < candidate.contentEndOffset || !sameParents(target)) break;
    }
  }
  return null;
}

// Table cursor offsets live in the projected block space, where a table block starts at its physical
// line start; a canonical node range starts after any container prefix (`> `, list indent).
function resolveProjectedTableStart(snapshot: EditorDerivedSnapshot, node: MarkdownNode): number {
  return snapshot.lineAt(node.source.startOffset)?.range.startOffset ?? node.source.startOffset;
}

export function isInsideTableCursor(tableCursor: TableCursorState | null): tableCursor is TableCursorState & { mode: "inside" } {
  return tableCursor?.mode === "inside";
}
