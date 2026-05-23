// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createActiveBlockStateFromBlockMap, type ActiveBlockState } from "../active-block";
import {
  runMarkdownArrowDownCommand,
  runMarkdownArrowUpCommand,
  runMarkdownBackspaceCommand,
  runMarkdownEnterCommand,
  runMarkdownHardBreakCommand,
  type MarkdownCommandTarget
} from "./markdown-commands";

type TestCommandTarget = MarkdownCommandTarget & {
  getDispatchedChanges: () => unknown[];
  getDispatchedSelections: () => unknown[];
};

function createCommandTarget(input: {
  doc: string;
  anchor: number;
  head?: number;
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
      head: input.head ?? input.anchor,
      empty: input.head === undefined || input.head === input.anchor
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

function createActiveState(source: string, anchor: number): ActiveBlockState {
  return createActiveBlockStateFromBlockMap(parseMarkdownDocument(source), {
    anchor,
    head: anchor
  });
}

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
        head: "Alpha\n".length,
        scrollIntoView: true
      }
    ]);
  });

  it("creates an independent empty paragraph block at paragraph end", () => {
    const target = createCommandTarget({ doc: "Alpha", anchor: "Alpha".length });

    expect(runMarkdownEnterCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "Alpha".length,
        to: "Alpha".length,
        insert: "\n\n",
        selection: {
          anchor: "Alpha\n\n".length,
          head: "Alpha\n\n".length
        }
      }
    ]);
  });

  it("creates a visible active empty paragraph block before an existing next line", () => {
    const source = ["Alpha", "Beta"].join("\n");
    const target = createCommandTarget({ doc: source, anchor: "Alpha".length });

    expect(runMarkdownEnterCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "Alpha".length,
        to: "Alpha".length,
        insert: "\n\n\n",
        selection: {
          anchor: "Alpha\n\n".length,
          head: "Alpha\n\n".length
        }
      }
    ]);
  });

  it("creates an active empty paragraph block at an existing paragraph block start", () => {
    const source = ["Alpha", "", "Beta"].join("\n");
    const blockStart = source.indexOf("Beta");
    const target = createCommandTarget({ doc: source, anchor: blockStart });

    expect(runMarkdownEnterCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: blockStart,
        to: blockStart,
        insert: "\n\n",
        selection: {
          anchor: blockStart + 1,
          head: blockStart + 1
        }
      }
    ]);
  });

  it("replaces a non-empty paragraph selection with a new paragraph block", () => {
    const target = createCommandTarget({
      doc: "AlphaBeta",
      anchor: "Alpha".length,
      head: "AlphaBeta".length
    });

    expect(runMarkdownEnterCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "Alpha".length,
        to: "AlphaBeta".length,
        insert: "\n\n",
        selection: {
          anchor: "Alpha\n\n".length,
          head: "Alpha\n\n".length
        }
      }
    ]);
  });

  it("creates an empty following block after an active thematic break", () => {
    const source = "+++";
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownEnterCommand(target, createActiveState(source, source.length))).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "+++".length,
        to: "+++".length,
        insert: "\n\n",
        selection: {
          anchor: "+++\n\n".length,
          head: "+++\n\n".length
        }
      }
    ]);
  });

  it("preserves the thematic break marker when Enter is pressed inside it", () => {
    const source = "+++";
    const target = createCommandTarget({ doc: source, anchor: 1 });

    expect(runMarkdownEnterCommand(target, createActiveState(source, 1))).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: source.length,
        to: source.length,
        insert: "\n\n",
        selection: {
          anchor: "+++\n\n".length,
          head: "+++\n\n".length
        }
      }
    ]);
  });

  it("falls back to native Enter handling for a thematic break selection", () => {
    const source = "+++";
    const target = createCommandTarget({ doc: source, anchor: 0, head: source.length });

    expect(runMarkdownEnterCommand(target, createActiveState(source, source.length))).toBe(false);
    expect(target.getDispatchedChanges()).toEqual([]);
    expect(target.insertNewlineAndIndent).toHaveBeenCalledTimes(1);
  });

  it("requests cursor scrolling when a custom ArrowDown navigation is handled", () => {
    const target = createCommandTarget({ doc: "Alpha\nBeta", anchor: 0 });

    vi.mocked(target.resolveArrowDown).mockReturnValue({
      anchor: "Alpha\n".length,
      head: "Alpha\n".length
    });

    expect(runMarkdownArrowDownCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedSelections()).toEqual([
      {
        anchor: "Alpha\n".length,
        head: "Alpha\n".length,
        scrollIntoView: true
      }
    ]);
  });

  it("inserts an inline hard break on Shift+Enter without creating a structural line", () => {
    const target = createCommandTarget({ doc: "AlphaBeta", anchor: "Alpha".length });

    expect(runMarkdownHardBreakCommand(target)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "Alpha".length,
        to: "Alpha".length,
        insert: "<br>",
        selection: {
          anchor: "Alpha<br>".length,
          head: "Alpha<br>".length
        }
      }
    ]);
  });

  it("joins body text into the previous list item on Backspace without creating lazy continuation", () => {
    const source = ["1. Tail", "", "Body"].join("\n");
    const target = createCommandTarget({ doc: source, anchor: source.indexOf("Body") });

    expect(runMarkdownBackspaceCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "1. Tail".length,
        to: "1. Tail\n\n".length,
        insert: "",
        selection: {
          anchor: "1. Tail".length,
          head: "1. Tail".length
        }
      }
    ]);
  });

  it("joins paragraph text into the previous paragraph on Backspace across a structural blank separator", () => {
    const source = ["Alpha", "", "Beta"].join("\n");
    const target = createCommandTarget({ doc: source, anchor: source.indexOf("Beta") });

    expect(runMarkdownBackspaceCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "Alpha".length,
        to: "Alpha\n\n".length,
        insert: "",
        selection: {
          anchor: "Alpha".length,
          head: "Alpha".length
        }
      }
    ]);
  });

  it("removes only the visible extra blank row on Backspace before crossing the structural separator", () => {
    const source = ["Alpha", "", "", "Beta"].join("\n");
    const target = createCommandTarget({ doc: source, anchor: source.indexOf("Beta") });

    expect(runMarkdownBackspaceCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "Alpha\n\n".length,
        to: "Alpha\n\n\n".length,
        insert: "",
        selection: {
          anchor: "Alpha\n\n".length,
          head: "Alpha\n\n".length
        }
      }
    ]);
  });
});
