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
  const nodesByLine: (MarkdownNode | null)[] = lineRanges.map((range) =>
    deepestNodeOverlapping(tree.root, range)
  );
  const fenceLineRoles = computeFenceRoles(source, lineRanges, tree);
  const lines: PhysicalLine[] = lineRanges.map((range, index) =>
    createPhysicalLine(source, range, index + 1, nodesByLine[index] ?? null, fenceLineRoles[index] ?? "content", tree)
  );

  const frozenLines = Object.freeze(lines);
  const lineAtOffset = (offset: number): PhysicalLine | null =>
    frozenLines.find(
      (line) => offset >= line.range.startOffset && offset < line.range.endOffset
    ) ?? frozenLines[frozenLines.length - 1] ?? null;

  return Object.freeze({
    source,
    lines: frozenLines,
    lineAtOffset(offset: number): PhysicalLine | null {
      return lineAtOffset(offset);
    },
    lineForNode(node: MarkdownNode): readonly PhysicalLine[] {
      return Object.freeze(
        frozenLines.filter(
          (line) =>
            line.range.endOffset > node.source.startOffset &&
            line.range.startOffset < node.source.endOffset
        )
      );
    },
    nodeAtOffset(offset: number): MarkdownNode | null {
      return deepestNodeAt(tree.root, offset);
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
  if (start < source.length) {
    ranges.push(Object.freeze({ startOffset: start, endOffset: source.length }));
  }
  return ranges;
}

function deepestNodeAt(root: MarkdownNode, offset: number): MarkdownNode | null {
  let current: MarkdownNode | null = null;
  let candidate: MarkdownNode = root;
  for (;;) {
    const next: MarkdownNode | undefined = childrenOf(candidate).find(
      (child) => offset >= child.source.startOffset && offset < child.source.endOffset
    );
    if (next === undefined) break;
    current = next;
    candidate = next;
  }
  return current;
}

// Lines are matched by overlap, not by their start offset: a container whose range begins
// after a quote prefix on the same line still owns that line.
function deepestNodeOverlapping(root: MarkdownNode, range: SourceRange): MarkdownNode | null {
  let current: MarkdownNode | null = null;
  let candidate: MarkdownNode = root;
  for (;;) {
    const next: MarkdownNode | undefined = childrenOf(candidate).find(
      (child) =>
        child.source.startOffset < range.endOffset && child.source.endOffset > range.startOffset
    );
    if (next === undefined) break;
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
    const covered = lineRanges
      .map((range, index) => ({ range, index }))
      .filter(
        ({ range }) =>
          range.endOffset > node.source.startOffset && range.startOffset < node.source.endOffset
      );
    covered.forEach(({ range, index }, position) => {
      const text = source.slice(range.startOffset, range.endOffset).trimEnd();
      const isMarker = /^(```|~~~|\\$\\$|\\$\\$)/u.test(text.trimStart());
      roles[index] = position === 0
        ? "fence-open"
        : position === covered.length - 1 && isMarker
          ? "fence-close"
          : "fence-content";
    });
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

  for (const quote of chain.filter((entry) => entry.kind === "blockquote")) {
    const indentStart = cursor;
    while (cursor < lineEnd && (source[cursor] === " " || source[cursor] === "\t") &&
           cursor - indentStart < 3) {
      cursor += 1;
    }
    push("indentation", indentStart, cursor);
    if (source[cursor] !== ">") {
      void quote;
      break;
    }
    push("quote-marker", cursor, cursor + 1);
    cursor += 1;
    const spacingStart = cursor;
    if (source[cursor] === " " || source[cursor] === "\t") cursor += 1;
    push("spacing", spacingStart, cursor);
  }

  for (const item of chain.filter((entry) => entry.kind === "list-item")) {
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
