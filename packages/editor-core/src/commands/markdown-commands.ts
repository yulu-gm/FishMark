import {
  formatTableMarkdown,
  parseMarkdownDocument,
  splitTableLine,
  type ListBlock,
  type MarkdownBlock
} from "@fishmark/markdown-engine";

import type { ActiveBlockState } from "../active-block";
import { blockRequiresLeadingStructuralSeparator } from "../structural-blank-lines";
import { parseBlockquoteLine, parseListLine } from "./line-parsers";

export type MarkdownCommandLine = {
  from: number;
  number: number;
  text: string;
  to: number;
};

export type MarkdownCommandSelection = {
  anchor: number;
  empty: boolean;
  head: number;
};

export type MarkdownCommandSelectionUpdate = {
  anchor: number;
  goalColumn?: number;
  head?: number;
  scrollIntoView?: boolean;
};

export type MarkdownCommandTarget = {
  deleteCharBackward: () => boolean;
  dispatchChange: (input: {
    from: number;
    insert: string;
    selection?: MarkdownCommandSelectionUpdate;
    to: number;
  }) => void;
  dispatchSelection: (selection: MarkdownCommandSelectionUpdate) => void;
  getLineCount: () => number;
  getSelection: () => MarkdownCommandSelection;
  insertNewlineAndIndent: () => boolean;
  line: (lineNumber: number) => MarkdownCommandLine;
  lineAt: (position: number) => MarkdownCommandLine;
  resolveArrowDown: (activeState: ActiveBlockState) => MarkdownCommandSelectionUpdate | null;
  resolveArrowUp: (activeState: ActiveBlockState) => MarkdownCommandSelectionUpdate | null;
  runBlockquoteBackspace: (activeState: ActiveBlockState) => boolean;
  runBlockquoteEnter: () => boolean;
  runCodeFenceBackspace: (activeState: ActiveBlockState) => boolean;
  runCodeFenceEnter: (activeState: ActiveBlockState) => boolean;
  runListBackspace: (activeState: ActiveBlockState) => boolean;
  runListEnter: (activeState: ActiveBlockState) => boolean;
  runListIndentOnTab: (activeState: ActiveBlockState) => boolean;
  runListOutdentOnShiftTab: (activeState: ActiveBlockState) => boolean;
  runTableBackspaceFromLineBelow: (activeState: ActiveBlockState) => boolean;
  runTableMoveDownOrExit: (activeState: ActiveBlockState) => boolean;
  runTableNextCell: (activeState: ActiveBlockState) => boolean;
  runTablePreviousCell: (activeState: ActiveBlockState) => boolean;
};

export function runMarkdownEnterCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  return (
    target.runTableMoveDownOrExit(activeState) ||
    runDraftTableEnterCommand(target, activeState) ||
    target.runCodeFenceEnter(activeState) ||
    target.runListEnter(activeState) ||
    runDraftBlockquoteMarkerEnterCommand(target) ||
    target.runBlockquoteEnter() ||
    runThematicBreakEnterCommand(target, activeState) ||
    runHeadingBlockEndEnterCommand(target, activeState) ||
    runPhysicalParagraphEnterCommand(target, activeState) ||
    target.insertNewlineAndIndent()
  );
}

export function runMarkdownBackspaceCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return target.deleteCharBackward();
  }

  return (
    runBackspaceFromWhitespaceOnlyLineCommand(target) ||
    target.runCodeFenceBackspace(activeState) ||
    target.runBlockquoteBackspace(activeState) ||
    runBackspaceFromOrderedListItemContentStartCommand(target, activeState) ||
    target.runListBackspace(activeState) ||
    target.runTableBackspaceFromLineBelow(activeState) ||
    runBackspaceFromTrailingEmptyBlockCommand(target, activeState) ||
    runBackspaceFromTrailingListExitBlankLineCommand(target) ||
    runBackspaceAcrossStructuralBlankBoundaryCommand(target, activeState) ||
    target.deleteCharBackward()
  );
}

export function runMarkdownHardBreakCommand(target: MarkdownCommandTarget): boolean {
  const selection = target.getSelection();
  const from = Math.min(selection.anchor, selection.head);
  const to = Math.max(selection.anchor, selection.head);
  const insert = "<br>";

  target.dispatchChange({
    from,
    to,
    insert,
    selection: {
      anchor: from + insert.length,
      head: from + insert.length
    }
  });

  return true;
}

export function runMarkdownTabCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  return target.runTableNextCell(activeState) || target.runListIndentOnTab(activeState);
}

