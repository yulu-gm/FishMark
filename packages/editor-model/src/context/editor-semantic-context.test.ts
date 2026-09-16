import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, reselectEditorSemanticContext } from "./editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";

const SOURCE = ["# Title", "", "- one", "", "Paragraph"].join("\n");

function createContext(revision?: number) {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(SOURCE));

  return createEditorSemanticContext({
    snapshot,
    selection: { anchor: SOURCE.indexOf("one"), head: SOURCE.indexOf("one") },
    ...(revision === undefined ? {} : { revision })
  });
}

describe("editor semantic context", () => {
  it("exposes document and selection-derived state through one context", () => {
    const context = createContext();

    expect(context.revision).toBe(1);
    expect(context.source).toBe(SOURCE);
    expect(context.nodeAt(SOURCE.indexOf("one"))?.kind).toBe("paragraph");
    expect(context.selection.activeLine?.lineNumber).toBe(3);
    expect(context.selectionContext.empty).toBe(true);
    expect(context.tableAt(0)).toBeNull();
  });

  it("rejects a command scheduled against a stale revision", () => {
    expect(() => createContext(0)).toThrow(/revision/i);
    expect(() => createContext(1)).not.toThrow();
  });

  it("recomputes only the selection part when the cursor moves", () => {
    const context = createContext();
    const moved = reselectEditorSemanticContext(context, {
      anchor: SOURCE.indexOf("Paragraph"),
      head: SOURCE.indexOf("Paragraph")
    });

    expect(moved.snapshot).toBe(context.snapshot);
    expect(moved.selection.activeLine?.lineNumber).toBe(5);
    expect(moved.selectionContext.empty).toBe(true);
  });
});
