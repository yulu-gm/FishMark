import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import {
  planBlockquoteToggle,
  planBulletListToggle,
  planEmphasisToggle,
  planHeadingToggle,
  planStrongToggle
} from "./formatting";

function contextAt(source: string, anchor: number, head = anchor): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head } });
}

function applyPlan(source: string, plan: ReturnType<typeof planStrongToggle>): string {
  if (plan === null) {
    return source;
  }

  let text = source;

  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return text;
}

describe("formatting planners", () => {
  it("wraps and unwraps a selection in strong markers", () => {
    const source = "Alpha Beta";
    const wrapped = planStrongToggle(contextAt(source, 0, 5));
    const unwrapped = planStrongToggle(contextAt(applyPlan(source, wrapped), 2, 7));

    expect(applyPlan(source, wrapped)).toBe("**Alpha** Beta");
    expect(applyPlan("**Alpha** Beta", unwrapped)).toBe("Alpha Beta");
  });

  it("inserts an empty pair and places the caret between the markers", () => {
    const source = "Alpha";
    const plan = planEmphasisToggle(contextAt(source, source.length));

    expect(applyPlan(source, plan)).toBe("Alpha**");
    expect(plan?.selection).toEqual({ anchor: source.length + 1, head: source.length + 1 });
  });

  it("toggles a heading level and removes it when it already matches", () => {
    const source = "Title";
    const applied = planHeadingToggle(contextAt(source, 2), 2);

    expect(applyPlan(source, applied)).toBe("## Title");
    expect(applyPlan("## Title", planHeadingToggle(contextAt("## Title", 5), 2))).toBe("Title");
  });

  it("converts a heading level in place", () => {
    const source = "## Title";
    const plan = planHeadingToggle(contextAt(source, 6), 3);

    expect(applyPlan(source, plan)).toBe("### Title");
  });

  it("adds and removes bullet markers on the selected lines", () => {
    const source = ["one", "two"].join("\n");
    const added = planBulletListToggle(contextAt(source, 0, source.length));

    expect(applyPlan(source, added)).toBe(["- one", "- two"].join("\n"));
    expect(applyPlan(["- one", "- two"].join("\n"), planBulletListToggle(contextAt(["- one", "- two"].join("\n"), 0, 9)))).toBe(
      ["one", "two"].join("\n")
    );
  });

  it("adds and removes one quote level", () => {
    const source = "quoted";
    const added = planBlockquoteToggle(contextAt(source, 2));

    expect(applyPlan(source, added)).toBe("> quoted");
    expect(applyPlan("> quoted", planBlockquoteToggle(contextAt("> quoted", 4)))).toBe("quoted");
  });

  it("keeps list and quote combinations valid", () => {
    const source = ["> - item", "> - next"].join("\n");
    const plan = planBulletListToggle(contextAt(source, source.indexOf("item"), source.indexOf("next") + 2));

    expect(applyPlan(source, plan)).toBe(["> item", "> next"].join("\n"));
  });
});

