import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createActiveBlockState, createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import { createBlockDecorations } from "./decorations/block-decorations";
import { createHeadingPresentationExtension, headingMarkerAt, headingMarkerIsVisible, progressiveMarkerAt,
  readHeadingPresentation, revealHeadingMarkerEffect, setHeadingPresentationEffect } from "./heading-marker-presentation";

const snapshotOf = (source: string) => createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
function visibleRanges(source: string, anchor: number, head = anchor, mode: "reading" | "editing" = "editing", focus = true) {
  const snapshot = snapshotOf(source), ranges: Array<{ from: number; to: number; class: string }> = [];
  createBlockDecorations({ snapshot, source, hasEditorFocus: focus,
    activeBlockState: createActiveBlockState(snapshot, { anchor, head }),
    headingMarkerPresentation: { mode, revealed: null }
  }).decorationSet.between(0, source.length, (from, to, value) => {
    const name = value.spec.attributes?.class;
    if (name === "cm-active-inline-marker" || name === "cm-active-list-marker") ranges.push({ from, to, class: name });
  });
  return ranges;
}

describe("canonical progressive source markers", () => {
  it.each(["**bold**", "*emphasis*", "~~strike~~", "`code`", "[label](https://example.test)"])(
    "keeps %s content rendered and reveals only the touched or crossed marker", source => {
      const snapshot = snapshotOf(source), content = source.startsWith("**") || source.startsWith("~~") ? 2 : 1;
      const open = progressiveMarkerAt(snapshot, 0)!;
      expect(open).toEqual({ from: 0, to: content });
      expect(visibleRanges(source, content + 1)).toEqual([]);
      expect(visibleRanges(source, 0)).toEqual([{ ...open, class: "cm-active-inline-marker" }]);
      expect(visibleRanges(source, 0, content + 1)).toEqual([{ ...open, class: "cm-active-inline-marker" }]);
      const close = progressiveMarkerAt(snapshot, source.length - 1)!;
      expect(visibleRanges(source, close.from)).toEqual([{ ...close, class: "cm-active-inline-marker" }]);
      expect(visibleRanges(source, close.from, source.length, "reading")).toEqual([]);
      expect(visibleRanges(source, close.from, source.length, "editing", false)).toEqual([]);
    });

  it.each(["- item", "12. item", "- [ ] item", "> - [x] item", "- parent\n  - child"])(
    "presents %s prefix only while its source is entered", source => {
      const snapshot = snapshotOf(source), content = source.lastIndexOf(source.includes("child") ? "child" : "item");
      const prefix = progressiveMarkerAt(snapshot, content)!;
      expect(prefix.to).toBe(content);
      expect(visibleRanges(source, content + 1)).toEqual([]);
      const entered = visibleRanges(source, prefix.from);
      expect(entered).toHaveLength(1);
      expect(entered[0]!.from).toBe(prefix.from);
      expect(entered[0]!.to).toBeLessThanOrEqual(content);
      expect(visibleRanges(source, prefix.from, content, "reading")).toEqual([]);
      expect(progressiveMarkerAt(snapshot, prefix.from, false)).toBeNull();
    });

  it("does not reveal an outer formatting marker for an inner marker or label caret", () => {
    const source = "***both*** and [**label**](url)", snapshot = snapshotOf(source);
    expect(visibleRanges(source, 4)).toEqual([]);
    expect(visibleRanges(source, 1)).toEqual([{ from: 1, to: 3, class: "cm-active-inline-marker" }]);
    const inner = source.indexOf("**label");
    expect(progressiveMarkerAt(snapshot, inner)).toEqual({ from: inner, to: inner + 2 });
    expect(visibleRanges(source, inner)).toEqual([{ from: inner, to: inner + 2, class: "cm-active-inline-marker" }]);
  });

  it.each(["![alt](image.png)", "$x$", "[^note]", "```text\nx\n```", "| a |\n| --- |\n| b |"])(
    "preserves special owner boundaries for %s", source => {
      const snapshot = snapshotOf(source);
      for (let offset = 0; offset < source.length; offset++) expect(progressiveMarkerAt(snapshot, offset)).toBeNull();
    });

  it("retains the approved heading long-prefix fallback", () => {
    for (const source of ["######   Title", "##\tTitle"]) {
      const snapshot = snapshotOf(source);
      expect(headingMarkerAt(snapshot, source.indexOf("Title"))).toBeNull();
      expect(progressiveMarkerAt(snapshot, 1)).toBeNull();
    }
    expect(headingMarkerAt(snapshotOf("###### Title"), 7)).toEqual({ from: 0, to: 7 });
  });

  it("keeps formatted image alt under the existing active image source owner", () => {
    const source = "![**alt**](image.png)", snapshot = snapshotOf(source);
    for (let offset = 0; offset < source.length; offset++) expect(progressiveMarkerAt(snapshot, offset)).toBeNull();
    expect(visibleRanges(source, source.indexOf("alt") + 1)).toEqual([
      { from: 2, to: 4, class: "cm-active-inline-marker" },
      { from: 7, to: 9, class: "cm-active-inline-marker" }
    ]);
  });

  it("maps a temporary reveal through changes and clears it when the caret leaves or reading begins", () => {
    let state = EditorState.create({ doc: "**bold**", selection: { anchor: 2 }, extensions: createHeadingPresentationExtension() });
    state = state.update({ effects: revealHeadingMarkerEffect.of({ from: 0, to: 2 }) }).state;
    expect(headingMarkerIsVisible({ from: 0, to: 2 }, { anchor: 2, head: 2 }, true, readHeadingPresentation(state))).toBe(true);
    state = state.update({ changes: { from: 0, insert: "a" }, selection: { anchor: 3 } }).state;
    expect(readHeadingPresentation(state).revealed).toEqual({ from: 1, to: 3 });
    state = state.update({ selection: { anchor: 4 } }).state;
    expect(readHeadingPresentation(state).revealed).toBeNull();
    state = state.update({ effects: [revealHeadingMarkerEffect.of({ from: 1, to: 3 }), setHeadingPresentationEffect.of("reading")] }).state;
    expect(readHeadingPresentation(state)).toEqual({ mode: "reading", revealed: null });
  });
});
