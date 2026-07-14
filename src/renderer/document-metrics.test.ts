import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { getDocumentMetrics } from "./document-metrics";

describe("getDocumentMetrics", () => {
  it("returns 0 for an empty document", () => {
    expect(getDocumentMetrics("").meaningfulCharacterCount).toBe(0);
  });

  it("counts non-whitespace characters for English text", () => {
    expect(getDocumentMetrics("hello world").meaningfulCharacterCount).toBe(10);
  });

  it("returns stable meaningful character count for Chinese text", () => {
    expect(getDocumentMetrics("你好，世界！").meaningfulCharacterCount).toBe(6);
  });

  it("does not count leading/trailing whitespace and empty lines as meaningful characters", () => {
    expect(getDocumentMetrics("\n\n  你好 世界  \n\n").meaningfulCharacterCount).toBe(4);
  });

  it("does not count unordered list Markdown markers as meaningful characters", () => {
    expect(getDocumentMetrics("- content1").meaningfulCharacterCount).toBe(8);
  });

  it("does not count task list, heading, or inline Markdown syntax markers as meaningful characters", () => {
    expect(getDocumentMetrics("- [x] done\n# **标题**").meaningfulCharacterCount).toBe(6);
  });

  it("keeps the default parser behavior unchanged when parser instrumentation is omitted", () => {
    const source = "# **Title**\n\n- item";

    expect(getDocumentMetrics(source)).toEqual(
      getDocumentMetrics(source, { parseMarkdownDocument })
    );
  });

  it("uses an injected document parser exactly once", () => {
    const source = "# Title";
    let parseCalls = 0;

    expect(
      getDocumentMetrics(source, {
        parseMarkdownDocument(value) {
          parseCalls += 1;
          return parseMarkdownDocument(value);
        }
      })
    ).toEqual({ meaningfulCharacterCount: 5 });
    expect(parseCalls).toBe(1);
  });
});
