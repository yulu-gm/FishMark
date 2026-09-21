import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";

import { createActiveBlockState } from "./active-block";

function snapshotFor(source: string) {
  return createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
}

describe("createActiveBlockState", () => {
  const source = ["# Title", "", "Paragraph", "", "- one", "- two", "", "> quote"].join("\n");

  it("resolves the top-level canonical block containing the current selection", () => {
    const snapshot = snapshotFor(source);

    expect(
      createActiveBlockState(snapshot, {
        anchor: source.indexOf("Title"),
        head: source.indexOf("Title")
      }).activeKind
    ).toBe("heading");

    expect(
      createActiveBlockState(snapshot, {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      }).activeKind
    ).toBe("paragraph");

    expect(
      createActiveBlockState(snapshot, {
        anchor: source.indexOf("- one"),
        head: source.indexOf("- one")
      }).activeKind
    ).toBe("list");

    expect(
      createActiveBlockState(snapshot, {
        anchor: source.indexOf("> quote"),
        head: source.indexOf("> quote")
      }).activeKind
    ).toBe("blockquote");
  });

  it("keeps the block active on its trailing newline but not across blank separators", () => {
    const snapshot = snapshotFor(source);

    expect(createActiveBlockState(snapshot, { anchor: 7, head: 7 }).activeKind).toBe("heading");
    expect(createActiveBlockState(snapshot, { anchor: 8, head: 8 }).activeKind).toBeNull();
  });

  it("returns null when the document is empty or the selection is between top-level blocks", () => {
    expect(createActiveBlockState(snapshotFor(""), { anchor: 0, head: 0 }).activeKind).toBeNull();
    expect(createActiveBlockState(snapshotFor(source), { anchor: 19, head: 19 }).activeKind).toBeNull();
  });

  it("keeps a non-empty whitespace-only document without an active semantic block", () => {
    const whitespaceOnlySource = " ";
    const activeKind = createActiveBlockState(snapshotFor(whitespaceOnlySource), {
      anchor: whitespaceOnlySource.length,
      head: whitespaceOnlySource.length
    }).activeKind;

    expect(activeKind).toBeNull();
  });

  it("resolves blockquote markers without requiring marker padding", () => {
    expect(createActiveBlockState(snapshotFor(">"), { anchor: 1, head: 1 }).activeKind).toBe("blockquote");
    expect(createActiveBlockState(snapshotFor(">quote"), { anchor: 6, head: 6 }).activeKind).toBe("blockquote");
    expect(createActiveBlockState(snapshotFor("> "), { anchor: 2, head: 2 }).activeKind).toBe("blockquote");
  });

  it("keeps the blockquote as the active root block for quote-internal code fences", () => {
    const source = ["> ```ts", "> const answer = 42;", "> ```"].join("\n");
    const cursor = source.indexOf("answer");

    expect(createActiveBlockState(snapshotFor(source), { anchor: cursor, head: cursor }).activeKind).toBe(
      "blockquote"
    );
  });

  it("resolves thematic breaks as active blocks when the selection lands on the separator", () => {
    const thematicBreakSource = ["Paragraph", "", "---", "", "+++"].join("\n");
    const snapshot = snapshotFor(thematicBreakSource);

    expect(
      createActiveBlockState(snapshot, {
        anchor: thematicBreakSource.indexOf("---"),
        head: thematicBreakSource.indexOf("---")
      }).activeKind
    ).toBe("thematic-break");

    expect(
      createActiveBlockState(snapshot, {
        anchor: thematicBreakSource.indexOf("+++"),
        head: thematicBreakSource.indexOf("+++")
      }).activeKind
    ).toBe("thematic-break");
  });

  it("reports the canonical active heading id only for a root-level heading", () => {
    const headingSource = ["# Title", "", "Paragraph", "", "> # Quoted"].join("\n");
    const snapshot = snapshotFor(headingSource);

    expect(
      createActiveBlockState(snapshot, {
        anchor: headingSource.indexOf("Title"),
        head: headingSource.indexOf("Title")
      }).activeHeadingId
    ).toBe(snapshot.nodeAt(headingSource.indexOf("Title"))?.id);

    expect(
      createActiveBlockState(snapshot, {
        anchor: headingSource.indexOf("Paragraph"),
        head: headingSource.indexOf("Paragraph")
      }).activeHeadingId
    ).toBeNull();

    expect(
      createActiveBlockState(snapshot, {
        anchor: headingSource.indexOf("Quoted"),
        head: headingSource.indexOf("Quoted")
      }).activeHeadingId
    ).toBeNull();
  });
});
