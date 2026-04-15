import { parse, postprocess, preprocess } from "micromark";
import type { Event, Token } from "micromark-util-types";

import type {
  BlockMap,
  BlockquoteBlock,
  CodeFenceBlock,
  HeadingBlock,
  ListItemBlock,
  ListBlock,
  MarkdownBlock,
  ParagraphBlock
} from "./block-map";

export function parseBlockMap(source: string): BlockMap {
  const blocks: MarkdownBlock[] = [];
  let containerDepth = 0;

  for (const [kind, token] of parseEvents(source)) {
    if (kind === "enter") {
      if (token.type === "listOrdered" || token.type === "listUnordered") {
        if (containerDepth === 0) {
          blocks.push(createListBlock(token, token.type === "listOrdered", source));
        }

        containerDepth += 1;
        continue;
      }

      if (token.type === "blockQuote") {
        if (containerDepth === 0) {
          blocks.push(createBlockquoteBlock(token));
        }

        containerDepth += 1;
        continue;
      }

      if (containerDepth > 0) {
        continue;
      }

      if (token.type === "codeFenced") {
        blocks.push(createCodeFenceBlock(token, source));
        continue;
      }

      if (token.type === "atxHeading" || token.type === "setextHeading") {
        blocks.push(createHeadingBlock(token, source));
        continue;
      }

      if (token.type === "paragraph") {
        blocks.push(createParagraphBlock(token));
      }

      continue;
    }

    if (token.type === "listOrdered" || token.type === "listUnordered" || token.type === "blockQuote") {
      containerDepth -= 1;
    }
  }

  return { blocks };
}

function parseEvents(source: string): Event[] {
  return postprocess(parse().document().write(preprocess()(source, "utf8", true)));
}

function createHeadingBlock(token: Token, source: string): HeadingBlock {
  const base = createBaseBlock("heading", token);

  return {
    ...base,
    depth: getHeadingDepth(token, source)
  };
}

function createParagraphBlock(token: Token): ParagraphBlock {
  return createBaseBlock("paragraph", token);
}

function createListBlock(token: Token, ordered: boolean, source: string): ListBlock {
  const base = createBaseBlock("list", token);

  return {
    ...base,
    ordered,
    items: parseListItems(source.slice(base.startOffset, base.endOffset), base.startOffset, base.startLine)
  };
}

function createBlockquoteBlock(token: Token): BlockquoteBlock {
  return createBaseBlock("blockquote", token);
}

function createCodeFenceBlock(token: Token, source: string): CodeFenceBlock {
  const base = createBaseBlock("codeFence", token);

  return {
    ...base,
    info: getCodeFenceInfo(source.slice(base.startOffset, base.endOffset))
  };
}

function createBaseBlock<TType extends MarkdownBlock["type"]>(
  type: TType,
  token: Token
): Extract<MarkdownBlock, { type: TType }> {
  const startOffset = token.start.offset;
  const endOffset = token.end.offset;

  return {
    id: `${type}:${startOffset}-${endOffset}`,
    type,
    startOffset,
    endOffset,
    startLine: token.start.line,
    endLine: token.end.line
  } as Extract<MarkdownBlock, { type: TType }>;
}

function getHeadingDepth(token: Token, source: string): number {
  const slice = source.slice(token.start.offset, token.end.offset);

  if (token.type === "atxHeading") {
    const match = /^\s{0,3}(#{1,6})(?:[ \t]+|$)/.exec(slice);
    const sequence = match?.[1];

    return sequence ? sequence.length : 1;
  }

  const match = /\n[ \t]{0,3}(=+|-+)[ \t]*$/.exec(slice);
  const sequence = match?.[1];

  if (!sequence) {
    return 1;
  }

  return sequence[0] === "=" ? 1 : 2;
}

function getCodeFenceInfo(sourceSlice: string): string | null {
  const firstLine = sourceSlice.slice(0, sourceSlice.indexOf("\n") === -1 ? sourceSlice.length : sourceSlice.indexOf("\n"));
  const match = /^\s{0,3}(?:`{3,}|~{3,})(?:[ \t]*([^\n]*?))?[ \t]*$/.exec(firstLine);
  const info = match?.[1]?.trim();

  return info ? info : null;
}

type LineInfo = {
  text: string;
  startOffset: number;
  endOffset: number;
  lineNumber: number;
};

type DraftListItem = {
  startOffset: number;
  startLine: number;
  indent: number;
  marker: string;
  markerStart: number;
  markerEnd: number;
  task: ListItemBlock["task"];
  endOffset: number;
  endLine: number;
};

const LIST_ITEM_PATTERN = /^(\s*)([*+-]|\d+[.)])(?:[ \t]+|$)/;
const TASK_MARKER_PATTERN = /^\[( |x|X)\](?=[ \t]|$)/;

function parseListItems(sourceSlice: string, baseOffset: number, baseLine: number): ListItemBlock[] {
  const lines = createLineInfos(sourceSlice, baseOffset, baseLine);
  const items: DraftListItem[] = [];

  for (const line of lines) {
    const match = LIST_ITEM_PATTERN.exec(line.text);
    if (!match) {
      const current = items.at(-1);
      if (current) {
        current.endOffset = line.endOffset;
        current.endLine = line.lineNumber;
      }
      continue;
    }

    const indent = match[1]?.length ?? 0;
    const marker = match[2] ?? "-";
    const markerStart = line.startOffset + indent;
    const markerEnd = markerStart + marker.length;
    const remainder = line.text.slice(match[0].length);
    const task = parseTaskMarker(remainder, markerEnd + (match[0].length - indent - marker.length));

    items.push({
      startOffset: line.startOffset,
      startLine: line.lineNumber,
      indent,
      marker,
      markerStart,
      markerEnd,
      task,
      endOffset: line.endOffset,
      endLine: line.lineNumber
    });
  }

  return items.map((item) => ({
    id: `list-item:${item.startOffset}-${item.endOffset}`,
    startOffset: item.startOffset,
    endOffset: item.endOffset,
    startLine: item.startLine,
    endLine: item.endLine,
    indent: item.indent,
    marker: item.marker,
    markerStart: item.markerStart,
    markerEnd: item.markerEnd,
    task: item.task
  }));
}

function createLineInfos(sourceSlice: string, baseOffset: number, baseLine: number): LineInfo[] {
  if (sourceSlice.length === 0) {
    return [];
  }

  const lines: LineInfo[] = [];
  let cursor = 0;
  let lineNumber = baseLine;

  while (cursor < sourceSlice.length) {
    const lineEndIndex = sourceSlice.indexOf("\n", cursor);
    const endIndex = lineEndIndex === -1 ? sourceSlice.length : lineEndIndex;

    lines.push({
      text: sourceSlice.slice(cursor, endIndex),
      startOffset: baseOffset + cursor,
      endOffset: baseOffset + endIndex,
      lineNumber
    });

    if (lineEndIndex === -1) {
      break;
    }

    cursor = lineEndIndex + 1;
    lineNumber += 1;
  }

  return lines;
}

function parseTaskMarker(remainder: string, taskStartOffset: number): ListItemBlock["task"] {
  const taskMatch = TASK_MARKER_PATTERN.exec(remainder);
  if (!taskMatch) {
    return null;
  }

  return {
    checked: taskMatch[1]?.toLowerCase() === "x",
    markerStart: taskStartOffset,
    markerEnd: taskStartOffset + taskMatch[0].length
  };
}
