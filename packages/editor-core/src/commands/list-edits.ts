import { parseBlockMap, type ListBlock, type ListItemBlock } from "@yulora/markdown-engine";

import type { SemanticContext } from "./semantic-context";

export type TextChange = {
  from: number;
  to: number;
  insert: string;
};

export type ListEdit = {
  changes: TextChange;
  selection: { anchor: number; head: number };
};

export type OrderedListNormalization = {
  source: string;
  changes: readonly TextChange[];
};

type OrderedListScope = Extract<ListBlock, { ordered: true }>;

type ListItemContext = {
  rootList: ListBlock;
  scope: ListBlock;
  parentScope: ListBlock | null;
  parentItem: ListItemBlock | null;
  item: ListItemBlock;
  itemIndex: number;
};

type OrderedListItemContext = ListItemContext & {
  scope: OrderedListScope;
};

export function computeInsertOrderedListItemBelow(ctx: SemanticContext): ListEdit | null {
  const current = findOrderedListItemContext(ctx);

  if (!current || ctx.selection.empty === false) {
    return null;
  }

  const insertAt = toBlockOffset(current.rootList, current.item.endOffset);
  const nextOrdinal = current.scope.startOrdinal + current.itemIndex + 1;
  const insert = `\n${" ".repeat(current.item.indent)}${nextOrdinal}${current.scope.delimiter} `;
  const blockSource = readBlockSource(ctx, current.rootList);
  const tentativeSource = replaceRange(blockSource, insertAt, insertAt, insert);
  const tentativeCursor = insertAt + insert.length;

  return finalizeListEdit(current.rootList, tentativeSource, tentativeCursor);
}

export function computeOrderedListEnter(
  ctx: SemanticContext,
  isCurrentLineEmpty: boolean
): ListEdit | null {
  const current = findOrderedListItemContext(ctx);

  if (!current || ctx.selection.empty === false) {
    return null;
  }

  if (!isCurrentLineEmpty) {
    return computeInsertOrderedListItemBelow(ctx);
  }

  if (current.item.children.length > 0 || current.item.endLine > current.item.startLine) {
    return computeInsertOrderedListItemBelow(ctx);
  }

  if (current.itemIndex < current.scope.items.length - 1) {
    const insertAt = toBlockOffset(current.rootList, current.item.endOffset);
    const nextOrdinal = current.scope.startOrdinal + current.itemIndex + 1;
    const insert = `\n${" ".repeat(current.item.indent)}${nextOrdinal}${current.scope.delimiter} `;
    const blockSource = readBlockSource(ctx, current.rootList);
    const tentativeSource = replaceRange(blockSource, insertAt, insertAt, insert);
    const tentativeCursor = insertAt + insert.length;

    return finalizeListEdit(current.rootList, tentativeSource, tentativeCursor);
  }

  const blockSource = readBlockSource(ctx, current.rootList);
  let deleteTo = current.item.endOffset;

  if (deleteTo < ctx.source.length && ctx.source[deleteTo] === "\n") {
    deleteTo += 1;
  }

  const tentativeSource = replaceRange(
    blockSource,
    toBlockOffset(current.rootList, current.item.startOffset),
    toBlockOffset(current.rootList, deleteTo),
    ""
  );

  return finalizeListEdit(current.rootList, tentativeSource, toBlockOffset(current.rootList, current.item.startOffset));
}

export function computeDeleteOrderedListRange(ctx: SemanticContext): ListEdit | null {
  if (ctx.selection.empty) {
    return null;
  }

  const rootList = readActiveListRoot(ctx);

  if (!rootList || !containsOrderedScope(rootList)) {
    return null;
  }

  const deleteFrom = Math.max(ctx.selection.from, rootList.startOffset);
  const deleteTo = Math.min(ctx.selection.to, rootList.endOffset);

  if (deleteFrom >= deleteTo) {
    return null;
  }

  const blockSource = readBlockSource(ctx, rootList);
  const tentativeSource = replaceRange(
    blockSource,
    toBlockOffset(rootList, deleteFrom),
    toBlockOffset(rootList, deleteTo),
    ""
  );

  return finalizeListEdit(rootList, tentativeSource, toBlockOffset(rootList, deleteFrom));
}

