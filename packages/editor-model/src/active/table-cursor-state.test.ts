import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { describe, expect, it } from "vitest";

import { deriveTableCursorState } from "./table-cursor-state";

function snapshotFor(source: string) {
  return createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
}

describe("deriveTableCursorState", () => {
  it("detects a cursor inside a quote-internal table cell", () => {
    const source = ["> | name | qty |", "> | --- | ---: |", "> | pen | 2 |"].join("\n");
    const snapshot = snapshotFor(source);
    const cursor = deriveTableCursorState(
      snapshot,
      {
        anchor: source.indexOf("pen"),
        head: source.indexOf("pen")
      },
      null
    );

    expect(cursor).toEqual({
      mode: "inside",
      tableNodeId: snapshot.nodeAt(source.indexOf("pen"))!.id,
      tableStartOffset: 0,
      row: 1,
      column: 0,
      offsetInCell: 0
    });
  });

  it("detects quote-internal table adjacency from the quoted line above", () => {
    const source = [
      "> Intro",
      ">",
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |"
    ].join("\n");
    const snapshot = snapshotFor(source);
    const cursor = deriveTableCursorState(
      snapshot,
      {
        anchor: source.indexOf("> Intro") + "> Intro".length,
        head: source.indexOf("> Intro") + "> Intro".length
      },
      null
    );

    expect(cursor).toMatchObject({
      mode: "adjacent-above",
      tableStartOffset: source.indexOf("> | name"),
      row: 0,
      column: 0
    });
  });

  it("does not derive body-to-blockquote table adjacency from the line above", () => {
    const source = [
      "Intro",
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |"
    ].join("\n");
    const snapshot = snapshotFor(source);
    const cursor = deriveTableCursorState(
      snapshot,
      {
        anchor: source.indexOf("Intro") + "Intro".length,
        head: source.indexOf("Intro") + "Intro".length
      },
      null
    );

    expect(cursor).toBeNull();
  });

  it("does not derive body-to-blockquote table adjacency across a quote-only blank line", () => {
    const source = [
      "Intro",
      ">",
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |"
    ].join("\n");
    const snapshot = snapshotFor(source);
    const cursor = deriveTableCursorState(
      snapshot,
      {
        anchor: source.indexOf("Intro") + "Intro".length,
        head: source.indexOf("Intro") + "Intro".length
      },
      null
    );

    expect(cursor).toBeNull();
  });

  it("does not derive body-to-blockquote table adjacency from the line below", () => {
    const source = [
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |",
      "",
      "Outro"
    ].join("\n");
    const snapshot = snapshotFor(source);
    const cursor = deriveTableCursorState(
      snapshot,
      {
        anchor: source.indexOf("Outro"),
        head: source.indexOf("Outro")
      },
      null
    );

    expect(cursor).toBeNull();
  });

  it("does not derive top-level table adjacency across a standalone quote line from above", () => {
    const source = [
      "Intro",
      ">",
      "| name | qty |",
      "| --- | ---: |",
      "| pen | 2 |"
    ].join("\n");
    const snapshot = snapshotFor(source);
    const cursor = deriveTableCursorState(
      snapshot,
      {
        anchor: source.indexOf("Intro") + "Intro".length,
        head: source.indexOf("Intro") + "Intro".length
      },
      null
    );

    expect(cursor).toBeNull();
  });

  it("does not derive top-level table adjacency across a standalone quote line from below", () => {
    const source = [
      "| name | qty |",
      "| --- | ---: |",
      "| pen | 2 |",
      ">",
      "Outro"
    ].join("\n");
    const snapshot = snapshotFor(source);
    const cursor = deriveTableCursorState(
      snapshot,
      {
        anchor: source.indexOf("Outro"),
        head: source.indexOf("Outro")
      },
      null
    );

    expect(cursor).toBeNull();
  });
});
