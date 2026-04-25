// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { ActiveBlockState } from "../active-block";
import {
  runMarkdownArrowUpCommand,
  runMarkdownEnterCommand,
  type MarkdownCommandTarget
} from "./markdown-commands";

type TestCommandTarget = MarkdownCommandTarget & {
  getDispatchedChanges: () => unknown[];
  getDispatchedSelections: () => unknown[];
};

function createCommandTarget(input: {
  doc: string;
  anchor: number;
}): TestCommandTarget {
  const lines = input.doc.split("\n");
  const lineStarts = lines.reduce<number[]>((starts, _line, index) => {
    starts.push(index === 0 ? 0 : starts[index - 1]! + lines[index - 1]!.length + 1);
    return starts;
  }, []);
  const dispatchedChanges: unknown[] = [];
  const dispatchedSelections: unknown[] = [];

  return {
    deleteCharBackward: vi.fn(() => false),
    dispatchChange: vi.fn((change) => {
      dispatchedChanges.push(change);
    }),
    dispatchSelection: vi.fn((selection) => {
      dispatchedSelections.push(selection);
    }),
    getDispatchedChanges: () => dispatchedChanges,
    getDispatchedSelections: () => dispatchedSelections,
    getLineCount: () => lines.length,
    getSelection: () => ({
      anchor: input.anchor,
      head: input.anchor,
      empty: true
    }),
    insertNewlineAndIndent: vi.fn(() => false),
    line: (lineNumber) => {
      const text = lines[lineNumber - 1]!;
      const from = lineStarts[lineNumber - 1]!;
      return {
        from,
        number: lineNumber,
        text,
        to: from + text.length
      };
    },
    lineAt: (position) => {
      let lineIndex = 0;

      for (let index = 0; index < lineStarts.length; index += 1) {
        if (lineStarts[index]! <= position) {
          lineIndex = index;
        }
      }

      const number = lineIndex + 1;
      const text = lines[lineIndex]!;
      const from = lineStarts[lineIndex]!;
      return {
        from,
        number,
        text,
        to: from + text.length
      };
    },
    resolveArrowDown: vi.fn(() => null),
    resolveArrowUp: vi.fn(() => null),
    runBlockquoteBackspace: vi.fn(() => false),
    runBlockquoteEnter: vi.fn(() => false),
    runCodeFenceBackspace: vi.fn(() => false),
    runCodeFenceEnter: vi.fn(() => false),
    runListBackspace: vi.fn(() => false),
    runListEnter: vi.fn(() => false),
    runListIndentOnTab: vi.fn(() => false),
    runListOutdentOnShiftTab: vi.fn(() => false),
    runTableMoveDownOrExit: vi.fn(() => false),
    runTableNextCell: vi.fn(() => false),
    runTablePreviousCell: vi.fn(() => false)
  };
}

const paragraphActiveState = {
  activeBlock: {
    type: "paragraph"
  }
} as ActiveBlockState;

describe("semantic markdown commands", () => {
  it("converts a draft table without requiring a CodeMirror EditorView", () => {
    const target = createCommandTarget({ doc: "| name | qty |", anchor: "| name | qty |".length });

    expect(runMarkdownEnterCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      expect.objectContaining({
        from: 0,
        to: "| name | qty |".length
      })
    ]);
  });

  it("moves across blank lines through the editor command target", () => {
    const target = createCommandTarget({ doc: "Alpha\n\n", anchor: "Alpha\n\n".length });

    expect(runMarkdownArrowUpCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedSelections()).toEqual([
      {
        anchor: "Alpha\n".length,
        head: "Alpha\n".length
      }
    ]);
  });
});