export function computeIndentListItem(ctx: SemanticContext): ListEdit | null {
  const current = findOrderedListItemContext(ctx);

  if (!current || ctx.selection.empty === false || current.itemIndex <= 0) {
    return null;
  }

  const subtree = readItemSubtreeSource(ctx, current.item);
  const indentedSubtree = subtree
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const blockSource = readBlockSource(ctx, current.rootList);
  const subtreeFrom = toBlockOffset(current.rootList, current.item.startOffset);
  const subtreeTo = toBlockOffset(current.rootList, current.item.endOffset);
  const tentativeSource = replaceRange(blockSource, subtreeFrom, subtreeTo, indentedSubtree);
  const cursor = ctx.selection.from + 2;

  return finalizeListEdit(current.rootList, tentativeSource, toBlockOffset(current.rootList, cursor));
}

export function computeOutdentListItem(ctx: SemanticContext): ListEdit | null {
  const current = findOrderedListItemContext(ctx);

  if (
    !current ||
    ctx.selection.empty === false ||
    current.parentItem === null ||
    current.item.indent < 2
  ) {
    return null;
  }

  const subtree = readItemSubtreeSource(ctx, current.item);
  const outdentedSubtree = subtree
    .split("\n")
    .map((line) => (line.startsWith("  ") ? line.slice(2) : line))
    .join("\n");
  const blockSource = readBlockSource(ctx, current.rootList);
  const subtreeFrom = toBlockOffset(current.rootList, current.item.startOffset);
  const subtreeTo = toBlockOffset(current.rootList, current.item.endOffset);
  const tentativeSource = replaceRange(blockSource, subtreeFrom, subtreeTo, outdentedSubtree);
  const cursor = Math.max(current.item.startOffset, ctx.selection.from - 2);

  return finalizeListEdit(current.rootList, tentativeSource, toBlockOffset(current.rootList, cursor));
}

export function computeMoveListItemDown(ctx: SemanticContext): ListEdit | null {
  const current = findOrderedListItemContext(ctx);

  if (!current) {
    return null;
  }

  const nextItem = current.scope.items[current.itemIndex + 1];

  if (!nextItem) {
    return null;
  }

  return computeSiblingSwapEdit(ctx, current.rootList, current.item, nextItem, "down");
}

export function computeMoveListItemUp(ctx: SemanticContext): ListEdit | null {
  const current = findOrderedListItemContext(ctx);

  if (!current || current.itemIndex === 0) {
    return null;
  }

  const previousItem = current.scope.items[current.itemIndex - 1];

  if (!previousItem) {
    return null;
  }

  return computeSiblingSwapEdit(ctx, current.rootList, previousItem, current.item, "up");
}

export function normalizeOrderedListScopes(ctx: SemanticContext): ListEdit | null {
  const rootList = readActiveListRoot(ctx);

  if (!rootList || !containsOrderedScope(rootList)) {
    return null;
  }

  const blockSource = readBlockSource(ctx, rootList);
  const normalization = normalizeOrderedListBlock(blockSource, rootList);

  if (normalization.changes.length === 0) {
    return null;
  }

  return {
    changes: {
      from: rootList.startOffset,
      to: rootList.endOffset,
      insert: normalization.source
    },
    selection: {
      anchor: mapBlockOffsetThroughChanges(
        toBlockOffset(rootList, ctx.selection.from),
        normalization.changes
      ) + rootList.startOffset,
      head: mapBlockOffsetThroughChanges(toBlockOffset(rootList, ctx.selection.to), normalization.changes) +
        rootList.startOffset
    }
  };
}

