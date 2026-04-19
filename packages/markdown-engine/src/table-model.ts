import type { TableAlignment, TableBlock, TableCell, TableRow, TableRowSeparator } from "./block-map";

export type CanonicalTableModel = {
  hasHeader: boolean;
  rowSeparator: TableRowSeparator;
  alignments: readonly TableAlignment[];
  header: readonly string[];
  rows: readonly (readonly string[])[];
};

type TableLineSegment = {
  raw: string;
  startOffset: number;
  endOffset: number;
  contentStartOffset: number;
  contentEndOffset: number;
  text: string;
};

export function splitTableLine(line: string, lineStartOffset = 0): TableLineSegment[] {
  const rawSegments: Array<{ raw: string; startOffset: number; endOffset: number }> = [];
  let segmentStart = 0;
  let cursor = 0;
  let activeCodeSpanBackticks: number | null = null;

  while (cursor < line.length) {
    const character = line[cursor];
    const isEscapedPipe = character === "|" && cursor > 0 && line[cursor - 1] === "\\";
    const backtickRunLength = countRepeatedCharacter(line, cursor, "`");

    if (backtickRunLength > 0) {
      if (activeCodeSpanBackticks === null) {
        if (hasClosingBacktickRun(line, cursor + backtickRunLength, backtickRunLength)) {
          activeCodeSpanBackticks = backtickRunLength;
        }
      } else if (activeCodeSpanBackticks === backtickRunLength) {
        activeCodeSpanBackticks = null;
      }

      cursor += backtickRunLength;
      continue;
    }

    if (character === "|" && activeCodeSpanBackticks === null && !isEscapedPipe) {
      rawSegments.push({
        raw: line.slice(segmentStart, cursor),
        startOffset: lineStartOffset + segmentStart,
        endOffset: lineStartOffset + cursor
      });
      segmentStart = cursor + 1;
    }

    cursor += 1;
  }

  rawSegments.push({
    raw: line.slice(segmentStart),
    startOffset: lineStartOffset + segmentStart,
    endOffset: lineStartOffset + line.length
  });

  let segments = rawSegments;

  if (
    line.trimStart().startsWith("|") &&
    segments.length > 0 &&
    segments[0]!.raw.trim().length === 0
  ) {
    segments = segments.slice(1);
  }

  if (
    line.trimEnd().endsWith("|") &&
    segments.length > 0 &&
    segments.at(-1)!.raw.trim().length === 0
  ) {
    segments = segments.slice(0, -1);
  }

  return segments.map(({ raw, startOffset, endOffset }) => {
    const leadingWhitespace = raw.match(/^\s*/u)?.[0].length ?? 0;
    const trailingWhitespace = raw.match(/\s*$/u)?.[0].length ?? 0;
    const contentStartOffset = startOffset + leadingWhitespace;
    const contentEndOffset = Math.max(contentStartOffset, endOffset - trailingWhitespace);

    return {
      raw,
      startOffset,
      endOffset,
      contentStartOffset,
      contentEndOffset,
      text: raw.trim().replace(/\\\|/gu, "|")
    };
  });
}

function countRepeatedCharacter(source: string, startIndex: number, character: string): number {
  let length = 0;

  while (source[startIndex + length] === character) {
    length += 1;
  }

  return length;
}

function hasClosingBacktickRun(source: string, startIndex: number, runLength: number): boolean {
  let cursor = startIndex;

  while (cursor < source.length) {
    const currentRunLength = countRepeatedCharacter(source, cursor, "`");

    if (currentRunLength === runLength) {
      return true;
    }

    cursor += Math.max(currentRunLength, 1);
  }

  return false;
}

export function isTableDelimiterLine(line: string): boolean {
  const segments = splitTableLine(line);

  return (
    segments.length >= 2 &&
    segments.every((segment) => /^:?-{3,}:?$/u.test(segment.text))
  );
}

export function parseTableAlignment(cell: string): TableAlignment {
  const trimmed = cell.trim();

  if (/^:-{3,}:$/u.test(trimmed)) {
    return "center";
  }

  if (/^:-{3,}$/u.test(trimmed)) {
    return "left";
  }

  if (/^-{3,}:$/u.test(trimmed)) {
    return "right";
  }

  return "left";
}

export function looksLikePipeTable(lines: readonly string[]): boolean {
  if (lines.length < 2) {
    return false;
  }

  const headerSegments = splitTableLine(lines[0] ?? "");
  const delimiterSegments = splitTableLine(lines[1] ?? "");

  if (headerSegments.length < 2 || delimiterSegments.length !== headerSegments.length) {
    return false;
  }

  if (!isTableDelimiterLine(lines[1] ?? "")) {
    return false;
  }

  return lines.slice(2).every((line) => line.trim().length > 0);
}

export function normalizeTableCells(
  cells: readonly string[],
  columnCount: number
): string[] {
  const normalized = cells.slice(0, columnCount).map((cell) => cell.trim());

  while (normalized.length < columnCount) {
    normalized.push("");
  }

  return normalized;
}

export function createCanonicalTableModel(input: {
  hasHeader?: boolean;
  rowSeparator?: TableRowSeparator;
  alignments: readonly TableAlignment[];
  header: readonly string[];
  rows: readonly (readonly string[])[];
}): CanonicalTableModel {
  const columnCount = Math.max(
    input.alignments.length,
    input.header.length,
    ...input.rows.map((row) => row.length),
    0
  );

  return {
    hasHeader: input.hasHeader ?? true,
    rowSeparator: input.rowSeparator ?? "compact",
    alignments: normalizeTableCells(
      input.alignments,
      columnCount
    ) as TableAlignment[],
    header: normalizeTableCells(input.header, columnCount),
    rows: input.rows.map((row) => normalizeTableCells(row, columnCount))
  };
}

