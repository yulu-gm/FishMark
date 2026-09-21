import type { InlineReferenceDefinition, FootnoteDefinition } from "../inline-ast";
import { parseInlineAst } from "../parse-inline-ast";
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
import type { MarkdownParseOptions } from "../parse-instrumentation";
import {
  createDocumentStructureCacheFromTree,
  type DocumentStructureCache
} from "./document-structure-cache";
import {
  applyTextEdit,
  type InvalidationWindow,
  type TextEdit
} from "./invalidation-range";

export interface IncrementalParseStats {
  readonly parsedSourceLength: number;
  readonly fullParseCount: number;
  readonly reusedNodes: number;
  readonly reparsedNodes: number;
  readonly fallbackReason: string | null;
  readonly window: Pick<InvalidationWindow, "oldStart" | "oldEnd" | "newStart" | "newEnd" | "delta"> | null;
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
  edit: TextEdit,
  options: MarkdownParseOptions = {}
): IncrementalParseResult {
  const newSource = applyTextEdit(cache.source, edit);
  const delta = edit.insertedText.length - (edit.toOffset - edit.fromOffset);
  if (!Number.isSafeInteger(edit.fromOffset) || !Number.isSafeInteger(edit.toOffset) ||
      edit.fromOffset < 0 || edit.toOffset < edit.fromOffset || edit.toOffset > cache.source.length) {
    return fullParseFallback(newSource, "no-safe-window");
  }

  // Until parser continuation states are available, only edits within plain paragraph
  // content prove that the old block boundary remains valid. Structural edits explicitly
  // fall back; an old checkpoint alone is not a stability proof for the new document.
  const target = cache.tree.root.children.find((node) =>
    node.kind === "paragraph" && edit.fromOffset >= node.source.startOffset &&
    edit.toOffset <= node.content.endOffset &&
    /^[\p{L}][\p{L}\p{N} ,.!?]*(?:\r?\n)?$/u.test(cache.source.slice(node.source.startOffset, node.source.endOffset))
  );
  if (target === undefined || !/^[\p{L}\p{N} ,.!?]*$/u.test(edit.insertedText) ||
      !/^[\p{L}\p{N} ,.!?]*$/u.test(cache.source.slice(edit.fromOffset, edit.toOffset)) ||
      !/^[\p{L}][\p{L}\p{N} ,.!?]*(?:\r?\n)?$/u.test(newSource.slice(target.source.startOffset, target.source.endOffset + delta))) {
    return fullParseFallback(newSource, "unproven-block-boundary");
  }
  if (cache.tree.referenceDefinitions.size > 0 || cache.tree.footnoteDefinitions.size > 0) {
    return fullParseFallback(newSource, "global-definition-dependencies");
  }
  const referenceDefinitions = cache.tree.referenceDefinitions;
  const footnoteDefinitions = cache.tree.footnoteDefinitions;
  const window = { delta, oldStart: target.source.startOffset, oldEnd: target.source.endOffset,
    newStart: target.source.startOffset, newEnd: target.source.endOffset + delta };
  const oldChildren = cache.tree.root.children;
  const before = oldChildren.filter((child) => child.source.endOffset <= window.oldStart);
  const after = oldChildren.filter((child) => child.source.startOffset >= window.oldEnd);

  const content = createSourceRange(target.content.startOffset, target.content.endOffset + window.delta);
  const windowChildren = [createMarkdownLeafNode({
    ...target,
    kind: "paragraph",
    id: createNodeIdForSource({ path: target.path, kind: "paragraph", source: newSource.slice(window.newStart, window.newEnd) }),
    source: createSourceRange(window.newStart, window.newEnd),
    content,
    inline: parseInlineAst(newSource, content.startOffset, content.endOffset, { instrumentation: options.instrumentation })
  })];
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
      footnoteDefinitions,
      reuseInline: true,
      options
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
    nodesById: indexTree(root),
    source: newSource,
    referenceDefinitions: cache.tree.referenceDefinitions,
    footnoteDefinitions: cache.tree.footnoteDefinitions
  });

  const reparsedNodes = 1;
  return {
    cache: createDocumentStructureCacheFromTree(cache.revision + 1, newSource, tree),
    stats: {
      reusedNodes: countNodes(root) - reparsedNodes,
      reparsedNodes,
      parsedSourceLength: window.newEnd - window.newStart,
      fullParseCount: 0,
      fallbackReason: null,
      window
    }
  };

  function fullParseFallback(source: string, reason: string): IncrementalParseResult {
    const tree = parseFullDocumentTree(source, options);
    return {
      cache: createDocumentStructureCacheFromTree(cache.revision + 1, source, tree),
      stats: {
        reusedNodes: 0,
        reparsedNodes: countNodes(tree.root),
        parsedSourceLength: source.length,
        fullParseCount: 1,
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
  readonly reuseInline?: boolean;
  readonly options?: MarkdownParseOptions;
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

  const inline = input.reuseInline
    ? mapSourceOffsets(input.node.inline, input.offsetDelta)
    : input.node.kind === "paragraph" || input.node.kind === "heading"
    ? parseInlineAst(input.source, contentRange.startOffset, contentRange.endOffset, {
        instrumentation: input.options?.instrumentation,
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
    data: mapSourceOffsets(input.node.data, input.offsetDelta),
    ...(inline === undefined ? {} : { inline })
  });
}

// Inline nodes and table metadata carry absolute offsets too. Shift their ranges rather
// than reparsing unchanged content. All offset-bearing fields use the shared *Offset suffix.
function mapSourceOffsets<T>(value: T, delta: number): T {
  if (delta === 0 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item: unknown) => mapSourceOffsets(item, delta)) as T;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    key.endsWith("Offset") && typeof child === "number" ? child + delta : mapSourceOffsets(child, delta)
  ])) as T;
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
