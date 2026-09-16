import { parse, postprocess, preprocess } from "micromark";

import type { FootnoteDefinition, FootnoteDefinitionBlockData, FootnoteDefinitionContentLine, FootnoteDefinitionStatus, InlineReferenceDefinition } from "../inline-ast";
import type { MarkdownBlock } from "../block-map";
import type { MarkdownParseOptions } from "../parse-instrumentation";
import { createLineInfos } from "./leaf-blocks";
import { trimTrailingCarriageReturn } from "./leaf-nodes";
import { normalizeReferenceIdentifier, parseInlineAst } from "../parse-inline-ast";

// Reference and footnote definition indexes are derived from the raw source and from the
// top-level leaf blocks of the recursive parse, so no consumer needs a second block scanner.
export function collectReferenceDefinitions(
  source: string,
  options: MarkdownParseOptions = {}
): Map<string, InlineReferenceDefinition> {
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

  options.instrumentation?.onFullDocumentParse({
    kind: "reference-definitions",
    sourceLength: source.length
  });
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

export type FootnoteDefinitionCandidate = FootnoteDefinition & {
  status: FootnoteDefinitionStatus;
};

type FootnoteDefinitionData = {
  candidates: FootnoteDefinitionCandidate[];
  definitions: Map<string, FootnoteDefinition>;
};

export function collectFootnoteDefinitionsFromBlocks(
  source: string,
  blocks: readonly MarkdownBlock[]
): Map<string, FootnoteDefinition> {
  return collectFootnoteDefinitionData(source, blocks).definitions;
}

export function collectFootnoteDefinitionData(
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

export function enrichFootnoteDefinitions(
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

export function attachFootnoteDefinitionBlocks(
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



