import {
  applyIncrementalEdit,
  childrenOf,
  flattenMarkdownTree,
  isMarkdownLeafNode,
  type ContainerPath,
  type DocumentStructureCache,
  type InlineNode,
  type InlineRoot,
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

export type EditorOutlineHeading = {
  /** Canonical node id of the root-level heading, shared by editor and renderer outline consumers. */
  readonly id: string;
  readonly depth: number;
  readonly label: string;
  readonly startOffset: number;
  readonly startLine: number;
};

export type EditorDocumentMetrics = {
  readonly meaningfulCharacterCount: number;
};

// Document-derived editor state. Everything in this snapshot depends only on a document
// revision, so selection changes reuse it untouched and only edits rebuild it.
export interface EditorDerivedSnapshot {
  readonly revision: number;
  readonly source: string;
  readonly tree: MarkdownDocumentTree;
  readonly document: PhysicalEditingDocument;
  readonly outlineHeadings: readonly EditorOutlineHeading[];
  readonly documentMetrics: EditorDocumentMetrics;
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
  const outlineHeadings = createOutlineHeadings(tree, physical);
  let documentMetrics: EditorDocumentMetrics | null = null;

  return Object.freeze({
    revision,
    source,
    tree,
    document: physical,
    outlineHeadings,
    get documentMetrics(): EditorDocumentMetrics {
      documentMetrics ??= createDocumentMetrics(source, tree, physical);
      return documentMetrics;
    },
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

function createOutlineHeadings(
  tree: MarkdownDocumentTree,
  physical: PhysicalEditingDocument
): readonly EditorOutlineHeading[] {
  const headings: EditorOutlineHeading[] = [];

  for (const node of childrenOf(tree.root)) {
    if (!isMarkdownLeafNode(node) || node.data.kind !== "heading") {
      continue;
    }

    const line = physical.lineAtOffset(node.source.startOffset);
    if (line === null) {
      continue;
    }

    headings.push(Object.freeze({
      id: node.id,
      depth: node.data.depth,
      label: normalizeOutlineLabel(readInlineText(node.inline)),
      startOffset: line.range.startOffset,
      startLine: line.lineNumber
    }));
  }

  return Object.freeze(headings);
}

function createDocumentMetrics(
  source: string,
  tree: MarkdownDocumentTree,
  physical: PhysicalEditingDocument
): EditorDocumentMetrics {
  let meaningfulCharacterCount = 0;

  for (const node of flattenMarkdownTree(tree)) {
    if (!isMarkdownLeafNode(node)) {
      continue;
    }

    switch (node.data.kind) {
      case "heading":
      case "paragraph":
        meaningfulCharacterCount += countNodeInlineMeaningfulCharacters(
          node,
          source,
          physical
        );
        break;
      case "code-fence":
        meaningfulCharacterCount += countMeaningfulCharacters(
          collectCodeFenceReadableText(node, source, physical)
        );
        break;
      case "block-math":
        meaningfulCharacterCount += countMeaningfulCharacters(node.data.value);
        break;
      case "table":
        for (const row of [node.data.header, ...node.data.rows]) {
          for (const cell of row) {
            meaningfulCharacterCount += countInlineMeaningfulCharacters(cell.inline);
          }
        }
        break;
      case "html-image":
        meaningfulCharacterCount += countMeaningfulCharacters(node.data.alt);
        break;
      case "definition":
      case "thematic-break":
        break;
    }
  }

  return Object.freeze({ meaningfulCharacterCount });
}

function collectCodeFenceReadableText(
  node: MarkdownLeafNode,
  source: string,
  physical: PhysicalEditingDocument
): string {
  if (node.data.kind !== "code-fence") {
    return "";
  }

  return physical
    .lineForNode(node)
    .filter((line) => line.role === "fence-content")
    .map((line) => {
      const text = source.slice(line.contentStartOffset, line.contentEndOffset);
      return node.data.kind === "code-fence" && node.data.fence === "indented"
        ? text.replace(/^(?: {4}|\t)/u, "")
        : text;
    })
    .join("\n");
}

function countNodeInlineMeaningfulCharacters(
  node: MarkdownLeafNode,
  source: string,
  physical: PhysicalEditingDocument
): number {
  const root = node.inline;

  if (!root) {
    return 0;
  }

  return physical.lineForNode(node).reduce((count, line) => {
    const startOffset = Math.max(root.startOffset, line.contentStartOffset);
    const endOffset = Math.min(root.endOffset, line.contentEndOffset);

    return count + countInlineRangeMeaningfulCharacters(
      root.children,
      source,
      startOffset,
      endOffset
    );
  }, 0);
}

function countInlineRangeMeaningfulCharacters(
  nodes: readonly InlineNode[],
  source: string,
  startOffset: number,
  endOffset: number
): number {
  if (endOffset <= startOffset) {
    return 0;
  }

  return nodes.reduce(
    (count, node) =>
      count + countInlineNodeRangeMeaningfulCharacters(
        node,
        source,
        startOffset,
        endOffset
      ),
    0
  );
}

function countInlineNodeRangeMeaningfulCharacters(
  node: InlineNode,
  source: string,
  startOffset: number,
  endOffset: number
): number {
  const from = Math.max(startOffset, node.startOffset);
  const to = Math.min(endOffset, node.endOffset);

  if (to <= from) {
    return 0;
  }

  if (from <= node.startOffset && node.endOffset <= to) {
    return countInlineNodeMeaningfulCharacters(node);
  }

  switch (node.type) {
    case "text":
      return countMeaningfulCharacters(source.slice(from, to));
    case "hardBreak":
      return 0;
    case "codeSpan": {
      const contentFrom = Math.max(from, node.openMarker.endOffset);
      const contentTo = Math.min(to, node.closeMarker.startOffset);
      return contentTo > contentFrom
        ? countMeaningfulCharacters(source.slice(contentFrom, contentTo))
        : 0;
    }
    case "inlineMath": {
      const contentFrom = Math.max(from, node.contentStartOffset);
      const contentTo = Math.min(to, node.contentEndOffset);
      return contentTo > contentFrom
        ? countMeaningfulCharacters(source.slice(contentFrom, contentTo))
        : 0;
    }
    case "footnoteReference":
      return from <= node.labelStartOffset && node.labelEndOffset <= to
        ? countMeaningfulCharacters(node.label)
        : 0;
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      return countInlineRangeMeaningfulCharacters(
        node.children,
        source,
        from,
        to
      );
  }
}

function countInlineMeaningfulCharacters(root: InlineRoot | undefined): number {
  if (!root) {
    return 0;
  }

  return root.children.reduce(
    (count, node) => count + countInlineNodeMeaningfulCharacters(node),
    0
  );
}

function countInlineNodeMeaningfulCharacters(node: InlineNode): number {
  switch (node.type) {
    case "text":
      return countMeaningfulCharacters(node.value);
    case "hardBreak":
      return 0;
    case "codeSpan":
      return countMeaningfulCharacters(node.text);
    case "inlineMath":
      return countMeaningfulCharacters(node.value);
    case "footnoteReference":
      return countMeaningfulCharacters(node.label);
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      return node.children.reduce(
        (count, child) => count + countInlineNodeMeaningfulCharacters(child),
        0
      );
  }
}

function countMeaningfulCharacters(value: string): number {
  return value.match(/[^\s]/gu)?.length ?? 0;
}

function readInlineText(inline: InlineRoot | undefined): string {
  if (!inline) {
    return "";
  }

  return inline.children.map((node) => readInlineNodeText(node)).join("");
}

function readInlineNodeText(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "hardBreak":
      return " ";
    case "codeSpan":
      return node.text;
    case "inlineMath":
      return node.value;
    case "footnoteReference":
      return node.label;
    case "strong":
    case "emphasis":
    case "strikethrough":
    case "link":
    case "image":
      return node.children.map((child) => readInlineNodeText(child)).join("");
  }
}

function normalizeOutlineLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : "Untitled heading";
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




