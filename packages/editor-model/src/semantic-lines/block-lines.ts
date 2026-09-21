import {
  parseBlockquoteLinePrefix,
  resolveIndentedCodeContentStartOffset,
  type BlockquoteMarker,
  type CodeBlockKind
} from "@fishmark/markdown-engine";

export type BlockLineInfo = {
  lineStart: number;
  lineEnd: number;
};

export type InactiveBlockquoteLine = {
  lineStart: number;
  lineEnd: number;
  markerEnd: number;
  sourcePrefixEndOffset: number;
  contentStartOffset: number;
  quoteDepth: number;
  markers: readonly BlockquoteMarker[];
  isFirstLine: boolean;
  isLastLine: boolean;
};

export type InactiveCodeFenceLine = {
  contentStart: number;
  lineStart: number;
  lineEnd: number;
  kind: "fence" | "content";
  isFirstContentLine: boolean;
  isLastContentLine: boolean;
};

export function getBlockLineInfos(
  startOffset: number,
  endOffset: number,
  source: string
): BlockLineInfo[] {
  const lines: BlockLineInfo[] = [];
  let cursor = startOffset;

  while (cursor < endOffset) {
    const nextBreak = source.indexOf("\n", cursor);
    const lineEnd = nextBreak === -1 || nextBreak >= endOffset ? endOffset : nextBreak;

    lines.push({
      lineStart: cursor,
      lineEnd
    });

    if (nextBreak === -1 || nextBreak >= endOffset) {
      break;
    }

    cursor = nextBreak + 1;
  }

  return lines;
}

export function getInactiveBlockquoteLines(
  startOffset: number,
  endOffset: number,
  source: string
): InactiveBlockquoteLine[] {
  const lines: InactiveBlockquoteLine[] = [];
  let cursor = startOffset;
  let isFirstLine = true;

  while (cursor < endOffset) {
    const nextBreak = source.indexOf("\n", cursor);
    const lineEnd = nextBreak === -1 || nextBreak >= endOffset ? endOffset : nextBreak;
    const prefix = parseBlockquoteLinePrefix(source, cursor, lineEnd);
    const nextCursor = nextBreak === -1 || nextBreak >= endOffset ? endOffset : nextBreak + 1;

    lines.push({
      lineStart: cursor,
      lineEnd,
      markerEnd: prefix.markerEnd,
      sourcePrefixEndOffset: prefix.sourcePrefixEndOffset,
      contentStartOffset: prefix.contentStartOffset,
      quoteDepth: prefix.markers.length,
      markers: prefix.markers,
      isFirstLine,
      isLastLine: nextCursor >= endOffset
    });

    cursor = nextCursor;
    isFirstLine = false;
  }

  return lines;
}

export function getInactiveCodeFenceLines(
  startOffset: number,
  endOffset: number,
  source: string,
  blockKind: CodeBlockKind = "fenced"
): InactiveCodeFenceLine[] {
  const lines = getBlockLineInfos(startOffset, endOffset, source);

  if (lines.length === 0) {
    return [];
  }

  if (blockKind === "indented") {
    const lastIndex = lines.length - 1;

    return lines.map((line, index) => ({
      contentStart: resolveIndentedCodeContentStartOffset(source, line.lineStart, line.lineEnd),
      lineStart: line.lineStart,
      lineEnd: line.lineEnd,
      kind: "content",
      isFirstContentLine: index === 0,
      isLastContentLine: index === lastIndex
    }));
  }

  const lastIndex = lines.length - 1;

  return lines.map((line, index) => ({
    contentStart: line.lineStart,
    lineStart: line.lineStart,
    lineEnd: line.lineEnd,
    kind: index === 0 || index === lastIndex ? "fence" : "content",
    isFirstContentLine: index === 1,
    isLastContentLine: index === lastIndex - 1
  }));
}
