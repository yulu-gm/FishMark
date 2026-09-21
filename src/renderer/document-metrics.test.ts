import { describe, expect, it } from "vitest";

import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { getDocumentMetrics } from "./document-metrics";

const metricsFor = (source: string) =>
  getDocumentMetrics(
    createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source))
  );

describe("getDocumentMetrics", () => {
  it("returns 0 for an empty document", () => {
    expect(metricsFor("").meaningfulCharacterCount).toBe(0);
  });

  it("counts non-whitespace characters for English text", () => {
    expect(metricsFor("hello world").meaningfulCharacterCount).toBe(10);
  });

  it("returns stable meaningful character count for Chinese text", () => {
    expect(metricsFor("你好，世界！").meaningfulCharacterCount).toBe(6);
  });

  it("does not count leading/trailing whitespace and empty lines as meaningful characters", () => {
    expect(metricsFor("\n\n  你好 世界  \n\n").meaningfulCharacterCount).toBe(4);
  });

  it("does not count unordered list Markdown markers as meaningful characters", () => {
    expect(metricsFor("- content1").meaningfulCharacterCount).toBe(8);
  });

  it("does not count task list, heading, or inline Markdown syntax markers as meaningful characters", () => {
    expect(metricsFor("- [x] done\n# **标题**").meaningfulCharacterCount).toBe(6);
  });

  it("uses canonical table-cell inline data instead of reparsing cells", () => {
    expect(
      metricsFor([
        "| name | value |",
        "| --- | --- |",
        "| **bold** | x y |"
      ].join("\n")).meaningfulCharacterCount
    ).toBe(15);
  });

  it("counts nested code content without container or fence markers", () => {
    expect(
      metricsFor([
        "> ```ts",
        "> const value = 1;",
        "> ```"
      ].join("\n")).meaningfulCharacterCount
    ).toBe("constvalue=1;".length);
  });
});
