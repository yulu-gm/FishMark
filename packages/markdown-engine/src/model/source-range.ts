// Source ranges are half-open [startOffset, endOffset) offsets into the original Markdown
// source. They are the only identity the recursive model keeps for text, so every node,
// marker, and content span is expressed as one of these.

export interface SourceRange {
  readonly startOffset: number;
  readonly endOffset: number;
}

export type MarkdownMarkerKind =
  | "blockquote"
  | "heading"
  | "list-marker"
  | "task-marker"
  | "fence"
  | "thematic-break"
  | "table-delimiter";

export interface SourceMarker {
  readonly kind: MarkdownMarkerKind;
  readonly range: SourceRange;
}

export function createSourceRange(startOffset: number, endOffset: number): SourceRange {
  if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset)) {
    throw new TypeError("Source range offsets must be safe integers.");
  }
  if (startOffset < 0 || endOffset < startOffset) {
    throw new RangeError("Source range must be non-negative and ordered.");
  }
  return Object.freeze({ startOffset, endOffset });
}

export function sourceRangeLength(range: SourceRange): number {
  return range.endOffset - range.startOffset;
}

export function isEmptySourceRange(range: SourceRange): boolean {
  return range.startOffset === range.endOffset;
}

export function sourceRangeContainsOffset(range: SourceRange, offset: number): boolean {
  return offset >= range.startOffset && offset < range.endOffset;
}

export function sourceRangeContainsRange(outer: SourceRange, inner: SourceRange): boolean {
  return inner.startOffset >= outer.startOffset && inner.endOffset <= outer.endOffset;
}

export function sourceRangesOverlap(left: SourceRange, right: SourceRange): boolean {
  return left.startOffset < right.endOffset && right.startOffset < left.endOffset;
}

export function sameSourceRange(left: SourceRange, right: SourceRange): boolean {
  return left.startOffset === right.startOffset && left.endOffset === right.endOffset;
}

// Masking replaces the given ranges with spaces while preserving the source length and every
// newline, so offsets computed by parsing the masked text map 1:1 onto the original document.
// This is how container prefixes (`> `, list indentation, fence markers) are removed before
// inline parsing without introducing any offset translation table.
export function maskSourceRanges(
  source: string,
  maskRanges: readonly SourceRange[]
): string {
  if (maskRanges.length === 0) return source;
  const characters = source.split("");
  for (const range of maskRanges) {
    if (range.startOffset < 0 || range.endOffset > source.length) {
      throw new RangeError("Mask range falls outside the source length.");
    }
    for (let offset = range.startOffset; offset < range.endOffset; offset += 1) {
      const character = characters[offset];
      if (character !== "\n" && character !== "\r") {
        characters[offset] = " ";
      }
    }
  }
  return characters.join("");
}

// The complement of the mask ranges: ordered, non-overlapping spans of source that stay
// visible after masking. Container code uses this to read child content verbatim.
export function collectUnmaskedRanges(
  sourceLength: number,
  maskRanges: readonly SourceRange[]
): readonly SourceRange[] {
  const ordered = [...maskRanges].sort((left, right) => left.startOffset - right.startOffset);
  const unmasked: SourceRange[] = [];
  let cursor = 0;
  for (const range of ordered) {
    if (range.startOffset > cursor) {
      unmasked.push(createSourceRange(cursor, range.startOffset));
    }
    cursor = Math.max(cursor, range.endOffset);
  }
  if (cursor < sourceLength) {
    unmasked.push(createSourceRange(cursor, sourceLength));
  }
  return Object.freeze(unmasked);
}
