import { expect, it } from "vitest";
import type { MarkdownBlock } from "../block-map";
import type { SourceText } from "../source-text";
import { mergeLeafSiblingBlocks } from "./leaf-blocks";

it("does bounded source work when rejecting tables in repeated ordinary paragraphs", () => {
  const texts = Array.from({ length: 2000 }, (_, index) => `Plain paragraph ${index}`);
  const source = texts.join("\n\n");
  let offset = 0;
  const blocks: MarkdownBlock[] = texts.map((text, index) => {
    const startOffset = offset;
    offset += text.length + 2;
    return { id: `p${index}`, type: "paragraph", startOffset, endOffset: startOffset + text.length,
      startLine: index * 2 + 1, endLine: index * 2 + 1 };
  });
  let scannedCharacters = 0;
  const measured: SourceText = {
    length: source.length,
    slice: (start, end) => {
      const result = source.slice(start, end);
      scannedCharacters += result.length;
      return result;
    },
    charAt: (index) => source.charAt(index),
    indexOf: (text, position) => source.indexOf(text, position)
  };
  expect(mergeLeafSiblingBlocks(blocks, measured)).toEqual(blocks);
  expect(scannedCharacters).toBeLessThan(source.length * 5);
});

it("keeps compact split table recognition and loose blank-separated rows", () => {
  for (const [lines, separator, hasHeader] of [
    [["| a | b |", "| --- | --- |"], "\n", true],
    [["| a | b |", "| c | d |"], "\n\n", false]
  ] as const) {
    const source = lines.join(separator);
    const second = lines[0].length + separator.length;
    const blocks: MarkdownBlock[] = [
      { id: "a", type: "paragraph", startOffset: 0, endOffset: lines[0].length, startLine: 1, endLine: 1 },
      { id: "b", type: "paragraph", startOffset: second, endOffset: source.length,
        startLine: separator.length + 1, endLine: separator.length + 1 }
    ];
    expect(mergeLeafSiblingBlocks(blocks, source)).toMatchObject([
      { type: "table", hasHeader, startOffset: 0, endOffset: source.length, columnCount: 2 }
    ]);
  }
});
