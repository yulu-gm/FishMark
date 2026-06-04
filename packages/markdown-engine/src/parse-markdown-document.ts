import { parse, postprocess, preprocess } from "micromark";

import type {
  BlockMathBlock,
  BlockquoteBlock,
  HeadingBlock,
  InlineLine,
  ListBlock,
  ListItemBlock,
  MarkdownBlock
} from "./block-map";
import { parseBlockquoteLinePrefix } from "./blockquote";
import type { InlineReferenceDefinition } from "./inline-ast";
import type {
  FootnoteDefinition,
  FootnoteDefinitionBlockData,
  FootnoteDefinitionContentLine,
  FootnoteDefinitionStatus
} from "./inline-ast";
import type { MarkdownDocument } from "./markdown-document";
import { parseBlockMap, parseTopLevelBlocks } from "./parse-block-map";
import { normalizeReferenceIdentifier, parseInlineAst } from "./parse-inline-ast";

export function parseMarkdownDocument(source: string): MarkdownDocument {
  const referenceDefinitions = collectReferenceDefinitions(source);
  const blockMap = parseBlockMap(source);
  const footnoteDefinitionData = collectFootnoteDefinitionData(source, blockMap.blocks);
  const footnoteDefinitions = enrichFootnoteDefinitions(
    footnoteDefinitionData.definitions,
    source,
    referenceDefinitions
  );
  const blocks = attachFootnoteDefinitionBlocks(
    blockMap.blocks,
    footnoteDefinitionData.candidates,
    footnoteDefinitions,
    source
  );

  return {
    blocks: blocks.map((block) => attachInlineData(block, source, referenceDefinitions, footnoteDefinitions)),
    referenceDefinitions,
    footnoteDefinitions
  };
}

export function collectReferenceDefinitions(source: string): Map<string, InlineReferenceDefinition> {
  const definitions = new Map<string, InlineReferenceDefinition>();
  let current: {
    destinationEndOffset: number | null;
    destinationStartOffset: number | null;
    href: string | null;
    isFootnote: boolean;
    label: string | null;
    title: string | null;
    titleEndOffset: number | null;
    titleStartOffset: number | null;
  } | null = null;

  for (const [phase, token] of postprocess(parse().document().write(preprocess()(source, "utf8", true)))) {
    const tokenType = token.type as string;

    if (phase === "enter") {
      if (tokenType === "definition") {
        current = {
          destinationEndOffset: null,
          destinationStartOffset: null,
          href: null,
          isFootnote: false,
          label: null,
          title: null,
          titleEndOffset: null,
          titleStartOffset: null
        };
        continue;
      }

      if (!current) {
        continue;
      }

      if (tokenType === "definitionLabelString") {
        const label = source.slice(token.start.offset, token.end.offset);
        current.isFootnote = isFootnoteDefinitionLabel(label);
        current.label = current.isFootnote ? null : normalizeReferenceIdentifier(label);
        continue;
      }

      if (tokenType === "definitionDestinationString") {
        current.href = source.slice(token.start.offset, token.end.offset);
        current.destinationStartOffset = token.start.offset;
        current.destinationEndOffset = token.end.offset;
        continue;
      }

      if (tokenType === "definitionTitleString") {
        current.title = source.slice(token.start.offset, token.end.offset);
        current.titleStartOffset = token.start.offset;
        current.titleEndOffset = token.end.offset;
      }

      continue;
    }

    if (tokenType !== "definition" || !current) {
      continue;
    }

    if (
      current.label &&
      !current.isFootnote &&
      current.href !== null &&
      current.destinationStartOffset !== null &&
      current.destinationEndOffset !== null &&
      !definitions.has(current.label)
    ) {
      definitions.set(current.label, {
        href: current.href,
        title: current.title,
        destinationStartOffset: current.destinationStartOffset,
        destinationEndOffset: current.destinationEndOffset,
        titleStartOffset: current.titleStartOffset,
        titleEndOffset: current.titleEndOffset
      });
    }

    current = null;
  }

  return definitions;
}

type FootnoteDefinitionCandidate = FootnoteDefinition & {
  status: FootnoteDefinitionStatus;
};

type FootnoteDefinitionData = {
  candidates: FootnoteDefinitionCandidate[];
  definitions: Map<string, FootnoteDefinition>;
};

export function collectFootnoteDefinitions(source: string): Map<string, FootnoteDefinition> {
  return collectFootnoteDefinitionData(source, parseBlockMap(source).blocks).definitions;
}

