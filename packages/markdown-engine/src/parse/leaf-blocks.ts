import type { Token } from "micromark-util-types";

import type {
  BlockMathBlock,
  CodeFenceBlock,
  DefinitionBlock,
  HeadingBlock,
  HtmlImageBlock,
  ListBlock,
  MarkdownBlock,
  ParagraphBlock,
  TableBlock,
  ThematicBreakBlock
} from "../block-map";
import { parseHtmlImageData } from "../html-image";
import type { SourceRange } from "../model/source-range";
import type { SourceText } from "../source-text";
import { isTableDelimiterLine, parseLoosePipeTable, parsePipeTable, splitTableLine } from "../table-model";

// Leaf-level Markdown derivation: turning one micromark leaf token range into the concrete
// blocks it represents. Container structure never appears here, so the recursive document
// parser and any container-aware caller share exactly one leaf classification path.
export function createLeafBlocksForToken(
  token: Token,
  source: SourceText,
  maskPrefixes: readonly SourceRange[] = []
): MarkdownBlock[] {
  if (token.type === "codeFenced") {
    return [createCodeFenceBlock(token, source)];
  }

  if (token.type === "mathFlow") {
    return [createBlockMathBlock(token, source, maskPrefixes)];
  }

  if (token.type === "codeIndented") {
    return [createIndentedCodeBlock(token)];
  }

  if (token.type === "htmlFlow") {
    const htmlImageBlock = createHtmlImageBlock(token, source);

    return htmlImageBlock ? [htmlImageBlock] : [];
  }

  if (token.type === "definition") {
    return [createDefinitionBlock(token)];
  }

  if (token.type === "thematicBreak") {
    return [createThematicBreakBlock(token, source, "-")];
  }

  if (token.type === "atxHeading") {
    return [createHeadingBlock(token, source)];
  }

  if (token.type === "setextHeading") {
    return createSetextHeadingDerivedBlocks(token, source);
  }

  if (token.type === "paragraph") {
    return createParagraphDerivedBlocks(token, source);
  }

  return [];
}

// Sibling-level leaf merges. These only ever combine adjacent leaf blocks, so a container can
// run them over its direct leaf run without any knowledge of container nesting.
export function mergeLeafSiblingBlocks(blocks: MarkdownBlock[], source: SourceText): MarkdownBlock[] {
  return mergeLoosePipeTables(blocks, source);
}

function createHeadingBlock(token: Token, source: SourceText): HeadingBlock {
  const base = createBaseBlock("heading", token);

  return {
    ...base,
    depth: getHeadingDepth(token, source)
  };
}

function createParagraphBlock(token: Token): ParagraphBlock {
  return createBlockFromRange("paragraph", token.start.offset, token.end.offset, token.start.line, token.end.line);
}

function createCodeFenceBlock(token: Token, source: SourceText): CodeFenceBlock {
  const base = createBaseBlock("codeFence", token);

  return {
    ...base,
    kind: "fenced",
    info: getCodeFenceInfo(source.slice(base.startOffset, base.endOffset))
  };
}

function createIndentedCodeBlock(token: Token): CodeFenceBlock {
  return {
    ...createBaseBlock("codeFence", token),
    kind: "indented",
    info: null
  };
}

