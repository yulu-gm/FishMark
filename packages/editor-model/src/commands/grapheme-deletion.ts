import type { PhysicalLine } from "../physical-lines/physical-editing-document";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Ordinary deletion removes a user-perceived character, never a UTF-16 half. */
export function graphemeDeletionRange(
  source: string,
  line: PhysicalLine,
  offset: number,
  direction: "backward" | "forward"
): { readonly from: number; readonly to: number } | null {
  // Structural line joins remain with their command planners. Limit Unicode
  // segmentation to this physical line, rather than scanning the document.
  const start = line.range.startOffset;
  const text = source.slice(start, line.contentEndOffset);
  const index = offset - start - (direction === "backward" ? 1 : 0);
  const segment = graphemes.segment(text).containing(index);
  if (segment === undefined) return null;
  return { from: start + segment.index, to: start + segment.index + segment.segment.length };
}
