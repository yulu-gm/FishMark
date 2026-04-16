import { getBlockLineInfos } from "../decorations";

export type ParsedListLine =
  | {
      indent: string;
      marker: string;
      task: null;
      content: string;
    }
  | {
      indent: string;
      marker: string;
      task: {
        checked: boolean;
      };
      content: string;
    };

const LIST_LINE_PATTERN = /^(\s*)([*+-]|\d+[.)])(?:[ \t]+|$)(.*)$/;
const TASK_CONTENT_PATTERN = /^\[( |x|X)\](?:[ \t]+|$)(.*)$/;
const BLOCKQUOTE_LINE_PATTERN = /^(\s{0,3})>(?:[ \t]?)(.*)$/;
const CODE_FENCE_LINE_PATTERN = /^(\s{0,3})(`{3,}|~{3,})([^\n]*)$/;

export function parseListLine(text: string): ParsedListLine | null {
  const match = LIST_LINE_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  const indent = match[1] ?? "";
  const marker = match[2] ?? "-";
  const remainder = match[3] ?? "";
  const taskMatch = TASK_CONTENT_PATTERN.exec(remainder);

  if (!taskMatch) {
    return {
      indent,
      marker,
      task: null,
      content: remainder
    };
  }

  return {
    indent,
    marker,
    task: {
      checked: taskMatch[1]?.toLowerCase() === "x"
    },
    content: taskMatch[2] ?? ""
  };
}

export function parseBlockquoteLine(text: string): { indent: string; content: string } | null {
  const match = BLOCKQUOTE_LINE_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  return {
    indent: match[1] ?? "",
    content: match[2] ?? ""
  };
}

export function parseCodeFenceLine(text: string): { indent: string; fence: string } | null {
  const match = CODE_FENCE_LINE_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  return {
    indent: match[1] ?? "",
    fence: match[2] ?? "```"
  };
}

export function buildContinuationPrefix(parsed: ParsedListLine): string {
  const basePrefix = `${parsed.indent}${incrementListMarker(parsed.marker)} `;

  if (!parsed.task) {
    return basePrefix;
  }

  return `${basePrefix}[ ] `;
}

export function getBackspaceLineStart(
  source: string,
  selectionHead: number,
  lineStart: number
): number {
  if (
    selectionHead === source.length &&
    selectionHead > 0 &&
    source.slice(selectionHead - 1, selectionHead) === "\n"
  ) {
    return selectionHead;
  }

  return lineStart;
}

export function getCodeFenceEditableAnchor(
  source: string,
  block: { startOffset: number; endOffset: number }
): number {
  const lines = getBlockLineInfos(block.startOffset, block.endOffset, source);

  if (lines.length >= 3) {
    return lines[lines.length - 2]!.lineEnd;
  }

  return lines[0]?.lineEnd ?? block.endOffset;
}

function incrementListMarker(marker: string): string {
  const orderedMatch = /^(\d+)([.)])$/.exec(marker);
  if (!orderedMatch) {
    return marker;
  }

  return `${Number.parseInt(orderedMatch[1] ?? "1", 10) + 1}${orderedMatch[2] ?? "."}`;
}