function createBlockMathBlock(
  token: Token,
  source: SourceText,
  maskPrefixes: readonly SourceRange[]
): BlockMathBlock {
  const base = createBaseBlock("blockMath", token);
  const lines = createLineInfos(source.slice(base.startOffset, base.endOffset), base.startOffset, base.startLine);
  const openingLine = lines[0];
  const openingText = openingLine
    ? source.slice(lineContentStart(openingLine, maskPrefixes), openingLine.endOffset)
    : "";
  const openingMatch = openingLine ? /^([ \t]{0,3})(\${2,})[ \t]*$/u.exec(openingText) : null;
  const openingIndentLength = openingMatch?.[1]?.length ?? 0;
  const openingMarkerLength = openingMatch?.[2]?.length ?? "$$".length;
  const markerStartOffset = openingLine
    ? lineContentStart(openingLine, maskPrefixes) + openingIndentLength
    : base.startOffset;
  const markerEndOffset = markerStartOffset + openingMarkerLength;
  const contentStartOffset = openingLine
    ? lineContentStart(
        { startOffset: skipLineBreak(source, openingLine.endOffset, base.endOffset), endOffset: base.endOffset },
        maskPrefixes
      )
    : base.startOffset;
  const closingLine = findClosingBlockMathLine(source, lines, contentStartOffset, maskPrefixes);
  const closingMarkerStartOffset = closingLine
    ? lineContentStart(closingLine, maskPrefixes) + getLeadingWhitespaceLength(
        source.slice(lineContentStart(closingLine, maskPrefixes), closingLine.endOffset)
      )
    : null;
  const closingMarkerLength = closingLine
    ? getBlockMathFenceLength(source.slice(lineContentStart(closingLine, maskPrefixes), closingLine.endOffset))
    : 0;
  const closingMarkerEndOffset = closingMarkerStartOffset === null
    ? null
    : closingMarkerStartOffset + closingMarkerLength;
  const contentEndOffset = closingLine
    ? trimLineBreakBefore(source, contentStartOffset, closingLine.startOffset)
    : trimTrailingLineBreak(source, contentStartOffset, base.endOffset);

  return {
    ...base,
    markerStartOffset,
    markerEndOffset,
    closingMarkerStartOffset,
    closingMarkerEndOffset,
    contentStartOffset,
    contentEndOffset,
    value: source.slice(contentStartOffset, contentEndOffset),
    closed: closingMarkerStartOffset !== null
  };
}

// A container prefix is blanked instead of removed, so structural line inspection must start
// after it. Prefix spans are contiguous per line, which makes this a simple forward skip.
function lineContentStart(
  line: { startOffset: number; endOffset: number },
  maskPrefixes: readonly SourceRange[]
): number {
  let cursor = line.startOffset;

  for (const prefix of maskPrefixes) {
    if (prefix.startOffset === cursor && prefix.endOffset <= line.endOffset) {
      cursor = prefix.endOffset;
    }
  }

  return cursor;
}

function findClosingBlockMathLine(
  source: SourceText,
  lines: readonly LineInfo[],
  contentStartOffset: number,
  maskPrefixes: readonly SourceRange[]
): LineInfo | null {
  for (let index = lines.length - 1; index >= 1; index -= 1) {
    const line = lines[index]!;

    if (line.startOffset < contentStartOffset) {
      continue;
    }

    const text = source.slice(lineContentStart(line, maskPrefixes), line.endOffset);

    if (/^[ \t]{0,3}\${2,}[ \t]*$/u.test(text)) {
      return line;
    }
  }

  return null;
}

function getLeadingWhitespaceLength(value: string): number {
  return /^[ \t]*/u.exec(value)?.[0].length ?? 0;
}

function getBlockMathFenceLength(value: string): number {
  return /\${2,}/u.exec(value)?.[0].length ?? "$$".length;
}

function skipLineBreak(source: SourceText, startOffset: number, endOffset: number): number {
  if (startOffset >= endOffset) {
    return startOffset;
  }

  if (source.charAt(startOffset) === "\r" && source.charAt(startOffset + 1) === "\n") {
    return Math.min(startOffset + 2, endOffset);
  }

  if (source.charAt(startOffset) === "\n") {
    return Math.min(startOffset + 1, endOffset);
  }

  return startOffset;
}

function trimLineBreakBefore(source: SourceText, startOffset: number, endOffset: number): number {
  let cursor = endOffset;

  if (cursor > startOffset && source.charAt(cursor - 1) === "\n") {
    cursor -= 1;
  }

  if (cursor > startOffset && source.charAt(cursor - 1) === "\r") {
    cursor -= 1;
  }

  return cursor;
}

function trimTrailingLineBreak(source: SourceText, startOffset: number, endOffset: number): number {
  let cursor = endOffset;

  while (cursor > startOffset && (source.charAt(cursor - 1) === "\n" || source.charAt(cursor - 1) === "\r")) {
    cursor -= 1;
  }

  return cursor;
}

function createDefinitionBlock(token: Token): DefinitionBlock {
  return createBaseBlock("definition", token);
}

