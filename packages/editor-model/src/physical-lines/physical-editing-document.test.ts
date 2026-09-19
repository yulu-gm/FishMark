import { childrenOf, parseFullDocumentTree, type MarkdownNode } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";

import { createPhysicalEditingDocument } from "./physical-editing-document";

function build(source: string) {
  return createPhysicalEditingDocument(source, parseFullDocumentTree(source));
}

describe("createPhysicalEditingDocument", () => {
  it.each(["", "alpha\n", "alpha\r\n"])("keeps an editable final line for %j", (source) => {
    const document = build(source);
    expect(document.lines).toHaveLength(source === "" ? 1 : 2);
    expect(document.lineAtOffset(source.length)).toMatchObject({
      range: { startOffset: source.length, endOffset: source.length },
      role: "structural-blank"
    });
  });

  it.each(["```", "~~~", "$$"])("recognizes quoted %s closing markers", (marker) => {
    const document = build(`> ${marker}\n> code\n> ${marker}`);
    expect(document.lines.map((line) => line.role)).toEqual(["fence-open", "fence-content", "fence-close"]);
  });

  it("does not mistake a different fence marker for a closing fence", () => {
    expect(build("```\ncode\n~~~").lines.at(-1)?.role).toBe("fence-content");
  });

  it("matches first-overlap traversal for nested CRLF blocks and every caret offset", () => {
    const source = "> - first\r\n>   continuation\r\n> - second\r\n\r\n# heading\r\n\r\nlast\r\n";
    const tree = parseFullDocumentTree(source);
    const document = createPhysicalEditingDocument(source, tree);
    function originalNodeAt(offset: number): MarkdownNode | null {
      let current: MarkdownNode = tree.root;
      let result: MarkdownNode | null = null;
      for (;;) {
        const child: MarkdownNode | undefined = childrenOf(current).find((node) => node.source.startOffset <= offset && node.source.endOffset > offset);
        if (child === undefined) return result;
        result = current = child;
      }
    }
    for (let offset = 0; offset <= source.length; offset += 1) {
      expect(document.nodeAtOffset(offset)?.id).toBe(originalNodeAt(offset)?.id);
    }
    for (const line of document.lines) {
      let current: MarkdownNode = tree.root;
      let result: MarkdownNode | null = null;
      for (;;) {
        const children: readonly MarkdownNode[] = childrenOf(current);
        const child: MarkdownNode | undefined = children.find((node) => node.source.startOffset >= line.range.startOffset && node.source.startOffset < line.range.endOffset) ??
          children.find((node) => node.source.startOffset < line.range.endOffset && node.source.endOffset > line.range.startOffset);
        if (child === undefined) break;
        result = current = child;
      }
      expect(line.nodeId).toBe(result?.id ?? null);
    }
    for (const node of tree.nodesById.values()) {
      expect(document.lineForNode(node)).toEqual(document.lines.filter((line) =>
        line.range.endOffset > node.source.startOffset && line.range.startOffset < node.source.endOffset));
    }
  });

  it("bounds sibling range reads by indexed lookups rather than lines times siblings", () => {
    const fragment = "paragraph\n\n";
    const source = fragment.repeat(2000);
    const templateTree = parseFullDocumentTree(fragment);
    const template = templateTree.root.children[0]!;
    let rangeReads = 0;
    const children = Array.from({ length: 2000 }, (_, index) => {
      const shift = index * fragment.length;
      const range = { startOffset: template.source.startOffset + shift, endOffset: template.source.endOffset + shift };
      return {
        ...template, id: `paragraph-${index}`, path: [index],
        content: { startOffset: template.content.startOffset + shift, endOffset: template.content.endOffset + shift },
        get source() { rangeReads += 1; return range; }
      };
    });
    const root = { ...templateTree.root, children, source: { startOffset: 0, endOffset: source.length } };
    const tree = { ...templateTree, source, root, nodesById: new Map(children.map((node) => [node.id, node])) };
    const document = createPhysicalEditingDocument(source, tree);
    for (const line of document.lines) document.nodeAtOffset(line.range.startOffset);
    expect(document.lines).toHaveLength(4001);
    // A linear scan per line exceeds millions of reads; indexed construction + all queries
    // stay comfortably under this deterministic work bound, independent of machine speed.
    expect(rangeReads).toBeLessThan(100_000);
  });

  it("emits ordered quote, list, task, and spacing prefix segments", () => {
    const source = [
      "> - [x] quoted item",
      ">   continued",
      "",
      "1. ordered",
      "2. second"
    ].join("\n");
    const document = build(source);
    const first = document.lines[0]!;

    expect(first.segments.map((segment) => segment.kind)).toEqual([
      "quote-marker",
      "spacing",
      "list-marker",
      "spacing",
      "task-marker",
      "spacing"
    ]);
    expect(first.segments.map((segment) => segment.text)).toEqual([">", " ", "-", " ", "[x]", " "]);
    expect(source.slice(first.contentStartOffset, first.contentEndOffset)).toBe("quoted item");

    const ordered = document.lines[3]!;
    expect(ordered.segments.map((segment) => segment.kind)).toEqual([
      "list-marker",
      "spacing"
    ]);
    expect(ordered.segments[0]!.text).toBe("1.");
  });

  it("marks structural blank, separator, fence, and ordinary content roles", () => {
    const source = [
      "# Title",
      "",
      "---",
      "```js",
      "const x = 1;",
      "```",
      "text"
    ].join("\n");
    const document = build(source);

    expect(document.lines.map((line) => line.role)).toEqual([
      "content",
      "structural-blank",
      "separator",
      "fence-open",
      "fence-content",
      "fence-close",
      "content"
    ]);
  });

  it("answers offset, line, node, and visible-column queries", () => {
    const source = "> quoted text";
    const document = build(source);

    const line = document.lineAtOffset(source.indexOf("text"));
    expect(line?.lineNumber).toBe(1);
    expect(document.lineAtOffset(0)).toBe(line);

    const node = document.nodeAtOffset(source.indexOf("quoted"));
    expect(node).not.toBeNull();
    if (node === null) return;
    expect(document.lineForNode(node).map((entry) => entry.lineNumber)).toEqual([1]);

    // Two hidden prefix columns (`> `) shift the text column by two.
    expect(document.visibleColumnAt(source.indexOf("text"))).toBe(9);
  });

  it("keeps a tab-advanced prefix column honest across container levels", () => {
    const source = "> \t- item\n";
    const document = build(source);
    const line = document.lines[0]!;

    expect(line.segments.map((segment) => segment.text)).toEqual([">", " ", "\t", "-", " "]);
    // `> ` is two columns, then a tab advances to column 4, then `- ` reaches column 6.
    expect(line.segments[1]!.endColumn).toBe(2);
    expect(line.segments[2]!.endColumn).toBe(4);
    expect(line.segments[3]!.startColumn).toBe(4);
    expect(source.slice(line.contentStartOffset, line.contentEndOffset)).toBe("item");
  });
});
