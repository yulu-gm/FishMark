import type { ListItemBlock } from "@fishmark/markdown-engine";

export function createInactiveBlockquoteDepthClass(depth: number): string {
  return `cm-inactive-blockquote-depth-${Math.max(1, Math.min(depth, 4))}`;
}

export function consumeHorizontalSpace(source: string, startOffset: number, endOffset: number): number {
  let cursor = startOffset;
  while (cursor < endOffset && (source[cursor] === " " || source[cursor] === "\t")) cursor += 1;
  return cursor;
}

/** Resolve the body after a raw list marker when no canonical content offset is available. */
export function resolveListItemMarkerContentStartOffset(
  item: ListItemBlock,
  source: string,
  lineEndOffset: number
): number {
  let cursor = consumeHorizontalSpace(source, item.markerEnd, lineEndOffset);
  if (item.task && item.task.markerStart === cursor) {
    cursor = consumeHorizontalSpace(source, item.task.markerEnd, lineEndOffset);
  }
  return Math.min(cursor, lineEndOffset);
}

/** Shared source geometry for the live editor and HTML export. */
export function createListLineAttributes(
  mode: "active" | "inactive",
  item: ListItemBlock,
  source: string,
  ordered: boolean,
  lineKind: "first" | "continuation",
  sourcePrefixLength: number
): { class: string; style: string } {
  const prefix = `cm-${mode}-list`;
  const classes = [
    lineKind === "continuation" ? `${prefix}-continuation` : prefix,
    ordered ? `${prefix}-ordered` : `${prefix}-unordered`,
    `${prefix}-depth-${Math.floor(item.indent / 2)}`
  ];
  if (item.task) classes.push(`${prefix}-task`,
    item.task.checked ? `${prefix}-task-checked` : `${prefix}-task-unchecked`);

  // Only this item's visible marker belongs to its gutter. Quote markers and
  // ancestor indentation remain owned by their containers. CM's supported tab
  // stop defaults to four columns; reserving all four is safe at any alignment.
  const marker = source.slice(item.markerStart, item.task?.markerEnd ?? item.markerEnd);
  const width = marker.replace(/\t/gu, "    ").length;
  // Existing fixed gutters accommodate ordinary bullets/tasks and one- or
  // two-digit ordered markers. Only long ordered markers or tabs need expansion.
  if ((ordered && item.markerEnd - item.markerStart > 3) || marker.includes("\t")) {
    classes.push("cm-list-wide-marker");
  }
  return {
    class: classes.join(" "),
    style: `--fishmark-list-source-prefix-offset: ${mode === "active" ? "0em" : `${sourcePrefixLength}ch`}; --fishmark-list-marker-source-width: ${width}ch;`
  };
}
