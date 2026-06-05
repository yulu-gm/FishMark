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
    runTableBackspaceFromLineBelow: vi.fn(() => false),
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

const headingActiveState = {
  activeBlock: {
    type: "heading"
  }
} as ActiveBlockState;

const noActiveBlockState = {
  activeBlock: null
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

  it("commits a bare blockquote marker when Enter is pressed after it", () => {
    const target = createCommandTarget({ doc: ">", anchor: 1 });

    expect(runMarkdownEnterCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([{
      from: 1,
      to: 1,
      insert: " \n> ",
      selection: {
        anchor: 5,
        head: 5
      }
    }]);
  });

  it("commits a nested blockquote marker when Enter is pressed after it", () => {
    const source = "> >";
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownEnterCommand(target, createActiveState(source, source.length))).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([{
      from: source.length,
      to: source.length,
      insert: " \n> > ",
      selection: {
        anchor: "> > \n> > ".length,
        head: "> > \n> > ".length
      }
    }]);
  });

  it("moves across blank lines through the editor command target", () => {
    const target = createCommandTarget({ doc: "Alpha\n\n", anchor: "Alpha\n\n".length });

    expect(runMarkdownArrowUpCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedSelections()).toEqual([
      {
        anchor: "Alpha".length,
        head: "Alpha".length,
        scrollIntoView: true
      }
    ]);
  });

  it("skips the hidden separator when ArrowUp moves between trailing visible empty paragraphs", () => {
    const source = "# Title\n\n\n\n";
    const visiblePreviousEmptyLineStart = "# Title\n\n".length;
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownArrowUpCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedSelections()).toEqual([
      {
        anchor: visiblePreviousEmptyLineStart,
        head: visiblePreviousEmptyLineStart,
        scrollIntoView: true
      }
    ]);
  });

  it("leaves an active trailing separator line on ArrowUp in one step", () => {
    const source = "# Title\n\n\n";
    const visiblePreviousEmptyLineStart = "# Title\n\n".length;
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownArrowUpCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedSelections()).toEqual([
      {
        anchor: visiblePreviousEmptyLineStart,
        head: visiblePreviousEmptyLineStart,
        scrollIntoView: true
      }
    ]);
  });

  it("skips the hidden separator when ArrowDown moves between trailing visible empty paragraphs", () => {
    const source = "# Title\n\n\n\n";
    const visiblePreviousEmptyLineStart = "# Title\n\n".length;
    const target = createCommandTarget({ doc: source, anchor: visiblePreviousEmptyLineStart });

    expect(runMarkdownArrowDownCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedSelections()).toEqual([
      {
        anchor: source.length,
        head: source.length,
        scrollIntoView: true
      }
    ]);
  });

  it("skips alternating and block-leading structural separators around a table", () => {
    const source = ["+++", "", "", "", "", "| a | b |", "| - | - |"].join("\n");
    const tableStart = source.indexOf("| a");
    const visibleBlankBeforeTable = "+++\n\n".length;
    const activeState = createActiveState(source, tableStart);
    const upTarget = createCommandTarget({ doc: source, anchor: tableStart });
    const downTarget = createCommandTarget({ doc: source, anchor: visibleBlankBeforeTable });

    expect(runMarkdownArrowUpCommand(upTarget, activeState)).toBe(true);
    expect(upTarget.getDispatchedSelections()).toEqual([
      {
        anchor: visibleBlankBeforeTable,
        head: visibleBlankBeforeTable,
        scrollIntoView: true
      }
    ]);

    expect(runMarkdownArrowDownCommand(downTarget, activeState)).toBe(true);
    expect(downTarget.getDispatchedSelections()).toEqual([
      {
        anchor: tableStart,
        head: tableStart,
        scrollIntoView: true
      }
    ]);
  });

  it("enters a whitespace-only line when ArrowUp leaves the empty paragraph below it", () => {
    const source = "   \n\n";
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownArrowUpCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedSelections()).toEqual([
      {
        anchor: "   ".length,
        head: "   ".length,
        scrollIntoView: true
      }
    ]);
  });

  it("skips the hidden separator when ArrowDown leaves a whitespace-only line", () => {
    const source = "   \n\n";
    const target = createCommandTarget({ doc: source, anchor: 0 });

    expect(runMarkdownArrowDownCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedSelections()).toEqual([
      {
        anchor: source.length,
        head: source.length,
        scrollIntoView: true
      }
    ]);
  });

  it("lets native ArrowUp geometry handle the current whitespace-only physical line", () => {
    const source = ["", "   "].join("\n");
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownArrowUpCommand(target, paragraphActiveState)).toBe(false);
    expect(target.getDispatchedSelections()).toEqual([]);
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

  it("creates an independent empty paragraph block at heading end", () => {
    const source = "# Title";
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownEnterCommand(target, headingActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: source.length,
        to: source.length,
        insert: "\n\n",
        selection: {
          anchor: `${source}\n\n`.length,
          head: `${source}\n\n`.length
        }
      }
    ]);
  });

  it("uses physical paragraph fallback on Enter from an empty physical line without an active semantic block", () => {
    const source = "# Title\n\n";
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownEnterCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: source.length,
        to: source.length,
        insert: "\n\n",
        selection: {
          anchor: `${source}\n\n`.length,
          head: `${source}\n\n`.length
        }
      }
    ]);
  });

  it("uses Typora paragraph spacing on Enter at a whitespace-only physical line end without deleting spaces", () => {
    const source = ["Alpha", "   ", "Beta"].join("\n");
    const anchor = source.indexOf("Beta") - 1;
    const target = createCommandTarget({ doc: source, anchor });

    expect(runMarkdownEnterCommand(target, paragraphActiveState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: anchor,
        to: anchor,
        insert: "\n\n",
        selection: {
          anchor: anchor + 2,
          head: anchor + 2
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

  it("breaks ordered quote list rendering on Backspace at content start", () => {
    const source = ["> 1. 内容", "> 2. 内容2", "> 3. 内容3"].join("\n");
    const cursor = source.indexOf("内容2");
    const target = createCommandTarget({ doc: source, anchor: cursor });
    const insert = "\n>\n> 2.";
    const previousLineEnd = "> 1. 内容".length;

    expect(runMarkdownBackspaceCommand(target, createActiveState(source, cursor))).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: previousLineEnd,
        to: cursor,
        insert,
        selection: {
          anchor: previousLineEnd + insert.length,
          head: previousLineEnd + insert.length
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

  it("removes the current empty paragraph pair on Backspace from repeated trailing empty paragraphs", () => {
    const source = "# Title\n\n\n\n";
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownBackspaceCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "# Title\n\n".length,
        to: source.length,
        insert: "",
        selection: {
          anchor: "# Title\n\n".length,
          head: "# Title\n\n".length
        }
      }
    ]);
  });

  it("returns from an empty paragraph below a whitespace-only line in one Backspace", () => {
    const source = "   \n\n";
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownBackspaceCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: "   ".length,
        to: source.length,
        insert: "",
        selection: {
          anchor: "   ".length,
          head: "   ".length
        }
      }
    ]);
  });

  it("removes only the current empty paragraph below an ordered list on Backspace", () => {
    const source = "1. 1\n\n\n\n";
    const previousVisibleEmptyLineStart = "1. 1\n\n".length;
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownBackspaceCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: previousVisibleEmptyLineStart,
        to: source.length,
        insert: "",
        selection: {
          anchor: previousVisibleEmptyLineStart,
          head: previousVisibleEmptyLineStart
        }
      }
    ]);
  });

  it("leaves an active trailing separator line below an ordered list on Backspace", () => {
    const source = "1. 1\n\n\n";
    const previousVisibleEmptyLineStart = "1. 1\n\n".length;
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownBackspaceCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: previousVisibleEmptyLineStart,
        to: source.length,
        insert: "",
        selection: {
          anchor: previousVisibleEmptyLineStart,
          head: previousVisibleEmptyLineStart
        }
      }
    ]);
  });

  it("returns to the whitespace-only line below an ordered list on Backspace", () => {
    const source = "1. 1\n   \n\n";
    const whitespaceLineEnd = "1. 1\n   ".length;
    const target = createCommandTarget({ doc: source, anchor: source.length });

    expect(runMarkdownBackspaceCommand(target, noActiveBlockState)).toBe(true);
    expect(target.getDispatchedChanges()).toEqual([
      {
        from: whitespaceLineEnd,
        to: source.length,
        insert: "",
        selection: {
          anchor: whitespaceLineEnd,
          head: whitespaceLineEnd
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

  it("routes Backspace from the editable line below a table before deleting blank lines", () => {
    const source = ["| A | B |", "| --- | --- |", "| 1 | 2 |", "", ""].join("\n");
    const activeState = {
      activeBlock: null,
      tableCursor: {
        mode: "adjacent-below",
        tableStartOffset: 0,
        row: 1,
        column: 0,
        offsetInCell: 0
      }
    } as ActiveBlockState;
    const target = createCommandTarget({ doc: source, anchor: source.length });

    vi.mocked(target.runTableBackspaceFromLineBelow).mockReturnValue(true);

    expect(runMarkdownBackspaceCommand(target, activeState)).toBe(true);
    expect(target.runTableBackspaceFromLineBelow).toHaveBeenCalledWith(activeState);
    expect(target.getDispatchedChanges()).toEqual([]);
  });
});