function collectFootnoteDefinitionData(
  source: string,
  blocks: readonly MarkdownBlock[]
): FootnoteDefinitionData {
  const candidates = filterAttachableFootnoteDefinitionCandidates(
    scanFootnoteDefinitionCandidates(source),
    blocks
  );
  const validCandidatesByIdentifier = new Map<string, FootnoteDefinitionCandidate[]>();

  for (const candidate of candidates) {
    if (candidate.status !== "valid") {
      continue;
    }

    const existing = validCandidatesByIdentifier.get(candidate.identifier) ?? [];
    existing.push(candidate);
    validCandidatesByIdentifier.set(candidate.identifier, existing);
  }

  const definitions = new Map<string, FootnoteDefinition>();

  for (const [identifier, entries] of validCandidatesByIdentifier) {
    if (entries.length === 1) {
      const definition = entries[0]!;
      definitions.set(identifier, cloneFootnoteDefinition(definition));
      continue;
    }

    for (const entry of entries) {
      entry.status = "duplicate";
    }
  }

  return { candidates, definitions };
}

function scanFootnoteDefinitionCandidates(source: string): FootnoteDefinitionCandidate[] {
  const candidates: FootnoteDefinitionCandidate[] = [];
  const lines = createLineInfos(source, 0, 1);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const match = /^([ \t]{0,3})\[\^([^\]\r\n]*)\]:[ \t]*/u.exec(line.text);

    if (!match) {
      continue;
    }

    const indent = match[1] ?? "";
    const label = match[2] ?? "";
    const identifier = normalizeReferenceIdentifier(label);
    const labelStartOffset = line.startOffset + indent.length + 2;
    const labelEndOffset = labelStartOffset + label.length;
    const markerStartOffset = line.startOffset + indent.length;
    const markerEndOffset = markerStartOffset + "[^".length + label.length + "]:".length;
    const firstContentStartOffset = line.startOffset + match[0].length;
    const contentLines: FootnoteDefinitionContentLine[] = [];
    let endOffset = line.endOffset;
    let endLine = line.lineNumber;

    appendFootnoteContentLine(
      contentLines,
      line.startOffset,
      line.endOffset,
      firstContentStartOffset,
      trimTrailingCarriageReturn(source, line.startOffset, line.endOffset)
    );

    let continuationIndex = index + 1;
    while (continuationIndex < lines.length) {
      const continuation = lines[continuationIndex]!;
      const continuationContentStart = getFootnoteContinuationContentStart(continuation.text);

      if (continuationContentStart === null) {
        break;
      }

      const contentStartOffset = continuation.startOffset + continuationContentStart;
      const contentEndOffset = trimTrailingCarriageReturn(
        source,
        continuation.startOffset,
        continuation.endOffset
      );

      appendFootnoteContentLine(
        contentLines,
        continuation.startOffset,
        continuation.endOffset,
        contentStartOffset,
        contentEndOffset
      );
      endOffset = continuation.endOffset;
      endLine = continuation.lineNumber;
      continuationIndex += 1;
    }

    const contentStartOffset = contentLines[0]?.contentStartOffset ?? firstContentStartOffset;
    const contentEndOffset = contentLines.at(-1)?.contentEndOffset ?? firstContentStartOffset;
    const hasContent = contentLines.some((entry) => entry.contentEndOffset > entry.contentStartOffset);
    const status: FootnoteDefinitionStatus = identifier.length > 0 && hasContent ? "valid" : "malformed";

    candidates.push({
      identifier,
      label,
      status,
      startOffset: line.startOffset,
      endOffset,
      startLine: line.lineNumber,
      endLine,
      labelStartOffset,
      labelEndOffset,
      markerStartOffset,
      markerEndOffset,
      contentStartOffset,
      contentEndOffset,
      lines: contentLines
    });

    index = Math.max(index, continuationIndex - 1);
  }

  return candidates;
}

function appendFootnoteContentLine(
  lines: FootnoteDefinitionContentLine[],
  startOffset: number,
  endOffset: number,
  contentStartOffset: number,
  contentEndOffset: number
): void {
  if (contentEndOffset < contentStartOffset) {
    return;
  }

  lines.push({
    startOffset,
    endOffset,
    contentStartOffset,
    contentEndOffset
  });
}

function getFootnoteContinuationContentStart(lineText: string): number | null {
  if (lineText.length === 0 || lineText.trim().length === 0) {
    return null;
  }

  if (lineText.startsWith("\t")) {
    return 1;
  }

  const spaces = /^ {4,}/u.exec(lineText)?.[0].length ?? 0;
  return spaces >= 4 ? 4 : null;
}

