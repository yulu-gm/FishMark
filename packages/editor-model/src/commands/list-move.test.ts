import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { planMoveListItemDown, planMoveListItemUp } from "./list-move";
import { planNormalizeOrderedListScopes } from "./ordered-list";

function contextAt(source: string, anchor: number): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head: anchor } });
}

function applyPlan(source: string, plan: ReturnType<typeof planMoveListItemDown>): string {
  if (plan === null) {
    return source;
  }

  let text = source;

  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return text;
}

describe("list move planners", () => {
  it("moves an item subtree down past its sibling", () => {
    const source = ["5. parent", "6. child", "  continuation", "  - nested", "7. sibling"].join("\n");
    const plan = planMoveListItemDown(contextAt(source, source.indexOf("child")));

    expect(applyPlan(source, plan)).toBe(
      ["5. parent", "6. sibling", "7. child", "  continuation", "  - nested"].join("\n")
    );
  });

  it("moves an item subtree up past its sibling", () => {
    const source = ["5. parent", "6. sibling", "7. child", "  continuation", "  - nested"].join("\n");
    const plan = planMoveListItemUp(contextAt(source, source.indexOf("child")));

    expect(applyPlan(source, plan)).toBe(
      ["5. parent", "6. child", "  continuation", "  - nested", "7. sibling"].join("\n")
    );
  });

  it("keeps the caret inside the moved item", () => {
    const source = ["- one", "- two"].join("\n");
    const plan = planMoveListItemDown(contextAt(source, 3));

    expect(plan?.selection.anchor).toBe(source.indexOf("- two") + 3);
  });

  it("returns null at the list edges and outside a list", () => {
    expect(planMoveListItemUp(contextAt("- only", 3))).toBeNull();
    expect(planMoveListItemDown(contextAt("- only", 3))).toBeNull();
    expect(planMoveListItemDown(contextAt("Paragraph", 3))).toBeNull();
  });

  it("moves a quoted item without losing its quote prefixes", () => {
    const source = ["> - one", "> - two"].join("\n");
    const plan = planMoveListItemDown(contextAt(source, source.indexOf("one")));

    expect(applyPlan(source, plan)).toBe(["> - two", "> - one"].join("\n"));
  });
});

describe("ordered list normalization", () => {
  it("renumbers a drifted ordered scope", () => {
    const source = ["1. one", "3. two", "4. three"].join("\n");
    const plan = planNormalizeOrderedListScopes(contextAt(source, source.indexOf("two")));

    expect(applyPlan(source, plan)).toBe(["1. one", "2. two", "3. three"].join("\n"));
  });

  it("keeps numbering across an indented continuation line", () => {
    const source = ["1. one", "  tail", "5. two"].join("\n");
    const plan = planNormalizeOrderedListScopes(contextAt(source, source.indexOf("two")));

    expect(applyPlan(source, plan)).toBe(["1. one", "  tail", "2. two"].join("\n"));
  });

  it("restarts numbering after an item whose text continues unindented", () => {
    const source = ["1. one", "tail", "5. two"].join("\n");
    const plan = planNormalizeOrderedListScopes(contextAt(source, source.indexOf("two")));

    expect(applyPlan(source, plan)).toBe(["1. one", "tail", "1. two"].join("\n"));
  });

  it("returns null when numbering already matches", () => {
    const source = ["1. one", "2. two"].join("\n");

    expect(planNormalizeOrderedListScopes(contextAt(source, 0))).toBeNull();
  });

  it("returns null outside an ordered list", () => {
    expect(planNormalizeOrderedListScopes(contextAt("- one", 2))).toBeNull();
    expect(planNormalizeOrderedListScopes(contextAt("Paragraph", 2))).toBeNull();
  });
});

