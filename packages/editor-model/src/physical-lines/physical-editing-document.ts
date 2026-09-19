import {
  childrenOf,
  type MarkdownDocumentTree,
  type MarkdownNode,
  type SourceRange
} from "@fishmark/markdown-engine";

import {
  advanceVisibleColumn,
  createPrefixSegment,
  hiddenPrefixColumns,
  type PrefixSegment,
  type PrefixSegmentKind
} from "./prefix-segment";

export type PhysicalLineRole =
  | "structural-blank"
  | "separator"
  | "fence-open"
  | "fence-content"
  | "fence-close"
  | "content";

export interface PhysicalLine {
  readonly lineNumber: number;
  readonly range: SourceRange;
  readonly contentRange: SourceRange;
  readonly role: PhysicalLineRole;
  readonly segments: readonly PrefixSegment[];
  readonly contentStartOffset: number;
  readonly contentEndOffset: number;
  readonly nodeId: string | null;
}

export interface PhysicalEditingDocument {
  readonly source: string;
  readonly lines: readonly PhysicalLine[];
  lineAtOffset(offset: number): PhysicalLine | null;
  lineForNode(node: MarkdownNode): readonly PhysicalLine[];
  nodeAtOffset(offset: number): MarkdownNode | null;
  visibleColumnAt(offset: number): number;
}

// Physical lines pair the raw source with the recursive tree: each line gets its ordered
// prefix segments and its structural role, and the queries below are the only place commands
// and decorations read prefix geometry from.
export function createPhysicalEditingDocument(
  source: string,
  tree: MarkdownDocumentTree
): PhysicalEditingDocument {
  const lineRanges = splitLineRanges(source);
  const nodeIndex = createNodeRangeIndex();
  const nodesByLine: (MarkdownNode | null)[] = lineRanges.map((range) =>
    deepestNodeOverlapping(tree.root, range, nodeIndex)
  );
  const fenceLineRoles = computeFenceRoles(source, lineRanges, tree);
  const lines: PhysicalLine[] = lineRanges.map((range, index) =>
    createPhysicalLine(source, range, index + 1, nodesByLine[index] ?? null, fenceLineRoles[index] ?? "content", tree)
  );

  const frozenLines = Object.freeze(lines);
  const lineAtOffset = (offset: number): PhysicalLine | null => {
    const index = firstAfter(lineRanges.length, (index) => lineRanges[index]!.endOffset, offset);
    const line = frozenLines[index];
    return line !== undefined && offset >= line.range.startOffset
      ? line
      : frozenLines[frozenLines.length - 1] ?? null;
  };

  return Object.freeze({
    source,
    lines: frozenLines,
    lineAtOffset(offset: number): PhysicalLine | null {
      return lineAtOffset(offset);
    },
    lineForNode(node: MarkdownNode): readonly PhysicalLine[] {
      const start = firstAfter(lineRanges.length, (index) => lineRanges[index]!.endOffset, node.source.startOffset);
      const end = firstAtLeast(lineRanges.length, (index) => lineRanges[index]!.startOffset, node.source.endOffset);
      return Object.freeze(frozenLines.slice(start, Math.max(start, end)));
    },
    nodeAtOffset(offset: number): MarkdownNode | null {
      return deepestNodeAt(tree.root, offset, nodeIndex);
    },
    visibleColumnAt(offset: number): number {
      const line = lineAtOffset(offset);
      if (line === null) return 0;
      const prefix = hiddenPrefixColumns(line.segments);
      const text = source.slice(line.contentStartOffset, Math.max(line.contentStartOffset, offset));
      return advanceVisibleColumn(prefix, text);
    }
  });
}

function splitLineRanges(source: string): readonly SourceRange[] {
  const ranges: SourceRange[] = [];
  let start = 0;
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === "\n") {
      ranges.push(Object.freeze({ startOffset: start, endOffset: offset + 1 }));
      start = offset + 1;
    }
  }
  // Match editor line semantics: even an empty document or terminal newline has a caret line.
  ranges.push(Object.freeze({ startOffset: start, endOffset: source.length }));
  return ranges;
}

// Siblings are in source order. Prefix maximum ends retain the original first-overlap
// preference even when a preceding sibling extends over a later sibling's range.
function createNodeRangeIndex() {
  const indexes = new WeakMap<MarkdownNode, { children: readonly MarkdownNode[]; ends: number[] }>();
  return (node: MarkdownNode) => {
    let index = indexes.get(node);
    if (index === undefined) {
      const children = childrenOf(node);
      let maxEnd = -Infinity;
      const ends = children.map((child) => (maxEnd = Math.max(maxEnd, child.source.endOffset)));
      index = { children, ends };
      indexes.set(node, index);
    }
    return index;
  };
}