function cloneFootnoteDefinition(definition: FootnoteDefinition): FootnoteDefinition {
  return {
    identifier: definition.identifier,
    label: definition.label,
    startOffset: definition.startOffset,
    endOffset: definition.endOffset,
    startLine: definition.startLine,
    endLine: definition.endLine,
    labelStartOffset: definition.labelStartOffset,
    labelEndOffset: definition.labelEndOffset,
    markerStartOffset: definition.markerStartOffset,
    markerEndOffset: definition.markerEndOffset,
    contentStartOffset: definition.contentStartOffset,
    contentEndOffset: definition.contentEndOffset,
    lines: definition.lines.map((line) => ({ ...line }))
  };
}

function enrichFootnoteDefinitions(
  definitions: ReadonlyMap<string, FootnoteDefinition>,
  source: string,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>
): Map<string, FootnoteDefinition> {
  const enriched = new Map<string, FootnoteDefinition>();

  for (const [identifier, definition] of definitions) {
    enriched.set(identifier, enrichFootnoteDefinition(definition, source, referenceDefinitions, definitions));
  }

  return enriched;
}

function enrichFootnoteDefinition(
  definition: FootnoteDefinition,
  source: string,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>
): FootnoteDefinition {
  return {
    ...definition,
    lines: definition.lines.map((line) => ({
      ...line,
      inline: parseInlineAst(source, line.contentStartOffset, line.contentEndOffset, {
        referenceDefinitions,
        footnoteDefinitions
      })
    }))
  };
}

function attachFootnoteDefinitionBlocks(
  blocks: MarkdownBlock[],
  candidates: readonly FootnoteDefinitionCandidate[],
  definitions: ReadonlyMap<string, FootnoteDefinition>,
  source: string
): MarkdownBlock[] {
  const sortedCandidates = [...candidates].sort((left, right) => left.startOffset - right.startOffset);
  const nextBlocks: MarkdownBlock[] = [];
  let candidateIndex = 0;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const blockCandidates: FootnoteDefinitionCandidate[] = [];

    while (
      candidateIndex < sortedCandidates.length &&
      sortedCandidates[candidateIndex]!.endOffset <= block.startOffset
    ) {
      candidateIndex += 1;
    }

    let lookaheadIndex = candidateIndex;
    while (
      lookaheadIndex < sortedCandidates.length &&
      sortedCandidates[lookaheadIndex]!.startOffset < block.endOffset
    ) {
      const candidate = sortedCandidates[lookaheadIndex]!;

      if (canAttachFootnoteDefinitionCandidate(block, candidate)) {
        blockCandidates.push(candidate);
      }

      lookaheadIndex += 1;
    }

    if (blockCandidates.length === 0) {
      nextBlocks.push(block);
      continue;
    }

    let segmentStartOffset = block.startOffset;

    for (const candidate of blockCandidates) {
      appendParagraphSegmentIfPresent(nextBlocks, source, segmentStartOffset, candidate.startOffset, block.startLine);
      nextBlocks.push(createFootnoteDefinitionBlock(candidate, definitions));
      segmentStartOffset = Math.max(segmentStartOffset, candidate.endOffset);
    }

    appendParagraphSegmentIfPresent(nextBlocks, source, segmentStartOffset, block.endOffset, block.startLine);
  }

  return nextBlocks;
}

function filterAttachableFootnoteDefinitionCandidates(
  candidates: readonly FootnoteDefinitionCandidate[],
  blocks: readonly MarkdownBlock[]
): FootnoteDefinitionCandidate[] {
  return candidates.filter((candidate) =>
    blocks.some((block) => canAttachFootnoteDefinitionCandidate(block, candidate))
  );
}

function canAttachFootnoteDefinitionCandidate(
  block: MarkdownBlock,
  candidate: FootnoteDefinitionCandidate
): boolean {
  return (
    (block.type === "paragraph" || block.type === "definition") &&
    candidate.startOffset >= block.startOffset &&
    candidate.endOffset <= block.endOffset
  );
}

function createFootnoteDefinitionBlock(
  candidate: FootnoteDefinitionCandidate,
  definitions: ReadonlyMap<string, FootnoteDefinition>
): MarkdownBlock {
  const footnoteDefinition = createFootnoteDefinitionBlockData(candidate, definitions);

  return {
    id: `definition:${candidate.startOffset}-${candidate.endOffset}`,
    type: "definition",
    startOffset: candidate.startOffset,
    endOffset: candidate.endOffset,
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    footnoteDefinition
  };
}

