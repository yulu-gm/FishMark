import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { applyEditorDerivedEdit, createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { decideDelete, planDelete, type DeletePlanKind } from "./delete";

function contextAt(source: string, anchor: number, head = anchor): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head } });
}

function applyPlan(
  source: string,
  anchor: number,
  head = anchor
): { text: string; cursor: number; kind: DeletePlanKind | null } {
  const context = contextAt(source, anchor, head);
  const decision = decideDelete(context);
  const plan = planDelete(context);

  if (plan === null || decision === null) {
    return { text: source, cursor: anchor, kind: null };
  }

  let text = source;
  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return { text, cursor: plan.selection.anchor, kind: decision.kind };
}

describe("planDelete", () => {
  it("deletes one ordinary character", () => {
    const source = "Alpha";
    const result = applyPlan(source, 0);

    expect(result.kind).toBe("default");
    expect(result.text).toBe("lpha");
    expect(result.cursor).toBe(0);
  });

  it("deletes a selected range", () => {
    const source = "Alpha Beta";
    const result = applyPlan(source, 5, 10);

    expect(result.kind).toBe("range-delete");
    expect(result.text).toBe("Alpha");
  });

  it("joins the next paragraph line and removes its hidden prefix", () => {
    const source = ["> alpha", "> beta"].join("\n");
    const result = applyPlan(source, "> alpha".length);

    expect(result.kind).toBe("line-join");
    expect(result.text).toBe("> alphabeta");
    expect(result.cursor).toBe("> alpha".length);
  });

  it("joins a quoted item into the previous quoted line", () => {
    const source = ["> - one", "> - two"].join("\n");
    const result = applyPlan(source, "> - one".length);

    expect(result.kind).toBe("line-join");
    expect(result.text).toBe("> - onetwo");
  });

  it("recomputes the destination path after a cross-container join", () => {
    const source = ["> quoted", "outside"].join("\n");
    const context = contextAt(source, "> quoted".length);
    const plan = planDelete(context);
    const applied = applyEditorDerivedEdit(context.snapshot, createDocumentStructureCache(source), {
      from: "> quoted".length,
      to: "> quoted\n".length,
      insert: ""
    });
    const afterContext = createEditorSemanticContext({
      snapshot: applied.snapshot,
      selection: { anchor: 1, head: 1 }
    });

    expect(plan?.edits).toHaveLength(1);
    // The joined text is no longer inside the blockquote, so the destination path is recomputed.
    expect(afterContext.source).toBe("> quotedoutside");
    expect(afterContext.containerPathAt(1)).toEqual(applied.snapshot.containerPathAt(1));
  });

  it("returns null at the end of the document", () => {
    const source = "Alpha";

    expect(planDelete(contextAt(source, source.length))).toBeNull();
  });
});



