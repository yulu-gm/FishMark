import { describe, expect, it } from "vitest";

import { createEditorDerivedSnapshotFromCache, type EditorDerivedSnapshot } from "@fishmark/editor-model";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorDerivedState } from "@fishmark/editor-model";
import { deriveInactiveBlockDecorationsState as buildDecorations } from "./inactive-block-decorations";

// One canonical snapshot per source, so selection-only updates share the same document revision.
const snapshots = new Map<string, EditorDerivedSnapshot>();

const snapshotOf = (source: string): EditorDerivedSnapshot => {
  let snapshot = snapshots.get(source);

  if (!snapshot) {
    snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
    snapshots.set(source, snapshot);
  }

  return snapshot;
};

type TestOptions = Omit<Parameters<typeof buildDecorations>[0], "snapshot"> & { source: string };

function deriveInactiveBlockDecorationsState(options: TestOptions) {
  const { source, ...rest } = options;
  return buildDecorations({ ...rest, snapshot: snapshotOf(source) });
}

describe("deriveInactiveBlockDecorationsState", () => {
  it("reuses the canonical snapshot across selection-only updates", () => {
    const source = ["# Title", "", "Paragraph"].join("\n");

    const initialResult = deriveInactiveBlockDecorationsState({
      source,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false
    });

    const nextResult = deriveInactiveBlockDecorationsState({
      source,
      selection: {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      },
      hasEditorFocus: false
    });

    expect(initialResult.activeBlockState.activeKind).toBe("heading");
    expect(nextResult.activeBlockState.activeKind).toBe("paragraph");
    expect(nextResult.activeBlockState.snapshot.tree).toBe(initialResult.activeBlockState.snapshot.tree);
  });

  it("uses a supplied editor derived state instead of deriving another one", () => {
    const source = ["# Title", "", "Paragraph"].join("\n");
    const editorDerivedState = createEditorDerivedState({
      snapshot: snapshotOf(source),
      selection: {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      }
    });

    const result = deriveInactiveBlockDecorationsState({
      source,
      selection: editorDerivedState.selection,
      hasEditorFocus: false,
      editorDerivedState
    });

    expect(result.activeBlockState).toBe(editorDerivedState.activeBlockState);
    expect(result.activeBlockState.activeKind).toBe("paragraph");
  });

  it("renders reference-style list image widgets from the canonical snapshot", () => {
    const source = [
      "- ![Alt text][hero]",
      "",
      "[hero]: hero.png",
      "",
      "Paragraph"
    ].join("\n");

    const result = deriveInactiveBlockDecorationsState({
      source,
      selection: {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      },
      hasEditorFocus: true
    });

    expect(collectWidgets(source, result.decorationSet)).toEqual([
      {
        from: 2,
        to: "- ![Alt text][hero]".length,
        name: "MarkdownImagePreviewWidget"
      }
    ]);
  });

  it("refreshes the decoration signature when only inline markers change", () => {
    const sourceWithStrong = "Paragraph with **bold**";
    const sourceWithEmphasis = "Paragraph with *bold*";

    const strongResult = deriveInactiveBlockDecorationsState({
      source: sourceWithStrong,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false
    });

    const emphasisResult = deriveInactiveBlockDecorationsState({
      source: sourceWithEmphasis,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false
    });

    expect(strongResult.activeBlockState.activeKind).toBe("paragraph");
    expect(emphasisResult.activeBlockState.activeKind).toBe("paragraph");
    expect(strongResult.signature).not.toBe(emphasisResult.signature);
  });

  it("refreshes the decoration signature when only list item inline markers change", () => {
    const sourceWithStrong = "- **bold**";
    const sourceWithEmphasis = "- *bold*";

    const strongResult = deriveInactiveBlockDecorationsState({
      source: sourceWithStrong,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false
    });

    const emphasisResult = deriveInactiveBlockDecorationsState({
      source: sourceWithEmphasis,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false
    });

    expect(strongResult.activeBlockState.activeKind).toBe("list");
    expect(emphasisResult.activeBlockState.activeKind).toBe("list");
    expect(strongResult.signature).not.toBe(emphasisResult.signature);
  });
});

function collectWidgets(
  source: string,
  decorationSet: ReturnType<typeof deriveInactiveBlockDecorationsState>["decorationSet"]
): Array<{ from: number; to: number; name: string }> {
  const widgets: Array<{ from: number; to: number; name: string }> = [];

  decorationSet.between(0, source.length, (from, to, value) => {
    if (!value.spec.widget) {
      return;
    }

    widgets.push({
      from,
      to,
      name: value.spec.widget.constructor.name
    });
  });

  return widgets;
}
