import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import {
  createEditorSemanticContext,
  type EditorSemanticContext
} from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import {
  INTENT_POLICIES,
  planPointerSelection,
  planPrintableInput,
  planProgrammaticNormalization,
  planVerticalNavigation,
  policyFor
} from "./navigation";

function contextAt(source: string, anchor: number): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head: anchor } });
}

describe("navigation policies", () => {
  it("declares whether each intent may change structure", () => {
    expect(policyFor("printable-input").structural).toBe(false);
    expect(policyFor("pointer").structural).toBe(false);
    expect(policyFor("programmatic-normalization").movesCaret).toBe(false);
    expect(policyFor("structural-arrow").structural).toBe(true);
    expect(Object.keys(INTENT_POLICIES)).toHaveLength(4);
  });

  it("moves between visible lines and keeps the preferred column", () => {
    const source = ["> alpha", "> beta"].join("\n");
    const context = contextAt(source, source.length);
    const plan = planVerticalNavigation(context, "up");

    expect(plan?.edits).toEqual([]);
    expect(plan?.intent).toBe("navigation");
    expect(plan?.selection.anchor).toBe(source.indexOf("alpha") + "alpha".length);
  });

  it("keeps the visible column across hidden prefixes at mixed depths", () => {
    const source = ["> - alpha", ">   - beta"].join("\n");
    const context = contextAt(source, source.indexOf("alpha") + 2);
    const plan = planVerticalNavigation(context, "down");

    expect(plan).not.toBeNull();
    expect(plan?.selection.anchor).toBeGreaterThan(source.indexOf("beta"));
  });

  it("navigates across a structural blank line at depth", () => {
    const source = ["> - one", ">", "> - two"].join("\n");
    const first = planVerticalNavigation(contextAt(source, source.indexOf("one") + 1), "down");

    // The empty quoted line only offers the caret position after its marker.
    expect(first?.selection.anchor).toBe(source.indexOf("\n") + 2);

    const second = planVerticalNavigation(contextAt(source, first?.selection.anchor ?? 0), "down");
    expect(second?.selection.anchor).toBe(source.indexOf("- two") + 2);
  });

  it("returns null at the document edges", () => {
    const source = "Only";

    expect(planVerticalNavigation(contextAt(source, 1), "up")).toBeNull();
    expect(planVerticalNavigation(contextAt(source, 1), "down")).toBeNull();
  });

  it("never moves structure for printable input", () => {
    const source = "- item";
    const context = contextAt(source, source.length);
    const plan = planPrintableInput(context, "x");

    expect(plan.intent).toBe("edit");
    expect(plan.edits).toEqual([{ from: source.length, to: source.length, insert: "x" }]);
    expect(plan.selection).toEqual({ anchor: source.length + 1, head: source.length + 1 });
    expect(policyFor("printable-input").structural).toBe(false);
  });

  it("sets the caret from a pointer press without editing", () => {
    const source = ["> quoted", "plain"].join("\n");
    const plan = planPointerSelection(contextAt(source, 3), source.indexOf("plain"));

    expect(plan.edits).toEqual([]);
    expect(plan.selection).toEqual({ anchor: source.indexOf("plain"), head: source.indexOf("plain") });
  });

  it("never normalizes structure on its own", () => {
    expect(planProgrammaticNormalization(contextAt("# Title", 2))).toBeNull();
  });
});


