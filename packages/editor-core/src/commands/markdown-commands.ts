import { formatTableMarkdown, parseMarkdownDocument, splitTableLine } from "@fishmark/markdown-engine";

import type { ActiveBlockState } from "../active-block";

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
    target.runBlockquoteEnter() ||
    runParagraphBlockEnterCommand(target, activeState) ||
    target.insertNewlineAndIndent()
  );
}

export function runMarkdownBackspaceCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  return (
    target.runCodeFenceBackspace(activeState) ||
    target.runBlockquoteBackspace(activeState) ||
    target.runListBackspace(activeState) ||
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
    return false;
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
    return runBlankLineArrowUpCommand(target);
  }

  target.dispatchSelection({
    ...result,
    scrollIntoView: true
  });
  return true;
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

function runParagraphBlockEnterCommand(
  target: MarkdownCommandTarget,
  activeState: ActiveBlockState
): boolean {
  if (activeState.activeBlock?.type !== "paragraph") {
    return false;
  }

  const selection = target.getSelection();
  const from = Math.min(selection.anchor, selection.head);
  const to = Math.max(selection.anchor, selection.head);
  const insert = shouldUseExistingBlockBoundaryForEnter(target, selection) ? "\n" : "\n\n";

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

function shouldUseExistingBlockBoundaryForEnter(
  target: MarkdownCommandTarget,
  selection: MarkdownCommandSelection
): boolean {
  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);

  if (selection.head !== currentLine.from || currentLine.number <= 1) {
    return false;
  }

  const previousLine = target.line(currentLine.number - 1);

  return previousLine.text.trim().length === 0;
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

  if (previousLine.text.trim().length !== 0) {
    return false;
  }

  const previousPreviousLine = target.line(currentLine.number - 2);
  const isPreviousLineVisibleExtraBlank = previousPreviousLine.text.trim().length === 0;
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

function runBlankLineArrowUpCommand(target: MarkdownCommandTarget): boolean {
  const selection = target.getSelection();

  if (!selection.empty) {
    return false;
  }

  const currentLine = target.lineAt(selection.head);

  if (currentLine.number <= 1 || currentLine.text.trim().length !== 0) {
    return false;
  }

  const previousLine = target.line(currentLine.number - 1);

  if (previousLine.text.trim().length !== 0) {
    return false;
  }

  target.dispatchSelection({
    anchor: previousLine.from,
    head: previousLine.from,
    scrollIntoView: true
  });

  return true;
}
