import { collectBlockquotePrefixSpans } from "../blockquote";
import type { MarkdownBlock } from "../block-map";
import { createSourceRange } from "../model/source-range";
import type { RawChild, RawContainer } from "./full-document-parser";
import { readListScopes, type ListItemGeometry, type ListScope } from "./list-scopes";

// FishMark lists nest by indentation, including the two-space ordered-list style.
// Resolve that dialect once while constructing the canonical tree. Keep micromark's
// non-list containers and typed leaves; only paragraph spans may be split by a newly
// discovered item boundary.
export function normalizeListFrames(frame: RawContainer, source: string): void {
  for (const child of frame.children) {
    if (child.type === "container") normalizeListFrames(child.container, source);
  }
  if (frame.kind === "list" || frame.kind === "list-item") return;

  const result: RawChild[] = [];
  for (let index = 0; index < frame.children.length; index += 1) {
    const child = frame.children[index]!;
    if (child.type !== "container" || child.container.kind !== "list") {
      result.push(child);
      continue;
    }
    const run = [child.container];
    while (index + 1 < frame.children.length) {
      const next = frame.children[index + 1]!;
      if (next.type !== "container" || next.container.kind !== "list" ||
          source.slice(run.at(-1)!.range.endOffset, next.container.range.startOffset).trim() !== "") break;
      run.push(next.container);
      index += 1;
    }
    const start = source.lastIndexOf("\n", run[0]!.range.startOffset - 1) + 1;
    const end = run.at(-1)!.range.endOffset;
    const prefixes = collectBlockquotePrefixSpans(source, createSourceRange(start, end)).prefixes;
    const leaves = run.flatMap(collectLeaves);
    // Quotes inside items have their own container-prefix stack. Their micromark
    // boundaries already express that nesting; do not reinterpret their markers as
    // belonging to the enclosing list's indentation scope.
    if (leaves.some((leaf) => leaf.type === "container") || run.some((list) => hasInlineNestedList(list, source))) {
      result.push(...run.map((container): RawChild => ({ type: "container", container })));
      continue;
    }
    const opaqueRanges = leaves.flatMap((leaf) => leaf.type === "container"
      ? [leaf.container.range]
      : leaf.blocks.filter((block) => block.type !== "paragraph" && block.type !== "heading").map((block) => createSourceRange(block.startOffset, block.endOffset)));
    const scopes = readListScopes(source, createSourceRange(start, end), prefixes, opaqueRanges, true);
    if (scopes === null || scopes.length === 0 || !scopesCoverContent(scopes, run[0]!, end)) {
      result.push(...run.map((container): RawChild => ({ type: "container", container })));
    } else {
      result.push(...scopes.map((scope): RawChild => ({ type: "container", container: scopeFrame(scope, run[0]!, leaves) })));
    }
  }
  frame.children = result;
}

// A same-line nested marker is already a recursive micromark container. The
// indentation dialect reader sees only the first marker on each physical line.
function hasInlineNestedList(frame: RawContainer, source: string): boolean {
  return frame.children.some((child) => {
    if (child.type !== "container") return false;
    const nested = child.container;
    return (frame.kind === "list-item" && nested.kind === "list" &&
      !source.slice(frame.range.startOffset, nested.range.startOffset).includes("\n")) ||
      hasInlineNestedList(nested, source);
  });
}

function scopesCoverContent(scopes: readonly ListScope[], template: RawContainer, end: number): boolean {
  let cursor = template.range.startOffset;
  for (const scope of scopes) {
    if (template.maskedSource.slice(cursor, scope.items[0]!.markerStart).trim().length > 0) return false;
    cursor = scope.items.at(-1)!.endOffset;
  }
  return template.maskedSource.slice(cursor, end).trim().length === 0;
}

function collectLeaves(frame: RawContainer): RawChild[] {
  return frame.children.flatMap((child) => child.type === "container" &&
    (child.container.kind === "list" || child.container.kind === "list-item")
    ? collectLeaves(child.container) : child.type === "blocks"
      ? child.blocks.map((block): RawChild => ({ type: "blocks", blocks: [block] })) : [child]);
}