function appendParagraphSegmentIfPresent(
  blocks: MarkdownBlock[],
  source: string,
  startOffset: number,
  endOffset: number,
  fallbackStartLine: number
): void {
  const contentStartOffset = skipLineBreaks(source, startOffset, endOffset);
  const contentEndOffset = trimOuterWhitespace(source, contentStartOffset, endOffset);

  if (contentEndOffset <= contentStartOffset) {
    return;
  }

  const startLine = resolveLineNumberAtOffset(source, contentStartOffset, fallbackStartLine);
  const endLine = resolveLineNumberAtOffset(source, contentEndOffset, startLine);

  blocks.push({
    id: `paragraph:${contentStartOffset}-${contentEndOffset}`,
    type: "paragraph",
    startOffset: contentStartOffset,
    endOffset: contentEndOffset,
    startLine,
    endLine
  });
}

function skipLineBreaks(source: string, startOffset: number, endOffset: number): number {
  let cursor = startOffset;

  while (cursor < endOffset && (source[cursor] === "\r" || source[cursor] === "\n")) {
    cursor += 1;
  }

  return cursor;
}

function trimOuterWhitespace(source: string, startOffset: number, endOffset: number): number {
  let cursor = endOffset;

  while (cursor > startOffset) {
    const character = source[cursor - 1];

    if (character !== " " && character !== "\t" && character !== "\r" && character !== "\n") {
      break;
    }

    cursor -= 1;
  }

  return cursor;
}

function resolveLineNumberAtOffset(source: string, offset: number, fallbackLine: number): number {
  if (offset <= 0) {
    return 1;
  }

  let line = 1;
  let cursor = 0;

  while (cursor < offset && cursor < source.length) {
    if (source[cursor] === "\n") {
      line += 1;
    }

    cursor += 1;
  }

  return line || fallbackLine;
}

function createFootnoteDefinitionBlockData(
  candidate: FootnoteDefinitionCandidate,
  definitions: ReadonlyMap<string, FootnoteDefinition>
): FootnoteDefinitionBlockData {
  const definition = candidate.status === "valid"
    ? definitions.get(candidate.identifier) ?? candidate
    : candidate;

  return {
    ...definition,
    status: candidate.status
  };
}

function isFootnoteDefinitionLabel(label: string): boolean {
  return label.startsWith("^");
}

function attachInlineData(
  block: MarkdownBlock,
  source: string,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>
): MarkdownBlock {
  if (block.type === "heading") {
    const contentRange = getHeadingContentRange(block, source);
    return {
      ...block,
      markerEnd: contentRange.markerEnd,
      inline: parseInlineAst(source, contentRange.contentStartOffset, contentRange.contentEndOffset, {
        referenceDefinitions,
        footnoteDefinitions
      })
    };
  }

  if (block.type === "paragraph") {
    const contentEndOffset = trimTrailingCarriageReturn(source, block.startOffset, block.endOffset);
    return {
      ...block,
      inline: parseInlineAst(source, block.startOffset, contentEndOffset, { referenceDefinitions, footnoteDefinitions })
    };
  }

  if (block.type === "list") {
    return enrichListBlock(block, source, referenceDefinitions, footnoteDefinitions);
  }

  if (block.type === "blockquote") {
    const lines = createBlockquoteLines(block, source, referenceDefinitions, footnoteDefinitions);
    return {
      ...block,
      lines,
      innerBlocks: createBlockquoteInnerBlocks(source, lines, referenceDefinitions, footnoteDefinitions)
    };
  }

  if (block.type === "table") {
    return block;
  }

  return block;
}

function enrichListBlock(
  block: ListBlock,
  source: string,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>
): ListBlock {
  return {
    ...block,
    items: block.items.map((item) => enrichListItem(item, source, referenceDefinitions, footnoteDefinitions))
  };
}

type HeadingContentRange = {
  markerEnd: number;
  contentStartOffset: number;
  contentEndOffset: number;
};