export function runMarkdownShiftTabCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  return target.runTablePreviousCell(activeState) || target.runListOutdentOnShiftTab(activeState);
}

export function runMarkdownArrowDownCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  const result = target.resolveArrowDown(activeState);

  if (result === null) {
    return runVisibleLineArrowDownCommand(target, activeState);
  }

  target.dispatchSelection({
    ...result,
    scrollIntoView: true
  });
  return true;
}

export function runMarkdownArrowUpCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  const result = target.resolveArrowUp(activeState);

  if (result === null) {
    return runVisibleLineArrowUpCommand(target, activeState);
  }

  target.dispatchSelection({
    ...result,
    scrollIntoView: true
  });
  return true;
}

function runDraftBlockquoteMarkerEnterCommand(target: MarkdownCommandTarget): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const line = target.lineAt(selection.head);

  if (selection.head !== line.to) {
    return false;
  }

  const committedPrefix = resolveDraftBlockquoteMarkerCommitPrefix(line.text);

  if (committedPrefix === null) {
    return false;
  }

  const insert = `${committedPrefix.slice(line.text.length)}\n${committedPrefix}`;
  const selectionAnchor = line.to + insert.length;

  target.dispatchChange({
    from: line.to,
    to: line.to,
    insert,
    selection: {
      anchor: selectionAnchor,
      head: selectionAnchor
    }
  });

  return true;
}

function resolveDraftBlockquoteMarkerCommitPrefix(lineText: string): string | null {
  const parsed = parseBlockquoteLine(lineText);

  if (
    parsed &&
    parsed.content.trim().length === 0 &&
    parsed.contentStartOffset === parsed.markerEnd &&
    lineText.length === parsed.markerEnd
  ) {
    return `${parsed.sourcePrefix} `;
  }

  if (parsed?.content === ">") {
    return `${parsed.sourcePrefix}> `;
  }

  return /^[ \t]{0,3}>$/u.test(lineText) ? `${lineText} ` : null;
}

function runDraftTableEnterCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  if (activeState.activeBlock?.type !== "paragraph") {
    return false;
  }

  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const line = target.lineAt(selection.head);

  if (selection.head !== line.to) {
    return false;
  }

  const nextLine = line.number < target.getLineCount() ? target.line(line.number + 1) : null;

  if (nextLine && looksLikeCommittedTableDelimiter(nextLine.text)) {
    return false;
  }

  const headerCells = readDraftTableHeaderCells(line.text);

  if (!headerCells) {
    return false;
  }

  const tableMarkdown = formatTableMarkdown({
    alignments: headerCells.map(() => "left"),
    header: headerCells,
    rows: [headerCells.map(() => "")]
  });
  const parsedTable = parseMarkdownDocument(tableMarkdown).blocks.find((block) => block.type === "table");
  const selectionAnchor =
    parsedTable?.type === "table" ? parsedTable.rows[0]?.[0]?.contentStartOffset ?? tableMarkdown.length : tableMarkdown.length;

  target.dispatchChange({
    from: line.from,
    to: line.to,
    insert: tableMarkdown,
    selection: {
      anchor: line.from + selectionAnchor,
      head: line.from + selectionAnchor
    }
  });

  return true;
}

function readDraftTableHeaderCells(line: string): string[] | null {
  const pipeCount = line.match(/\|/gu)?.length ?? 0;

  if (pipeCount < 2) {
    return null;
  }

  const segments = splitTableLine(line);

  if (segments.length < 2) {
    return null;
  }

  const cells = segments.map((segment) => segment.text);

  if (cells.every((cell) => cell.length === 0)) {
    return null;
  }

  return cells;
}

function looksLikeCommittedTableDelimiter(line: string): boolean {
  const segments = splitTableLine(line);

  return segments.length >= 2 && segments.every((segment) => /^:?-{3,}:?$/u.test(segment.text));
}

function runHeadingBlockEndEnterCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  if (activeState.activeBlock?.type !== "heading") {
    return false;
  }

  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);

  if (selection.head !== currentLine.to) {
    return false;
  }

  const plan = resolveParagraphBlockEnterInsert(target, selection, selection.head);

  target.dispatchChange({
    from: selection.head,
    to: selection.head,
    insert: plan.insert,
    selection: {
      anchor: plan.selectionAnchor,
      head: plan.selectionAnchor
    }
  });

  return true;
}

function runPhysicalParagraphEnterCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  if (activeState.activeBlock && activeState.activeBlock.type !== "paragraph") {
    return false;
  }

  const selection = target.getSelection();
  const from = Math.min(selection.anchor, selection.head);
  const to = Math.max(selection.anchor, selection.head);
  const plan = resolveParagraphBlockEnterInsert(target, selection, from);

  target.dispatchChange({
    from,
    to,
    insert: plan.insert,
    selection: {
      anchor: plan.selectionAnchor,
      head: plan.selectionAnchor
    }
  });

  return true;
}

function resolveParagraphBlockEnterInsert(
  target: MarkdownCommandTarget,
  selection: MarkdownCommandSelection,
  from: number
): { insert: string; selectionAnchor: number } {
  const defaultInsert = "\n\n";

  if (!selection.empty) {
    return {
      insert: defaultInsert,
      selectionAnchor: from + defaultInsert.length
    };
  }

  const currentLine = target.lineAt(selection.head);

  if (currentLine.text.trim().length === 0) {
    return {
      insert: defaultInsert,
      selectionAnchor: from + defaultInsert.length
    };
  }

  if (selection.head === currentLine.from && currentLine.number > 1 && currentLine.text.length > 0) {
    const previousLine = target.line(currentLine.number - 1);

    if (previousLine.text.trim().length === 0) {
      return {
        insert: defaultInsert,
        selectionAnchor: from + 1
      };
    }
  }

  if (selection.head === currentLine.to && currentLine.number < target.getLineCount()) {
    const nextLine = target.line(currentLine.number + 1);

    if (nextLine.text.trim().length > 0) {
      return {
        insert: "\n\n\n",
        selectionAnchor: from + 2
      };
    }
  }

  return {
    insert: defaultInsert,
    selectionAnchor: from + defaultInsert.length
  };
}

function runThematicBreakEnterCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  if (activeState.activeBlock?.type !== "thematicBreak") {
    return false;
  }

  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const line = target.lineAt(selection.head);
  const from = line.to;
  const to = line.to;
  const insert = "\n\n";
  const selectionAnchor = from + insert.length;

  target.dispatchChange({
    from,
    to,
    insert,
    selection: {
      anchor: selectionAnchor,
      head: selectionAnchor
    }
  });

  return true;
}

function runBackspaceAcrossStructuralBlankBoundaryCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  if (activeState.activeBlock?.type !== "paragraph") {
    return false;
  }

  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);

  if (selection.head !== currentLine.from || currentLine.number <= 2 || currentLine.text.length === 0) {
    return false;
  }

  const previousLine = target.line(currentLine.number - 1);

  if (previousLine.text.length !== 0) {
    return false;
  }

  const previousPreviousLine = target.line(currentLine.number - 2);
  const isPreviousLineVisibleExtraBlank = previousPreviousLine.text.length === 0;
  const deleteFrom = isPreviousLineVisibleExtraBlank ? previousLine.from : previousPreviousLine.to;

  target.dispatchChange({
    from: deleteFrom,
    to: currentLine.from,
    insert: "",
    selection: {
      anchor: deleteFrom,
      head: deleteFrom
    }
  });

  return true;
}

function runBackspaceFromTrailingEmptyBlockCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);

  if (
    currentLine.number <= 2 ||
    currentLine.number !== target.getLineCount() ||
    selection.head !== currentLine.from ||
    currentLine.text.length !== 0
  ) {
    return false;
  }

  const previousLine = target.line(currentLine.number - 1);
  const currentLineIsHiddenSeparator = isHiddenSeparatorLine(target, currentLine.number, activeState);

  if (!currentLineIsHiddenSeparator && !isHiddenSeparatorLine(target, previousLine.number, activeState)) {
    return false;
  }

  const previousVisibleLine = findPreviousVisiblePhysicalLine(target, currentLine.number, activeState);

  if (!previousVisibleLine) {
    return false;
  }

  target.dispatchChange({
    from: previousVisibleLine.to,
    to: currentLine.to,
    insert: "",
    selection: {
      anchor: previousVisibleLine.to,
      head: previousVisibleLine.to
    }
  });

  return true;
}

function runBackspaceFromTrailingListExitBlankLineCommand(target: MarkdownCommandTarget): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);

  if (
    currentLine.number <= 1 ||
    currentLine.number !== target.getLineCount() ||
    selection.head !== currentLine.from ||
    currentLine.text.length !== 0
  ) {
    return false;
  }

  let previousLineNumber = currentLine.number - 1;
  let previousLine = target.line(previousLineNumber);

  while (previousLineNumber > 1 && previousLine.text.length === 0) {
    previousLineNumber -= 1;
    previousLine = target.line(previousLineNumber);
  }

  if (previousLine.text.length === 0 || !parseListLine(previousLine.text)) {
    return false;
  }

  target.dispatchChange({
    from: previousLine.to,
    to: currentLine.to,
    insert: "",
    selection: {
      anchor: previousLine.to,
      head: previousLine.to
    }
  });

  return true;
}

