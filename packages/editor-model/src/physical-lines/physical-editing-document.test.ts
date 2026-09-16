import { parseFullDocumentTree } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";

import { createPhysicalEditingDocument } from "./physical-editing-document";

function build(source: string) {
  return createPhysicalEditingDocument(source, parseFullDocumentTree(source));
}

describe("createPhysicalEditingDocument", () => {
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
