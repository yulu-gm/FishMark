import {
  parseMarkdownDocument,
  parseBlockMap,
  type BlockMap,
  type MarkdownBlock,
  type ListBlock,
  type ListItemBlock
} from "@fishmark/markdown-engine";

import type { SemanticContext } from "./semantic-context";
import { parseBlockquoteLine, parseListLine } from "./line-parsers";

export type TextChange = {
  from: number;
  to: number;
  insert: string;
};

export type ListEdit = {
  changes: TextChange;
  selection: { anchor: number; head: number };
  filter?: boolean;
  userEvent?: string;
};

export type OrderedListNormalization = {
  source: string;
  changes: readonly TextChange[];
};

export type ParseOrderedListNormalizationBlockMap = (source: string) => BlockMap;

export type OrderedListNormalizationChangedRange = {
  from: number;
  to: number;
};

export type OrderedListNormalizationOptions = {
  parseBlockMap?: ParseOrderedListNormalizationBlockMap;
  changedRanges?: readonly OrderedListNormalizationChangedRange[];
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

type BareListMarkerLine = {
  marker: string;
  indent: number;
  ordered: boolean;
  delimiter: "." | ")" | null;
};

export function computeInsertOrderedListItemBelow(ctx: SemanticContext): ListEdit | null {
  const current = findOrderedListItemContext(ctx);

  if (!current || ctx.selection.empty === false) {
    return null;
  }

  const insertAt = toBlockOffset(current.rootList, current.item.endOffset);
  const nextOrdinal = current.scope.startOrdinal + current.itemIndex + 1;
  const insert =
    `\n${readListItemMarkerPrefix(ctx, current.item)}${nextOrdinal}${current.scope.delimiter} `;
  const blockSource = readBlockSource(ctx, current.rootList);
  const tentativeSource = replaceRange(blockSource, insertAt, insertAt, insert);
  const tentativeCursor = insertAt + insert.length;

  return finalizeListEdit(current.rootList, blockSource, tentativeSource, tentativeCursor);
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

  const nestedExitEdit = computeExitEmptyNestedListItem(ctx);

  if (nestedExitEdit) {
    return nestedExitEdit;
  }

  if (current.itemIndex < current.scope.items.length - 1) {
    const insertAt = toBlockOffset(current.rootList, current.item.endOffset);
    const nextOrdinal = current.scope.startOrdinal + current.itemIndex + 1;
    const insert = `\n${" ".repeat(current.item.indent)}${nextOrdinal}${current.scope.delimiter} `;
    const blockSource = readBlockSource(ctx, current.rootList);
    const tentativeSource = replaceRange(blockSource, insertAt, insertAt, insert);
    const tentativeCursor = insertAt + insert.length;

    return finalizeListEdit(current.rootList, blockSource, tentativeSource, tentativeCursor);
  }

  const blockSource = readBlockSource(ctx, current.rootList);
  let deleteTo = current.item.endOffset;

  if (deleteTo < ctx.source.length && ctx.source[deleteTo] === "\n") {
    deleteTo += 1;
  }

  const replacement =
    current.parentItem === null && current.item.startOffset > current.rootList.startOffset ? "\n" : "";

  const tentativeSource = replaceRange(
    blockSource,
    toBlockOffset(current.rootList, current.item.startOffset),
    toBlockOffset(current.rootList, deleteTo),
    replacement
  );

  return finalizeListEdit(
    current.rootList,
    blockSource,
    tentativeSource,
    toBlockOffset(current.rootList, current.item.startOffset) + replacement.length,
    current.parentItem === null ? "input.list-exit" : undefined
  );
}

export function computeListItemEnter(
  ctx: SemanticContext,
  contentStartOffset?: number
): ListEdit | null {
  if (ctx.selection.empty === false) {
    return null;
  }

  const bareMarkerEdit = computeBareEmptyListItemEnter(ctx);
  if (bareMarkerEdit) {
    return bareMarkerEdit;
  }

  const rootList = readActiveListRoot(ctx);
  if (!rootList) {
    return null;
  }

  const current = findListItemContext(rootList, ctx.selection.from, rootList, null, null);
  if (!current) {
    return null;
  }

  const resolvedContentStartOffset =
    contentStartOffset ?? current.item.contentStartOffset ?? current.item.markerEnd;

  if (ctx.selection.from < resolvedContentStartOffset) {
    return null;
  }

  const line = ctx.state.doc.lineAt(ctx.selection.from);
  const leftContent = ctx.source.slice(resolvedContentStartOffset, ctx.selection.from);

  if (leftContent.trim().length === 0 && ctx.selection.from <= line.to) {
    return computeUpgradeListItemAtContentStart(ctx, current, line.to);
  }

  return computeSplitListItemAtSelection(ctx, current);
}

export function computeUpgradeEmptyLeftListItemEnter(
  ctx: SemanticContext,
  contentStartOffset: number
): ListEdit | null {
  if (ctx.selection.empty === false || ctx.selection.from < contentStartOffset) {
    return null;
  }

  const rootList = readActiveListRoot(ctx);
  if (!rootList) {
    return null;
  }

  const current = findListItemContext(rootList, ctx.selection.from, rootList, null, null);

  if (
    !current ||
    current.item.children.length > 0 ||
    current.item.endLine > current.item.startLine
  ) {
    return null;
  }

  const line = ctx.state.doc.lineAt(ctx.selection.from);
  const leftContent = ctx.source.slice(contentStartOffset, ctx.selection.from);

  if (leftContent.trim().length > 0 || ctx.selection.from > line.to) {
    return null;
  }

  const rightContent = ctx.source.slice(ctx.selection.from, line.to);
  if (rightContent.trim().length === 0) {
    return null;
  }

  return computeUpgradeListItemAtContentStart(ctx, current, line.to);
}

function computeUpgradeListItemAtContentStart(
  ctx: SemanticContext,
  current: ListItemContext,
  lineEndOffset: number
): ListEdit | null {
  if (current.item.children.length > 0 || current.item.endLine > current.item.startLine) {
    if (current.parentItem) {
      return computeOutdentListItem(ctx);
    }

    return computeUpgradeTopLevelSubtreeAtContentStart(ctx, current, lineEndOffset);
  }

  const rightContent = ctx.source.slice(ctx.selection.from, lineEndOffset);
  const rightContentIsEmpty = rightContent.trim().length === 0;
  const exitsTopLevelEmptyItem = current.parentItem === null && rightContentIsEmpty;
  const hasFollowingLineBreak = lineEndOffset < ctx.source.length && ctx.source[lineEndOffset] === "\n";
  const hasExistingSeparatorAfterItem =
    exitsTopLevelEmptyItem &&
    hasFollowingLineBreak &&
    lineEndOffset + 1 < ctx.source.length &&
    ctx.source[lineEndOffset + 1] === "\n";
  const needsTrailingBodySeparator =
    current.parentItem === null &&
    !rightContentIsEmpty &&
    hasFollowingLineBreak &&
    lineEndOffset < current.rootList.endOffset;
  const topLevelBodyPrefix = readTopLevelBodyPrefix(ctx, current.item);
  const topLevelQuoteExitPrefix =
    exitsTopLevelEmptyItem && topLevelBodyPrefix !== null
      ? buildTopLevelQuoteListExitPrefix(ctx, current.item)
      : null;
  const replacementPrefix =
    current.parentScope && current.parentItem
      ? buildParentEmptyListItemPrefix(ctx, current.parentScope, current.parentItem)
      : hasExistingSeparatorAfterItem
        ? ""
      : topLevelQuoteExitPrefix !== null
        ? topLevelQuoteExitPrefix
      : topLevelBodyPrefix !== null
        ? topLevelBodyPrefix
      : toBlockOffset(current.rootList, current.item.startOffset) > 0
        ? "\n"
        : "";

  if (replacementPrefix === null) {
    return null;
  }

  const blockSource = readBlockSource(ctx, current.rootList);
  const replaceFrom = toBlockOffset(current.rootList, current.item.startOffset);
  const deleteTo =
    exitsTopLevelEmptyItem && hasFollowingLineBreak
      ? lineEndOffset + 1
      : lineEndOffset;

  if (exitsTopLevelEmptyItem && hasFollowingLineBreak && deleteTo > current.rootList.endOffset) {
    const selectionOffset =
      topLevelBodyPrefix !== null
        ? current.item.startOffset + replacementPrefix.length
        : current.item.startOffset;

    return {
      changes: {
        from: current.item.startOffset,
        to: deleteTo,
        insert: replacementPrefix
      },
      selection: {
        anchor: selectionOffset,
        head: selectionOffset
      },
      userEvent: "input.list-exit"
    };
  }

  const replaceTo = toBlockOffset(current.rootList, deleteTo);
  const replacement = `${replacementPrefix}${rightContent}${needsTrailingBodySeparator ? "\n" : ""}`;
  const tentativeSource = replaceRange(blockSource, replaceFrom, replaceTo, replacement);
  const tentativeCursor =
    exitsTopLevelEmptyItem && hasFollowingLineBreak
      ? replaceFrom + (topLevelBodyPrefix !== null ? replacementPrefix.length : 0)
      : replaceFrom + replacementPrefix.length;

  return finalizeListEdit(
    current.rootList,
    blockSource,
    tentativeSource,
    tentativeCursor,
    current.parentItem === null ? "input.list-exit" : undefined
  );
}

function computeUpgradeTopLevelSubtreeAtContentStart(
  ctx: SemanticContext,
  current: ListItemContext,
  lineEndOffset: number
): ListEdit | null {
  const rightContent = ctx.source.slice(ctx.selection.from, lineEndOffset);
  const tailFrom =
    lineEndOffset < current.item.endOffset && ctx.source[lineEndOffset] === "\n"
      ? lineEndOffset + 1
      : lineEndOffset;
  const rawTail = ctx.source.slice(tailFrom, current.item.endOffset);
  const tail = outdentListItemTail(rawTail);
  const tailStartsList = firstNonBlankLineStartsList(tail);
  const hasFollowingRootItem = current.item.endOffset < current.rootList.endOffset;
  const replacementPrefix =
    toBlockOffset(current.rootList, current.item.startOffset) > 0 ? "\n" : "";
  const tailSeparator = tail.length === 0 ? "" : tailStartsList ? "\n\n" : "\n";
  const trailingSeparator =
    hasFollowingRootItem && (tail.length === 0 || !tailStartsList) ? "\n" : "";
  const replacement = `${replacementPrefix}${rightContent}${tailSeparator}${tail}${trailingSeparator}`;
  const blockSource = readBlockSource(ctx, current.rootList);
  const replaceFrom = toBlockOffset(current.rootList, current.item.startOffset);
  const replaceTo = toBlockOffset(current.rootList, current.item.endOffset);
  const tentativeSource = replaceRange(blockSource, replaceFrom, replaceTo, replacement);
  const tentativeCursor = replaceFrom + replacementPrefix.length;

  return finalizeListEdit(
    current.rootList,
    blockSource,
    tentativeSource,
    tentativeCursor,
    "input.list-exit"
  );
}

function computeSplitListItemAtSelection(
  ctx: SemanticContext,
  current: ListItemContext
): ListEdit | null {
  if (current.item.children.length > 0 || current.item.endLine > current.item.startLine) {
    return null;
  }

  const blockSource = readBlockSource(ctx, current.rootList);
  const insertAt = toBlockOffset(current.rootList, ctx.selection.from);
  const marker = current.scope.ordered
    ? `${current.scope.startOrdinal + current.itemIndex + 1}${current.scope.delimiter}`
    : current.item.marker;
  const continuationPrefix =
    `${readListItemMarkerPrefix(ctx, current.item)}${marker} ${current.item.task ? "[ ] " : ""}`;
  const insert = `\n${continuationPrefix}`;
  const tentativeSource = replaceRange(blockSource, insertAt, insertAt, insert);
  const tentativeCursor = insertAt + insert.length;

  return finalizeListEdit(current.rootList, blockSource, tentativeSource, tentativeCursor);
}

function outdentListItemTail(source: string): string {
  return outdentListItemSubtreeSource(source);
}

function firstNonBlankLineStartsList(source: string): boolean {
  const line = source.split("\n").find((candidate) => candidate.trim().length > 0);
  return line ? lineHasPotentialListMarker(line) : false;
}

export function computeExitEmptyNestedListItem(ctx: SemanticContext): ListEdit | null {
  if (ctx.selection.empty === false) {
    return null;
  }

  const rootList = readActiveListRoot(ctx);

  if (!rootList) {
    return null;
  }

  const current = findListItemContext(rootList, ctx.selection.from, rootList, null, null);

  if (
    !current ||
    current.parentItem === null ||
    current.parentScope === null ||
    current.item.children.length > 0 ||
    current.item.endLine > current.item.startLine
  ) {
    return null;
  }

  const replacementPrefix = buildParentEmptyListItemPrefix(ctx, current.parentScope, current.parentItem);

  if (!replacementPrefix) {
    return null;
  }

  const blockSource = readBlockSource(ctx, rootList);
  const itemFrom = toBlockOffset(rootList, current.item.startOffset);
  let deleteTo = current.item.endOffset;

  if (deleteTo < ctx.source.length && ctx.source[deleteTo] === "\n") {
    deleteTo += 1;
  }

  const itemTo = toBlockOffset(rootList, deleteTo);
  const sourceWithoutCurrent = replaceRange(blockSource, itemFrom, itemTo, "");
  const removedLength = itemTo - itemFrom;
  const insertAt = Math.max(0, toBlockOffset(rootList, current.parentItem.endOffset) - removedLength);
  const needsLeadingNewline = insertAt > 0 && sourceWithoutCurrent[insertAt - 1] !== "\n";
  const insert = `${needsLeadingNewline ? "\n" : ""}${replacementPrefix}`;
  const tentativeSource = replaceRange(sourceWithoutCurrent, insertAt, insertAt, insert);
  const tentativeCursor = insertAt + insert.length;

  return finalizeListEdit(rootList, blockSource, tentativeSource, tentativeCursor);
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

  return finalizeListEdit(rootList, blockSource, tentativeSource, toBlockOffset(rootList, deleteFrom));
}

export function computeBackspaceOrderedListMarker(ctx: SemanticContext): ListEdit | null {
  return computeBackspaceListMarker(ctx);
}

export function computeBackspaceEmptyListMarker(ctx: SemanticContext): ListEdit | null {
  return computeBackspaceListMarker(ctx);
}

export function computeBackspaceListMarker(ctx: SemanticContext): ListEdit | null {
  const rootList = readActiveListRoot(ctx);
  const current = rootList ? findListItemContext(rootList, ctx.selection.from, rootList, null, null) : null;

  if (
    !current ||
    ctx.selection.empty === false ||
    current.item.children.length > 0 ||
    current.item.endLine > current.item.startLine
  ) {
    return null;
  }

  const contentStartOffset = current.item.contentStartOffset ?? current.item.markerEnd;

  if (ctx.selection.from !== contentStartOffset) {
    return null;
  }

  const blockSource = readBlockSource(ctx, current.rootList);
  const deleteFrom = toBlockOffset(current.rootList, current.item.markerStart);
  const deleteTo = toBlockOffset(current.rootList, contentStartOffset);
  const tentativeSource = replaceRange(blockSource, deleteFrom, deleteTo, "");
  const tentativeCursor = deleteFrom;

  return {
    changes: createMinimalTextChange(blockSource, tentativeSource, current.rootList.startOffset),
    selection: {
      anchor: current.rootList.startOffset + tentativeCursor,
      head: current.rootList.startOffset + tentativeCursor
    },
    filter: false,
    userEvent: "delete.list-marker"
  };
}

export function computeIndentListItem(ctx: SemanticContext): ListEdit | null {
  const rootList = readActiveListRoot(ctx);
  const current = rootList ? findListItemContext(rootList, ctx.selection.from, rootList, null, null) : null;

  if (!current || ctx.selection.empty === false || current.itemIndex <= 0) {
    return null;
  }

  const subtreeSource = readItemSubtreeSource(ctx, current.item);
  const subtree = current.scope.ordered ? resetOrderedListSubtreeRootMarker(subtreeSource) : subtreeSource;
  const indentedSubtree = indentListItemSubtreeSource(subtree);
  const blockSource = readBlockSource(ctx, current.rootList);
  const subtreeFrom = toBlockOffset(current.rootList, current.item.startOffset);
  const subtreeTo = toBlockOffset(current.rootList, current.item.endOffset);
  const tentativeSource = replaceRange(blockSource, subtreeFrom, subtreeTo, indentedSubtree);
  const cursor = ctx.selection.from + 2;

  return finalizeListEdit(current.rootList, blockSource, tentativeSource, toBlockOffset(current.rootList, cursor));
}

export function computeOutdentListItem(ctx: SemanticContext): ListEdit | null {
  const rootList = readActiveListRoot(ctx);
  const current = rootList ? findListItemContext(rootList, ctx.selection.from, rootList, null, null) : null;

  if (
    !current ||
    ctx.selection.empty === false ||
    current.parentItem === null ||
    current.item.indent < 2
  ) {
    return null;
  }

  const subtree = readItemSubtreeSource(ctx, current.item);
  const outdentedSubtree = outdentListItemSubtreeSource(subtree);
  const blockSource = readBlockSource(ctx, current.rootList);
  const subtreeFrom = toBlockOffset(current.rootList, current.item.startOffset);
  const subtreeTo = toBlockOffset(current.rootList, current.item.endOffset);
  const tentativeSource = replaceRange(blockSource, subtreeFrom, subtreeTo, outdentedSubtree);
  const cursor = Math.max(current.item.startOffset, ctx.selection.from - 2);

  return finalizeListEdit(current.rootList, blockSource, tentativeSource, toBlockOffset(current.rootList, cursor));
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
    changes: createMinimalTextChange(blockSource, normalization.source, rootList.startOffset),
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

export function computeNormalizedOrderedListDocument(
  source: string,
  options: OrderedListNormalizationOptions = {}
): OrderedListNormalization | null {
  if (!options.changedRanges || options.changedRanges.length === 0) {
    return computeFullDocumentOrderedListNormalization(source, options);
  }

  if (options.changedRanges.length > 1) {
    return computeFullDocumentOrderedListNormalization(source, options);
  }

  return computeChangedRangeOrderedListNormalization(source, options.changedRanges[0]!, options);
}

function computeFullDocumentOrderedListNormalization(
  source: string,
  options: OrderedListNormalizationOptions
): OrderedListNormalization | null {
  const document = (options.parseBlockMap ?? parseBlockMap)(source);
  const changes: TextChange[] = [];

  for (const block of document.blocks) {
    if (block.type !== "list" || !containsOrderedScope(block)) {
      continue;
    }

    const blockSource = source.slice(block.startOffset, block.endOffset);
    const normalization = normalizeOrderedListBlock(
      blockSource,
      block,
      getDocumentOrderedListStartOrdinal(block)
    );

    if (normalization.changes.length === 0) {
      continue;
    }

    changes.push(
      ...normalization.changes.map((change) => ({
        from: block.startOffset + change.from,
        to: block.startOffset + change.to,
        insert: change.insert
      }))
    );
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    source: applyChangeSpecs(source, changes),
    changes
  };
}

function computeChangedRangeOrderedListNormalization(
  source: string,
  changedRange: OrderedListNormalizationChangedRange,
  options: OrderedListNormalizationOptions
): OrderedListNormalization | null {
  const candidateRange = findPotentialChangedListRange(source, changedRange);

  if (!candidateRange) {
    return null;
  }

  const candidateSource = source.slice(candidateRange.from, candidateRange.to);
  const document = (options.parseBlockMap ?? parseBlockMap)(candidateSource);
  const changedFrom = Math.max(0, changedRange.from - candidateRange.from);
  const changedTo = Math.max(changedFrom, changedRange.to - candidateRange.from);
  const targetBlock = document.blocks.find((block) =>
    block.type === "list" &&
    containsOrderedScope(block) &&
    rangesIntersect(block.startOffset, block.endOffset, changedFrom, changedTo)
  );

  if (!targetBlock || targetBlock.type !== "list") {
    return null;
  }

  const blockSource = candidateSource.slice(targetBlock.startOffset, targetBlock.endOffset);
  const normalization = normalizeOrderedListBlock(
    blockSource,
    targetBlock,
    getDocumentOrderedListStartOrdinal(targetBlock)
  );

  if (normalization.changes.length === 0) {
    return null;
  }

  const baseOffset = candidateRange.from + targetBlock.startOffset;
  const changes = normalization.changes.map((change) => ({
    from: baseOffset + change.from,
    to: baseOffset + change.to,
    insert: change.insert
  }));

  return {
    source: applyChangeSpecs(source, changes),
    changes
  };
}

function findPotentialChangedListRange(
  source: string,
  changedRange: OrderedListNormalizationChangedRange
): { from: number; to: number } | null {
  if (source.length === 0) {
    return null;
  }

  const anchorOffset = changedRange.to > changedRange.from
    ? changedRange.to - 1
    : changedRange.from;
  const anchor = Math.max(0, Math.min(anchorOffset, source.length - 1));
  const anchorLine = readLineInfoAt(source, anchor);

  let hasListMarker = lineHasPotentialListMarker(source.slice(anchorLine.from, anchorLine.to));
  let from = anchorLine.from;

  while (from > 0) {
    const previousLine = readLineInfoBefore(source, from);

    if (!previousLine) {
      break;
    }

    const text = source.slice(previousLine.from, previousLine.to);

    if (text.trim().length === 0) {
      break;
    }

    hasListMarker = hasListMarker || lineHasPotentialListMarker(text);
    from = previousLine.from;
  }

  if (!hasListMarker) {
    return null;
  }

  let to = anchorLine.to;

  while (to < source.length) {
    const nextLine = readLineInfoAfter(source, to);

    if (!nextLine) {
      break;
    }

    const text = source.slice(nextLine.from, nextLine.to);

    if (text.trim().length === 0) {
      break;
    }

    to = nextLine.to;
  }

  return { from, to };
}

function readLineInfoAt(source: string, offset: number): { from: number; to: number } {
  let from = offset;

  while (from > 0 && source[from - 1] !== "\n") {
    from -= 1;
  }

  let to = offset;

  while (to < source.length && source[to] !== "\n") {
    to += 1;
  }

  return { from, to };
}

function readLineInfoBefore(source: string, lineStart: number): { from: number; to: number } | null {
  if (lineStart <= 0) {
    return null;
  }

  const to = lineStart - 1;

  if (to < 0) {
    return null;
  }

  return readLineInfoAt(source, to);
}

function readLineInfoAfter(source: string, lineEnd: number): { from: number; to: number } | null {
  if (lineEnd >= source.length) {
    return null;
  }

  const from = source[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;

  if (from >= source.length) {
    return null;
  }

  return readLineInfoAt(source, from);
}

function lineHasPotentialListMarker(line: string): boolean {
  return /^[ \t]*(?:[-+*]|\d+[.)])(?:[ \t]+)/u.test(readListContentLine(line));
}

function rangesIntersect(leftFrom: number, leftTo: number, rightFrom: number, rightTo: number): boolean {
  if (rightFrom === rightTo) {
    return rightFrom >= leftFrom && rightFrom <= leftTo;
  }

  return leftFrom < rightTo && leftTo > rightFrom;
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

  return finalizeListEdit(rootList, blockSource, tentativeSource, tentativeCursor);
}

function finalizeListEdit(
  rootList: ListBlock,
  originalSource: string,
  tentativeSource: string,
  tentativeCursor: number,
  userEvent?: string
): ListEdit {
  return finalizeListEditRange(
    rootList.startOffset,
    originalSource,
    tentativeSource,
    tentativeCursor,
    userEvent
  );
}

function finalizeListEditRange(
  sourceStartOffset: number,
  originalSource: string,
  tentativeSource: string,
  tentativeCursor: number,
  userEvent?: string
): ListEdit {
  const normalization = normalizeOrderedListBlock(tentativeSource);
  const selectionOffset = mapBlockOffsetThroughChanges(tentativeCursor, normalization.changes);

  return {
    changes: createMinimalTextChange(originalSource, normalization.source, sourceStartOffset),
    selection: {
      anchor: sourceStartOffset + selectionOffset,
      head: sourceStartOffset + selectionOffset
    },
    userEvent
  };
}

function normalizeOrderedListBlock(source: string, parsedList?: ListBlock, rootStartOrdinalOverride?: number): {
  source: string;
  changes: TextChange[];
} {
  const nextParsedList = parsedList ?? parseListBlockForNormalization(source);

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
    let nextOrdinal = startOrdinalOverride ?? list.startOrdinal;

    for (let index = 0; index < list.items.length; index += 1) {
      const item = list.items[index]!;
      const desiredMarker = `${nextOrdinal}${list.delimiter}`;
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

      nextOrdinal = hasTopLevelPlainTextTail(item, source, baseOffset) ? 1 : nextOrdinal + 1;
    }
  }

  for (const item of list.items) {
    for (const child of item.children) {
      appendOrderedListScopeChanges(child, source, changes, baseOffset);
    }
  }
}

function getDocumentOrderedListStartOrdinal(currentBlock: ListBlock): number | undefined {
  return currentBlock.ordered ? currentBlock.startOrdinal : undefined;
}

function hasTopLevelPlainTextTail(item: ListItemBlock, source: string, baseOffset: number): boolean {
  const itemSource = source.slice(item.startOffset - baseOffset, item.endOffset - baseOffset);
  const lines = itemSource.split("\n");

  if (lines.length <= 1) {
    return false;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = readListContentLine(lines[index] ?? "");

    if (line.trim().length === 0) {
      continue;
    }

    if (/^\s+/u.test(line)) {
      continue;
    }

    return true;
  }

  return false;
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
  const activeRoot = readActiveListRootFromActiveBlock(ctx.activeState.activeBlock, ctx.selection.from);

  if (activeRoot) {
    return activeRoot;
  }

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

function readActiveListRootFromActiveBlock(
  activeBlock: MarkdownBlock | null,
  selectionOffset: number
): ListBlock | null {
  if (!activeBlock) {
    return null;
  }

  if (activeBlock.type === "list" && offsetIsInsideBlock(activeBlock, selectionOffset)) {
    return activeBlock;
  }

  if (activeBlock.type !== "blockquote" || !activeBlock.innerBlocks) {
    return null;
  }

  return findListRootInBlocks(activeBlock.innerBlocks, selectionOffset);
}

function findListRootInBlocks(
  blocks: readonly MarkdownBlock[],
  selectionOffset: number
): ListBlock | null {
  for (const block of blocks) {
    if (block.type === "list" && offsetIsInsideBlock(block, selectionOffset)) {
      return block;
    }
  }

  return null;
}

function computeBareEmptyListItemEnter(ctx: SemanticContext): ListEdit | null {
  if (ctx.selection.empty === false) {
    return null;
  }

  const line = ctx.state.doc.lineAt(ctx.selection.from);
  if (ctx.selection.from !== line.to) {
    return null;
  }

  const lineText = ctx.source.slice(line.from, line.to);
  const bareMarker = parseBareListMarkerLine(lineText);
  if (!bareMarker) {
    return null;
  }

  const rootList = readActiveListRoot(ctx) ?? readPrecedingActiveListRoot(ctx, line.from);
  if (!rootList || !listKindMatchesBareMarker(rootList, bareMarker)) {
    return null;
  }

  const previousContext = findTrailingListItemContextForBareMarker(rootList, bareMarker);
  if (!previousContext) {
    return null;
  }

  const deleteTo = line.to < ctx.source.length && ctx.source[line.to] === "\n" ? line.to + 1 : line.to;
  const previousScopeIndent = readListScopeIndent(previousContext.scope);

  if (
    previousContext.parentItem &&
    previousContext.parentScope &&
    previousScopeIndent === bareMarker.indent
  ) {
    const replacementPrefix = buildBareParentEmptyListItemPrefix(
      ctx,
      previousContext.parentScope,
      previousContext.parentItem
    );

    if (!replacementPrefix) {
      return null;
    }

    return finalizeBareListMarkerEnter(
      ctx,
      rootList.startOffset,
      deleteTo,
      line.from,
      deleteTo,
      replacementPrefix
    );
  }

  if (previousScopeIndent !== bareMarker.indent) {
    return null;
  }

  const replacementPrefix = buildBareTopLevelListExitPrefix(
    lineText,
    line.from > rootList.startOffset
  );
  return finalizeBareListMarkerEnter(
    ctx,
    rootList.startOffset,
    deleteTo,
    line.from,
    deleteTo,
    replacementPrefix,
    "input.list-exit"
  );
}

function parseBareListMarkerLine(lineText: string): BareListMarkerLine | null {
  const content = readListContentLine(lineText);
  const match = /^([ \t]*)([*+-]|\d+[.)])$/u.exec(content);

  if (!match) {
    return null;
  }

  const marker = match[2] ?? "-";
  const orderedMatch = /^(\d+)([.)])$/u.exec(marker);

  return {
    marker,
    indent: (match[1] ?? "").length,
    ordered: orderedMatch !== null,
    delimiter: orderedMatch ? (orderedMatch[2] as "." | ")") : null
  };
}