function runBackspaceFromWhitespaceOnlyLineCommand(target: MarkdownCommandTarget): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const line = target.lineAt(selection.head);

  if (
    selection.head <= line.from ||
    selection.head > line.to ||
    !/^[ \t]+$/u.test(line.text)
  ) {
    return false;
  }

  const deleteFrom = selection.head - 1;

  target.dispatchChange({
    from: deleteFrom,
    to: selection.head,
    insert: "",
    selection: {
      anchor: deleteFrom,
      head: deleteFrom
    }
  });

  return true;
}

function runBackspaceFromOrderedListItemContentStartCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);
  const parsed = parseOrderedListCommandLine(currentLine.text);

  if (!parsed || !/^\d+[.)]$/u.test(parsed.marker) || parsed.content.trim().length === 0) {
    return false;
  }

  const contentStart = currentLine.from + parsed.contentStartColumn;

  if (selection.head !== contentStart || currentLine.number <= 1) {
    return false;
  }

  if (!hasPreviousOrderedSiblingInActiveListScope(activeState, selection.head)) {
    return false;
  }

  const previousLine = target.line(currentLine.number - 1);

  if (previousLine.text.trim().length === 0) {
    return false;
  }

  const markerPrefix = currentLine.text.slice(0, parsed.contentStartColumn).trimEnd();
  const insert =
    parsed.quoteSeparatorPrefix === null
      ? `\n\n${markerPrefix}`
      : `\n${parsed.quoteSeparatorPrefix}\n${markerPrefix}`;
  const selectionAnchor = previousLine.to + insert.length;

  target.dispatchChange({
    from: previousLine.to,
    to: contentStart,
    insert,
    selection: {
      anchor: selectionAnchor,
      head: selectionAnchor
    }
  });

  return true;
}

function parseOrderedListCommandLine(lineText: string): {
  content: string;
  contentStartColumn: number;
  marker: string;
  quoteSeparatorPrefix: string | null;
} | null {
  const parsed = parseListLine(lineText);

  if (parsed) {
    return {
      content: parsed.content,
      contentStartColumn: lineText.length - parsed.content.length,
      marker: parsed.marker,
      quoteSeparatorPrefix: null
    };
  }

  const parsedQuote = parseBlockquoteLine(lineText);

  if (!parsedQuote) {
    return null;
  }

  const parsedQuotedList = parseListLine(parsedQuote.content);

  if (!parsedQuotedList) {
    return null;
  }

  return {
    content: parsedQuotedList.content,
    contentStartColumn: lineText.length - parsedQuotedList.content.length,
    marker: parsedQuotedList.marker,
    quoteSeparatorPrefix: buildQuotedStructuralSeparatorPrefix(parsedQuote.sourcePrefix, parsedQuote.quoteDepth)
  };
}

function buildQuotedStructuralSeparatorPrefix(sourcePrefix: string, quoteDepth: number): string {
  return quoteDepth <= 1 ? sourcePrefix.trimEnd() : sourcePrefix;
}

function hasPreviousOrderedSiblingInActiveListScope(
  activeState: ActiveBlockState,
  offset: number
): boolean {
  const activeBlock = activeState.activeBlock;

  if (!activeBlock) {
    return false;
  }

  if (activeBlock.type === "list") {
    return findPreviousOrderedSiblingInListScope(activeBlock, offset) === true;
  }

  if (activeBlock.type !== "blockquote" || !activeBlock.innerBlocks) {
    return false;
  }

  return findPreviousOrderedSiblingInBlocks(activeBlock.innerBlocks, offset) === true;
}

function findPreviousOrderedSiblingInBlocks(
  blocks: readonly MarkdownBlock[],
  offset: number
): boolean | null {
  for (const block of blocks) {
    if (block.type !== "list") {
      continue;
    }

    const result = findPreviousOrderedSiblingInListScope(block, offset);

    if (result !== null) {
      return result;
    }
  }

  return null;
}

function findPreviousOrderedSiblingInListScope(
  list: ListBlock,
  offset: number
): boolean | null {
  for (const [index, item] of list.items.entries()) {
    for (const child of item.children) {
      if (offset >= child.startOffset && offset <= child.endOffset) {
        const nestedResult = findPreviousOrderedSiblingInListScope(child, offset);

        if (nestedResult !== null) {
          return nestedResult;
        }
      }
    }

    if (offset >= item.startOffset && offset <= item.endOffset) {
      return list.ordered ? index > 0 : false;
    }
  }

  return null;
}

