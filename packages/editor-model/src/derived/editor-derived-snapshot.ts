import {
  applyIncrementalEdit,
  childrenOf,
  type ContainerPath,
  type DocumentStructureCache,
  type MarkdownDocumentTree,
  type MarkdownLeafNode,
  type MarkdownNode,
  type MarkdownTableCell,
} from "@fishmark/markdown-engine";

import { createSelectionContext, type EditorSelection, type SelectionContext } from "../context/selection-context";
import {
  createPhysicalEditingDocument,
  type PhysicalEditingDocument,
  type PhysicalLine
} from "../physical-lines/physical-editing-document";

// Document-derived editor state. Everything in this snapshot depends only on a document
// revision, so selection changes reuse it untouched and only edits rebuild it.
export interface EditorDerivedSnapshot {
  readonly revision: number;
  readonly source: string;
  readonly tree: MarkdownDocumentTree;
  readonly document: PhysicalEditingDocument;
  lineAt(offset: number): PhysicalLine | null;
  nodeAt(offset: number): MarkdownNode | null;
  nodeById(id: string): MarkdownNode | null;
  containerPathAt(offset: number): ContainerPath | null;
  tableAt(offset: number): TableCursor | null;
}

export interface TableCursor {
  readonly node: MarkdownLeafNode;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly isHeader: boolean;
  readonly cell: MarkdownTableCell;
}

// Selection-derived editor state: the same document snapshot plus the active line, node, path,
// and table cursor for one selection. Creating it never parses or rescans the document.
export interface EditorSelectionSnapshot {
  readonly revision: number;
  readonly selection: SelectionContext;
  readonly activeLine: PhysicalLine | null;
  readonly activeNode: MarkdownNode | null;
  readonly activePath: ContainerPath | null;
  readonly activeTable: TableCursor | null;
}

export interface EditorDerivedEditResult {
  readonly snapshot: EditorDerivedSnapshot;
  readonly reusedNodes: number;
  readonly reparsedNodes: number;
  readonly fallbackReason: string | null;
}

export function createEditorDerivedSnapshot(input: {
  readonly revision: number;
  readonly source: string;
  readonly tree: MarkdownDocumentTree;
  readonly document?: PhysicalEditingDocument;
}): EditorDerivedSnapshot {
  return createSnapshot(input.revision, input.source, input.tree, input.document);
}

const snapshotsByCache = new WeakMap<DocumentStructureCache, EditorDerivedSnapshot>();

export function createEditorDerivedSnapshotFromCache(cache: DocumentStructureCache): EditorDerivedSnapshot {
  let snapshot = snapshotsByCache.get(cache);
  if (snapshot === undefined) {
    snapshot = createSnapshot(cache.revision, cache.source, cache.tree, undefined);
    snapshotsByCache.set(cache, snapshot);
  }
  return snapshot;
}

// A document edit goes through the incremental cache, so unaffected structure is reused and the
// new snapshot carries the new revision.
export function applyEditorDerivedEdit(
  _snapshot: EditorDerivedSnapshot,
  cache: DocumentStructureCache,
  edit: { readonly from: number; readonly to: number; readonly insert: string }
): EditorDerivedEditResult {
  const result = applyIncrementalEdit(cache, {
    fromOffset: edit.from,
    toOffset: edit.to,
    insertedText: edit.insert
  });

  return Object.freeze({
    snapshot: createEditorDerivedSnapshotFromCache(result.cache),
    reusedNodes: result.stats.reusedNodes,
    reparsedNodes: result.stats.reparsedNodes,
    fallbackReason: result.stats.fallbackReason
  });
}

export function deriveSelectionSnapshot(
  snapshot: EditorDerivedSnapshot,
  selection: EditorSelection
): EditorSelectionSnapshot {
  const selectionContext = createSelectionContext(selection);
  const activeNode = snapshot.nodeAt(selectionContext.activeOffset);

  return Object.freeze({
    revision: snapshot.revision,
    selection: selectionContext,
    activeLine: snapshot.lineAt(selectionContext.activeOffset),
    activeNode,
    activePath: activeNode === null ? null : activeNode.path,
    activeTable: snapshot.tableAt(selectionContext.activeOffset)
  });
}

export function assertSnapshotRevision(snapshot: EditorDerivedSnapshot, revision: number): void {
  if (snapshot.revision !== revision) {
    throw new Error(
      `Editor snapshot revision ${snapshot.revision} is stale for revision ${revision}.`
    );
  }
}

function resolveNodeAt(document: PhysicalEditingDocument, tree: MarkdownDocumentTree, offset: number): MarkdownNode | null {
  const exact = document.nodeAtOffset(offset);
  const line = document.lineAtOffset(offset);
  const owner = line?.nodeId === null || line?.nodeId === undefined ? null : tree.nodesById.get(line.nodeId) ?? null;
  // Prefixes and the caret immediately after the final character belong to the
  // content on this line, even when half-open source lookup finds only an ancestor.
  if (owner !== null && (exact === null || owner.depth > exact.depth)) return owner;
  return exact ?? (offset > 0 && line !== null && offset > line.range.startOffset
    ? document.nodeAtOffset(offset - 1) : null);
}
function createSnapshot(
  revision: number,
  source: string,
  tree: MarkdownDocumentTree,
  document: PhysicalEditingDocument | undefined
): EditorDerivedSnapshot {
  const physical = document ?? createPhysicalEditingDocument(source, tree);

  return Object.freeze({
    revision,
    source,
    tree,
    document: physical,
    lineAt: (offset: number): PhysicalLine | null => physical.lineAtOffset(offset),
    // A caret sits between characters, so a caret at a node's end still belongs to that node.
    nodeAt: (offset: number): MarkdownNode | null => resolveNodeAt(physical, tree, offset),
    nodeById: (id: string): MarkdownNode | null => tree.nodesById.get(id) ?? null,
    containerPathAt: (offset: number): ContainerPath | null => {
      const node = resolveNodeAt(physical, tree, offset);

      return node === null ? null : node.path;
    },
    tableAt: (offset: number): TableCursor | null => {
      const node = resolveNodeAt(physical, tree, offset);

      return node !== null && node.kind === "table" ? tableCursorAt(node, offset) : null;
    }
  });
}

// The table cursor is the cell the offset sits in, falling back to the cell on the same line so a
// cursor just past a cell still resolves to that table.
function tableCursorAt(node: MarkdownLeafNode, offset: number): TableCursor | null {
  const data = node.data;

  if (data.kind !== "table") {
    return null;
  }

  const cells = [data.header, ...data.rows];

  for (const row of cells) {
    for (const cell of row) {
      if (offset >= cell.content.startOffset && offset <= cell.content.endOffset) {
        return freezeCursor(node, cell);
      }
    }
  }

  for (const row of cells) {
    for (const cell of row) {
      if (offset >= cell.source.startOffset && offset <= cell.source.endOffset) {
        return freezeCursor(node, cell);
      }
    }
  }

  return null;
}

function freezeCursor(node: MarkdownLeafNode, cell: MarkdownTableCell): TableCursor {
  return Object.freeze({
    node,
    rowIndex: cell.rowIndex,
    columnIndex: cell.columnIndex,
    isHeader: cell.isHeader,
    cell
  });
}

export { childrenOf };