export function computeNormalizedOrderedListDocument(source: string): OrderedListNormalization | null {
  const document = parseBlockMap(source);
  const changes: TextChange[] = [];

  for (const block of document.blocks) {
    if (block.type !== "list" || !containsOrderedScope(block)) {
      continue;
    }

    const blockSource = source.slice(block.startOffset, block.endOffset);
    const normalization = normalizeOrderedListBlock(
      blockSource,
      block,
      getDocumentOrderedListStartOrdinal(document.blocks, block, source)
    );

    if (normalization.changes.length === 0) {
      continue;
    }

    changes.push({
      from: block.startOffset,
      to: block.endOffset,
      insert: normalization.source
    });
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    source: applyChangeSpecs(source, changes),
    changes
  };
}

export function mapTextOffsetThroughChanges(offset: number, changes: readonly TextChange[]): number {
  return mapBlockOffsetThroughChanges(offset, changes);
}

function computeSiblingSwapEdit(
  ctx: SemanticContext,
  rootList: ListBlock,
  firstItem: ListItemBlock,
  secondItem: ListItemBlock,
  direction: "up" | "down"
): ListEdit {
  const blockSource = readBlockSource(ctx, rootList);
  const swapFrom = toBlockOffset(rootList, firstItem.startOffset);
  const swapTo = toBlockOffset(rootList, secondItem.endOffset);
  const firstSource = readItemSubtreeSource(ctx, firstItem);
  const secondSource = readItemSubtreeSource(ctx, secondItem);
  const between = blockSource.slice(
    toBlockOffset(rootList, firstItem.endOffset),
    toBlockOffset(rootList, secondItem.startOffset)
  );
  const swapped = `${secondSource}${between}${firstSource}`;
  const tentativeSource = replaceRange(blockSource, swapFrom, swapTo, swapped);
  const currentItem = direction === "down" ? firstItem : secondItem;
  const currentSelectionOffset = ctx.selection.from - currentItem.startOffset;
  const currentStartInTentative =
    direction === "down" ? swapFrom + secondSource.length + between.length : swapFrom;
  const tentativeCursor = currentStartInTentative + currentSelectionOffset;

  return finalizeListEdit(rootList, tentativeSource, tentativeCursor);
}

function finalizeListEdit(
  rootList: ListBlock,
  tentativeSource: string,
  tentativeCursor: number
): ListEdit {
  const normalization = normalizeOrderedListBlock(tentativeSource);
  const selectionOffset = mapBlockOffsetThroughChanges(tentativeCursor, normalization.changes);

  return {
    changes: {
      from: rootList.startOffset,
      to: rootList.endOffset,
      insert: normalization.source
    },
    selection: {
      anchor: rootList.startOffset + selectionOffset,
      head: rootList.startOffset + selectionOffset
    }
  };
}

function normalizeOrderedListBlock(source: string, parsedList?: ListBlock, rootStartOrdinalOverride?: number): {
  source: string;
  changes: TextChange[];
} {
  const nextParsedList = parsedList ?? parseBlockMap(source).blocks[0];

  if (!nextParsedList || nextParsedList.type !== "list") {
    return { source, changes: [] };
  }

  const changes = collectOrderedListScopeChanges(
    nextParsedList,
    source,
    nextParsedList.startOffset,
    rootStartOrdinalOverride
  );

  if (changes.length === 0) {
    return { source, changes };
  }

  return {
    source: applyChangeSpecs(source, changes),
    changes
  };
}

function collectOrderedListScopeChanges(
  list: ListBlock,
  source: string,
  baseOffset = 0,
  rootStartOrdinalOverride?: number
): TextChange[] {
  const changes: TextChange[] = [];
  appendOrderedListScopeChanges(list, source, changes, baseOffset, rootStartOrdinalOverride);
  return changes;
}

