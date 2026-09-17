import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { decideBackspace, planBackspace, type BackspacePlanKind } from "./backspace";

function contextAt(source: string, anchor: number, head = anchor): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head } });
}

function applyPlan(
  source: string,
  anchor: number,
  head = anchor
): { text: string; cursor: number; kind: BackspacePlanKind | null } {
  const context = contextAt(source, anchor, head);
  const decision = decideBackspace(context);
  const plan = planBackspace(context);

  if (plan === null || decision === null) {
    return { text: source, cursor: anchor, kind: null };
  }

  let text = source;
  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return { text, cursor: plan.selection.anchor, kind: decision.kind };
}

describe("planBackspace", () => {
  it("deletes one ordinary character", () => {
    const source = "Alpha";
    const result = applyPlan(source, 3);

    expect(result.kind).toBe("default");
    expect(result.text).toBe("Alha");
    expect(result.cursor).toBe(2);
  });

  it("deletes a selected range", () => {
    const source = "Alpha Beta";
    const result = applyPlan(source, 2, 6);

    expect(result.kind).toBe("range-delete");
    expect(result.text).toBe("AlBeta");
    expect(result.cursor).toBe(2);
  });

  it("degrades a list marker to its indentation", () => {
    const source = "- item";
    const result = applyPlan(source, "- ".length);

    expect(result.kind).toBe("marker-degrade");
    expect(result.text).toBe("item");
    expect(result.cursor).toBe(0);
  });

  it("degrades a quoted item marker before touching the quote level", () => {
    const source = "> - item";
    const result = applyPlan(source, "> - ".length);

    expect(result.kind).toBe("marker-degrade");
    expect(result.text).toBe("> item");
  });

  it("degrades one quote level when the cursor is at the content start", () => {
    const source = "> quoted";
    const result = applyPlan(source, "> ".length);

    expect(result.kind).toBe("quote-degrade");
    expect(result.text).toBe("quoted");
  });

  it("moves a complete nested subtree when outdenting", () => {
    const source = ["- parent", "  - child", "    - leaf"].join("\n");
    const offset = source.indexOf("- child");
    const result = applyPlan(source, offset);

    expect(result.kind).toBe("indent-degrade");
    expect(result.text).toBe(["- parent", "- child", "  - leaf"].join("\n"));
  });

  it("degrades one step per press for repeated deletion", () => {
    const source = "- item";
    const first = applyPlan(source, "- ".length);
    const second = applyPlan(first.text, first.text.length);

    expect(first.kind).toBe("marker-degrade");
    expect(first.text).toBe("item");
    expect(second.kind).toBe("default");
    expect(second.text).toBe("ite");
  });

  it("keeps a whitespace line untouched when there is no marker", () => {
    const source = "Alpha\n   ";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("default");
    expect(result.text).toBe("Alpha\n  ");
  });

  it("collapses a trailing blank line back to the last line with content", () => {
    const source = "Alpha\n\n";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("subtree-join");
    expect(result.text).toBe("Alpha");
    expect(result.cursor).toBe("Alpha".length);
  });

  it("collapses a trailing run of empty quote lines", () => {
    const source = ["> 1111", ">", "> "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("subtree-join");
    expect(result.text).toBe("> 1111");
    expect(result.cursor).toBe("> 1111".length);
  });
});