function readPrecedingActiveListRoot(ctx: SemanticContext, lineStartOffset: number): ListBlock | null {
  const activeBlock = ctx.activeState.activeBlock;

  if (activeBlock?.type === "blockquote" && activeBlock.innerBlocks) {
    return findPrecedingListRootInBlocks(activeBlock.innerBlocks, lineStartOffset, ctx.source);
  }

  const activeRoot = activeBlock?.type === "list"
    ? activeBlock
    : findPrecedingListRootInBlocks(ctx.activeState.blockMap.blocks, lineStartOffset, ctx.source);

  if (
    activeRoot?.type === "list" &&
    activeRoot.endOffset <= lineStartOffset &&
    sourceBetweenBlocksIsAdjacentLineBreak(ctx.source, activeRoot.endOffset, lineStartOffset)
  ) {
    return activeRoot;
  }

  return null;
}

function findPrecedingListRootInBlocks(
  blocks: readonly MarkdownBlock[],
  lineStartOffset: number,
  source: string
): ListBlock | null {
  let nearest: ListBlock | null = null;

  for (const block of blocks) {
    if (block.type === "blockquote" && block.innerBlocks) {
      const inner = findPrecedingListRootInBlocks(block.innerBlocks, lineStartOffset, source);
      if (inner && (!nearest || inner.endOffset > nearest.endOffset)) {
        nearest = inner;
      }
      continue;
    }

    if (
      block.type === "list" &&
      block.endOffset <= lineStartOffset &&
      sourceBetweenBlocksIsAdjacentLineBreak(source, block.endOffset, lineStartOffset) &&
      (!nearest || block.endOffset > nearest.endOffset)
    ) {
      nearest = block;
    }
  }

  return nearest;
}

