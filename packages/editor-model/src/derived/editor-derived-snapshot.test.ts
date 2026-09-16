import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import {
  applyEditorDerivedEdit,
  createEditorDerivedSnapshotFromCache,
  deriveSelectionSnapshot
} from "./editor-derived-snapshot";

const SOURCE = [
  "# Title",
  "",
  "- one",
  "- [x] done",
  "",
  "> quoted",
  "",
  "| a | b |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
  "Paragraph"
].join("\n");

describe("editor derived snapshot", () => {
  it("answers document queries from one revision without reparsing", () => {
    const cache = createDocumentStructureCache(SOURCE);
    const snapshot = createEditorDerivedSnapshotFromCache(cache);

    expect(snapshot.revision).toBe(cache.revision);
    expect(snapshot.nodeAt(SOURCE.indexOf("Title"))?.kind).toBe("heading");
    expect(snapshot.nodeAt(SOURCE.indexOf("one"))?.kind).toBe("paragraph");
    expect(snapshot.containerPathAt(SOURCE.indexOf("one"))).toEqual(
      snapshot.nodeAt(SOURCE.indexOf("one"))?.path
    );
    expect(snapshot.lineAt(0)?.lineNumber).toBe(1);
    expect(snapshot.nodeById(snapshot.tree.root.id)).toBe(snapshot.tree.root);
  });

  it("resolves a table cursor to the cell under the offset", () => {
    const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(SOURCE));
    const cursor = snapshot.tableAt(SOURCE.indexOf("1 | 2") + 1);

    expect(cursor).not.toBeNull();
    expect(cursor?.isHeader).toBe(false);
    expect(cursor?.rowIndex).toBe(1);
    expect(cursor?.columnIndex).toBe(0);
  });

  it("recomputes only selection-derived state and keeps the document snapshot", () => {
    const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(SOURCE));
    const first = deriveSelectionSnapshot(snapshot, { anchor: 0, head: 0 });
    const second = deriveSelectionSnapshot(snapshot, { anchor: SOURCE.indexOf("one"), head: SOURCE.indexOf("one") });

    expect(first.revision).toBe(second.revision);
    expect(first.activeLine?.lineNumber).toBe(1);
    expect(second.activeLine?.lineNumber).toBe(3);
    expect(first.activeNode).not.toBe(second.activeNode);
    expect(first.selection.empty).toBe(true);
  });

  it("keeps document-derived state stable across selection changes", () => {
    const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(SOURCE));
    const before = snapshot.nodeAt(SOURCE.indexOf("quoted"));
    deriveSelectionSnapshot(snapshot, { anchor: 0, head: SOURCE.length });
    const after = snapshot.nodeAt(SOURCE.indexOf("quoted"));

    expect(after).toBe(before);
  });

  it("advances the revision and reuses structure after an incremental edit", () => {
    const cache = createDocumentStructureCache(SOURCE);
    const snapshot = createEditorDerivedSnapshotFromCache(cache);
    const result = applyEditorDerivedEdit(snapshot, cache, {
      from: SOURCE.indexOf("Paragraph"),
      to: SOURCE.indexOf("Paragraph"),
      insert: "New "
    });

    expect(result.snapshot.revision).toBe(cache.revision + 1);
    expect(result.snapshot.source).toContain("New Paragraph");
    expect(result.reparsedNodes).toBeGreaterThan(0);
    expect(result.reusedNodes + result.reparsedNodes).toBe(result.snapshot.tree.nodesById.size);
    expect(result.snapshot.nodeAt(result.snapshot.source.indexOf("New Paragraph"))?.kind).toBe("paragraph");
  });
});



