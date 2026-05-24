import { describe, expect, it, vi } from "vitest";

import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { createEditorDerivedState } from "./editor-derived-state";

describe("createEditorDerivedState", () => {
  it("builds one reusable derived state from a single Markdown document parse", () => {
    const source = [
      "# **Title**",
      "",
      "| name | qty |",
      "| --- | ---: |",
      "| pen | 2 |",
      "",
      "[hero]: hero.png"
    ].join("\n");
    const parseSpy = vi.fn(parseMarkdownDocument);
    const selectionOffset = source.indexOf("pen");

    const state = createEditorDerivedState({
      source,
      selection: {
        anchor: selectionOffset,
        head: selectionOffset
      },
      parseMarkdownDocument: parseSpy
    });

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(state.source).toBe(source);
    expect(state.markdownDocument).toBe(parseSpy.mock.results[0]?.value);
    expect(state.activeBlockState.blockMap).toBe(state.markdownDocument);
    expect(state.activeBlockState.activeBlock?.type).toBe("table");
    expect(state.tableCursor).toMatchObject({
      mode: "inside",
      row: 1,
      column: 0
    });
    expect(state.activeBlockState.tableCursor).toBe(state.tableCursor);
    expect(state.editingDocument.source).toBe(source);
    expect(state.activeLine).toMatchObject({
      number: 5,
      kind: "text",
      text: "| pen | 2 |"
    });
    expect(state.referenceDefinitions?.get("hero")?.href).toBe("hero.png");
    expect(state.outlineHeadings).toEqual([
      {
        id: "heading:0-11",
        depth: 1,
        label: "Title",
        startOffset: 0,
        startLine: 1
      }
    ]);
  });

  it("keeps whitespace-only Markdown semantic blocks unchanged while exposing an active physical line", () => {
    const source = " ";
    const state = createEditorDerivedState({
      source,
      selection: {
        anchor: source.length,
        head: source.length
      },
      parseMarkdownDocument
    });

    expect(state.markdownDocument.blocks).toHaveLength(0);
    expect(state.activeLine).toMatchObject({
      number: 1,
      kind: "whitespace",
      from: 0,
      to: 1
    });
    expect(state.activeBlockState.activeBlock).toBeNull();
  });

  it("exposes an active empty physical line for an empty document", () => {
    const state = createEditorDerivedState({
      source: "",
      selection: {
        anchor: 0,
        head: 0
      },
      parseMarkdownDocument
    });

    expect(state.activeLine).toMatchObject({
      number: 1,
      kind: "empty",
      from: 0,
      to: 0
    });
    expect(state.activeBlockState.activeBlock).toBeNull();
  });
});
