// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createCodeEditorController } from "./code-editor";

// Source/selection contracts retained when retiring the mock MarkdownCommandTarget.
// These exercise the product controller and its real filters, not two aliases of one planner.
type Case = { name: string; key: "enter" | "backspace" | "up" | "down"; source: string; at?: number; head?: number; expected?: string; caret: number };
const cases: Case[] = [
  { name: "bare quote commit", key: "enter", source: ">", expected: "> \n> ", caret: 5 },
  { name: "nested quote commit", key: "enter", source: "> >", expected: "> > \n> > ", caret: 9 },
  { name: "quote fence completion", key: "enter", source: "> ```", expected: "> ```\n> \n> ```", caret: 8 },
  { name: "body fence completion", key: "enter", source: "```", expected: "```\n\n```", caret: 4 },
  { name: "paragraph end", key: "enter", source: "Alpha", expected: "Alpha\n\n", caret: 7 },
  { name: "heading end", key: "enter", source: "# Title", expected: "# Title\n\n", caret: 9 },
  { name: "empty trailing paragraph", key: "enter", source: "# Title\n\n", expected: "# Title\n\n\n\n", caret: 11 },
  { name: "whitespace paragraph end", key: "enter", source: "Alpha\n   \nBeta", at: 9, expected: "Alpha\n   \n\n\nBeta", caret: 11 },
  { name: "paragraph before following line", key: "enter", source: "Alpha\nBeta", at: 5, expected: "Alpha\n\n\n\nBeta", caret: 7 },
  { name: "paragraph start", key: "enter", source: "Alpha\n\nBeta", at: 7, expected: "Alpha\n\n\n\nBeta", caret: 8 },
  { name: "paragraph range replacement", key: "enter", source: "AlphaBeta", at: 5, head: 9, expected: "Alpha\n\n", caret: 7 },
  { name: "thematic break end", key: "enter", source: "+++", expected: "+++\n\n", caret: 5 },
  { name: "thematic break interior", key: "enter", source: "+++", at: 1, expected: "+++\n\n", caret: 5 },
  { name: "up from terminal paragraph", key: "up", source: "Alpha\n\n", caret: 5 },
  { name: "up across trailing hidden separator", key: "up", source: "# Title\n\n\n\n", caret: 9 },
  { name: "up from active trailing separator", key: "up", source: "# Title\n\n\n", caret: 9 },
  { name: "down across trailing hidden separator", key: "down", source: "# Title\n\n\n\n", at: 9, caret: 11 },
  { name: "up from whitespace paragraph below", key: "up", source: "   \n\n", caret: 3 },
  { name: "down from whitespace paragraph", key: "down", source: "   \n\n", at: 0, caret: 5 },
  { name: "join body into preceding list", key: "backspace", source: "1. Tail\n\nBody", at: 9, expected: "1. TailBody", caret: 7 },
  { name: "join across paragraph separator", key: "backspace", source: "Alpha\n\nBeta", at: 7, expected: "AlphaBeta", caret: 5 },
  { name: "remove one repeated trailing paragraph", key: "backspace", source: "# Title\n\n\n\n", expected: "# Title\n\n", caret: 9 },
  { name: "backspace to whitespace paragraph", key: "backspace", source: "   \n\n", expected: "   ", caret: 3 },
  { name: "remove one paragraph after ordered list", key: "backspace", source: "1. 1\n\n\n\n", expected: "1. 1\n\n", caret: 6 },
  { name: "remove trailing separator after ordered list", key: "backspace", source: "1. 1\n\n\n", expected: "1. 1\n\n", caret: 6 },
  { name: "backspace to whitespace after list", key: "backspace", source: "1. 1\n   \n\n", expected: "1. 1\n   ", caret: 8 },
  { name: "remove visible blank before separator", key: "backspace", source: "Alpha\n\n\nBeta", at: 8, expected: "Alpha\n\nBeta", caret: 7 }
];

describe("retained command source and selection contracts", () => {
  it.each(cases)("$name", ({ key, source, at = source.length, head = at, expected = source, caret }) => {
    const host = document.createElement("div");
    document.body.append(host);
    const editor = createCodeEditorController({ parent: host, initialContent: source, onChange: () => undefined });
    try {
      editor.setSelection(at, head);
      if (key === "enter") editor.pressEnter();
      else if (key === "backspace") editor.pressBackspace();
      else if (key === "up") editor.pressArrowUp();
      else editor.pressArrowDown();
      expect(editor.getContent()).toBe(expected);
      expect(editor.getSelection()).toEqual({ anchor: caret, head: caret });
    } finally { editor.destroy(); host.remove(); }
  });
});
