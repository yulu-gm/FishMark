import { describe, expect, it } from "vitest";

import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { deriveOutlineItems } from "./outline";

const snapshot = (source: string) =>
  createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

describe("deriveOutlineItems", () => {
  it("projects heading labels, depth, offsets, and canonical ids from one editor snapshot", () => {
    const source = ["# Title", "", "Paragraph", "", "## Next step"].join("\n");
    const current = snapshot(source);
    const rootChildren = current.tree.root.children;

    expect(deriveOutlineItems(current)).toEqual([
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
    const current = snapshot(source);

    expect(deriveOutlineItems(current)).toEqual([
      {
        id: current.tree.root.children[0]!.id,
        label: "Bold code link alt",
        depth: 3,
        startOffset: 0,
        startLine: 1
      }
    ]);
  });

  it("keeps nested headings out of the renderer outline", () => {
    const current = snapshot(["> # Quoted", "", "# Root"].join("\n"));

    expect(deriveOutlineItems(current).map((item) => item.label)).toEqual(["Root"]);
  });

  it("reuses the exact snapshot heading projection without another parser", () => {
    const current = snapshot("# Title\n\n## Next");

    expect(deriveOutlineItems(current)).toEqual(current.outlineHeadings);
    expect(deriveOutlineItems(current)[0]?.id).toBe(current.outlineHeadings[0]?.id);
  });
});
