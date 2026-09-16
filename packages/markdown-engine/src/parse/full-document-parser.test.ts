import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { flattenMarkdownTree, type MarkdownDocumentTree } from "../model/document-tree";
import {
  isMarkdownContainerNode,
  isMarkdownLeafNode,
  type MarkdownNode
} from "../model/markdown-node";
import { parseFullDocumentTree } from "./full-document-parser";

const fixture = readFileSync(
  path.join(process.cwd(), "fixtures", "markdown", "recursive-containers.md"),
  "utf8"
);

function nodeKinds(tree: MarkdownDocumentTree): string[] {
  return flattenMarkdownTree(tree).map((node: MarkdownNode) => node.kind);
}

describe("parseFullDocumentTree", () => {
  it("builds recursive container nesting from the event stream", () => {
    const tree = parseFullDocumentTree(fixture);
    const kinds = nodeKinds(tree);

    expect(kinds[0]).toBe("document");
    expect(kinds).toContain("blockquote");
    expect(kinds).toContain("list");
    expect(kinds).toContain("list-item");
    expect(kinds).toContain("code-fence");
    expect(kinds).toContain("heading");

    // A blockquote nested inside another blockquote is a real recursive path, not a special case.
    const nestedQuoteDepths = flattenMarkdownTree(tree)
      .filter((node) => node.kind === "blockquote")
      .map((node) => node.depth);
    expect(Math.max(...nestedQuoteDepths)).toBeGreaterThanOrEqual(2);
  });

  it("keeps every node inside its parent and inside the document", () => {
    const tree = parseFullDocumentTree(fixture);
    for (const node of flattenMarkdownTree(tree)) {
      expect(node.source.startOffset).toBeGreaterThanOrEqual(0);
      expect(node.source.endOffset).toBeLessThanOrEqual(fixture.length);
      expect(node.source.endOffset).toBeGreaterThanOrEqual(node.source.startOffset);
      expect(node.content.startOffset).toBeGreaterThanOrEqual(node.source.startOffset);
      expect(node.content.endOffset).toBeLessThanOrEqual(node.source.endOffset);
    }
    expect(tree.root.source).toEqual({ startOffset: 0, endOffset: fixture.length });
  });

  it("reconstructs the original source from ordered top-level ranges", () => {
    const tree = parseFullDocumentTree(fixture);
    const children = isMarkdownContainerNode(tree.root) ? tree.root.children : [];

    let cursor = 0;
    for (const child of children) {
      if (child.source.startOffset > cursor) {
        // Inter-block whitespace is allowed between siblings, and nothing may be skipped inside.
        expect(fixture.slice(cursor, child.source.startOffset).trim()).toBe("");
      }
      expect(child.source.startOffset).toBeGreaterThanOrEqual(cursor);
      cursor = Math.max(cursor, child.source.endOffset);
    }
    expect(fixture.slice(cursor).trim()).toBe("");
  });

  it("attaches inline AST only to leaf content ranges", () => {
    const tree = parseFullDocumentTree(fixture);
    const withInline = flattenMarkdownTree(tree)
      .filter(isMarkdownLeafNode)
      .filter((node) => node.inline !== undefined);
    expect(withInline.length).toBeGreaterThan(0);
    for (const node of withInline) {
      expect(node.kind === "paragraph" || node.kind === "heading").toBe(true);
      expect(node.inline?.startOffset).toBeGreaterThanOrEqual(node.content.startOffset);
      expect(node.inline?.endOffset).toBeLessThanOrEqual(node.content.endOffset);
    }
  });

  it("parses lazily continued blockquote content without container prefixes in text", () => {
    const tree = parseFullDocumentTree("> first\ncontinued\n");
    const leaf = flattenMarkdownTree(tree).find(isMarkdownLeafNode);
    const text = leaf?.inline?.children
      .map((child) => ("value" in child ? child.value : ""))
      .join("") ?? "";

    expect(text).toContain("first");
    expect(text).toContain("continued");
    expect(text).not.toContain(">");
  });
});