function sourceBetweenBlocksIsAdjacentLineBreak(source: string, from: number, to: number): boolean {
  const gapSource = source.slice(from, to);

  return gapSource === "\n" || gapSource === "\r\n";
}

function listKindMatchesBareMarker(list: ListBlock, bareMarker: BareListMarkerLine): boolean {
  if (list.ordered !== bareMarker.ordered) {
    return false;
  }

  if (!list.ordered || !bareMarker.ordered) {
    return true;
  }

  return list.delimiter === bareMarker.delimiter;
}

function readListScopeIndent(scope: ListBlock): number | null {
  return scope.items[0]?.indent ?? null;
}

function findTrailingListItemContextForBareMarker(
  rootList: ListBlock,
  bareMarker: BareListMarkerLine
): ListItemContext | null {
  let scope = rootList;
  let parentItem: ListItemBlock | null = null;
  let parentScope: ListBlock | null = null;
  let match: ListItemContext | null = null;

  while (scope.items.length > 0) {
    const itemIndex = scope.items.length - 1;
    const item = scope.items[itemIndex]!;

    if (
      readListScopeIndent(scope) === bareMarker.indent &&
      listKindMatchesBareMarker(scope, bareMarker)
    ) {
      match = {
        rootList,
        scope,
        parentScope,
        parentItem,
        item,
        itemIndex
      };
    }

    const trailingChild = item.children.reduce<ListBlock | null>(
      (latest, child) => (!latest || child.endOffset > latest.endOffset ? child : latest),
      null
    );

    if (!trailingChild || trailingChild.endOffset !== item.endOffset) {
      break;
    }

    parentScope = scope;
    parentItem = item;
    scope = trailingChild;
  }

  return match;
}

