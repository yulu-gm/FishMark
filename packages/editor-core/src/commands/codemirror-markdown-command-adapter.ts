import { deleteCharBackward, insertNewlineAndIndent } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

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
import type { MarkdownCommandTarget } from "./markdown-commands";
import {
  runTableMoveDownOrExit,
  runTableNextCell,
  runTablePreviousCell
} from "./table-commands";

export function createCodeMirrorMarkdownCommandTarget(view: EditorView): MarkdownCommandTarget {
  return {
    deleteCharBackward: () => deleteCharBackward(view),
    dispatchChange: (input) => {
      view.dispatch({
        changes: {
          from: input.from,
          to: input.to,
          insert: input.insert
        },
        selection: input.selection
          ? {
              anchor: input.selection.anchor,
              head: input.selection.head ?? input.selection.anchor
            }
          : undefined
      });
    },
    dispatchSelection: (selection) => {
      view.dispatch({
        selection:
          selection.goalColumn === undefined
            ? {
                anchor: selection.anchor,
                head: selection.head ?? selection.anchor
              }
            : EditorSelection.cursor(selection.anchor, 0, undefined, selection.goalColumn)
      });
    },
    getLineCount: () => view.state.doc.lines,
    getSelection: () => {
      const selection = view.state.selection.main;

      return {
        anchor: selection.anchor,
        empty: selection.empty,
        head: selection.head
      };
    },
    insertNewlineAndIndent: () => insertNewlineAndIndent(view),
    line: (lineNumber) => view.state.doc.line(lineNumber),
    lineAt: (position) => view.state.doc.lineAt(position),
    resolveArrowDown: (activeState) => resolveArrowDown(view, activeState),
    resolveArrowUp: (activeState) => resolveArrowUp(view, activeState),
    runBlockquoteBackspace: (activeState) => runBlockquoteBackspace(view, activeState),
    runBlockquoteEnter: () => runBlockquoteEnter(view),
    runCodeFenceBackspace: (activeState) => runCodeFenceBackspace(view, activeState),
    runCodeFenceEnter: (activeState) => runCodeFenceEnter(view, activeState),
    runListBackspace: (activeState) => runListBackspace(view, activeState),
    runListEnter: (activeState) => runListEnter(view, activeState),
    runListIndentOnTab: (activeState) => runListIndentOnTab(view, activeState),
    runListOutdentOnShiftTab: (activeState) => runListOutdentOnShiftTab(view, activeState),
    runTableMoveDownOrExit: (activeState) => runTableMoveDownOrExit(view, activeState),
    runTableNextCell: (activeState) => runTableNextCell(view, activeState),
    runTablePreviousCell: (activeState) => runTablePreviousCell(view, activeState)
  };
}

export function runCodeMirrorMarkdownCommand(
  view: EditorView,
  activeState: ActiveBlockState,
  command: (target: MarkdownCommandTarget, activeState: ActiveBlockState) => boolean
): boolean {
  return command(createCodeMirrorMarkdownCommandTarget(view), activeState);
}
