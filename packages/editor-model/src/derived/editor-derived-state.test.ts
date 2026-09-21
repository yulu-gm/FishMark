import { describe, expect, it } from "vitest";

import { createEditorDerivedSnapshotFromCache } from "./editor-derived-snapshot";
import { childrenOf, createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorDerivedState } from "./editor-derived-state";

const snapshotOf = (source: string) =>
  createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

describe("createEditorDerivedState", () => {
  it("reuses document geometry across selections and replaces it when the canonical revision changes", () => {
    const source = "# Title\n\nParagraph";
    const snapshot = snapshotOf(source);
    const first = createEditorDerivedState({ snapshot, selection: { anchor: 0, head: 0 } });
    const second = createEditorDerivedState({ snapshot, selection: { anchor: source.length, head: source.length } });
    expect(second.editingDocument).toBe(first.editingDocument);
    expect(second.outlineHeadings).toBe(first.outlineHeadings);
    expect(second.activeBlockState.snapshot.tree).toBe(first.activeBlockState.snapshot.tree);
    expect(first.activeLine.number).toBe(1);
    expect(second.activeLine.number).toBe(3);
    expect(second.activeBlockState.activeKind).toBe("paragraph");
    const third = createEditorDerivedState({
      snapshot: snapshotOf("# Next\n\nParagraph"),
      selection: { anchor: 0, head: 0 }
    });
    expect(third.editingDocument).not.toBe(first.editingDocument);
    expect(third.outlineHeadings[0]?.label).toBe("Next");
  });

  it("derives the active block, table cursor and definition indexes from one canonical snapshot", () => {
    const source = [
      "# **Title**",
      "",
      "| name | qty |",
      "| --- | ---: |",
      "| pen | 2 |",
      "",
      "[hero]: hero.png"
    ].join("\n");
    const snapshot = snapshotOf(source);
    const selectionOffset = source.indexOf("pen");

    const state = createEditorDerivedState({
      snapshot,
      selection: {
        anchor: selectionOffset,
        head: selectionOffset
      }
    });

    expect(state.source).toBe(source);
    expect(state.referenceDefinitions).toBe(snapshot.tree.referenceDefinitions);
    expect(state.footnoteDefinitions).toBe(snapshot.tree.footnoteDefinitions);
    expect(state.activeBlockState.snapshot).toBe(snapshot);
    expect(state.activeBlockState.activeKind).toBe("table");
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
    const headingNode = snapshot.tree.root.children[0]!;
    expect(state.outlineHeadings).toEqual([
      {
        id: headingNode.id,
        depth: 1,
        label: "Title",
        startOffset: 0,
        startLine: 1
      }
    ]);
    expect(state.outlineHeadings[0]?.id).toBe(snapshot.nodeById(headingNode.id)?.id);
  });

  it("keeps whitespace-only Markdown semantic blocks unchanged while exposing an active physical line", () => {
    const source = " ";
    const state = createEditorDerivedState({
      snapshot: snapshotOf(source),
      selection: {
        anchor: source.length,
        head: source.length
      }
    });

    expect(childrenOf(state.activeBlockState.snapshot.tree.root)).toHaveLength(0);
    expect(state.activeLine).toMatchObject({
      number: 1,
      kind: "whitespace",
      from: 0,
      to: 1
    });
    expect(state.activeBlockState.activeKind).toBeNull();
  });

  it("exposes an active empty physical line for an empty document", () => {
    const state = createEditorDerivedState({
      snapshot: snapshotOf(""),
      selection: {
        anchor: 0,
        head: 0
      }
    });

    expect(state.activeLine).toMatchObject({
      number: 1,
      kind: "empty",
      from: 0,
      to: 0
    });
    expect(state.activeBlockState.activeKind).toBeNull();
  });
});
