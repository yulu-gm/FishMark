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
  it.each(["- - alpha", "- - alpha\n    omega", "> - - alpha", "- - alpha\r\n    omega"])(
    "preserves same-line nested lists through indentation normalization: %j", (source) => {
      const tree = parseFullDocumentTree(source);
      const nodes = flattenMarkdownTree(tree);
      const paragraph = nodes.find((node) => node.kind === "paragraph");
      expect(paragraph).toBeDefined();
      expect(nodes.filter((node) => node.kind === "list")).toHaveLength(2);
      expect(nodes.filter((node) => node.kind === "list-item")).toHaveLength(2);
      expect(paragraph?.depth).toBe(source.startsWith(">") ? 6 : 5);
      expect(source.slice(paragraph!.content.startOffset, paragraph!.content.endOffset)).toContain("alpha");
    }
  );
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

  it("masks container prefixes inside continued blockquote lines", () => {
    const tree = parseFullDocumentTree("> a\n> b");
    const leaf = flattenMarkdownTree(tree).find(isMarkdownLeafNode);
    const text = leaf?.inline?.children
      .map((child) => ("value" in child ? child.value : ""))
      .join("") ?? "";

    expect(text).toBe("ab");
  });
});

function findByKind(tree: MarkdownDocumentTree, kind: MarkdownNode["kind"]): MarkdownNode[] {
  return flattenMarkdownTree(tree).filter((node) => node.kind === kind);
}

