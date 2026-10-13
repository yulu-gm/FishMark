import { describe, expect, it } from "vitest";
import { createActiveBlockState, createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createBlockDecorations } from "./block-decorations";

function classes(source: string, anchor = source.length, head = anchor, mode: "editing" | "reading" | null = "editing", focus = true) {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
  const lineStart = snapshot.lineAt(head)!.range.startOffset;
  const names: string[] = [];
  const decorations = createBlockDecorations({ snapshot, source,
    activeBlockState: createActiveBlockState(snapshot, { anchor, head }), hasEditorFocus: focus,
    ...(mode === null ? {} : { headingMarkerPresentation: { mode, revealed: null } }) });
  decorations.decorationSet.between(0, source.length, (from, to, decoration) => {
    if (from === lineStart && to === from) names.push(...(decoration.spec.attributes?.class ?? "").split(" "));
  });
  return names;
}

describe("focused unpadded list draft presentation", () => {
  it("retains the editing default when presentation is omitted", () => {
    expect(classes("-", 1, 1, null)).toContain("cm-active-paragraph");
  });
  it.each(["-", "+", "*", "1.", "2)"])("keeps %s as visible paragraph draft until padding is typed", marker => {
    expect(classes(marker)).toContain("cm-active-paragraph");
    expect(classes(marker)).not.toContain("cm-inactive-list");
    expect(classes(marker + " ")).toContain("cm-inactive-list");
    expect(classes(marker + " body")).toContain("cm-inactive-list");
  });

  it("uses the current line in a longer document without changing canonical list identity", () => {
    const source = "Before\n\n-\n\nAfter";
    expect(classes(source, source.indexOf("-") + 1)).toContain("cm-active-paragraph");
    const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache("-"));
    expect(snapshot.tree.root.children[0]?.kind).toBe("list");
  });

  it.each(["- parent\n-", "- parent\n  -", "> -", "> > -", "-\n  body"])(
    "preserves existing/quoted/nested or nonempty list semantics: %j", source => {
      expect(classes(source)).not.toContain("cm-active-paragraph");
    });

  it("restores canonical presentation on blur, reading, selection or movement", () => {
    expect(classes("-", 1, 1, "editing", false)).toContain("cm-inactive-list");
    expect(classes("-", 1, 1, "reading")).toContain("cm-inactive-list");
    expect(classes("-", 0, 1)).not.toContain("cm-active-paragraph");
    expect(classes("-", 0)).not.toContain("cm-active-paragraph");
  });
});
