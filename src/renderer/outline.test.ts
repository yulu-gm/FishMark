import { describe, expect, it } from "vitest";

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
});