function isHiddenSeparatorLine(
  target: MarkdownCommandTarget,
  lineNumber: number,
  activeState?: ActiveBlockState
): boolean {
  if (lineNumber < 1 || lineNumber > target.getLineCount()) {
    return false;
  }

  const line = target.line(lineNumber);

  if (line.text.length !== 0) {
    return false;
  }

  if (isLeadingStyledBlockSeparatorLine(lineNumber, activeState)) {
    return true;
  }

  let emptyRunIndex = 1;

  for (let previousLineNumber = lineNumber - 1; previousLineNumber >= 1; previousLineNumber -= 1) {
    const previousLine = target.line(previousLineNumber);

    if (previousLine.text.length !== 0) {
      break;
    }

    emptyRunIndex += 1;
  }

  return emptyRunIndex % 2 === 1;
}

function isLeadingStyledBlockSeparatorLine(
  lineNumber: number,
  activeState: ActiveBlockState | undefined
): boolean {
  const blocks = activeState?.blockMap?.blocks ?? [];
  const nextBlock = blocks.find((block) => block.startLine === lineNumber + 1);

  return nextBlock ? blockRequiresLeadingStructuralSeparator(nextBlock) : false;
}

function findPreviousVisiblePhysicalLine(
  target: MarkdownCommandTarget,
  currentLineNumber: number,
  activeState?: ActiveBlockState
): MarkdownCommandLine | null {
  for (let lineNumber = currentLineNumber - 1; lineNumber >= 1; lineNumber -= 1) {
    if (!isHiddenSeparatorLine(target, lineNumber, activeState)) {
      return target.line(lineNumber);
    }
  }

  return null;
}

function findNextVisiblePhysicalLine(
  target: MarkdownCommandTarget,
  currentLineNumber: number,
  activeState?: ActiveBlockState
): MarkdownCommandLine | null {
  for (let lineNumber = currentLineNumber + 1; lineNumber <= target.getLineCount(); lineNumber += 1) {
    if (!isHiddenSeparatorLine(target, lineNumber, activeState)) {
      return target.line(lineNumber);
    }
  }

  return null;
}

function resolveArrowUpAnchor(
  currentLine: MarkdownCommandLine,
  previousLine: MarkdownCommandLine,
  selectionHead: number
): number {
  if (currentLine.text.length === 0) {
    return previousLine.text.length === 0 ? previousLine.from : previousLine.to;
  }

  const column = Math.max(0, selectionHead - currentLine.from);

  return previousLine.from + Math.min(column, previousLine.text.length);
}

function resolveArrowDownAnchor(
  currentLine: MarkdownCommandLine,
  nextLine: MarkdownCommandLine,
  selectionHead: number
): number {
  const column = Math.max(0, selectionHead - currentLine.from);

  return nextLine.from + Math.min(column, nextLine.text.length);
}

function runVisibleLineArrowUpCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);

  if (currentLine.number <= 1) {
    return false;
  }

  const previousLine = target.line(currentLine.number - 1);
  const currentLineIsHiddenSeparator = isHiddenSeparatorLine(target, currentLine.number, activeState);

  if (!currentLineIsHiddenSeparator && !isHiddenSeparatorLine(target, previousLine.number, activeState)) {
    return false;
  }

  const previousVisibleLine = findPreviousVisiblePhysicalLine(target, currentLine.number, activeState);

  if (!previousVisibleLine) {
    return false;
  }

  const anchor = resolveArrowUpAnchor(currentLine, previousVisibleLine, selection.head);

  target.dispatchSelection({
    anchor,
    head: anchor,
    scrollIntoView: true
  });

  return true;
}

function runVisibleLineArrowDownCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);

  if (currentLine.number >= target.getLineCount()) {
    return false;
  }

  const nextLine = target.line(currentLine.number + 1);
  const currentLineIsHiddenSeparator = isHiddenSeparatorLine(target, currentLine.number, activeState);

  if (!currentLineIsHiddenSeparator && !isHiddenSeparatorLine(target, nextLine.number, activeState)) {
    return false;
  }

  const nextVisibleLine = findNextVisiblePhysicalLine(target, currentLine.number, activeState);

  if (!nextVisibleLine) {
    return false;
  }

  const anchor = resolveArrowDownAnchor(currentLine, nextVisibleLine, selection.head);

  target.dispatchSelection({
    anchor,
    head: anchor,
    scrollIntoView: true
  });

  return true;
}
