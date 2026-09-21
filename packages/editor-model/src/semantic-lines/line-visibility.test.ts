import { describe, expect, it } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { anchorForVisibleLineColumn, createVisibleLine, normalizeHiddenSelectionAnchor, visibleLineColumn } from "./line-visibility";

function snapshotFor(source: string) {
  return createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
}

describe("canonical line visibility", () => {
  it("uses the same multiline inline tree while limiting hidden ranges to each physical line", () => {
    const source = "**alpha\nbeta** tail";
    const snapshot = snapshotFor(source);
    const first = createVisibleLine({ snapshot, lineStart: 0, lineEnd: 7 });
    const second = createVisibleLine({ snapshot, lineStart: 8, lineEnd: source.length });
    expect(first.inline).toBe(second.inline);
    expect(first.visibleStartAnchor).toBe(2);
    expect(first.hiddenRanges).toEqual([{ start: 0, end: 2 }]);
    expect(second.hiddenRanges).toEqual([{ start: 12, end: 14 }]);
    expect(visibleLineColumn(second, 14)).toBe(4);
    expect(anchorForVisibleLineColumn(second, 4)).toBe(14);
    expect(normalizeHiddenSelectionAnchor(snapshot, 13, 1)).toBe(14);
  });

  it("retains document-scoped reference resolution and nested prefix ownership", () => {
    const source = "> - [label][ref]\n\n[ref]: /target";
    const snapshot = snapshotFor(source);
    const line = createVisibleLine({ snapshot, lineStart: 0, lineEnd: 16 });
    expect(line.baseAnchor).toBe(4);
    expect(line.visibleStartAnchor).toBe(5);
    expect(line.inline?.children[0]).toMatchObject({ type: "link", href: "/target" });
    expect(normalizeHiddenSelectionAnchor(snapshot, 1)).toBe(5);
  });

  it("keeps code punctuation literal and bounds CRLF lines", () => {
    const source = "> ```\r\n> **raw**\r\n> ```";
    const snapshot = snapshotFor(source);
    const start = source.indexOf("> **");
    const end = source.indexOf("\n", start);
    const line = createVisibleLine({ snapshot, lineStart: start, lineEnd: end });
    expect(line.inline).toBeNull();
    expect(line.hiddenRanges).toEqual([]);
    expect(line.visibleStartAnchor).toBe(start + 2);
    expect(line.lineEnd).toBe(end - 1);
  });

  it("uses canonical heading content and leaves empty items editable", () => {
    const heading = createVisibleLine({ snapshot: snapshotFor("## **title**"), lineStart: 0, lineEnd: 12 });
    expect(heading.baseAnchor).toBe(3);
    expect(heading.visibleStartAnchor).toBe(5);
    const empty = createVisibleLine({ snapshot: snapshotFor("> - "), lineStart: 0, lineEnd: 4 });
    expect(empty.visibleStartAnchor).toBe(4);
    expect(empty.inline).toBeNull();
  });
});