type NodeRangeIndex = ReturnType<typeof createNodeRangeIndex>;

function firstAfter(length: number, valueAt: (index: number) => number, value: number): number {
  let low = 0;
  let high = length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (valueAt(middle) <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function firstAtLeast(length: number, valueAt: (index: number) => number, value: number): number {
  let low = 0;
  let high = length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (valueAt(middle) < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function deepestNodeAt(root: MarkdownNode, offset: number, nodeIndex: NodeRangeIndex): MarkdownNode | null {
  let current: MarkdownNode | null = null;
  let candidate: MarkdownNode = root;
  for (;;) {
    const { children, ends } = nodeIndex(candidate);
    const next = children[firstAfter(ends.length, (index) => ends[index]!, offset)];
    if (next === undefined || next.source.startOffset > offset) break;
    current = next;
    candidate = next;
  }
  return current;
}

// Lines are matched by overlap, not by their start offset: a container whose range begins
// after a quote prefix on the same line still owns that line.
function deepestNodeOverlapping(root: MarkdownNode, range: SourceRange, nodeIndex: NodeRangeIndex): MarkdownNode | null {
  let current: MarkdownNode | null = null;
  let candidate: MarkdownNode = root;
  for (;;) {
    const { children, ends } = nodeIndex(candidate);
    // A child that starts on this line owns it. Overlap alone would hand the line to the
    // previous sibling, whose range still covers its own trailing line break.
    const starting = children[firstAtLeast(children.length, (index) => children[index]!.source.startOffset, range.startOffset)];
    const next = starting !== undefined && starting.source.startOffset < range.endOffset
      ? starting
      : children[firstAfter(ends.length, (index) => ends[index]!, range.startOffset)];
    if (next === undefined || next.source.startOffset >= range.endOffset) break;
    current = next;
    candidate = next;
  }
  return current;
}

function computeFenceRoles(
  source: string,
  lineRanges: readonly SourceRange[],
  tree: MarkdownDocumentTree
): readonly PhysicalLineRole[] {
  const roles: PhysicalLineRole[] = lineRanges.map(() => "content");
  for (const node of tree.nodesById.values()) {
    if (node.kind !== "code-fence" && node.kind !== "block-math") continue;
    const start = firstAfter(lineRanges.length, (index) => lineRanges[index]!.endOffset, node.source.startOffset);
    const end = firstAtLeast(lineRanges.length, (index) => lineRanges[index]!.startOffset, node.source.endOffset);
    const markerText = (range: SourceRange): string => {
      const lineEnd = trimLineBreak(source, range.startOffset, range.endOffset);
      const segments = buildPrefixSegments(source, range.startOffset, lineEnd, node, tree);
      return source.slice(segments.at(-1)?.range.endOffset ?? range.startOffset, lineEnd).trim();
    };
    const opening = start < end ? /^(`{3,}|~{3,}|\$\$)/u.exec(markerText(lineRanges[start]!))?.[0] : undefined;
    for (let index = start; index < end; index += 1) {
      const range = lineRanges[index]!;
      const closing = index === end - 1 ? /^(`{3,}|~{3,}|\$\$)$/u.exec(markerText(range))?.[0] : undefined;
      const isMarker = opening !== undefined && closing !== undefined &&
        closing[0] === opening[0] && closing.length >= opening.length;
      roles[index] = index === start
        ? "fence-open"
        : index === end - 1 && isMarker
          ? "fence-close"
          : "fence-content";
    }
  }
  return roles;
}

function createPhysicalLine(
  source: string,
  range: SourceRange,
  lineNumber: number,
  node: MarkdownNode | null,
  role: PhysicalLineRole,
  tree: MarkdownDocumentTree
): PhysicalLine {
  const contentEndOffset = trimLineBreak(
    source,
    range.startOffset,
    range.endOffset
  );
  const segments = buildPrefixSegments(source, range.startOffset, contentEndOffset, node, tree);
  const contentStartOffset = segments.length === 0
    ? range.startOffset
    : segments[segments.length - 1]!.range.endOffset;
  const isEmpty = contentEndOffset <= contentStartOffset;
  const resolvedRole: PhysicalLineRole =
    role === "content" && isEmpty ? "structural-blank"
      : role === "content" && !isEmpty && isSeparatorLine(source, range.startOffset, contentEndOffset)
        ? "separator"
        : role;

  return Object.freeze({
    lineNumber,
    range,
    contentRange: Object.freeze({ startOffset: range.startOffset, endOffset: contentEndOffset }),
    role: resolvedRole,
    segments,
    contentStartOffset,
    contentEndOffset,
    nodeId: node?.id ?? null
  });
}

function isSeparatorLine(source: string, startOffset: number, endOffset: number): boolean {
  const text = source.slice(startOffset, endOffset).trim();
  return /^(?:-{3,}|\*{3,}|_{3,})$/u.test(text);
}

function trimLineBreak(source: string, startOffset: number, endOffset: number): number {
  let end = endOffset;
  if (end > startOffset && source[end - 1] === "\n") end -= 1;
  if (end > startOffset && source[end - 1] === "\r") end -= 1;
  return end;
}

// Prefix segments follow document order: every enclosing blockquote marker first, then each
// enclosing list item's indentation/marker/task marker, then the spacing before real content.
function buildPrefixSegments(
  source: string,
  lineStart: number,
  lineEnd: number,
  node: MarkdownNode | null,
  tree: MarkdownDocumentTree
): readonly PrefixSegment[] {
  const chain: MarkdownNode[] = [];
  for (let current = node; current !== null; current = parentOf(tree, current)) {
    chain.unshift(current);
  }
  const segments: PrefixSegment[] = [];
  let cursor = lineStart;
  let column = 0;

  const push = (kind: PrefixSegmentKind, start: number, end: number): void => {
    if (end <= start) return;
    const text = source.slice(start, end);
    segments.push(createPrefixSegment({
      kind,
      range: Object.freeze({ startOffset: start, endOffset: end }),
      text,
      startColumn: column
    }));
    column = advanceVisibleColumn(column, text);
  };

  // Containers may alternate (list > quote > list); process actual ancestry order,
  // never all quote prefixes followed by all list prefixes.
  for (const item of chain) {
    if (item.kind === "blockquote") {
      const indentStart = cursor;
      while (cursor < lineEnd && (source[cursor] === " " || source[cursor] === "\t") && cursor - indentStart < 3) cursor += 1;
      push("indentation", indentStart, cursor);
      if (source[cursor] !== ">") continue;
      push("quote-marker", cursor, cursor + 1);
      cursor += 1;
      const spacingStart = cursor;
      if (source[cursor] === " " || source[cursor] === "\t") cursor += 1;
      push("spacing", spacingStart, cursor);
      continue;
    }
    if (item.kind !== "list-item") continue;
    const isFirstLine =
      item.source.startOffset >= lineStart && item.source.startOffset < lineEnd;
    const indentStart = cursor;
    while (cursor < lineEnd && (source[cursor] === " " || source[cursor] === "\t")) {
      if (isFirstLine) {
        const marker = listMarkerAt(source, cursor);
        if (marker !== null) break;
      }
      cursor += 1;
    }
    push("indentation", indentStart, cursor);
    if (!isFirstLine) continue;
    const marker = listMarkerAt(source, cursor);
    if (marker === null) continue;
    push("list-marker", cursor, cursor + marker.length);
    cursor += marker.length;
    const spacingStart = cursor;
    while (cursor < lineEnd && (source[cursor] === " " || source[cursor] === "\t")) cursor += 1;
    push("spacing", spacingStart, cursor);
    const task = /^\[[ xX]\]/u.exec(source.slice(cursor, cursor + 3));
    if (task !== null) {
      push("task-marker", cursor, cursor + 3);
      cursor += 3;
      const taskSpacingStart = cursor;
      while (cursor < lineEnd && (source[cursor] === " " || source[cursor] === "\t")) cursor += 1;
      push("spacing", taskSpacingStart, cursor);
    }
  }

  return Object.freeze(segments);
}

function parentOf(tree: MarkdownDocumentTree, node: MarkdownNode): MarkdownNode | null {
  if (node.path.length === 0) return null;
  let current: MarkdownNode = tree.root;
  for (let depth = 0; depth < node.path.length - 1; depth += 1) {
    const segment = node.path[depth] ?? -1;
    const next: MarkdownNode | undefined = childrenOf(current)[segment];
    if (next === undefined) return null;
    current = next;
  }
  return current;
}

function listMarkerAt(source: string, offset: number): string | null {
  const unordered = /^[-+*](?=[ \t]|$)/u.exec(source.slice(offset, offset + 2));
  if (unordered !== null) return unordered[0];
  const ordered = /^\d{1,9}[.)](?=[ \t]|$)/u.exec(source.slice(offset, offset + 11));
  return ordered === null ? null : ordered[0];
}

