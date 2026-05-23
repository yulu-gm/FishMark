import type { Decoration } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { beforeEach, describe, expect, it } from "vitest";

import { appendCodeHighlightRanges } from "./code-highlight";
import {
  clearCodeHighlightCache,
  CODE_HIGHLIGHT_SYNC_CONTENT_LIMIT,
  getCodeHighlightCacheStats
} from "./code-highlight-cache";
import {
  clearCodeHighlightLanguageLoaderState,
  getCodeHighlightLanguageLoaderStats,
  waitForPendingCodeHighlightLanguageLoads
} from "./code-highlight-language-loader";

function collectHighlightRanges(source: string, info: string): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];

  appendCodeHighlightRanges(source, 0, source.length, info, ranges);

  return ranges;
}

describe("appendCodeHighlightRanges", () => {
  beforeEach(() => {
    clearCodeHighlightCache();
    clearCodeHighlightLanguageLoaderState();
  });

  it("loads common JavaScript fence parsers on demand and highlights after the chunk is ready", async () => {
    const source = "const answer = 42;";

    expect(collectHighlightRanges(source, "js")).toEqual([]);
    expect(getCodeHighlightLanguageLoaderStats()).toMatchObject({
      requestedLoads: 1,
      loadedParsers: 0
    });

    await waitForPendingCodeHighlightLanguageLoads();

    expect(collectHighlightRanges(source, "js").length).toBeGreaterThan(0);
    expect(getCodeHighlightLanguageLoaderStats()).toMatchObject({
      requestedLoads: 1,
      loadedParsers: 1
    });
  });

  it.each([
    ["c++", "int main() { return 0; }"],
    ["cpp", "int main() { return 0; }"],
    ["rust", "fn main() { println!(\"hi\"); }"],
    ["go", "package main\nfunc main() {}"],
    ["java", "class Main { public static void main(String[] args) {} }"]
  ])("loads %s fence parser on demand and highlights after the chunk is ready", async (info, source) => {
    expect(collectHighlightRanges(source, info)).toEqual([]);
    expect(getCodeHighlightLanguageLoaderStats()).toMatchObject({
      requestedLoads: 1,
      loadedParsers: 0
    });

    await waitForPendingCodeHighlightLanguageLoads();

    expect(collectHighlightRanges(source, info).length).toBeGreaterThan(0);
    expect(getCodeHighlightLanguageLoaderStats()).toMatchObject({
      requestedLoads: 1,
      loadedParsers: 1
    });

    clearCodeHighlightCache();
    clearCodeHighlightLanguageLoaderState();
  });

  it("leaves low-frequency language fences unhighlighted instead of eager-loading parsers", () => {
    const ranges = collectHighlightRanges("SELECT * FROM notes;", "sql");

    expect(ranges).toEqual([]);
    expect(getCodeHighlightLanguageLoaderStats()).toMatchObject({
      requestedLoads: 0,
      loadedParsers: 0
    });
  });

  it("reuses cached highlight ranges for the same language and code content", async () => {
    const source = "const answer = 42;";

    expect(collectHighlightRanges(source, "js")).toEqual([]);
    await waitForPendingCodeHighlightLanguageLoads();

    expect(collectHighlightRanges(source, "js").length).toBeGreaterThan(0);
    expect(collectHighlightRanges(source, "javascript").length).toBeGreaterThan(0);

    expect(getCodeHighlightCacheStats()).toMatchObject({
      hits: 1,
      misses: 1,
      parserRuns: 1
    });
  });

  it("skips synchronous parser work for ultra-long code blocks", () => {
    const source = "const answer = 42;\n".repeat(
      Math.ceil(CODE_HIGHLIGHT_SYNC_CONTENT_LIMIT / "const answer = 42;\n".length) + 1
    );

    expect(collectHighlightRanges(source, "js")).toEqual([]);
    expect(getCodeHighlightCacheStats()).toMatchObject({
      skippedLongBlocks: 1,
      parserRuns: 0
    });
    expect(getCodeHighlightLanguageLoaderStats()).toMatchObject({
      requestedLoads: 0,
      loadedParsers: 0
    });
  });
});
