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
  type MarkdownLeafNode,
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

  // Plain paragraph/ATX heading text and word-internal paragraph edits can prove
  // that the block boundary remains unchanged. Structural edits still fall back.
  const target = cache.tree.root.children.find((node) =>
    (node.kind === "paragraph" || node.kind === "heading") && edit.fromOffset >= node.source.startOffset &&
    edit.toOffset <= node.content.endOffset
  );
  if (target === undefined || isMarkdownContainerNode(target)) {
    return fullParseFallback(newSource, "unproven-block-boundary");
  }
  const plainParagraphEdit =
    target.kind === "paragraph" &&
    /^[\p{L}][\p{L}\p{N} ,.!?]*(?:\r?\n)?$/u.test(cache.source.slice(target.source.startOffset, target.source.endOffset)) &&
    /^[\p{L}\p{N} ,.!?]*$/u.test(edit.insertedText) &&
    /^[\p{L}\p{N} ,.!?]*$/u.test(cache.source.slice(edit.fromOffset, edit.toOffset)) &&
    /^[\p{L}][\p{L}\p{N} ,.!?]*(?:\r?\n)?$/u.test(newSource.slice(target.source.startOffset, target.source.endOffset + delta));
  const wordEdit = target.kind === "paragraph" && isInlineWordEdit(target, cache.source, edit);
  const headingEdit = isPlainAtxHeadingEdit(target, cache.source, newSource, edit, delta);
  if (!plainParagraphEdit && !wordEdit && !headingEdit) return fullParseFallback(newSource, "unproven-block-boundary");
  const hasDefinitions = cache.tree.referenceDefinitions.size > 0 || cache.tree.footnoteDefinitions.size > 0;
  if (hasDefinitions && !wordEdit && !headingEdit) {
    return fullParseFallback(newSource, "global-definition-dependencies");
  }
  try {
    return applyInlineLeafEdit(cache, edit, target, newSource, options, hasDefinitions);
  } catch (error) {
    if (error instanceof OverlappingSourceOffset) return fullParseFallback(newSource, "overlapping-source-offset");
    throw error;
  }

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

function isPlainAtxHeadingEdit(
  target: MarkdownLeafNode, source: string, newSource: string, edit: TextEdit, delta: number
): boolean {
  if (target.kind !== "heading" || edit.fromOffset < target.content.startOffset ||
      !/^ {0,3}#{1,6}[\t ]+$/u.test(source.slice(target.source.startOffset, target.content.startOffset)) ||
      !/^(?:\r?\n)?$/u.test(source.slice(target.content.endOffset, target.source.endOffset)) ||
      !/^[\p{L}\p{N} ,.!?]*$/u.test(edit.insertedText)) return false;
  // Keep both content edges and the ATX prefix unchanged. In particular, do not
  // reuse closing hashes, trimmed whitespace, setext markers, or inline syntax.
  const plain = (text: string) => /^[\p{L}\p{N}][\p{L}\p{N} ,.!?]*$/u.test(text) && !text.endsWith(" ");
  return plain(source.slice(target.content.startOffset, target.content.endOffset)) &&
    plain(newSource.slice(target.content.startOffset, target.content.endOffset + delta));
}

function isInlineWordEdit(target: MarkdownLeafNode, source: string, edit: TextEdit): boolean {
  if (!/^[A-Za-z]/u.test(source.slice(target.content.startOffset, target.content.endOffset)) ||
      /[\r\n]/u.test(source.slice(target.content.startOffset, target.content.endOffset)) ||
      !/^[A-Za-z]*$/u.test(edit.insertedText) ||
      !/^[A-Za-z]*$/u.test(source.slice(edit.fromOffset, edit.toOffset)) ||
      !/[A-Za-z]/u.test(source[edit.fromOffset - 1] ?? "") ||
      !/[A-Za-z]/u.test(source[edit.toOffset] ?? "")) return false;
  return target.inline?.children.some(node => node.type === "text" &&
    edit.fromOffset > node.startOffset && edit.toOffset < node.endOffset &&
    node.value === source.slice(node.startOffset, node.endOffset)) ?? false;
}

