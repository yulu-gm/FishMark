import { deleteCharBackward, insertNewlineAndIndent } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { formatTableMarkdown, parseMarkdownDocument, splitTableLine } from "@yulora/markdown-engine";

import type { ActiveBlockState } from "../active-block";
import { resolveArrowDown, resolveArrowUp } from "../interactions";
import { runBlockquoteBackspace, runBlockquoteEnter } from "./blockquote-commands";
import {
  runCodeFenceBackspace,
  runCodeFenceEnter
} from "./code-fence-commands";
import {
  runListBackspace,
  runListEnter,
  runListIndentOnTab,
  runListOutdentOnShiftTab
} from "./list-commands";
import {
  runTableMoveDownOrExit,
  runTableNextCell,
  runTablePreviousCell
} from "./table-commands";

export function runMarkdownEnter(view: EditorView, activeState: ActiveBlockState): boolean {
  return (
    runTableMoveDownOrExit(view, activeState) ||
    runDraftTableEnter(view, activeState) ||
    runCodeFenceEnter(view, activeState) ||
    runListEnter(view, activeState) ||
    runBlockquoteEnter(view) ||
    insertNewlineAndIndent(view)
  );
}

export function runMarkdownBackspace(view: EditorView, activeState: ActiveBlockState): boolean {
  return (
    runCodeFenceBackspace(view, activeState) ||
    runBlockquoteBackspace(view, activeState) ||
    runListBackspace(view, activeState) ||
    deleteCharBackward(view)
  );
}

export function runMarkdownTab(view: EditorView, activeState: ActiveBlockState): boolean {
  return runTableNextCell(view, activeState) || runListIndentOnTab(view, activeState);
}

export function runMarkdownShiftTab(view: EditorView, activeState: ActiveBlockState): boolean {
  return runTablePreviousCell(view, activeState) || runListOutdentOnShiftTab(view, activeState);
}

export function runMarkdownArrowDown(view: EditorView, activeState: ActiveBlockState): boolean {
  const result = resolveArrowDown(view, activeState);

  if (result === null) {
    return false;
  }

  view.dispatch({
    selection: EditorSelection.cursor(result.anchor, 0, undefined, result.goalColumn)
  });

  return true;
}

export function runMarkdownArrowUp(view: EditorView, activeState: ActiveBlockState): boolean {
  const result = resolveArrowUp(view, activeState);

  if (result === null) {
    return runBlankLineArrowUp(view);
  }

  view.dispatch({
    selection: EditorSelection.cursor(result.anchor, 0, undefined, result.goalColumn)
  });

  return true;
}

function runDraftTableEnter(view: EditorView, activeState: ActiveBlockState): boolean {
  if (activeState.activeBlock?.type !== "paragraph") {
    return false;
  }

  const selection = view.state.selection.main;

  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);

  if (selection.head !== line.to) {
    return false;
  }

  const nextLine = line.number < view.state.doc.lines ? view.state.doc.line(line.number + 1) : null;

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

  view.dispatch({
    changes: {
      from: line.from,
      to: line.to,
      insert: tableMarkdown
    },
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

function runBlankLineArrowUp(view: EditorView): boolean {
  const selection = view.state.selection.main;

  if (!selection.empty) {
    return false;
  }

  const currentLine = view.state.doc.lineAt(selection.head);

  if (currentLine.number <= 1 || currentLine.text.trim().length !== 0) {
    return false;
  }

  const previousLine = view.state.doc.line(currentLine.number - 1);

  if (previousLine.text.trim().length !== 0) {
    return false;
  }

  view.dispatch({
    selection: {
      anchor: previousLine.from,
      head: previousLine.from
    }
  });

  return true;
}

