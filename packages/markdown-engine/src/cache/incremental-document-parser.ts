import type { InlineReferenceDefinition, FootnoteDefinition } from "../inline-ast";
import { parseInlineAst } from "../parse-inline-ast";
import {
  collectFootnoteDefinitions,
  collectReferenceDefinitions
} from "../parse-markdown-document";
import {
  createNodeIdForSource,
  type MarkdownDocumentTree
} from "../model/document-tree";
import { childContainerPath, ROOT_CONTAINER_PATH, type ContainerPath } from "../model/container-path";
import {
  createMarkdownContainerNode,
  createMarkdownLeafNode,
  isMarkdownContainerNode,
  type MarkdownNode
} from "../model/markdown-node";
import { createSourceRange, type SourceMarker, type SourceRange } from "../model/source-range";
import { parseFullDocumentTree } from "../parse/full-document-parser";
import {
  createDocumentStructureCacheFromTree,
  type DocumentStructureCache
} from "./document-structure-cache";
import {
  applyTextEdit,
  computeInvalidationWindow,
  type InvalidationWindow,
  type TextEdit
} from "./invalidation-range";

export interface IncrementalParseStats {
  readonly reusedNodes: number;
  readonly reparsedNodes: number;
  readonly fallbackReason: string | null;
  readonly window: InvalidationWindow | null;
}

export interface IncrementalParseResult {
  readonly cache: DocumentStructureCache;
  readonly stats: IncrementalParseStats;
}

// Applies one edit against the cached tree. Unaffected blocks keep their identity and are only
// offset-remapped; the invalidated window is reparsed. Any edit without a safe window falls back
// to a full parse, so the result is always structurally identical to parsing the new source.
export function applyIncrementalEdit(
  cache: DocumentStructureCache,
  edit: TextEdit
): IncrementalParseResult {
  const newSource = applyTextEdit(cache.source, edit);
  const window = computeInvalidationWindow(cache.source, cache.tree, edit);
  if (window === null) {
    return fullParseFallback(newSource, "no-safe-window");
  }

  const referenceDefinitions = collectReferenceDefinitions(newSource);
  const footnoteDefinitions = collectFootnoteDefinitions(newSource);
  const oldChildren = cache.tree.root.children;
  const before = oldChildren.filter((child) => child.source.endOffset <= window.oldStart);
  const after = oldChildren.filter((child) => child.source.startOffset >= window.oldEnd);

  const windowTree = parseFullDocumentTree(
    newSource.slice(window.newStart, window.newEnd)
  );
  const windowChildren = windowTree.root.children.map((child, index) =>
    shiftSubtree({
      node: child,
      newPath: childContainerPath(ROOT_CONTAINER_PATH, before.length + index),
      offsetDelta: window.newStart,
      source: newSource,
      referenceDefinitions,
      footnoteDefinitions
    })
  );
  const afterChildren = after.map((child, index) =>
    shiftSubtree({
      node: child,
      newPath: childContainerPath(
        ROOT_CONTAINER_PATH,
        before.length + windowChildren.length + index
      ),
      offsetDelta: window.delta,
      source: newSource,
      referenceDefinitions,
      footnoteDefinitions
    })
  );

  const children = [...before, ...windowChildren, ...afterChildren];
  const rootSource = createSourceRange(0, newSource.length);
  const root = createMarkdownContainerNode({
    id: createNodeIdForSource({
      path: ROOT_CONTAINER_PATH,
      kind: "document",
      source: newSource
    }),
    kind: "document",
    path: ROOT_CONTAINER_PATH,
    source: rootSource,
    content: rootSource,
    markers: [],
    data: { kind: "document" },
    children
  });
  const tree: MarkdownDocumentTree = Object.freeze({
    root,
    nodesById: indexTree(root)
  });

  const reparsedNodes = countNodes(windowTree.root);
  return {
    cache: createDocumentStructureCacheFromTree(cache.revision + 1, newSource, tree),
    stats: {
      reusedNodes: countNodes(root) - reparsedNodes,
      reparsedNodes,
      fallbackReason: null,
      window
    }
  };

  function fullParseFallback(source: string, reason: string): IncrementalParseResult {
    const tree = parseFullDocumentTree(source);
    return {
      cache: createDocumentStructureCacheFromTree(cache.revision + 1, source, tree),
      stats: {
        reusedNodes: 0,
        reparsedNodes: countNodes(tree.root),
        fallbackReason: reason,
        window: null
      }
    };
  }
}

function shiftSubtree(input: {
  readonly node: MarkdownNode;
  readonly newPath: ContainerPath;
  readonly offsetDelta: number;
  readonly source: string;
  readonly referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>;
  readonly footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>;
}): MarkdownNode {
  const sourceRange = shiftRange(input.node.source, input.offsetDelta);
  const contentRange = shiftRange(input.node.content, input.offsetDelta);
  const markers: readonly SourceMarker[] = input.node.markers.map((marker) =>
    Object.freeze({ kind: marker.kind, range: shiftRange(marker.range, input.offsetDelta) })
  );
  const id = createNodeIdForSource({
    path: input.newPath,
    kind: input.node.kind,
    source: input.source.slice(sourceRange.startOffset, sourceRange.endOffset)
  });

  if (isMarkdownContainerNode(input.node)) {
    const children = input.node.children.map((child, index) =>
      shiftSubtree({
        ...input,
        node: child,
        newPath: childContainerPath(input.newPath, index)
      })
    );
    return createMarkdownContainerNode({
      id,
      kind: input.node.kind,
      path: input.newPath,
      source: sourceRange,
      content: contentRange,
      markers,
      data: input.node.data,
      children
    });
  }

  const inline = input.node.kind === "paragraph" || input.node.kind === "heading"
    ? parseInlineAst(input.source, contentRange.startOffset, contentRange.endOffset, {
        referenceDefinitions: input.referenceDefinitions,
        footnoteDefinitions: input.footnoteDefinitions
      })
    : undefined;
  return createMarkdownLeafNode({
    id,
    kind: input.node.kind,
    path: input.newPath,
    source: sourceRange,
    content: contentRange,
    markers,
    data: input.node.data,
    ...(inline === undefined ? {} : { inline })
  });
}

function shiftRange(range: SourceRange, delta: number): SourceRange {
  return createSourceRange(range.startOffset + delta, range.endOffset + delta);
}

function indexTree(root: MarkdownNode): ReadonlyMap<string, MarkdownNode> {
  const index = new Map<string, MarkdownNode>();
  visit(root);
  return index;

  function visit(node: MarkdownNode): void {
    index.set(node.id, node);
    if (isMarkdownContainerNode(node)) {
      for (const child of node.children) visit(child);
    }
  }
}

function countNodes(root: MarkdownNode): number {
  let count = 1;
  if (isMarkdownContainerNode(root)) {
    for (const child of root.children) count += countNodes(child);
  }
  return count;
}
