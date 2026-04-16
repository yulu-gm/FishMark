export type BlockLineInfo = {
  lineStart: number;
  lineEnd: number;
};

export type InactiveBlockquoteLine = {
  lineStart: number;
  markerEnd: number;
  isFirstLine: boolean;
  isLastLine: boolean;
};

export type InactiveCodeFenceLine = {
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
    const lineText = source.slice(cursor, lineEnd);
    const markerMatch = /^\s{0,3}>\s?/.exec(lineText);
    const markerEnd = cursor + (markerMatch?.[0].length ?? 0);
    const nextCursor = nextBreak === -1 || nextBreak >= endOffset ? endOffset : nextBreak + 1;

    lines.push({
      lineStart: cursor,
      markerEnd,
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
  source: string
): InactiveCodeFenceLine[] {
  const lines = getBlockLineInfos(startOffset, endOffset, source);

  if (lines.length === 0) {
    return [];
  }

  const lastIndex = lines.length - 1;

  return lines.map((line, index) => ({
    lineStart: line.lineStart,
    lineEnd: line.lineEnd,
    kind: index === 0 || index === lastIndex ? "fence" : "content",
    isFirstContentLine: index === 1,
    isLastContentLine: index === lastIndex - 1
  }));
}
