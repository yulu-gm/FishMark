import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { planBackspace } from "./backspace";
import { planDelete } from "./delete";

afterEach(() => vi.restoreAllMocks());
function contextAt(source: string, anchor: number) {
  return createEditorSemanticContext({ snapshot: createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source)), selection: { anchor, head: anchor } });
}
describe("ordinary Unicode deletion", () => {
  it.each(["😀", "e\u0301", "👩🏽‍💻", "🇨🇳", "a\u0301\u0327"])("removes the complete %s grapheme in both directions", (grapheme) => {
    const source = `A${grapheme}B`;
    for (const [planner, offset] of [[planBackspace, 1 + grapheme.length], [planDelete, 1]] as const) {
      const plan = planner(contextAt(source, offset))!;
      expect(plan.edits).toEqual([{ from: 1, to: 1 + grapheme.length, insert: "" }]);
      const edit = plan.edits[0]!;
      expect(source.slice(0, edit.from) + source.slice(edit.to)).toBe("AB");
      expect(plan.selection).toEqual({ anchor: 1, head: 1 });
    }
  });
  it("does not split a surrogate pair even if an external caret falls inside it", () => {
    for (const planner of [planBackspace, planDelete]) {
      expect(planner(contextAt("😀", 1))!.edits).toEqual([{ from: 0, to: 2, insert: "" }]);
    }
  });
  it("segments only the active physical line in a large document", () => {
    const prefix = "unchanged\n\n".repeat(2000);
    const source = `${prefix}A👩🏽‍💻B\n\nlast`;
    const context = contextAt(source, prefix.length + 1);
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
    expect(planDelete(context)!.edits[0]!.from).toBe(prefix.length + 1);
    expect(segment).toHaveBeenCalledExactlyOnceWith("A👩🏽‍💻B");
  });
});
