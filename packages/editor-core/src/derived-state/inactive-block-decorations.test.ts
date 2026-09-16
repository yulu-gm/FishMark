import { describe, expect, it, vi } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createBlockMapCache } from "./block-map-cache";
import { createMarkdownDocumentCache } from "./markdown-document-cache";
import { createEditorDerivedState } from "./editor-derived-state";
import { deriveInactiveBlockDecorationsState } from "./inactive-block-decorations";

describe("deriveInactiveBlockDecorationsState", () => {
  it("reuses the cached block map across selection-only updates", () => {
    const source = ["# Title", "", "Paragraph"].join("\n");
    const parseSpy = vi.fn(parseMarkdownDocument);
    const markdownDocumentCache = createMarkdownDocumentCache(parseSpy);

    const initialResult = deriveInactiveBlockDecorationsState({
      source,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false,
      markdownDocumentCache
    });

    const nextResult = deriveInactiveBlockDecorationsState({
      source,
      selection: {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      },
      hasEditorFocus: false,
      markdownDocumentCache
    });

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(initialResult.activeBlockState.activeBlock?.type).toBe("heading");
    expect(nextResult.activeBlockState.activeBlock?.type).toBe("paragraph");
    expect(nextResult.activeBlockState.blockMap).toBe(initialResult.activeBlockState.blockMap);
  });

  it("uses a supplied editor derived state without reading the document cache again", () => {
    const source = ["# Title", "", "Paragraph"].join("\n");
    const parseSpy = vi.fn(parseMarkdownDocument);
    const editorDerivedState = createEditorDerivedState({
      source,
      selection: {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      },
      parseMarkdownDocument: parseSpy
    });

    parseSpy.mockClear();

    const result = deriveInactiveBlockDecorationsState({
      source,
      selection: editorDerivedState.selection,
      hasEditorFocus: false,
      editorDerivedState
    });

    expect(parseSpy).not.toHaveBeenCalled();
    expect(result.activeBlockState).toBe(editorDerivedState.activeBlockState);
    expect(result.activeBlockState.activeBlock?.type).toBe("paragraph");
  });

  it("keeps reference-style list image widgets on the legacy block-map cache path", () => {
    const source = [
      "- ![Alt text][hero]",
      "",
      "[hero]: hero.png",
      "",
      "Paragraph"
    ].join("\n");
    const blockMapCache = createBlockMapCache(parseMarkdownDocument);

    const result = deriveInactiveBlockDecorationsState({
      source,
      selection: {
        anchor: source.indexOf("Paragraph"),
        head: source.indexOf("Paragraph")
      },
      hasEditorFocus: true,
      blockMapCache
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
    const markdownDocumentCache = createMarkdownDocumentCache(parseMarkdownDocument);

    const strongResult = deriveInactiveBlockDecorationsState({
      source: sourceWithStrong,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false,
      markdownDocumentCache
    });

    const emphasisResult = deriveInactiveBlockDecorationsState({
      source: sourceWithEmphasis,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false,
      markdownDocumentCache
    });

    expect(strongResult.activeBlockState.activeBlock?.type).toBe("paragraph");
    expect(emphasisResult.activeBlockState.activeBlock?.type).toBe("paragraph");
    expect(strongResult.signature).not.toBe(emphasisResult.signature);
  });

  it("refreshes the decoration signature when only list item inline markers change", () => {
    const sourceWithStrong = "- **bold**";
    const sourceWithEmphasis = "- *bold*";
    const markdownDocumentCache = createMarkdownDocumentCache(parseMarkdownDocument);

    const strongResult = deriveInactiveBlockDecorationsState({
      source: sourceWithStrong,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false,
      markdownDocumentCache
    });

    const emphasisResult = deriveInactiveBlockDecorationsState({
      source: sourceWithEmphasis,
      selection: { anchor: 0, head: 0 },
      hasEditorFocus: false,
      markdownDocumentCache
    });

    expect(strongResult.activeBlockState.activeBlock?.type).toBe("list");
    expect(emphasisResult.activeBlockState.activeBlock?.type).toBe("list");
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

