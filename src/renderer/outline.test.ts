import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { deriveOutlineItems } from "./outline";

describe("deriveOutlineItems", () => {
  it("collects heading labels, depth, and source offsets from the current markdown document", () => {
    const source = ["# Title", "", "Paragraph", "", "## Next step"].join("\n");

    expect(deriveOutlineItems(source)).toEqual([
      {
        id: "heading:0-7",
        label: "Title",
        depth: 1,
        startOffset: 0,
        startLine: 1
      },
      {
        id: "heading:20-32",
        label: "Next step",
        depth: 2,
        startOffset: 20,
        startLine: 5
      }
    ]);
  });

  it("flattens inline heading content into plain-text outline labels", () => {
    const source = "### **Bold** `code` [link](https://example.com) ![alt](hero.png)";

    expect(deriveOutlineItems(source)).toEqual([
      {
        id: "heading:0-64",
        label: "Bold code link alt",
        depth: 3,
        startOffset: 0,
        startLine: 1
      }
    ]);
  });

  it("keeps the default parser behavior unchanged when parser instrumentation is omitted", () => {
    const source = "# Title\n\n## Next";

    expect(deriveOutlineItems(source)).toEqual(
      deriveOutlineItems(source, { parseMarkdownDocument })
    );
  });

  it("uses an injected document parser exactly once", () => {
    const source = "# Title";
    let parseCalls = 0;

    expect(
      deriveOutlineItems(source, {
        parseMarkdownDocument(value) {
          parseCalls += 1;
          return parseMarkdownDocument(value);
        }
      })
    ).toHaveLength(1);
    expect(parseCalls).toBe(1);
  });
});