function createThematicBreakBlock(
  token: Token,
  source: SourceText,
  markerOverride?: ThematicBreakBlock["marker"]
): ThematicBreakBlock {
  const base = createBaseBlock("thematicBreak", token);

  return {
    ...base,
    marker: markerOverride ?? getThematicBreakMarker(source.slice(base.startOffset, base.endOffset))
  };
}

function createHtmlImageBlock(token: Token, source: SourceText): HtmlImageBlock | null {
  const htmlImageData = parseHtmlImageData(source.slice(token.start.offset, token.end.offset));

  if (!htmlImageData) {
    return null;
  }

  return {
    ...createBaseBlock("htmlImage", token),
    ...htmlImageData
  };
}

function createBaseBlock<TType extends MarkdownBlock["type"]>(
  type: TType,
  token: Token
): Extract<MarkdownBlock, { type: TType }> {
  return createBlockFromRange(type, token.start.offset, token.end.offset, token.start.line, token.end.line);
}

export function createBlockFromRange<TType extends MarkdownBlock["type"]>(
  type: TType,
  startOffset: number,
  endOffset: number,
  startLine: number,
  endLine: number
): Extract<MarkdownBlock, { type: TType }> {
  return {
    id: `${type}:${startOffset}-${endOffset}`,
    type,
    startOffset,
    endOffset,
    startLine,
    endLine
  } as Extract<MarkdownBlock, { type: TType }>;
}

