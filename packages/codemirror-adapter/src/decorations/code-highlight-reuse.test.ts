import { RangeSet } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createEditorDerivedSnapshotFromCache, createEditorDerivedState } from "@fishmark/editor-model";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createBlockDecorations } from "./block-decorations";
import { appendCodeHighlightRanges } from "./code-highlight";
import { clearCodeHighlightCache, getCodeHighlightCacheStats } from "./code-highlight-cache";
import { waitForPendingCodeHighlightLanguageLoads } from "./code-highlight-language-loader";

async function loadParser() {
  appendCodeHighlightRanges("const ready = 1;", 0, 16, "ts", []);
  appendCodeHighlightRanges("const ready = 1;", 0, 16, "js", []);
  await waitForPendingCodeHighlightLanguageLoads();
  clearCodeHighlightCache();
}

it("reuses 1000 distinct code blocks at moved offsets and reparses only changed content", async () => {
  await loadParser();
  const blocks = Array.from({ length: 1000 }, (_, i) => `const value${i} = ${i};`);
  const render = (prefix: string) => blocks.map(code => {
    const ranges: Parameters<typeof appendCodeHighlightRanges>[4] = [];
    appendCodeHighlightRanges(prefix + code, prefix.length, prefix.length + code.length, "ts", ranges);
    return ranges.map(range => ({ from: range.from - prefix.length, to: range.to - prefix.length,
      className: range.value.spec.class }));
  });
  const original = render("");
  expect(getCodeHighlightCacheStats().parserRuns).toBe(1000);
  expect(render("paragraph shifted\n\n")).toEqual(original);
  expect(getCodeHighlightCacheStats()).toMatchObject({ parserRuns: 1000, hits: 1000, evictions: 0 });
  blocks[500] = "let changed = 'different';";
  const changed = render("X");
  expect(getCodeHighlightCacheStats().parserRuns).toBe(1001);
  expect(changed[500]).not.toEqual(original[500]);
  clearCodeHighlightCache();
  expect(render("X")).toEqual(changed);
});

it("isolates loaded TypeScript and JavaScript parsers for identical code", async () => {
  await loadParser();
  const code = "type Alias = number;";
  const render = (language: string) => {
    const ranges: Parameters<typeof appendCodeHighlightRanges>[4] = [];
    appendCodeHighlightRanges(code, 0, code.length, language, ranges);
    return ranges.map(range => ({ from: range.from, to: range.to, className: range.value.spec.class }));
  };
  const typescript = render("ts"), javascript = render("js");
  expect(typescript.length).toBeGreaterThan(0);
  expect(javascript.length).toBeGreaterThan(0);
  expect(typescript).not.toEqual(javascript);
  expect(getCodeHighlightCacheStats()).toMatchObject({ parserRuns: 2, hits: 0 });
  expect(render("typescript")).toEqual(typescript);
  expect(render("javascript")).toEqual(javascript);
  expect(getCodeHighlightCacheStats()).toMatchObject({ parserRuns: 2, hits: 2 });
  clearCodeHighlightCache();
  expect(render("js")).toEqual(javascript);
  expect(render("ts")).toEqual(typescript);
});
const mixed = ["Paragraph **bold** [ref] [^note].", "", "```ts", "const top = 1;", "```", "",
  "> - Nested **body**", ">", ">   ```ts", ">   const nested = 2;", ">   ```", "",
  "| Head | Value |", "| --- | --- |", "| cell | ![table](./cell.png) |", "",
  "![image](./image.png)", "", "[ref]: /first \"First\"", "", "[^note]: Footnote", ""].join("\n");

describe("warm relative tokens versus cold full decoration rebuild", () => {
  it.each(["reading", "editing"] as const)("keeps all decorations and widget context correct in %s", async mode => {
    await loadParser();
    const build = (source: string, head: number, viewMode: "source" | "wysiwym") => {
      const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
      const derived = createEditorDerivedState({ snapshot, selection: { anchor: head, head } });
      return createBlockDecorations({ ...derived, snapshot, hasEditorFocus: true, viewMode,
        headingMarkerPresentation: { mode, revealed: null }, resolveImagePreviewUrl: href => href });
    };
    for (const source of [mixed, "X\n\n" + mixed, mixed, mixed.replace("/first", "/second"),
      mixed.replace("Footnote", "Updated note"), mixed.replace("const top = 1", "let top = 'new'"),
      mixed.replace("```ts", "```js"), mixed.replace("cell.png", "changed.png"), mixed]) {
      for (const viewMode of ["wysiwym", "source", "wysiwym"] as const) {
        for (const head of [4, source.indexOf("const nested"), source.indexOf("cell |"), source.length]) {
          const warm = build(source, head, viewMode);
          clearCodeHighlightCache();
          const cold = build(source, head, viewMode);
          expect(warm.signature).toBe(cold.signature);
          expect(RangeSet.eq([warm.decorationSet], [cold.decorationSet])).toBe(true);
          const a = warm.decorationSet.iter(), b = cold.decorationSet.iter();
          while (a.value && b.value) {
            // Every widget still has a fresh owner; token reuse never carries
            // the previous source, absolute position, resolver or callbacks.
            if (a.value.spec.widget) expect(a.value.spec.widget).not.toBe(b.value.spec.widget);
            a.next(); b.next();
          }
        }
      }
    }
  });
});
