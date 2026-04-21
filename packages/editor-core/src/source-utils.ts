export type SourceLineInfo = {
  text: string;
  startOffset: number;
  endOffset: number;
};

export function trimTrailingCarriageReturn(source: string, startOffset: number, endOffset: number): number {
  return endOffset > startOffset && source[endOffset - 1] === "\r" ? endOffset - 1 : endOffset;
}

export function resolveLineStartOffset(source: string, offset: number): number {
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  const lineBreakOffset = source.lastIndexOf("\n", Math.max(0, boundedOffset - 1));

  return lineBreakOffset === -1 ? 0 : lineBreakOffset + 1;
}

export function createLineInfosInRange(
  source: string,
  startOffset: number,
  endOffset: number
): SourceLineInfo[] {
  const lines: SourceLineInfo[] = [];
  let cursor = startOffset;

  while (cursor < endOffset) {
    const nextBreakOffset = source.indexOf("\n", cursor);
    const lineEndOffset = nextBreakOffset === -1 || nextBreakOffset > endOffset ? endOffset : nextBreakOffset;

    lines.push({
      text: source.slice(cursor, lineEndOffset),
      startOffset: cursor,
      endOffset: lineEndOffset
    });

    if (nextBreakOffset === -1 || nextBreakOffset >= endOffset) {
      break;
    }

    cursor = nextBreakOffset + 1;
  }

  return lines;
}