function getHeadingDepth(token: Token, source: SourceText): number {
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

function createParagraphDerivedBlocks(
  token: Token,
  source: SourceText
): Array<ParagraphBlock | ThematicBreakBlock | TableBlock> {
  const tableBlock = createTableBlock(token, source);

  if (tableBlock) {
    return [tableBlock];
  }

  const looseTableBlocks = createLooseTableDerivedBlocks(token, source);

  if (looseTableBlocks) {
    return looseTableBlocks;
  }

  return createDerivedTextBlocks(token, source, () => createParagraphBlock(token), true);
}

function createSetextHeadingDerivedBlocks(
  token: Token,
  source: SourceText
): Array<HeadingBlock | ParagraphBlock | ThematicBreakBlock | ListBlock | TableBlock> {
  const trailingDashMarkerSplit = createTrailingDashMarkerBlocks(token, source);

  if (trailingDashMarkerSplit) {
    return trailingDashMarkerSplit;
  }

  return createDerivedTextBlocks(
    token,
    source,
    () => createHeadingBlock(token, source),
    false
  );
}

function createTrailingDashMarkerBlocks(
  token: Token,
  source: SourceText
): Array<ParagraphBlock | ThematicBreakBlock | TableBlock | ListBlock> | null {
  if (token.end.offset !== source.length) {
    return null;
  }

  const lines = createLineInfos(
    source.slice(token.start.offset, token.end.offset),
    token.start.offset,
    token.start.line
  );
  const underlineLine = lines.at(-1);
  const contentStart = lines[0];
  const contentEnd = lines.at(-2);

  if (
    !underlineLine ||
    !contentStart ||
    !contentEnd ||
    lines.slice(0, -1).some((line) => getExplicitThematicBreakMarker(line.text) !== null) ||
    !/^[ \t]{0,3}-(?:[ \t]+)?$/u.test(underlineLine.text)
  ) {
    return null;
  }

  const indent = underlineLine.text.search(/\S/u);
  const markerStart = underlineLine.startOffset + Math.max(indent, 0);
  const markerEnd = markerStart + 1;
  const contentLines = lines.slice(0, -1);
  const contentBlocks = createLooseTableDerivedBlocksFromLines(contentLines, source) ?? [
    createBlockFromRange(
      "paragraph",
      contentStart.startOffset,
      contentEnd.endOffset,
      contentStart.lineNumber,
      contentEnd.lineNumber
    )
  ];

  if (/^[ \t]{0,3}-$/u.test(underlineLine.text)) {
    return [
      ...contentBlocks,
      createBlockFromRange(
        "paragraph",
        underlineLine.startOffset,
        underlineLine.endOffset,
        underlineLine.lineNumber,
        underlineLine.lineNumber
      )
    ];
  }

  return [
    ...contentBlocks,
    {
      ...createBlockFromRange(
        "list",
        underlineLine.startOffset,
        underlineLine.endOffset,
        underlineLine.lineNumber,
        underlineLine.lineNumber
      ),
      ordered: false,
      items: [
        {
          id: `list-item:${underlineLine.startOffset}-${underlineLine.endOffset}`,
          startOffset: underlineLine.startOffset,
          endOffset: underlineLine.endOffset,
          startLine: underlineLine.lineNumber,
          endLine: underlineLine.lineNumber,
          indent: Math.max(indent, 0),
          marker: "-",
          markerStart,
          markerEnd,
          task: null,
          children: []
        }
      ]
    }
  ];
}

function createTableBlock(token: Token, source: SourceText): TableBlock | null {
  return parsePipeTable({
    source,
    startOffset: token.start.offset,
    endOffset: token.end.offset,
    startLine: token.start.line,
    endLine: token.end.line
  });
}

function createLooseTableDerivedBlocks(
  token: Token,
  source: SourceText
): Array<ParagraphBlock | ThematicBreakBlock | TableBlock> | null {
  const lines = createLineInfos(
    source.slice(token.start.offset, token.end.offset),
    token.start.offset,
    token.start.line
  );

  return createLooseTableDerivedBlocksFromLines(lines, source);
}

function createLooseTableDerivedBlocksFromLines(
  lines: readonly LineInfo[],
  source: SourceText
): Array<ParagraphBlock | ThematicBreakBlock | TableBlock> | null {
  const blocks: Array<ParagraphBlock | ThematicBreakBlock | TableBlock> = [];
  let foundLooseTable = false;
  let pendingTextStart = 0;
  let cursor = 0;

  while (cursor < lines.length) {
    const columnCount = getLoosePipeColumnCount(lines[cursor]!.text);

    if (columnCount === null) {
      cursor += 1;
      continue;
    }

    const pipeTableRunEnd = findPipeTableLineRunEnd(lines, cursor);

    if (pipeTableRunEnd !== null) {
      appendParagraphDerivedBlocksFromLines(blocks, lines.slice(pendingTextStart, cursor));
      const tableBlock = parsePipeTable({
        source,
        startOffset: lines[cursor]!.startOffset,
        endOffset: lines[pipeTableRunEnd - 1]!.endOffset,
        startLine: lines[cursor]!.lineNumber,
        endLine: lines[pipeTableRunEnd - 1]!.lineNumber
      });

      if (tableBlock) {
        blocks.push(tableBlock);
        foundLooseTable = true;
        pendingTextStart = pipeTableRunEnd;
        cursor = pipeTableRunEnd;
        continue;
      }
    }

    let runEnd = cursor + 1;

    while (runEnd < lines.length && getLoosePipeColumnCount(lines[runEnd]!.text) === columnCount) {
      runEnd += 1;
    }

    if (runEnd - cursor >= 2) {
      appendParagraphDerivedBlocksFromLines(blocks, lines.slice(pendingTextStart, cursor));
      const looseTableBlock = parseLoosePipeTable({
        source,
        startOffset: lines[cursor]!.startOffset,
        endOffset: lines[runEnd - 1]!.endOffset,
        startLine: lines[cursor]!.lineNumber,
        endLine: lines[runEnd - 1]!.lineNumber
      });

      if (looseTableBlock) {
        blocks.push(looseTableBlock);
        foundLooseTable = true;
        pendingTextStart = runEnd;
      }
    }

    cursor = runEnd;
  }

  appendParagraphDerivedBlocksFromLines(blocks, lines.slice(pendingTextStart));

  return foundLooseTable ? blocks : null;
}

function findPipeTableLineRunEnd(lines: readonly LineInfo[], startIndex: number): number | null {
  const headerLine = lines[startIndex];
  const delimiterLine = lines[startIndex + 1];

  if (!headerLine || !delimiterLine || !isTableDelimiterLine(delimiterLine.text)) {
    return null;
  }

  const headerColumnCount = splitTableLine(headerLine.text).length;
  const delimiterColumnCount = splitTableLine(delimiterLine.text).length;

  if (headerColumnCount < 2 || delimiterColumnCount < headerColumnCount) {
    return null;
  }

  let runEnd = startIndex + 2;

  while (runEnd < lines.length) {
    const line = lines[runEnd]!;
    const trimmed = line.text.trim();
    const cellCount = splitTableLine(line.text).length;

    if (trimmed.length === 0 || cellCount < 2 || cellCount > delimiterColumnCount) {
      break;
    }

    runEnd += 1;
  }

  return runEnd;
}

function mergeLoosePipeTables(blocks: MarkdownBlock[], source: SourceText): MarkdownBlock[] {
  const mergedBlocks: MarkdownBlock[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (!block || block.type !== "paragraph") {
      if (block) {
        mergedBlocks.push(block);
      }
      continue;
    }

    const pipeTableCandidate = findPipeTableCandidate(blocks, index, source);

    if (pipeTableCandidate) {
      mergedBlocks.push(pipeTableCandidate.block);
      index = pipeTableCandidate.endIndex;
      continue;
    }

    if (!looksLikeLoosePipeParagraph(block, source)) {
      mergedBlocks.push(block);
      continue;
    }

    let endIndex = index;

    while (endIndex + 1 < blocks.length) {
      const nextBlock = blocks[endIndex + 1];
      const gapSource = source.slice(blocks[endIndex]!.endOffset, nextBlock!.startOffset);

      if (
        nextBlock?.type !== "paragraph" ||
        !/^[\s\r\n]*$/u.test(gapSource) ||
        !looksLikeLoosePipeParagraph(nextBlock, source)
      ) {
        break;
      }

      endIndex += 1;
    }

    const candidate = parseLoosePipeTable({
      source,
      startOffset: block.startOffset,
      endOffset: blocks[endIndex]!.endOffset,
      startLine: block.startLine,
      endLine: blocks[endIndex]!.endLine
    });

    if (candidate) {
      mergedBlocks.push(candidate);
      index = endIndex;
      continue;
    }

    mergedBlocks.push(block);
  }

  return mergedBlocks;
}

function findPipeTableCandidate(
  blocks: readonly MarkdownBlock[],
  startIndex: number,
  source: SourceText
): { block: TableBlock; endIndex: number } | null {
  const startBlock = blocks[startIndex];

  if (!startBlock || startBlock.type !== "paragraph") {
    return null;
  }

  let endIndex = startIndex;

  while (endIndex + 1 < blocks.length) {
    const nextBlock = blocks[endIndex + 1];
    const gapSource = source.slice(blocks[endIndex]!.endOffset, nextBlock!.startOffset);

    if (nextBlock?.type !== "paragraph" || !/^[\s\r\n]*$/u.test(gapSource)) {
      break;
    }

    endIndex += 1;

    const candidate = parsePipeTable({
      source,
      startOffset: startBlock.startOffset,
      endOffset: blocks[endIndex]!.endOffset,
      startLine: startBlock.startLine,
      endLine: blocks[endIndex]!.endLine
    });

    if (candidate) {
      return { block: candidate, endIndex };
    }
  }

  return null;
}

function looksLikeLoosePipeParagraph(block: ParagraphBlock, source: SourceText): boolean {
  const lines = source
    .slice(block.startOffset, block.endOffset)
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return false;
  }

  const columnCounts = lines.map((line) => splitTableLine(line).length);
  const firstColumnCount = columnCounts[0] ?? 0;

  if (firstColumnCount < 2) {
    return false;
  }

  return lines.every((line, lineIndex) => {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|") && columnCounts[lineIndex] === firstColumnCount;
  });
}