function buildBareParentEmptyListItemPrefix(
  ctx: SemanticContext,
  scope: ListBlock,
  parentItem: ListItemBlock
): string | null {
  if (scope.ordered) {
    const parentItemIndex = scope.items.findIndex((item) => item === parentItem);

    if (parentItemIndex === -1) {
      return null;
    }

    return `${readListItemMarkerPrefix(ctx, parentItem)}${scope.startOrdinal + parentItemIndex + 1}${scope.delimiter}`;
  }

  return `${readListItemMarkerPrefix(ctx, parentItem)}${parentItem.marker}${parentItem.task ? " [ ]" : ""}`;
}

function buildBareTopLevelListExitPrefix(lineText: string, hasPreviousRootContent: boolean): string {
  const parsedQuote = parseBlockquoteLine(lineText);

  if (!parsedQuote) {
    return hasPreviousRootContent ? "\n" : "";
  }

  const separatorPrefix =
    parsedQuote.quoteDepth <= 1 ? parsedQuote.sourcePrefix.trimEnd() : parsedQuote.sourcePrefix;

  return `${separatorPrefix}\n${parsedQuote.sourcePrefix}`;
}

function finalizeBareListMarkerEnter(
  ctx: SemanticContext,
  rangeFrom: number,
  rangeTo: number,
  replaceFrom: number,
  replaceTo: number,
  replacement: string,
  userEvent?: string
): ListEdit {
  const originalSource = ctx.source.slice(rangeFrom, rangeTo);
  const tentativeSource = replaceRange(
    originalSource,
    replaceFrom - rangeFrom,
    replaceTo - rangeFrom,
    replacement
  );
  const tentativeCursor = replaceFrom - rangeFrom + replacement.length;

  return finalizeListEditRange(rangeFrom, originalSource, tentativeSource, tentativeCursor, userEvent);
}