function appendOrderedListScopeChanges(
  list: ListBlock,
  source: string,
  changes: TextChange[],
  baseOffset: number,
  startOrdinalOverride?: number
): void {
  if (list.ordered) {
    const nextStartOrdinal = startOrdinalOverride ?? list.startOrdinal;

    for (let index = 0; index < list.items.length; index += 1) {
      const item = list.items[index]!;
      const desiredMarker = `${nextStartOrdinal + index}${list.delimiter}`;
      const markerStart = item.markerStart - baseOffset;
      const markerEnd = item.markerEnd - baseOffset;
      const currentMarker = source.slice(markerStart, markerEnd);

      if (currentMarker !== desiredMarker) {
        changes.push({
          from: markerStart,
          to: markerEnd,
          insert: desiredMarker
        });
      }
    }
  }

  for (const item of list.items) {
    for (const child of item.children) {
      appendOrderedListScopeChanges(child, source, changes, baseOffset);
    }
  }
}

function getDocumentOrderedListStartOrdinal(
  blocks: ReturnType<typeof parseBlockMap>["blocks"],
  currentBlock: ListBlock,
  source: string
): number | undefined {
  if (!currentBlock.ordered) {
    return undefined;
  }

  const currentIndex = blocks.findIndex((block) => block === currentBlock);

  if (currentIndex <= 0) {
    return currentBlock.startOrdinal;
  }

  const previousBlock = blocks[currentIndex - 1];

  if (previousBlock?.type !== "list" || !previousBlock.ordered) {
    return 1;
  }

  const gapSource = source.slice(previousBlock.endOffset, currentBlock.startOffset);

  if (gapSource === "\n" && previousBlock.delimiter === currentBlock.delimiter) {
    return currentBlock.startOrdinal;
  }

  return 1;
}

function findOrderedListItemContext(ctx: SemanticContext): OrderedListItemContext | null {
  const rootList = readActiveListRoot(ctx);

  if (!rootList) {
    return null;
  }

  const context = findListItemContext(rootList, ctx.selection.from, rootList, null, null);

  if (!context || !context.scope.ordered) {
    return null;
  }

  return {
    ...context,
    scope: context.scope
  };
}

function findListItemContext(
  scope: ListBlock,
  offset: number,
  rootList: ListBlock,
  parentItem: ListItemBlock | null,
  parentScope: ListBlock | null
): ListItemContext | null {
  for (let index = 0; index < scope.items.length; index += 1) {
    const item = scope.items[index]!;

    for (const child of item.children) {
      if (offset >= child.startOffset && offset <= child.endOffset) {
        const nested = findListItemContext(child, offset, rootList, item, scope);

        if (nested) {
          return nested;
        }
      }
    }

    if (offset >= item.startOffset && offset <= item.endOffset) {
      return {
        rootList,
        scope,
        parentScope,
        parentItem,
        item,
        itemIndex: index
      };
    }
  }

  return null;
}

function readActiveListRoot(ctx: SemanticContext): ListBlock | null {
  const blocks = parseBlockMap(ctx.source).blocks;
  const selectionOffset = ctx.selection.from;
  const currentIndex = blocks.findIndex(
    (block) => block.type === "list" && selectionOffset >= block.startOffset && selectionOffset <= block.endOffset
  );

  if (currentIndex === -1) {
    return null;
  }

  let startOffset = blocks[currentIndex]!.startOffset;
  let endOffset = blocks[currentIndex]!.endOffset;
  let nextRoot = tryReadListRootFromRange(ctx.source, startOffset, endOffset);

  if (!nextRoot) {
    return null;
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    const gapSource = ctx.source.slice(block!.endOffset, startOffset);

    if (block?.type !== "list" || !/^\s*$/u.test(gapSource)) {
      break;
    }

    const candidate = tryReadListRootFromRange(ctx.source, block.startOffset, endOffset);

    if (!candidate) {
      break;
    }

    startOffset = block.startOffset;
    nextRoot = candidate;
  }

  for (let index = currentIndex + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    const gapSource = ctx.source.slice(endOffset, block!.startOffset);

    if (block?.type !== "list" || !/^\s*$/u.test(gapSource)) {
      break;
    }

    const candidate = tryReadListRootFromRange(ctx.source, startOffset, block.endOffset);

    if (!candidate) {
      break;
    }

    endOffset = block.endOffset;
    nextRoot = candidate;
  }

  return nextRoot;
}