function getLoosePipeColumnCount(line: string): number | null {
  const trimmed = line.trim();

  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }

  const columnCount = splitTableLine(line).length;

  return columnCount >= 2 ? columnCount : null;
}

function appendParagraphDerivedBlocksFromLines(
  blocks: Array<ParagraphBlock | ThematicBreakBlock | TableBlock>,
  lines: readonly LineInfo[]
): void {
  if (lines.length === 0) {
    return;
  }

  let paragraphStart: LineInfo | null = null;
  let paragraphEnd: LineInfo | null = null;

  const flushParagraph = () => {
    if (!paragraphStart || !paragraphEnd) {
      return;
    }

    blocks.push(
      createBlockFromRange(
        "paragraph",
        paragraphStart.startOffset,
        paragraphEnd.endOffset,
        paragraphStart.lineNumber,
        paragraphEnd.lineNumber
      )
    );
    paragraphStart = null;
    paragraphEnd = null;
  };

  for (const line of lines) {
    const marker = getExplicitThematicBreakMarker(line.text);

    if (marker) {
      flushParagraph();
      blocks.push({
        ...createBlockFromRange(
          "thematicBreak",
          line.startOffset,
          line.endOffset,
          line.lineNumber,
          line.lineNumber
        ),
        marker
      });
      continue;
    }

    if (!paragraphStart) {
      paragraphStart = line;
    }

    paragraphEnd = line;
  }

  flushParagraph();
}