export function parsePipeTable(params: {
  source: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}): TableBlock | null {
  const lines = createLineInfos(
    params.source.slice(params.startOffset, params.endOffset),
    params.startOffset,
    params.startLine
  );

  if (lines.length < 2 || !looksLikePipeTable(lines.map((line) => line.text))) {
    return null;
  }

  const headerSegments = splitTableLine(lines[0]!.text, lines[0]!.startOffset);
  const alignmentSegments = splitTableLine(lines[1]!.text, lines[1]!.startOffset);
  const columnCount = headerSegments.length;
  const alignments = normalizeTableCells(
    alignmentSegments.map((segment) => parseTableAlignment(segment.text)),
    columnCount
  ) as TableAlignment[];

  const header = buildTableCells(headerSegments, {
    rowIndex: 0,
    isHeader: true,
    columnCount
  });

  const rows = lines.slice(2).map((line, rowIndex) =>
    buildTableRow(line, rowIndex + 1, columnCount)
  );

  return {
    id: `table:${params.startOffset}-${params.endOffset}`,
    type: "table",
    startOffset: params.startOffset,
    endOffset: params.endOffset,
    startLine: params.startLine,
    endLine: params.endLine,
    columnCount,
    hasHeader: true,
    rowSeparator: "compact",
    alignments,
    header,
    rows
  };
}

export function looksLikeLoosePipeTable(lines: readonly string[]): boolean {
  const contentLines = lines.filter((line) => line.trim().length > 0);

  if (contentLines.length < 2) {
    return false;
  }

  const columnCounts = contentLines.map((line) => splitTableLine(line).length);
  const firstColumnCount = columnCounts[0] ?? 0;

  if (firstColumnCount < 2) {
    return false;
  }

  return contentLines.every((line, index) => {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|") && columnCounts[index] === firstColumnCount;
  });
}

export function parseLoosePipeTable(params: {
  source: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}): TableBlock | null {
  const lines = createLineInfos(
    params.source.slice(params.startOffset, params.endOffset),
    params.startOffset,
    params.startLine
  );
  const contentLines = lines.filter((line) => line.text.trim().length > 0);

  if (!looksLikeLoosePipeTable(lines.map((line) => line.text))) {
    return null;
  }

  const columnCount = splitTableLine(contentLines[0]!.text, contentLines[0]!.startOffset).length;
  const buildLooseRow = (line: LineInfo, rowIndex: number): TableRow =>
    buildTableCells(splitTableLine(line.text, line.startOffset), {
      rowIndex,
      isHeader: false,
      columnCount
    });

  return {
    id: `table:${params.startOffset}-${params.endOffset}`,
    type: "table",
    startOffset: params.startOffset,
    endOffset: params.endOffset,
    startLine: params.startLine,
    endLine: params.endLine,
    columnCount,
    hasHeader: false,
    rowSeparator: contentLines.length === lines.length ? "compact" : "loose",
    alignments: Array.from({ length: columnCount }, () => "none" as const),
    header: buildLooseRow(contentLines[0]!, 0),
    rows: contentLines.slice(1).map((line, rowIndex) => buildLooseRow(line, rowIndex + 1))
  };
}

export function tableBlockToCanonicalModel(block: TableBlock): CanonicalTableModel {
  return createCanonicalTableModel({
    hasHeader: block.hasHeader,
    rowSeparator: block.rowSeparator,
    alignments: block.alignments,
    header: block.header.map((cell) => cell.text),
    rows: block.rows.map((row) => row.map((cell) => cell.text))
  });
}

function buildTableRow(
  line: { text: string; startOffset: number; endOffset: number },
  rowIndex: number,
  columnCount: number
): TableRow {
  return buildTableCells(splitTableLine(line.text, line.startOffset), {
    rowIndex,
    isHeader: false,
    columnCount
  });
}

function buildTableCells(
  segments: readonly TableLineSegment[],
  options: { rowIndex: number; isHeader: boolean; columnCount: number }
): TableCell[] {
  const cells = segments.slice(0, options.columnCount).map((segment, columnIndex) => ({
    text: segment.text,
    rowIndex: options.rowIndex,
    columnIndex,
    isHeader: options.isHeader,
    startOffset: segment.startOffset,
    endOffset: segment.endOffset,
    contentStartOffset: segment.contentStartOffset,
    contentEndOffset: segment.contentEndOffset
  }));

  while (cells.length < options.columnCount) {
    const previousCell = cells.at(-1);
    const fillerOffset = previousCell?.endOffset ?? 0;

    cells.push({
      text: "",
      rowIndex: options.rowIndex,
      columnIndex: cells.length,
      isHeader: options.isHeader,
      startOffset: fillerOffset,
      endOffset: fillerOffset,
      contentStartOffset: fillerOffset,
      contentEndOffset: fillerOffset
    });
  }

  return cells;
}

type LineInfo = {
  text: string;
  startOffset: number;
  endOffset: number;
  lineNumber: number;
};

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
      text: sourceSlice.slice(cursor, endIndex).replace(/\r$/u, ""),
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