function offsetIsInsideBlock(block: { startOffset: number; endOffset: number }, offset: number): boolean {
  return offset >= block.startOffset && offset <= block.endOffset;
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

function parseListBlockForNormalization(source: string): ListBlock | null {
  const parsed = parseBlockMap(source).blocks;
  const rootList = parsed.length === 1 && parsed[0]?.type === "list" ? parsed[0] : null;

  if (rootList) {
    return rootList;
  }

  const richParsed = parseMarkdownDocument(source).blocks;
  const blockquote = richParsed.length === 1 && richParsed[0]?.type === "blockquote" ? richParsed[0] : null;
  const innerList =
    blockquote?.innerBlocks?.length === 1 && blockquote.innerBlocks[0]?.type === "list"
      ? blockquote.innerBlocks[0]
      : null;

  return innerList;
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

function buildParentEmptyListItemPrefix(
  ctx: SemanticContext,
  scope: ListBlock,
  parentItem: ListItemBlock
): string | null {
  if (scope.ordered) {
    const parentItemIndex = scope.items.findIndex((item) => item === parentItem);

    if (parentItemIndex === -1) {
      return null;
    }

    return `${readListItemMarkerPrefix(ctx, parentItem)}${scope.startOrdinal + parentItemIndex + 1}${scope.delimiter} `;
  }

  return `${readListItemMarkerPrefix(ctx, parentItem)}${parentItem.marker} ${parentItem.task ? "[ ] " : ""}`;
}

function resetOrderedListSubtreeRootMarker(subtree: string): string {
  const [firstLine, ...restLines] = subtree.split("\n");

  if (!firstLine) {
    return subtree;
  }

  const parsedLine = parseListLineWithContainerPrefix(firstLine);
  const parsed = parsedLine?.parsed ?? null;

  if (!parsed || !/^\d+[.)]$/u.test(parsed.marker)) {
    return subtree;
  }

  const delimiter = parsed.marker.endsWith(")") ? ")" : ".";
  const markerStart = parsedLine!.containerPrefix.length + parsed.indent.length;
  const markerEnd = markerStart + parsed.marker.length;
  return [
    `${firstLine.slice(0, markerStart)}1${delimiter}${firstLine.slice(markerEnd)}`,
    ...restLines
  ].join("\n");
}

function readListItemMarkerPrefix(ctx: SemanticContext, item: ListItemBlock): string {
  return ctx.source.slice(item.startOffset, item.markerStart);
}

function readTopLevelBodyPrefix(ctx: SemanticContext, item: ListItemBlock): string | null {
  const markerPrefix = readListItemMarkerPrefix(ctx, item);

  return markerPrefix.includes(">") ? markerPrefix : null;
}

function buildTopLevelQuoteListExitPrefix(ctx: SemanticContext, item: ListItemBlock): string | null {
  const line = readLineInfoAt(ctx.source, item.startOffset);
  const lineText = ctx.source.slice(line.from, line.to);
  const parsedQuote = parseBlockquoteLine(lineText);

  if (!parsedQuote) {
    return null;
  }

  const separatorPrefix =
    parsedQuote.quoteDepth <= 1 ? parsedQuote.sourcePrefix.trimEnd() : parsedQuote.sourcePrefix;

  return `${separatorPrefix}\n${parsedQuote.sourcePrefix}`;
}

function indentListItemSubtreeSource(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const containerPrefixLength = readContainerPrefixLength(line);
      return `${line.slice(0, containerPrefixLength)}  ${line.slice(containerPrefixLength)}`;
    })
    .join("\n");
}

