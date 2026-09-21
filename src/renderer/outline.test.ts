import { describe, expect, it } from "vitest";

import { parseFullDocumentTree } from "@fishmark/markdown-engine";

import { deriveOutlineItems } from "./outline";

describe("deriveOutlineItems", () => {
  it("collects heading labels, depth, and source offsets from the canonical document tree", () => {
    const source = ["# Title", "", "Paragraph", "", "## Next step"].join("\n");
    const rootChildren = parseFullDocumentTree(source).root.children;

    expect(deriveOutlineItems(source)).toEqual([
      {
        id: rootChildren[0]!.id,
        label: "Title",
        depth: 1,
        startOffset: 0,
        startLine: 1
      },
      {
        id: rootChildren[2]!.id,
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
        id: parseFullDocumentTree(source).root.children[0]!.id,
        label: "Bold code link alt",
        depth: 3,
        startOffset: 0,
        startLine: 1
      }
    ]);
  });

  it("takes every outline id from the canonical node, including after a non-heading root child", () => {
    const source = ["> # Quoted", "", "# Root", "", "- item", "", "## Tail"].join("\n");
    const rootChildren = parseFullDocumentTree(source).root.children;

    expect(deriveOutlineItems(source).map((item) => item.id)).toEqual([
      rootChildren[1]!.id,
      rootChildren[3]!.id
    ]);
  });

  it("keeps nested headings out of the outline", () => {
    const source = ["> # Quoted", "", "# Root"].join("\n");

    expect(deriveOutlineItems(source).map((item) => item.label)).toEqual(["Root"]);
  });

  it("keeps the default parser behavior unchanged when parser instrumentation is omitted", () => {
    const source = "# Title\n\n## Next";

    expect(deriveOutlineItems(source)).toEqual(
      deriveOutlineItems(source, { parseDocumentTree: parseFullDocumentTree })
    );
  });

  it("uses an injected document tree parser exactly once", () => {
    const source = "# Title";
    let parseCalls = 0;

    expect(
      deriveOutlineItems(source, {
        parseDocumentTree(value) {
          parseCalls += 1;
          return parseFullDocumentTree(value);
        }
      })
    ).toHaveLength(1);
    expect(parseCalls).toBe(1);
  });
});