describe("parseFullDocumentTree leaf and container data", () => {
  it.each([
    ["> - ```txt\n>   al\n>   \n>   pha\n>   ```", "code-fence"],
    ["> > - $$\n> >   al\n> >   \n> >   pha\n> >   $$", "block-math"]
  ] as const)("preserves a fenced leaf in quoted item content after repeated Enter: %s", (source, kind) => {
    const tree = parseFullDocumentTree(source);
    const leaf = findByKind(tree, kind)[0];
    expect(leaf).toBeDefined();
    expect(leaf!.source.endOffset).toBe(source.length);
    expect(leaf!.path.length).toBe(kind === "block-math" ? 5 : 4);
  });
  it.each(["", "> "])("owns two-space ordered scopes and continuation lines under prefix %j", (prefix) => {
    const source = ["1. parent", "  1. child", "    1. leaf", "    continuation", "2. sibling"].map((line) => prefix + line).join("\n");
    const tree = parseFullDocumentTree(source);
    const items = findByKind(tree, "list-item");
    expect(items.map((item) => item.data)).toMatchObject([
      { marker: "1.", indent: 0 }, { marker: "1.", indent: 2 }, { marker: "1.", indent: 4 }, { marker: "2.", indent: 0 }
    ]);
    expect(items[2]!.source.endOffset).toBe(source.indexOf("continuation") + "continuation".length);
    expect(items[1]!.path.length).toBe(items[0]!.path.length + 2);
    expect(items[2]!.path.length).toBe(items[1]!.path.length + 2);
  });

  it("recognizes an editable empty quoted child as a list item instead of a setext underline", () => {
    const source = "> - parent\n>   - ";
    const tree = parseFullDocumentTree(source);
    expect(findByKind(tree, "heading")).toHaveLength(0);
    expect(findByKind(tree, "list-item").map((item) => item.data)).toMatchObject([
      { marker: "-", indent: 0 }, { marker: "-", indent: 2 }
    ]);
    expect(findByKind(tree, "list-item")[1]!.content.startOffset).toBe(source.length);
  });

  it.each(["\n", "\n\n"])("keeps fenced content after an item separator %j without discovering its literal markers", (gap) => {
    const source = `- parent${gap}  \`\`\`md\n  - literal\n  \`\`\`\n- sibling`;
    const tree = parseFullDocumentTree(source);
    expect(findByKind(tree, "list-item")).toHaveLength(2);
    expect(findByKind(tree, "code-fence")).toHaveLength(1);
    const fence = findByKind(tree, "code-fence")[0]!;
    expect(source.slice(fence.source.startOffset, fence.source.endOffset)).toContain("- literal");
  });
  it("records list metadata, item geometry, and task markers", () => {
    const tree = parseFullDocumentTree("3) three\n4) four\n\n- [x] done");
    const lists = findByKind(tree, "list");
    const items = findByKind(tree, "list-item");
    const ordered = lists[0]!;

    expect(ordered.data).toEqual({ kind: "list", ordered: true, startOrdinal: 3, delimiter: ")" });
    expect(items[0]?.data).toEqual({ kind: "list-item", marker: "3)", checked: null, indent: 0 });
    expect(items[0]?.markers).toEqual([
      { kind: "list-marker", range: { startOffset: 0, endOffset: 2 } }
    ]);

    const task = items[2]!;
    expect(task.data).toEqual({ kind: "list-item", marker: "-", checked: true, indent: 0 });
    expect(task.markers.map((marker) => marker.kind)).toEqual(["list-marker", "task-marker"]);
  });

  it("measures list indentation relative to enclosing container prefixes", () => {
    const tree = parseFullDocumentTree("> quote\n> - a\n>   1) nested");
    const items = findByKind(tree, "list-item");

    expect(items[0]?.data).toMatchObject({ marker: "-", indent: 0 });
    expect(items[0]?.content).toEqual({ startOffset: 12, endOffset: 13 });
    expect(items[1]?.data).toMatchObject({ marker: "1)", indent: 2 });
    expect(items[1]?.content).toEqual({ startOffset: 21, endOffset: 27 });
  });

  it("keeps item content inside the item's own first line when a nested list follows", () => {
    const tree = parseFullDocumentTree("- a\n  - b\n    - c");
    const items = findByKind(tree, "list-item");

    expect(items.map((item) => item.content)).toEqual([
      { startOffset: 2, endOffset: 3 },
      { startOffset: 8, endOffset: 9 },
      { startOffset: 16, endOffset: 17 }
    ]);
    expect(items.map((item) => item.data)).toMatchObject([
      { marker: "-", indent: 0 },
      { marker: "-", indent: 2 },
      { marker: "-", indent: 4 }
    ]);
  });

  it("records heading content, depth, and marker spans", () => {
    const atx = findByKind(parseFullDocumentTree("# Title #"), "heading")[0]!;
    expect(atx.data).toEqual({ kind: "heading", depth: 1 });
    expect(atx.markers).toEqual([{ kind: "heading", range: { startOffset: 0, endOffset: 2 } }]);
    expect(atx.content).toEqual({ startOffset: 2, endOffset: 7 });

    const setext = findByKind(parseFullDocumentTree("Title\n====="), "heading")[0]!;
    expect(setext.data).toEqual({ kind: "heading", depth: 1 });
    expect(setext.markers).toEqual([]);
    expect(setext.content).toEqual({ startOffset: 0, endOffset: 5 });
  });

  it("keeps fenced and indented code distinct", () => {
    const fenced = findByKind(parseFullDocumentTree("```ts info\ncode\n```"), "code-fence")[0]!;
    const indented = findByKind(parseFullDocumentTree("    code"), "code-fence")[0]!;

    expect(fenced.data).toEqual({ kind: "code-fence", fence: "fenced", info: "ts info" });
    expect(indented.data).toEqual({ kind: "code-fence", fence: "indented", info: null });
  });

  it("records block math fences, value, and closure", () => {
    const closed = findByKind(parseFullDocumentTree("$$\nvalue\n$$"), "block-math")[0]!;
    const open = findByKind(parseFullDocumentTree("$$\nvalue"), "block-math")[0]!;

    expect(closed.data).toEqual({ kind: "block-math", value: "value", closed: true });
    expect(closed.markers.map((marker) => marker.kind)).toEqual(["fence", "fence"]);
    expect(open.data).toEqual({ kind: "block-math", value: "value", closed: false });
    expect(open.markers).toHaveLength(1);
  });

  it("records thematic breaks, definitions, and html images", () => {
    expect(findByKind(parseFullDocumentTree("***"), "thematic-break")[0]?.data).toEqual({
      kind: "thematic-break",
      marker: "-"
    });
    expect(findByKind(parseFullDocumentTree("[ref]: /x \"t\""), "definition")).toHaveLength(1);

    const image = findByKind(
      parseFullDocumentTree("<img src=\"a.png\" width=\"10\" />"),
      "html-image"
    )[0]!;
    expect(image.data).toMatchObject({ kind: "html-image", src: "a.png", width: "10" });
  });

  it("records table cells with their own source and content ranges", () => {
    const table = findByKind(parseFullDocumentTree("| a | b |\n| --- | --- |\n| 1 | 2 |"), "table")[0]!;
    const data = table.data as unknown as { kind: "table"; columnCount: number; hasHeader: boolean; rows: unknown[] };

    expect(data.kind).toBe("table");
    expect(data.columnCount).toBe(2);
    expect(data.hasHeader).toBe(true);
    expect(data.rows.length).toBeGreaterThan(0);
  });
});


