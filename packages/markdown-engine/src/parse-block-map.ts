import { parse, postprocess, preprocess } from "micromark";
import { math } from "micromark-extension-math";
import type { Event, Token } from "micromark-util-types";

import type {
  BlockMap,
  BlockquoteBlock,
  ListBlock,
  ListItemBlock,
  MarkdownBlock,
  OrderedListDelimiter,
  ParagraphBlock
} from "./block-map";
import { parseBlockquoteLinePrefix } from "./blockquote";
import type { MarkdownParseInstrumentation, MarkdownParseOptions } from "./parse-instrumentation";
import { createBlockFromRange, createLeafBlocksForToken, createLineInfos, mergeLeafSiblingBlocks } from "./parse/leaf-blocks";

export function parseBlockMap(source: string, options: MarkdownParseOptions = {}): BlockMap {
  return {
    blocks: parseTopLevelBlocks(source, options)
  };
}

export function parseTopLevelBlocks(source: string, options: MarkdownParseOptions = {}): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let containerDepth = 0;

  for (const [kind, token] of parseEvents(source, options.instrumentation)) {
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
          blocks.push(createBlockquoteOrParagraphBlock(token, source));
        }

        containerDepth += 1;
        continue;
      }

      if (containerDepth > 0) {
        continue;
      }

      blocks.push(...createLeafBlocksForToken(token, source));
      continue;
    }

    if (token.type === "listOrdered" || token.type === "listUnordered" || token.type === "blockQuote") {
      containerDepth -= 1;
    }
  }

  return mergeLeafSiblingBlocks(mergeContiguousListBlocks(blocks, source), source);
}

function parseEvents(source: string, instrumentation?: MarkdownParseInstrumentation): Event[] {
  instrumentation?.onFullDocumentParse({ kind: "block-map", sourceLength: source.length });
  return postprocess(parse({ extensions: [math({ singleDollarTextMath: true })] }).document().write(preprocess()(source, "utf8", true)));
}

function createListBlocks(token: Token, ordered: boolean, source: string): Array<ListBlock | ParagraphBlock> {
  const base = createBlockFromRange("list", token.start.offset, token.end.offset, token.start.line, token.end.line);
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

function createBlockquoteOrParagraphBlock(token: Token, source: string): BlockquoteBlock | ParagraphBlock {
  const base = createBlockFromRange("blockquote", token.start.offset, token.end.offset, token.start.line, token.end.line);

  if (!hasCommittedBlockquoteMarker(source, base.startOffset, base.endOffset, base.startLine)) {
    return createBlockFromRange("paragraph", base.startOffset, base.endOffset, base.startLine, base.endLine);
  }

  return base;
}

function hasCommittedBlockquoteMarker(
  source: string,
  startOffset: number,
  endOffset: number,
  startLine: number
): boolean {
  return createLineInfos(source.slice(startOffset, endOffset), startOffset, startLine).some((line) => {
    const prefix = parseBlockquoteLinePrefix(source, line.startOffset, line.endOffset);
    return prefix.markers.length > 0;
  });
}

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
