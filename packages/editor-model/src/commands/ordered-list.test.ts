import { describe, expect, it } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { createEditorSemanticContext } from "../context/editor-semantic-context";
import { planNormalizeOrderedListScopes } from "./ordered-list";

function normalize(source: string, ranges: readonly { from: number; to: number }[] = [], anchor = source.length, head = anchor) {
  const context = createEditorSemanticContext({
    snapshot: createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source)),
    selection: { anchor, head }
  });
  const plan = planNormalizeOrderedListScopes(context, { changedRanges: ranges });
  let text = source;
  for (const edit of [...(plan?.edits ?? [])].reverse()) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return { text, plan };
}

describe("ordered normalization over canonical scopes", () => {
  it.each([
    ["5. parent\n  3) nested one\n  4) nested two\n7. sibling", "5. parent\n  3) nested one\n  4) nested two\n6. sibling"],
    ["1. one\n9. two\n\n3. three\n9. four", "1. one\n2. two\n\n3. three\n4. four"],
    ["1. one\n9. two\n5) three\n9) four", "1. one\n2. two\n5) three\n6) four"],
    ["1. one\n2. two\n3. four\n4\n5. six\n6. seven", "1. one\n2. two\n3. four\n4\n1. six\n2. seven"],
    ["> 5. first\n> 9. second", "> 5. first\n> 6. second"],
    ["1. 内容\n内容2\n3. 内容3", "1. 内容\n内容2\n1. 内容3"]
  ])("preserves scope start and delimiters in %j", (source, expected) => {
    expect(normalize(source).text).toBe(expected);
  });

  it("normalizes only the changed root for one changed range", () => {
    const source = "1. stale\n3. stale\n\n5. current\n9. next";
    const from = source.indexOf("current");
    expect(normalize(source, [{ from, to: from + 7 }]).text).toBe("1. stale\n3. stale\n\n5. current\n6. next");
  });

  it("normalizes all roots for multi-range edits", () => {
    const source = "1. stale\n3. stale\n\n5. current\n9. next";
    expect(normalize(source, [{ from: 3, to: 4 }, { from: source.indexOf("current"), to: source.length }]).text)
      .toBe("1. stale\n2. stale\n\n5. current\n6. next");
  });

  it.each(["six", "\n4\n"])("keeps the whole lazy continuation scope when editing %j", (text) => {
    const source = "1. one\n2. two\n3. four\n4\n5. six\n6. seven";
    const from = source.indexOf(text);
    expect(normalize(source, [{ from, to: from + text.length }]).text)
      .toBe("1. one\n2. two\n3. four\n4\n1. six\n2. seven");
  });

  it("does not rewrite a list when typing in a separate paragraph", () => {
    const source = "Paragraph updated\n\n1. one\n3. two";
    expect(normalize(source, [{ from: 9, to: 17 }]).plan).toBeNull();
  });

  it("preserves reversed selections while marker widths change", () => {
    const source = "8. first\n20. second\n30. third";
    const head = source.indexOf("second");
    const result = normalize(source, [], source.length, head);
    expect(result.text).toBe("8. first\n9. second\n10. third");
    expect(result.plan?.selection).toEqual({ anchor: result.text.length, head: result.text.indexOf("second") });
  });

  it("keeps selection before subsequent marker changes unmoved", () => {
    const source = "1. alpha\n2. split content\n2. last";
    const anchor = source.indexOf("split");
    expect(normalize(source, [], anchor).plan?.selection).toEqual({ anchor, head: anchor });
  });
});
