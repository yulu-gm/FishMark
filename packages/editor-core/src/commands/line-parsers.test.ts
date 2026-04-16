import { describe, expect, it } from "vitest";

import {
  buildContinuationPrefix,
  getBackspaceLineStart,
  getCodeFenceEditableAnchor,
  parseBlockquoteLine,
  parseCodeFenceLine,
  parseListLine
} from "./line-parsers";

describe("line-parsers", () => {
  it("parses task list lines and preserves checkbox state", () => {
    expect(parseListLine("  2. [x] done")).toEqual({
      indent: "  ",
      marker: "2.",
      task: {
        checked: true
      },
      content: "done"
    });
  });

  it("builds continuation prefixes for ordered task lists", () => {
    expect(
      buildContinuationPrefix({
        indent: "  ",
        marker: "2.",
        task: {
          checked: false
        },
        content: "todo"
      })
    ).toBe("  3. [ ] ");
  });

  it("parses blockquote and code fence markers", () => {
    expect(parseBlockquoteLine("  > quote")).toEqual({
      indent: "  ",
      content: "quote"
    });
    expect(parseCodeFenceLine(" ```ts")).toEqual({
      indent: " ",
      fence: "```"
    });
  });

  it("treats the EOF position after a trailing newline as its own backspace line start", () => {
    const source = "```ts\nconst answer = 42;\n```\n";

    expect(getBackspaceLineStart(source, source.length, source.length - 1)).toBe(source.length);
  });

  it("places the reopened code fence caret at the end of the last code line", () => {
    const source = "```ts\nconst answer = 42;\nconsole.log(answer);\n```";

    expect(getCodeFenceEditableAnchor(source, { startOffset: 0, endOffset: source.length })).toBe(
      source.indexOf("```", source.indexOf("console.log")) - 1
    );
  });
});
