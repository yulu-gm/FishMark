import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import {
  createEditorSemanticContext,
  type EditorSemanticContext
} from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { planIndentIn, planIndentOut } from "./indent";

function contextAt(source: string, anchor: number): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head: anchor } });
}

function applyPlan(source: string, plan: ReturnType<typeof planIndentIn>): string {
  if (plan === null) {
    return source;
  }

  let text = source;
  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return text;
}

describe("indent planners", () => {
  it("outdents a same-line child marker once and retains the outer item on repeat", () => {
    const source = "- - alpha";
    const first = planIndentOut(contextAt(source, source.length));
    expect(applyPlan(source, first)).toBe("- alpha");
    expect(first?.selection).toEqual({ anchor: 7, head: 7 });
    expect(planIndentOut(contextAt("- alpha", 7))).toBeNull();
  });
  it("outdents an inner list to its enclosing quote without removing the outer item", () => {
    const source = "- > - alpha";
    expect(applyPlan(source, planIndentOut(contextAt(source, source.length)))).toBe("- > alpha");
  });
  it("resets an ordered marker when Tab moves the item into a new scope", () => {
    const source = ["5. parent", "6. child", "7. sibling"].join("\n");
    const context = contextAt(source, source.indexOf("child"));
    const plan = planIndentIn(context);

    expect(applyPlan(source, plan)).toBe(["5. parent", "  1. child", "7. sibling"].join("\n"));
  });

  it("outdents the continuation line together with its owning item", () => {
    const source = ["- parent", "  - child", "    - leaf", "    continuation", "- sibling"].join("\n");
    const context = contextAt(source, source.indexOf("leaf"));
    const plan = planIndentOut(context);

    expect(applyPlan(source, plan)).toBe(
      ["- parent", "  - child", "  - leaf", "  continuation", "- sibling"].join("\n")
    );
  });

  it("indents the item subtree and keeps quoted prefixes untouched", () => {
    const source = ["> - parent", "> - child"].join("\n");
    const context = contextAt(source, source.indexOf("child"));
    const plan = planIndentIn(context);

    expect(applyPlan(source, plan)).toBe(
      ["> - parent", ">   - child"].join("\n")
    );
  });

  it("moves every covered line of a nested subtree", () => {
    const source = ["- parent", "  - first", "  - child", "    - leaf"].join("\n");
    const context = contextAt(source, source.indexOf("child"));
    const plan = planIndentIn(context);

    expect(applyPlan(source, plan)).toBe(
      ["- parent", "  - first", "    - child", "      - leaf"].join("\n")
    );
  });

  it("leaves the first item of a scope alone", () => {
    const source = ["- parent", "  - child"].join("\n");
    const context = contextAt(source, source.indexOf("child"));

    expect(planIndentIn(context)).toBeNull();
  });

  it("completes and indents an unterminated marker", () => {
    const source = ["> - parent", "> -"].join("\n");
    const context = contextAt(source, source.length);
    const plan = planIndentIn(context);

    expect(applyPlan(source, plan)).toBe(["> - parent", ">   - "].join("\n"));
  });

  it("closes the empty quote lines that hide a sibling before indenting", () => {
    const source = ["> - first", ">", "> - second"].join("\n");
    const context = contextAt(source, source.indexOf("second"));
    const plan = planIndentIn(context);

    expect(applyPlan(source, plan)).toBe(["> - first", ">   - second"].join("\n"));
  });

  it("outdents the item subtree one unit", () => {
    const source = ["- parent", "  - child", "    - leaf"].join("\n");
    const context = contextAt(source, source.indexOf("child"));
    const plan = planIndentOut(context);

    expect(applyPlan(source, plan)).toBe(
      ["- parent", "- child", "  - leaf"].join("\n")
    );
  });

  it("returns null for a top-level item that cannot outdent", () => {
    const source = "- parent";
    const context = contextAt(source, source.indexOf("parent"));

    expect(planIndentOut(context)).toBeNull();
  });

  it("returns null outside a list", () => {
    const source = "Paragraph";
    const context = contextAt(source, 2);

    expect(planIndentIn(context)).toBeNull();
    expect(planIndentOut(context)).toBeNull();
  });
});

