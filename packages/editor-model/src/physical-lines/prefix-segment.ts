import type { SourceRange } from "@fishmark/markdown-engine";

// A prefix segment is one ordered piece of a physical line's leading structure: the quote
// markers, list indentation, list marker, task marker, and spacing that push real content to
// the right. Commands and decorations read these instead of re-deriving prefixes themselves.
export type PrefixSegmentKind =
  | "quote-marker"
  | "indentation"
  | "list-marker"
  | "task-marker"
  | "spacing";

export interface PrefixSegment {
  readonly kind: PrefixSegmentKind;
  readonly range: SourceRange;
  readonly text: string;
  readonly startColumn: number;
  readonly endColumn: number;
}

// Tabs advance to the next multiple of four, matching Markdown's column semantics.
export function advanceVisibleColumn(column: number, text: string): number {
  let next = column;
  for (const character of text) {
    next = character === "\t" ? next + (4 - (next % 4)) : next + 1;
  }
  return next;
}

export function createPrefixSegment(input: {
  readonly kind: PrefixSegmentKind;
  readonly range: SourceRange;
  readonly text: string;
  readonly startColumn: number;
}): PrefixSegment {
  return Object.freeze({
    kind: input.kind,
    range: input.range,
    text: input.text,
    startColumn: input.startColumn,
    endColumn: advanceVisibleColumn(input.startColumn, input.text)
  });
}

export function prefixSegmentAtColumn(
  segments: readonly PrefixSegment[],
  column: number
): PrefixSegment | null {
  return segments.find((segment) => column >= segment.startColumn && column < segment.endColumn) ?? null;
}

export function hiddenPrefixColumns(segments: readonly PrefixSegment[]): number {
  const last = segments[segments.length - 1];
  return last === undefined ? 0 : last.endColumn;
}