function tryReadListRootFromRange(source: string, startOffset: number, endOffset: number): ListBlock | null {
  const candidateSource = source.slice(startOffset, endOffset);
  const parsed = parseBlockMap(candidateSource).blocks;
  const rootList = parsed.length === 1 && parsed[0]?.type === "list" ? parsed[0] : null;

  if (!rootList) {
    return null;
  }

  return offsetListBlock(rootList, startOffset);
}

function offsetListBlock(list: ListBlock, offset: number): ListBlock {
  const base = {
    ...list,
    startOffset: list.startOffset + offset,
    endOffset: list.endOffset + offset
  };
  const items = list.items.map((item) => offsetListItem(item, offset));

  if (!list.ordered) {
    return {
      ...base,
      items
    };
  }

  return {
    ...base,
    items
  };
}

function offsetListItem(item: ListItemBlock, offset: number): ListItemBlock {
  return {
    ...item,
    startOffset: item.startOffset + offset,
    endOffset: item.endOffset + offset,
    markerStart: item.markerStart + offset,
    markerEnd: item.markerEnd + offset,
    contentStartOffset:
      typeof item.contentStartOffset === "number" ? item.contentStartOffset + offset : item.contentStartOffset,
    contentEndOffset:
      typeof item.contentEndOffset === "number" ? item.contentEndOffset + offset : item.contentEndOffset,
    task: item.task
      ? {
          ...item.task,
          markerStart: item.task.markerStart + offset,
          markerEnd: item.task.markerEnd + offset
        }
      : null,
    children: item.children.map((child) => offsetListBlock(child, offset))
  };
}

function readBlockSource(ctx: SemanticContext, list: ListBlock): string {
  return ctx.source.slice(list.startOffset, list.endOffset);
}

function readItemSubtreeSource(ctx: SemanticContext, item: ListItemBlock): string {
  return ctx.source.slice(item.startOffset, item.endOffset);
}

function containsOrderedScope(list: ListBlock): boolean {
  if (list.ordered) {
    return true;
  }

  return list.items.some((item) => item.children.some((child) => containsOrderedScope(child)));
}

function replaceRange(source: string, from: number, to: number, insert: string): string {
  return `${source.slice(0, from)}${insert}${source.slice(to)}`;
}

function applyChangeSpecs(source: string, changes: readonly TextChange[]): string {
  const orderedChanges = [...changes].sort((left, right) => left.from - right.from);
  let cursor = 0;
  let result = "";

  for (const change of orderedChanges) {
    result += source.slice(cursor, change.from);
    result += change.insert.toString();
    cursor = change.to;
  }

  result += source.slice(cursor);

  return result;
}

function mapBlockOffsetThroughChanges(offset: number, changes: readonly TextChange[]): number {
  let mappedOffset = offset;

  for (const change of [...changes].sort((left, right) => left.from - right.from)) {
    if (mappedOffset <= change.from) {
      continue;
    }

    const deletedLength = change.to - change.from;
    const insertedLength = change.insert.toString().length;

    if (mappedOffset <= change.to) {
      mappedOffset = change.from + insertedLength;
      continue;
    }

    mappedOffset += insertedLength - deletedLength;
  }

  return mappedOffset;
}

function toBlockOffset(list: ListBlock, absoluteOffset: number): number {
  return absoluteOffset - list.startOffset;
}