function outdentListItemSubtreeSource(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const containerPrefixLength = readContainerPrefixLength(line);
      const removable = line.slice(containerPrefixLength, containerPrefixLength + 2);

      return removable === "  "
        ? `${line.slice(0, containerPrefixLength)}${line.slice(containerPrefixLength + 2)}`
        : line;
    })
    .join("\n");
}

function readContainerPrefixLength(line: string): number {
  const parsedQuote = parseBlockquoteLine(line);
  return parsedQuote?.contentStartOffset ?? 0;
}

function readListContentLine(line: string): string {
  return line.slice(readContainerPrefixLength(line));
}

function parseListLineWithContainerPrefix(line: string): {
  containerPrefix: string;
  parsed: NonNullable<ReturnType<typeof parseListLine>>;
} | null {
  const containerPrefixLength = readContainerPrefixLength(line);
  const parsed = parseListLine(line.slice(containerPrefixLength));

  if (!parsed) {
    return null;
  }

  return {
    containerPrefix: line.slice(0, containerPrefixLength),
    parsed
  };
}

function containsOrderedScope(list: ListBlock): boolean {
  if (list.ordered) {
    return true;
  }

  return list.items.some((item) => item.children.some((child) => containsOrderedScope(child)));
}

function createMinimalTextChange(originalSource: string, nextSource: string, baseOffset: number): TextChange {
  let sharedPrefixLength = 0;

  while (
    sharedPrefixLength < originalSource.length &&
    sharedPrefixLength < nextSource.length &&
    originalSource[sharedPrefixLength] === nextSource[sharedPrefixLength]
  ) {
    sharedPrefixLength += 1;
  }

  let sharedSuffixLength = 0;

  while (
    sharedSuffixLength < originalSource.length - sharedPrefixLength &&
    sharedSuffixLength < nextSource.length - sharedPrefixLength &&
    originalSource[originalSource.length - 1 - sharedSuffixLength] ===
      nextSource[nextSource.length - 1 - sharedSuffixLength]
  ) {
    sharedSuffixLength += 1;
  }

  const from = sharedPrefixLength;
  const to = originalSource.length - sharedSuffixLength;
  const insertTo = nextSource.length - sharedSuffixLength;

  return {
    from: baseOffset + from,
    to: baseOffset + to,
    insert: nextSource.slice(from, insertTo)
  };
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