function createDerivedTextBlocks<TBlock extends ParagraphBlock | HeadingBlock>(
  token: Token,
  source: SourceText,
  createFallbackBlock: () => TBlock,
  splitOnAnyThematicBreak: boolean
): Array<TBlock | ParagraphBlock | ThematicBreakBlock> {
  const lines = createLineInfos(
    source.slice(token.start.offset, token.end.offset),
    token.start.offset,
    token.start.line
  );

  const shouldSplit = splitOnAnyThematicBreak
    ? lines.some((line) => getExplicitThematicBreakMarker(line.text) !== null)
    : lines.some((line) => getExplicitThematicBreakMarker(line.text) === "+") ||
      shouldPreferTrailingDashThematicBreak(lines);

  if (!shouldSplit) {
    return [createFallbackBlock()];
  }

  const blocks: Array<ParagraphBlock | ThematicBreakBlock> = [];
  let paragraphStart: LineInfo | null = null;
  let paragraphEnd: LineInfo | null = null;

  const flushParagraph = () => {
    if (!paragraphStart || !paragraphEnd) {
      return;
    }

    blocks.push(
      createBlockFromRange(
        "paragraph",
        paragraphStart.startOffset,
        paragraphEnd.endOffset,
        paragraphStart.lineNumber,
        paragraphEnd.lineNumber
      )
    );
    paragraphStart = null;
    paragraphEnd = null;
  };

  for (const line of lines) {
    const marker = getExplicitThematicBreakMarker(line.text);

    if (marker) {
      flushParagraph();
      blocks.push({
        ...createBlockFromRange(
          "thematicBreak",
          line.startOffset,
          line.endOffset,
          line.lineNumber,
          line.lineNumber
        ),
        marker
      });
      continue;
    }

    if (!paragraphStart) {
      paragraphStart = line;
    }

    paragraphEnd = line;
  }

  flushParagraph();

  return blocks as Array<TBlock | ParagraphBlock | ThematicBreakBlock>;
}

function shouldPreferTrailingDashThematicBreak(lines: LineInfo[]): boolean {
  if (lines.length <= 2) {
    return false;
  }

  return getExplicitThematicBreakMarker(lines.at(-1)?.text ?? "") === "-";
}

function getExplicitThematicBreakMarker(sourceSlice: string): ThematicBreakBlock["marker"] | null {
  if (/^\s{0,3}\+(?:[ \t]*\+){2,}[ \t]*$/.test(sourceSlice)) {
    return "+";
  }

  if (/^\s{0,3}-(?:[ \t]*-){2,}[ \t]*$/.test(sourceSlice)) {
    return "-";
  }

  return null;
}

function getThematicBreakMarker(sourceSlice: string): ThematicBreakBlock["marker"] {
  const firstMarker = /[+-]/.exec(sourceSlice)?.[0];

  return firstMarker === "+" ? "+" : "-";
}

export type LineInfo = {
  text: string;
  startOffset: number;
  endOffset: number;
  lineNumber: number;
};

export function createLineInfos(sourceSlice: string, baseOffset: number, baseLine: number): LineInfo[] {
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





