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
  it("indents the item subtree and keeps quoted prefixes untouched", () => {
    const source = ["> - parent", "> - child"].join("\n");
    const context = contextAt(source, source.indexOf("child"));
    const plan = planIndentIn(context);

    expect(applyPlan(source, plan)).toBe(
      ["> - parent", ">   - child"].join("\n")
    );
  });

  it("moves every covered line of a nested subtree", () => {
    const source = ["- parent", "  - child", "    - leaf"].join("\n");
    const context = contextAt(source, source.indexOf("child"));
    const plan = planIndentIn(context);

    expect(applyPlan(source, plan)).toBe(
      ["- parent", "    - child", "      - leaf"].join("\n")
    );
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

