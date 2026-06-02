import { parse, postprocess, preprocess } from "micromark";
import { math } from "micromark-extension-math";
import type { Event, Token } from "micromark-util-types";

import type {
  BlockMathBlock,
  BlockMap,
  BlockquoteBlock,
  CodeFenceBlock,
  DefinitionBlock,
  HeadingBlock,
  HtmlImageBlock,
  ListBlock,
  ListItemBlock,
  MarkdownBlock,
  OrderedListDelimiter,
  ParagraphBlock,
  TableBlock,
  ThematicBreakBlock
} from "./block-map";
import { parseHtmlImageData } from "./html-image";
import { isTableDelimiterLine, parseLoosePipeTable, parsePipeTable, splitTableLine } from "./table-model";

export function parseBlockMap(source: string): BlockMap {
  return {
    blocks: parseTopLevelBlocks(source)
  };
}

export function parseTopLevelBlocks(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let containerDepth = 0;

  for (const [kind, token] of parseEvents(source)) {
    if (kind === "enter") {
      if (token.type === "listOrdered" || token.type === "listUnordered") {
        if (containerDepth === 0) {
          blocks.push(...createListBlocks(token, token.type === "listOrdered", source));
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

      if (token.type === "mathFlow") {
        blocks.push(createBlockMathBlock(token, source));
        continue;
      }

      if (token.type === "codeIndented") {
        blocks.push(createIndentedCodeBlock(token));
        continue;
      }

      if (token.type === "htmlFlow") {
        const htmlImageBlock = createHtmlImageBlock(token, source);

        if (htmlImageBlock) {
          blocks.push(htmlImageBlock);
        }

        continue;
      }

      if (token.type === "definition") {
        blocks.push(createDefinitionBlock(token));
        continue;
      }

      if (token.type === "thematicBreak") {
        blocks.push(createThematicBreakBlock(token, source, "-"));
        continue;
      }

      if (token.type === "atxHeading") {
        blocks.push(createHeadingBlock(token, source));
        continue;
      }

      if (token.type === "setextHeading") {
        blocks.push(...createSetextHeadingDerivedBlocks(token, source));
        continue;
      }

      if (token.type === "paragraph") {
        blocks.push(...createParagraphDerivedBlocks(token, source));
      }

      continue;
    }

    if (token.type === "listOrdered" || token.type === "listUnordered" || token.type === "blockQuote") {
      containerDepth -= 1;
    }
  }

  return mergeLoosePipeTables(mergeContiguousListBlocks(blocks, source), source);
}

function parseEvents(source: string): Event[] {
  return postprocess(parse({ extensions: [math({ singleDollarTextMath: true })] }).document().write(preprocess()(source, "utf8", true)));
}

function createHeadingBlock(token: Token, source: string): HeadingBlock {
  const base = createBaseBlock("heading", token);

  return {
    ...base,
    depth: getHeadingDepth(token, source)
  };
}

function createParagraphBlock(token: Token): ParagraphBlock {
  return createBlockFromRange("paragraph", token.start.offset, token.end.offset, token.start.line, token.end.line);
}

function createListBlocks(token: Token, ordered: boolean, source: string): Array<ListBlock | ParagraphBlock> {
  const base = createBaseBlock("list", token);
  const sourceSlice = source.slice(base.startOffset, base.endOffset);
  const listScopes = parseListScopes(
    sourceSlice,
    base.startOffset,
    base.startLine
  );

  if (listScopes === null || listScopes.length === 0 || listScopes.some((scope) => scope.ordered !== ordered)) {
    const fallbackItems = parseFlatListItems(sourceSlice, base.startOffset, base.startLine);

    if (fallbackItems.length === 0) {
      return [createBlockFromRange("paragraph", base.startOffset, base.endOffset, base.startLine, base.endLine)];
    }

    return [createFallbackListBlock(base, ordered, source)];
  }

  return listScopes.map((scope) => materializeListScope(scope));
}

function createBlockquoteBlock(token: Token): BlockquoteBlock {
  return createBaseBlock("blockquote", token);
}

function createCodeFenceBlock(token: Token, source: string): CodeFenceBlock {
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

function createBlockMathBlock(token: Token, source: string): BlockMathBlock {
  const base = createBaseBlock("blockMath", token);
  const lines = createLineInfos(source.slice(base.startOffset, base.endOffset), base.startOffset, base.startLine);
  const openingLine = lines[0];
  const openingMatch = openingLine ? /^([ \t]{0,3})(\${2,})[ \t]*$/u.exec(openingLine.text) : null;
  const openingIndentLength = openingMatch?.[1]?.length ?? 0;
  const openingMarkerLength = openingMatch?.[2]?.length ?? "$$".length;
  const markerStartOffset = openingLine
    ? openingLine.startOffset + openingIndentLength
    : base.startOffset;
  const markerEndOffset = markerStartOffset + openingMarkerLength;
  const contentStartOffset = openingLine
    ? skipLineBreak(source, openingLine.endOffset, base.endOffset)
    : base.startOffset;
  const closingLine = findClosingBlockMathLine(lines, contentStartOffset);
  const closingMarkerStartOffset = closingLine ? closingLine.startOffset + getLeadingWhitespaceLength(closingLine.text) : null;
  const closingMarkerLength = closingLine ? getBlockMathFenceLength(closingLine.text) : 0;
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

function findClosingBlockMathLine(lines: readonly LineInfo[], contentStartOffset: number): LineInfo | null {
  for (let index = lines.length - 1; index >= 1; index -= 1) {
    const line = lines[index]!;

    if (line.startOffset < contentStartOffset) {
      continue;
    }

    if (/^[ \t]{0,3}\${2,}[ \t]*$/u.test(line.text)) {
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

function skipLineBreak(source: string, startOffset: number, endOffset: number): number {
  if (startOffset >= endOffset) {
    return startOffset;
  }

  if (source[startOffset] === "\r" && source[startOffset + 1] === "\n") {
    return Math.min(startOffset + 2, endOffset);
  }

  if (source[startOffset] === "\n") {
    return Math.min(startOffset + 1, endOffset);
  }

  return startOffset;
}

function trimLineBreakBefore(source: string, startOffset: number, endOffset: number): number {
  let cursor = endOffset;

  if (cursor > startOffset && source[cursor - 1] === "\n") {
    cursor -= 1;
  }

  if (cursor > startOffset && source[cursor - 1] === "\r") {
    cursor -= 1;
  }

  return cursor;
}

function trimTrailingLineBreak(source: string, startOffset: number, endOffset: number): number {
  let cursor = endOffset;

  while (cursor > startOffset && (source[cursor - 1] === "\n" || source[cursor - 1] === "\r")) {
    cursor -= 1;
  }

  return cursor;
}

function createDefinitionBlock(token: Token): DefinitionBlock {
  return createBaseBlock("definition", token);
}

function createThematicBreakBlock(
  token: Token,
  source: string,
  markerOverride?: ThematicBreakBlock["marker"]
): ThematicBreakBlock {
  const base = createBaseBlock("thematicBreak", token);

  return {
    ...base,
    marker: markerOverride ?? getThematicBreakMarker(source.slice(base.startOffset, base.endOffset))
  };
}

function createHtmlImageBlock(token: Token, source: string): HtmlImageBlock | null {
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

function createBlockFromRange<TType extends MarkdownBlock["type"]>(
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

function createParagraphDerivedBlocks(
  token: Token,
  source: string
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
  source: string
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
  source: string
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

function createTableBlock(token: Token, source: string): TableBlock | null {
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
  source: string
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
  source: string
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

function mergeLoosePipeTables(blocks: MarkdownBlock[], source: string): MarkdownBlock[] {
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
  source: string
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

function looksLikeLoosePipeParagraph(block: ParagraphBlock, source: string): boolean {
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
  source: string,
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
  children: DraftListScope[];
};

type DraftListScope =
  | {
      ordered: false;
      indent: number;
      items: DraftListItem[];
    }
  | {
      ordered: true;
      indent: number;
      startOrdinal: number;
      delimiter: OrderedListDelimiter;
      items: DraftListItem[];
    };

const LIST_ITEM_PATTERN = /^(\s*)(?:([*+-])([ \t]+)|(\d+[.)])([ \t]+))/;
const TASK_MARKER_PATTERN = /^\[( |x|X)\](?=[ \t]|$)/;

function parseListScopes(sourceSlice: string, baseOffset: number, baseLine: number): DraftListScope[] | null {
  const lines = createLineInfos(sourceSlice, baseOffset, baseLine);
  const rootScopes: DraftListScope[] = [];
  const openItems: DraftListItem[] = [];
  let forceNewRootScope = false;

  for (const line of lines) {
    const match = LIST_ITEM_PATTERN.exec(line.text);
    if (!match) {
      if (line.text.trim().length === 0) {
        openItems.length = 0;
        forceNewRootScope = rootScopes.length > 0;
        continue;
      }

      for (const item of openItems) {
        item.endOffset = line.endOffset;
        item.endLine = line.lineNumber;
      }
      continue;
    }

    const indent = match[1]?.length ?? 0;
    const marker = match[2] ?? match[4] ?? "-";
    const metadata = parseListMarker(marker);

    while (openItems.length > 0 && openItems.at(-1)!.indent >= indent) {
      openItems.pop();
    }

    const markerStart = line.startOffset + indent;
    const markerEnd = markerStart + marker.length;
    const padding = match[3] ?? match[5] ?? "";
    const remainder = line.text.slice(match[0].length);
    const task = parseTaskMarker(remainder, markerEnd + padding.length);
    const item: DraftListItem = {
      startOffset: line.startOffset,
      startLine: line.lineNumber,
      indent,
      marker,
      markerStart,
      markerEnd,
      task,
      endOffset: line.endOffset,
      endLine: line.lineNumber,
      children: []
    };

    for (const ancestor of openItems) {
      ancestor.endOffset = line.endOffset;
      ancestor.endLine = line.lineNumber;
    }

    const parent = openItems.at(-1);
    if (parent) {
      appendDraftItemToNestedScope(parent, item, metadata, indent);
    } else {
      const currentRootScope = forceNewRootScope ? null : rootScopes.at(-1) ?? null;

      if (currentRootScope && draftListScopeMatches(currentRootScope, metadata, indent)) {
        currentRootScope.items.push(item);
      } else if (rootScopes.length === 0 || canStartNewRootScope(rootScopes.at(-1) ?? null, indent)) {
        rootScopes.push(createDraftListScope(metadata, indent, item));
      } else {
        return null;
      }

      forceNewRootScope = false;
    }

    openItems.push(item);
  }

  return rootScopes;
}

function createFallbackListBlock(
  base: Pick<ListBlock, "id" | "type" | "startOffset" | "endOffset" | "startLine" | "endLine">,
  ordered: boolean,
  source: string
): ListBlock {
  const items = parseFlatListItems(
    source.slice(base.startOffset, base.endOffset),
    base.startOffset,
    base.startLine
  );

  if (!ordered) {
    return {
      ...base,
      ordered: false,
      items
    };
  }

  const firstMarkerMetadata = parseListMarker(items[0]?.marker ?? "1.");

  return {
    ...base,
    ordered: true,
    startOrdinal: firstMarkerMetadata.ordered ? firstMarkerMetadata.startOrdinal : 1,
    delimiter: firstMarkerMetadata.ordered ? firstMarkerMetadata.delimiter : ".",
    items
  };
}

function parseFlatListItems(sourceSlice: string, baseOffset: number, baseLine: number): ListItemBlock[] {
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
    const marker = match[2] ?? match[4] ?? "-";
    const markerStart = line.startOffset + indent;
    const markerEnd = markerStart + marker.length;
    const padding = match[3] ?? match[5] ?? "";
    const remainder = line.text.slice(match[0].length);
    const task = parseTaskMarker(remainder, markerEnd + padding.length);

    items.push({
      startOffset: line.startOffset,
      startLine: line.lineNumber,
      indent,
      marker,
      markerStart,
      markerEnd,
      task,
      endOffset: line.endOffset,
      endLine: line.lineNumber,
      children: []
    });
  }

  return items.map((item) => materializeListItem(item));
}

function mergeContiguousListBlocks(blocks: MarkdownBlock[], source: string): MarkdownBlock[] {
  const mergedBlocks: MarkdownBlock[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (!block || block.type !== "list") {
      if (block) {
        mergedBlocks.push(block);
      }
      continue;
    }

    let mergedList: ListBlock = block;
    let endIndex = index;

    while (endIndex + 1 < blocks.length) {
      const nextBlock = blocks[endIndex + 1];
      const gapSource = source.slice(blocks[endIndex]!.endOffset, nextBlock!.startOffset);

      if (nextBlock?.type !== "list" || !/^\s*$/u.test(gapSource)) {
        break;
      }

      const candidate = tryMergeListRun(blocks.slice(index, endIndex + 2) as ListBlock[], source);

      if (!candidate) {
        break;
      }

      mergedList = candidate;
      endIndex += 1;
    }

    mergedBlocks.push(mergedList);
    index = endIndex;
  }

  return mergedBlocks;
}

function tryMergeListRun(blocks: ListBlock[], source: string): ListBlock | null {
  const firstBlock = blocks[0];
  const lastBlock = blocks.at(-1);

  if (!firstBlock || !lastBlock) {
    return null;
  }

  try {
    const scopes = parseListScopes(
      source.slice(firstBlock.startOffset, lastBlock.endOffset),
      firstBlock.startOffset,
      firstBlock.startLine
    );

    if (scopes === null || scopes.length !== 1) {
      return null;
    }

    return materializeListScope(
      scopes[0]!,
      createBlockFromRange("list", firstBlock.startOffset, lastBlock.endOffset, firstBlock.startLine, lastBlock.endLine)
    );
  } catch {
    return null;
  }
}

function parseListMarker(marker: string):
  | { ordered: false }
  | { ordered: true; startOrdinal: number; delimiter: OrderedListDelimiter } {
  const orderedMatch = /^(\d+)([.)])$/.exec(marker);

  if (!orderedMatch) {
    return { ordered: false };
  }

  return {
    ordered: true,
    startOrdinal: Number.parseInt(orderedMatch[1] ?? "1", 10),
    delimiter: (orderedMatch[2] ?? ".") as OrderedListDelimiter
  };
}

function createDraftListScope(
  metadata: ReturnType<typeof parseListMarker>,
  indent: number,
  firstItem: DraftListItem
): DraftListScope {
  if (!metadata.ordered) {
    return {
      ordered: false,
      indent,
      items: [firstItem]
    };
  }

  return {
    ordered: true,
    indent,
    startOrdinal: metadata.startOrdinal,
    delimiter: metadata.delimiter,
    items: [firstItem]
  };
}

function canStartNewRootScope(previousScope: DraftListScope | null, indent: number): boolean {
  if (!previousScope) {
    return true;
  }

  return previousScope.indent === indent;
}

function appendDraftItemToNestedScope(
  parent: DraftListItem,
  item: DraftListItem,
  metadata: ReturnType<typeof parseListMarker>,
  indent: number
): void {
  const currentScope = parent.children.at(-1);

  if (currentScope && draftListScopeMatches(currentScope, metadata, indent)) {
    currentScope.items.push(item);
    return;
  }

  parent.children.push(createDraftListScope(metadata, indent, item));
}

function draftListScopeMatches(
  scope: DraftListScope,
  metadata: ReturnType<typeof parseListMarker>,
  indent: number
): boolean {
  if (scope.indent !== indent || scope.ordered !== metadata.ordered) {
    return false;
  }

  if (!scope.ordered || !metadata.ordered) {
    return true;
  }

  return scope.delimiter === metadata.delimiter;
}

function materializeListScope(
  scope: DraftListScope,
  base?: Pick<ListBlock, "id" | "type" | "startOffset" | "endOffset" | "startLine" | "endLine">
): ListBlock {
  const firstItem = scope.items[0];
  const lastItem = scope.items.at(-1);

  if (!firstItem || !lastItem) {
    throw new Error("Cannot materialize an empty list scope.");
  }

  const range =
    base ??
    createBlockFromRange("list", firstItem.startOffset, lastItem.endOffset, firstItem.startLine, lastItem.endLine);
  const items = scope.items.map((item) => materializeListItem(item));

  if (!scope.ordered) {
    return {
      ...range,
      ordered: false,
      items
    };
  }

  return {
    ...range,
    ordered: true,
    startOrdinal: scope.startOrdinal,
    delimiter: scope.delimiter,
    items
  };
}

function materializeListItem(item: DraftListItem): ListItemBlock {
  return {
    id: `list-item:${item.startOffset}-${item.endOffset}`,
    startOffset: item.startOffset,
    endOffset: item.endOffset,
    startLine: item.startLine,
    endLine: item.endLine,
    indent: item.indent,
    marker: item.marker,
    markerStart: item.markerStart,
    markerEnd: item.markerEnd,
    task: item.task,
    children: item.children.map((scope) => materializeListScope(scope))
  };
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