function getHeadingContentRange(heading: HeadingBlock, source: string): HeadingContentRange {
  const lineEndOffset = findLineEndOffset(source, heading.startOffset, heading.endOffset);
  const contentLineEndOffset = trimTrailingCarriageReturn(source, heading.startOffset, lineEndOffset);
  const lineText = source.slice(heading.startOffset, contentLineEndOffset);
  const atxMatch = /^([ \t]{0,3})(#{1,6})(?:([ \t]+)|$)/.exec(lineText);

  if (!atxMatch) {
    return {
      markerEnd: heading.startOffset,
      contentStartOffset: heading.startOffset,
      contentEndOffset: contentLineEndOffset
    };
  }

  const markerEnd = heading.startOffset + atxMatch[0].length;
  let contentEndOffset = contentLineEndOffset;
  const remainder = source.slice(markerEnd, contentLineEndOffset);
  const closingMatch = /(?:[ \t]+#+[ \t]*)$/.exec(remainder);

  if (closingMatch) {
    contentEndOffset = contentLineEndOffset - closingMatch[0].length;
  }

  return {
    markerEnd,
    contentStartOffset: markerEnd,
    contentEndOffset: Math.max(markerEnd, contentEndOffset)
  };
}

function enrichListItem(
  item: ListItemBlock,
  source: string,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>
): ListItemBlock {
  const contentRange = getListItemContentRange(item, source);
  return {
    ...item,
    contentStartOffset: contentRange.contentStartOffset,
    contentEndOffset: contentRange.contentEndOffset,
    inline: parseInlineAst(source, contentRange.contentStartOffset, contentRange.contentEndOffset, {
      referenceDefinitions,
      footnoteDefinitions
    }),
    children: item.children.map((child) => enrichListBlock(child, source, referenceDefinitions, footnoteDefinitions))
  };
}

type ListItemContentRange = {
  contentStartOffset: number;
  contentEndOffset: number;
};

function getListItemContentRange(item: ListItemBlock, source: string): ListItemContentRange {
  const firstChildStartOffset = item.children[0]?.startOffset ?? item.endOffset;
  const contentUpperBound = Math.min(firstChildStartOffset, item.endOffset);
  const firstLineEndOffset = findLineEndOffset(source, item.startOffset, contentUpperBound);
  const firstLineContentEndOffset = trimTrailingCarriageReturn(source, item.startOffset, firstLineEndOffset);

  let contentStartOffset = item.markerEnd;
  contentStartOffset = consumeHorizontalSpace(source, contentStartOffset, firstLineContentEndOffset);

  if (item.task && item.task.markerStart === contentStartOffset) {
    contentStartOffset = item.task.markerEnd;
    contentStartOffset = consumeHorizontalSpace(source, contentStartOffset, firstLineContentEndOffset);
  }

  const boundedContentStartOffset = Math.min(contentStartOffset, contentUpperBound);
  const contentEndOffset = trimTrailingListItemContent(source, boundedContentStartOffset, contentUpperBound);

  return {
    contentStartOffset: boundedContentStartOffset,
    contentEndOffset
  };
}

function trimTrailingListItemContent(source: string, startOffset: number, endOffset: number): number {
  let cursor = trimTrailingCarriageReturn(source, startOffset, endOffset);

  while (cursor > startOffset) {
    const character = source[cursor - 1];

    if (character !== " " && character !== "\t" && character !== "\r" && character !== "\n") {
      break;
    }

    cursor -= 1;
  }

  return cursor;
}

function createBlockquoteLines(
  blockquote: BlockquoteBlock,
  source: string,
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>
): InlineLine[] {
  const lines = createLineInfos(
    source.slice(blockquote.startOffset, blockquote.endOffset),
    blockquote.startOffset,
    blockquote.startLine
  );

  return lines.map((line) => {
    const contentLineEndOffset = trimTrailingCarriageReturn(source, line.startOffset, line.endOffset);
    const prefix = parseBlockquoteLinePrefix(source, line.startOffset, contentLineEndOffset);
    return {
      text: source.slice(line.startOffset, contentLineEndOffset),
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      lineNumber: line.lineNumber,
      quoteDepth: prefix.markers.length,
      markers: prefix.markers,
      markerEnd: prefix.markerEnd,
      sourcePrefixEndOffset: prefix.sourcePrefixEndOffset,
      contentStartOffset: prefix.contentStartOffset,
      contentEndOffset: contentLineEndOffset,
      inline: parseInlineAst(source, prefix.contentStartOffset, contentLineEndOffset, {
        referenceDefinitions,
        footnoteDefinitions
      })
    };
  });
}

function createBlockquoteInnerBlocks(
  source: string,
  lines: readonly InlineLine[],
  referenceDefinitions: ReadonlyMap<string, InlineReferenceDefinition>,
  footnoteDefinitions: ReadonlyMap<string, FootnoteDefinition>
): MarkdownBlock[] {
  if (lines.length === 0 || !lines.some((line) => line.quoteDepth > 0)) {
    return [];
  }

  const innerSource = createBlockquoteInnerSource(source, lines);
  return parseTopLevelBlocks(innerSource.source)
    .map((block) => normalizeBlockquoteInnerBlock(block, source, lines, innerSource))
    .map((block) => attachInlineData(block, source, referenceDefinitions, footnoteDefinitions));
}

type BlockquoteInnerSource = {
  boundaryMap: number[];
  source: string;
};

function createBlockquoteInnerSource(source: string, lines: readonly InlineLine[]): BlockquoteInnerSource {
  const parts: string[] = [];
  const boundaryMap: number[] = [];
  let virtualOffset = 0;

  for (const [index, line] of lines.entries()) {
    boundaryMap[virtualOffset] = line.contentStartOffset;

    for (let offset = line.contentStartOffset; offset < line.contentEndOffset; offset += 1) {
      parts.push(source[offset] ?? " ");
      virtualOffset += 1;
      boundaryMap[virtualOffset] = offset + 1;
    }

    if (index < lines.length - 1) {
      parts.push("\n");
      virtualOffset += 1;
      boundaryMap[virtualOffset] = getLineBreakEndOffset(source, line.endOffset);
    }
  }

  return {
    boundaryMap,
    source: parts.join("")
  };
}

function normalizeBlockquoteInnerBlock(
  block: MarkdownBlock,
  source: string,
  lines: readonly InlineLine[],
  innerSource: BlockquoteInnerSource
): MarkdownBlock {
  if (block.type === "paragraph") {
    return normalizeBlockquoteInnerParagraph(block, source, lines, innerSource);
  }

  if (block.type === "list") {
    return normalizeBlockquoteInnerList(block, lines, innerSource);
  }

  if (block.type === "blockMath") {
    return normalizeBlockquoteInnerBlockMath(block, source, lines, innerSource);
  }

  if (block.type === "codeFence" || block.type === "thematicBreak" || block.type === "table") {
    return normalizeBlockquoteInnerBlockLineRange(block, lines, innerSource);
  }

  return block;
}

function normalizeBlockquoteInnerParagraph(
  block: Extract<MarkdownBlock, { type: "paragraph" }>,
  source: string,
  lines: readonly InlineLine[],
  innerSource: BlockquoteInnerSource
): Extract<MarkdownBlock, { type: "paragraph" }> {
  const mappedStartOffset = mapBlockquoteInnerOffset(innerSource, block.startOffset);
  const mappedEndOffset = mapBlockquoteInnerOffset(innerSource, block.endOffset);
  const range = getBlockquoteInnerContentRange(mappedStartOffset, mappedEndOffset, source, lines);
  return {
    ...block,
    id: `paragraph:${range.startOffset}-${range.endOffset}`,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    startLine: resolveLineNumberAtOffset(source, range.startOffset, block.startLine),
    endLine: resolveLineNumberAtOffset(source, range.endOffset, block.endLine)
  };
}

function normalizeBlockquoteInnerList(
  block: ListBlock,
  lines: readonly InlineLine[],
  innerSource: BlockquoteInnerSource
): ListBlock {
  const normalizedRange = getBlockquoteLineRange(
    mapBlockquoteInnerOffset(innerSource, block.startOffset),
    mapBlockquoteInnerOffset(innerSource, block.endOffset),
    lines
  );
  const items = block.items.map((item) => normalizeBlockquoteInnerListItem(item, lines, innerSource));
  const base = {
    ...block,
    id: `list:${normalizedRange.startOffset}-${normalizedRange.endOffset}`,
    startOffset: normalizedRange.startOffset,
    endOffset: normalizedRange.endOffset,
    startLine: normalizedRange.startLine,
    endLine: normalizedRange.endLine,
    items
  };

  const normalizedBlock: ListBlock = block.ordered
    ? {
        ...base,
        ordered: true,
        startOrdinal: block.startOrdinal,
        delimiter: block.delimiter
      }
    : {
        ...base,
        ordered: false
      };

  return promoteBlockquotePrefixNestedListItems(normalizedBlock, lines);
}

function normalizeBlockquoteInnerListItem(
  item: ListItemBlock,
  lines: readonly InlineLine[],
  innerSource: BlockquoteInnerSource
): ListItemBlock {
  const normalizedRange = getBlockquoteLineRange(
    mapBlockquoteInnerOffset(innerSource, item.startOffset),
    mapBlockquoteInnerOffset(innerSource, item.endOffset),
    lines
  );
  const markerStart = mapBlockquoteInnerOffset(innerSource, item.markerStart);
  const markerEnd = mapBlockquoteInnerOffset(innerSource, item.markerEnd);
  const task = item.task
    ? {
        ...item.task,
        markerStart: mapBlockquoteInnerOffset(innerSource, item.task.markerStart),
        markerEnd: mapBlockquoteInnerOffset(innerSource, item.task.markerEnd)
      }
    : null;

  return {
    ...item,
    id: `list-item:${normalizedRange.startOffset}-${normalizedRange.endOffset}`,
    startOffset: normalizedRange.startOffset,
    endOffset: normalizedRange.endOffset,
    startLine: normalizedRange.startLine,
    endLine: normalizedRange.endLine,
    markerStart,
    markerEnd,
    indent: item.indent,
    task,
    children: item.children.map((child) => normalizeBlockquoteInnerList(child, lines, innerSource))
  };
}

function promoteBlockquotePrefixNestedListItems(block: ListBlock, lines: readonly InlineLine[]): ListBlock {
  const items: ListItemBlock[] = [];

  for (const item of block.items) {
    const normalizedChildren = item.children.map((child) => promoteBlockquotePrefixNestedListItems(child, lines));
    const keptChildren: ListBlock[] = [];
    const promotedItems: ListItemBlock[] = [];
    let normalizedItem: ListItemBlock = {
      ...item,
      children: normalizedChildren
    };

    for (const child of normalizedChildren) {
      if (shouldPromoteBlockquotePrefixNestedListItems(block, normalizedItem, child)) {
        promotedItems.push(...child.items);
        continue;
      }

      keptChildren.push(child);
    }

    if (promotedItems.length > 0) {
      normalizedItem = truncateListItemBeforeOffset(
        {
          ...normalizedItem,
          children: keptChildren
        },
        promotedItems[0]!.startOffset,
        lines
      );
    } else {
      normalizedItem = {
        ...normalizedItem,
        children: keptChildren
      };
    }

    items.push(normalizedItem, ...promotedItems);
  }

  return block.ordered
    ? {
        ...block,
        ordered: true,
        items
      }
    : {
        ...block,
        ordered: false,
        items
      };
}

function shouldPromoteBlockquotePrefixNestedListItems(
  parentList: ListBlock,
  parentItem: ListItemBlock,
  childList: ListBlock
): boolean {
  return (
    listKindsMatch(parentList, childList) &&
    childList.items.length > 0 &&
    childList.items.every((childItem) => childItem.indent <= parentItem.indent)
  );
}

function listKindsMatch(left: ListBlock, right: ListBlock): boolean {
  if (left.ordered !== right.ordered) {
    return false;
  }

  if (!left.ordered || !right.ordered) {
    return true;
  }

  return left.delimiter === right.delimiter;
}

function truncateListItemBeforeOffset(
  item: ListItemBlock,
  nextItemStartOffset: number,
  lines: readonly InlineLine[]
): ListItemBlock {
  const previousLine = [...lines]
    .reverse()
    .find((line) => line.startOffset >= item.startOffset && line.endOffset < nextItemStartOffset);
  const endOffset = previousLine?.endOffset ?? Math.min(item.endOffset, nextItemStartOffset);
  const endLine = previousLine?.lineNumber ?? item.endLine;

  return {
    ...item,
    id: `list-item:${item.startOffset}-${endOffset}`,
    endOffset,
    endLine
  };
}

function normalizeBlockquoteInnerBlockMath(
  block: BlockMathBlock,
  source: string,
  lines: readonly InlineLine[],
  innerSource: BlockquoteInnerSource
): BlockMathBlock {
  const mappedContentStartOffset = mapBlockquoteInnerOffset(innerSource, block.contentStartOffset);
  const mappedContentEndOffset = mapBlockquoteInnerOffset(innerSource, block.contentEndOffset);
  const normalizedRange = getBlockquoteLineRange(
    mapBlockquoteInnerOffset(innerSource, block.startOffset),
    mapBlockquoteInnerOffset(innerSource, block.endOffset),
    lines
  );
  const contentRange = getBlockquoteInnerContentRange(
    mappedContentStartOffset,
    mappedContentEndOffset,
    source,
    lines
  );

  return {
    ...block,
    id: `blockMath:${normalizedRange.startOffset}-${normalizedRange.endOffset}`,
    startOffset: normalizedRange.startOffset,
    endOffset: normalizedRange.endOffset,
    startLine: normalizedRange.startLine,
    endLine: normalizedRange.endLine,
    markerStartOffset: mapBlockquoteInnerOffset(innerSource, block.markerStartOffset),
    markerEndOffset: mapBlockquoteInnerOffset(innerSource, block.markerEndOffset),
    closingMarkerStartOffset: block.closingMarkerStartOffset === null
      ? null
      : mapBlockquoteInnerOffset(innerSource, block.closingMarkerStartOffset),
    closingMarkerEndOffset: block.closingMarkerEndOffset === null
      ? null
      : mapBlockquoteInnerOffset(innerSource, block.closingMarkerEndOffset),
    contentStartOffset: contentRange.startOffset,
    contentEndOffset: contentRange.endOffset,
    value: block.value
  };
}

function normalizeBlockquoteInnerBlockLineRange<TBlock extends MarkdownBlock>(
  block: TBlock,
  lines: readonly InlineLine[],
  innerSource: BlockquoteInnerSource
): TBlock {
  const range = getBlockquoteLineRange(
    mapBlockquoteInnerOffset(innerSource, block.startOffset),
    mapBlockquoteInnerOffset(innerSource, block.endOffset),
    lines
  );
  return {
    ...block,
    id: `${block.type}:${range.startOffset}-${range.endOffset}`,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    startLine: range.startLine,
    endLine: range.endLine
  };
}

function getBlockquoteLineRange(
  startOffset: number,
  endOffset: number,
  lines: readonly InlineLine[]
): { startOffset: number; endOffset: number; startLine: number; endLine: number } {
  const startLine = findBlockquoteLineForOffset(startOffset, lines);
  const endLine = findBlockquoteLineForOffset(Math.max(startOffset, endOffset - 1), lines) ?? startLine;

  return {
    startOffset: startLine?.startOffset ?? startOffset,
    endOffset: endLine?.endOffset ?? endOffset,
    startLine: startLine?.lineNumber ?? 1,
    endLine: endLine?.lineNumber ?? startLine?.lineNumber ?? 1
  };
}

function mapBlockquoteInnerOffset(innerSource: BlockquoteInnerSource, offset: number): number {
  if (innerSource.boundaryMap.length === 0) {
    return offset;
  }

  if (offset <= 0) {
    return innerSource.boundaryMap[0] ?? offset;
  }

  if (offset < innerSource.boundaryMap.length) {
    return innerSource.boundaryMap[offset] ?? innerSource.boundaryMap[offset - 1] ?? offset;
  }

  return innerSource.boundaryMap.at(-1) ?? offset;
}

function getLineBreakEndOffset(source: string, lineEndOffset: number): number {
  if (source[lineEndOffset] === "\r" && source[lineEndOffset + 1] === "\n") {
    return lineEndOffset + 2;
  }

  if (source[lineEndOffset] === "\n") {
    return lineEndOffset + 1;
  }

  if (source[lineEndOffset] === "\r") {
    return lineEndOffset + 1;
  }

  return lineEndOffset;
}

function getBlockquoteInnerContentRange(
  startOffset: number,
  endOffset: number,
  source: string,
  lines: readonly InlineLine[]
): { startOffset: number; endOffset: number } {
  let contentStartOffset: number | null = null;
  let contentEndOffset: number | null = null;

  for (const line of lines) {
    if (line.endOffset < startOffset || line.startOffset > endOffset) {
      continue;
    }

    const segmentStart = Math.max(startOffset, line.contentStartOffset);
    const segmentEnd = Math.min(endOffset, line.contentEndOffset);
    const trimmedSegmentEnd = trimOuterWhitespace(source, segmentStart, segmentEnd);

    if (trimmedSegmentEnd <= segmentStart) {
      continue;
    }

    if (contentStartOffset === null) {
      contentStartOffset = segmentStart;
    }
    contentEndOffset = trimmedSegmentEnd;
  }

  return {
    startOffset: contentStartOffset ?? startOffset,
    endOffset: contentEndOffset ?? endOffset
  };
}

function findBlockquoteLineForOffset(offset: number, lines: readonly InlineLine[]): InlineLine | null {
  return lines.find((line) => offset >= line.startOffset && offset <= line.endOffset) ?? null;
}

function consumeHorizontalSpace(source: string, offset: number, endOffset: number): number {
  let cursor = offset;
  while (cursor < endOffset) {
    const character = source[cursor];
    if (character !== " " && character !== "\t") {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function findLineEndOffset(source: string, lineStartOffset: number, upperBound: number): number {
  const lineBreakOffset = source.indexOf("\n", lineStartOffset);
  if (lineBreakOffset === -1 || lineBreakOffset > upperBound) {
    return upperBound;
  }
  return lineBreakOffset;
}

function trimTrailingCarriageReturn(source: string, startOffset: number, endOffset: number): number {
  if (endOffset > startOffset && source[endOffset - 1] === "\r") {
    return endOffset - 1;
  }
  return endOffset;
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