function scopeFrame(scope: ListScope, template: RawContainer, leaves: readonly RawChild[]): RawContainer {
  const first = scope.items[0]!;
  const last = scope.items.at(-1)!;
  return {
    ...template,
    kind: "list",
    range: createSourceRange(first.markerStart, last.endOffset),
    markers: [],
    itemGeometry: undefined,
    data: scope.ordered
      ? { kind: "list", ordered: true, startOrdinal: scope.startOrdinal, delimiter: scope.delimiter }
      : { kind: "list", ordered: false, startOrdinal: null, delimiter: null },
    children: scope.items.map((item) => ({ type: "container", container: itemFrame(item, template, leaves) }))
  };
}

function itemFrame(item: ListItemGeometry, template: RawContainer, leaves: readonly RawChild[]): RawContainer {
  const nested = item.scopes.map((scope): RawChild => ({ type: "container", container: scopeFrame(scope, template, leaves) }));
  const intervals = [item.markerEnd, ...item.scopes.flatMap((scope) => [scope.items[0]!.startOffset, scope.items.at(-1)!.endOffset]), item.endOffset];
  const ownLeaves: RawChild[] = [];
  for (let index = 0; index + 1 < intervals.length; index += 2) {
    const from = intervals[index]!;
    const to = intervals[index + 1]!;
    for (let leafIndex = firstLeafEndingAfter(leaves, from); leafIndex < leaves.length; leafIndex += 1) {
      const leaf = leaves[leafIndex]!;
      if (childStart(leaf) >= to) break;
      if (leaf.type === "container") {
        if (leaf.container.range.startOffset >= from && leaf.container.range.endOffset <= to) ownLeaves.push(leaf);
      } else {
        const blocks: MarkdownBlock[] = [];
        for (const block of leaf.blocks) {
          if (block.endOffset <= from || block.startOffset >= to) continue;
          if (block.type !== "paragraph" && block.type !== "heading") {
            if (block.startOffset >= from && block.endOffset <= to) blocks.push(block);
          } else {
            const startOffset = Math.max(block.startOffset, from);
            const endOffset = Math.min(block.endOffset, to);
            // Splitting a paragraph around a dialect list boundary can leave only
            // marker padding. Empty items own no paragraph, like micromark items.
            if (template.maskedSource.slice(startOffset, endOffset).trim().length === 0) continue;
            blocks.push(block.type === "heading" && (startOffset !== block.startOffset || endOffset !== block.endOffset)
              ? { id: `paragraph:${startOffset}-${endOffset}`, type: "paragraph", startOffset, endOffset, startLine: block.startLine, endLine: block.endLine }
              : { ...block, startOffset, endOffset });
          }
        }
        if (blocks.length > 0) ownLeaves.push({ type: "blocks", blocks });
      }
    }
  }
  const children = [...ownLeaves, ...nested].sort((a, b) => childStart(a) - childStart(b));
  return {
    ...template,
    kind: "list-item",
    tokenType: "list-item",
    range: createSourceRange(item.markerStart, item.endOffset),
    markers: [
      { kind: "list-marker", range: createSourceRange(item.markerStart, item.markerEnd) },
      ...(item.task === null ? [] : [{ kind: "task-marker" as const, range: createSourceRange(item.task.markerStart, item.task.markerEnd) }])
    ],
    itemGeometry: item,
    children,
    data: { kind: "list-item", marker: item.marker, indent: item.indent, checked: item.task?.checked ?? null }
  };
}

function childStart(child: RawChild): number {
  return child.type === "container" ? child.container.range.startOffset : child.blocks[0]!.startOffset;
}

function firstLeafEndingAfter(leaves: readonly RawChild[], offset: number): number {
  let low = 0;
  let high = leaves.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const leaf = leaves[middle]!;
    const end = leaf.type === "container" ? leaf.container.range.endOffset : leaf.blocks[0]!.endOffset;
    if (end <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}
