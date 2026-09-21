import { isMarkdownLeafNode, type MarkdownNodeKind } from "@fishmark/markdown-engine";
import { buildRenderPlan } from "@fishmark/markdown-presentation";
import type { EditorDerivedSnapshot } from "../derived/editor-derived-snapshot";
import type { TableCursorState } from "./table-cursor-state";

export type ActiveBlockSelection = { anchor: number; head: number };

export type ActiveBlockState = {
  snapshot: EditorDerivedSnapshot;
  activeNodeId: string | null;
  /** Canonical root-level node that owns the selection; decoration routing reads this id. */
  activeRootNodeId: string | null;
  /** Canonical id of the active root-level heading, or null when that root block is not a heading. */
  activeHeadingId: string | null;
  /** Canonical kind of the active root-level block; null when no root block owns the selection. */
  activeKind: MarkdownNodeKind | null;
  selection: ActiveBlockSelection;
  tableCursor: TableCursorState | null;
};

export function createActiveBlockState(snapshot: EditorDerivedSnapshot, selection: ActiveBlockSelection): ActiveBlockState {
  const node = snapshot.nodeAt(selection.head);
  const owner = node?.kind === "document" ? null : node;
  const plan = buildRenderPlan(snapshot.tree, snapshot);
  const rootChild = owner ? plan.ancestorsOf(owner.id)[1]?.node ?? owner : null;
  const activeHeadingId =
    rootChild !== null && isMarkdownLeafNode(rootChild) && rootChild.data.kind === "heading"
      ? rootChild.id
      : null;

  return {
    snapshot,
    activeNodeId: owner?.id ?? null,
    activeRootNodeId: rootChild?.id ?? null,
    activeHeadingId,
    activeKind: rootChild?.kind ?? null,
    selection,
    tableCursor: null
  };
}
