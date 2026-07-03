import type { TableBlock } from "@fishmark/markdown-engine";
import { parseMarkdownDocument } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";

import {
  findBlockByStartOffsetDeep,
  findBlocksByTypeDeep,
  walkMarkdownBlocks
} from "./block-tree";

describe("block-tree", () => {
  it("walks top-level and blockquote inner blocks in source order", () => {
    const source = [
      "> alpha",
      ">",
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |",
      "",
      "Plain"
    ].join("\n");
    const document = parseMarkdownDocument(source);

    expect(walkMarkdownBlocks(document.blocks).map((entry) => entry.block.type)).toEqual([
      "blockquote",
      "paragraph",
      "table",
      "paragraph"
    ]);
  });

  it("finds quote-internal tables by type and start offset", () => {
    const source = [
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |"
    ].join("\n");
    const document = parseMarkdownDocument(source);
    const tables = findBlocksByTypeDeep(document.blocks, "table");
    const table = tables[0] as TableBlock | undefined;

    expect(tables).toHaveLength(1);
    expect(table?.startOffset).toBe(0);
    expect(findBlockByStartOffsetDeep(document.blocks, "table", 0)).toBe(table);
  });

  it("returns null when no block of the requested type starts at the offset", () => {
    const document = parseMarkdownDocument("Plain");

    expect(findBlockByStartOffsetDeep(document.blocks, "table", 0)).toBeNull();
  });
});