function applyInlineLeafEdit(
  cache: DocumentStructureCache, edit: TextEdit, target: MarkdownLeafNode,
  newSource: string, options: MarkdownParseOptions, hasDefinitions: boolean
): IncrementalParseResult {
  const delta = edit.insertedText.length - (edit.toOffset - edit.fromOffset);
  // Reference destinations can lie on the opposite side of the edit from their
  // link. One global coordinate mapper also preserves shared footnote line data.
  const mapOffsets = hasDefinitions ? createAbsoluteOffsetMapper(edit, delta) : undefined;
  const referenceDefinitions = mapOffsets
    ? new Map([...cache.tree.referenceDefinitions].map(([key, value]) => [key, mapOffsets(value)]))
    : cache.tree.referenceDefinitions;
  const footnoteDefinitions = mapOffsets
    ? new Map([...cache.tree.footnoteDefinitions].map(([key, value]) => [key, mapOffsets(value)]))
    : cache.tree.footnoteDefinitions;
  const window = { delta, oldStart: target.source.startOffset, oldEnd: target.source.endOffset,
    newStart: target.source.startOffset, newEnd: target.source.endOffset + delta };
  const oldChildren = cache.tree.root.children;
  const before = oldChildren.filter((child) => child.source.endOffset <= window.oldStart);
  const after = oldChildren.filter((child) => child.source.startOffset >= window.oldEnd);

  const content = createSourceRange(target.content.startOffset, target.content.endOffset + window.delta);
  const windowChildren = [createMarkdownLeafNode({
    ...target,
    id: createNodeIdForSource({ path: target.path, kind: target.kind, source: newSource.slice(window.newStart, window.newEnd) }),
    source: createSourceRange(window.newStart, window.newEnd),
    content,
    inline: parseInlineAst(newSource, content.startOffset, content.endOffset, {
      instrumentation: options.instrumentation, referenceDefinitions, footnoteDefinitions
    })
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
      mapOffsets,
      options
    })
  );

  const beforeChildren = mapOffsets ? before.map(node => shiftSubtree({
    node, newPath: node.path, offsetDelta: 0, source: newSource,
    referenceDefinitions, footnoteDefinitions, reuseInline: true, mapOffsets, options
  })) : before;
  const children = [...beforeChildren, ...windowChildren, ...afterChildren];
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
    referenceDefinitions,
    footnoteDefinitions
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

}

function shiftSubtree(input: {
  readonly node: MarkdownNode;
  readonly newPath: ContainerPath;
  readonly offsetDelta: number;
  readonly source: string;
  readonly referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>;
  readonly footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>;
  readonly reuseInline?: boolean;
  readonly mapOffsets?: <T>(value: T) => T;
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
    ? input.mapOffsets ? input.mapOffsets(input.node.inline) : mapSourceOffsets(input.node.inline, input.offsetDelta)
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
    data: input.mapOffsets ? input.mapOffsets(input.node.data) : mapSourceOffsets(input.node.data, input.offsetDelta),
    ...(inline === undefined ? {} : { inline })
  });
}

class OverlappingSourceOffset extends Error {}

function createAbsoluteOffsetMapper(edit: TextEdit, delta: number): <T>(value: T) => T {
  const mapped = new WeakMap<object, unknown>();
  return function map<T>(value: T): T {
    if (delta === 0 || value === null || typeof value !== "object") return value;
    if (mapped.has(value)) return mapped.get(value) as T;
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      mapped.set(value, result);
      for (const child of value) result.push(map(child));
      return result as T;
    }
    const result: Record<string, unknown> = {};
    mapped.set(value, result);
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith("Offset") && typeof child === "number") {
        if (child > edit.fromOffset && child < edit.toOffset) throw new OverlappingSourceOffset();
        result[key] = child >= edit.toOffset ? child + delta : child;
      } else result[key] = map(child);
    }
    return result as T;
  };
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
