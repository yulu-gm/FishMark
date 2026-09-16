import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import {
  planCodeFenceCompletion,
  planCodeFenceEnter,
  planCodeFenceIndent,
  planCodeFenceToggle
} from "./code-fence";

function contextAt(source: string, anchor: number, head = anchor): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head } });
}

function applyPlan(source: string, plan: ReturnType<typeof planCodeFenceToggle>): string {
  if (plan === null) {
    return source;
  }

  let text = source;

  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return text;
}

const FENCE = ["```ts", "const value = 1;", "```"].join("\n");

describe("code fence planners", () => {
  it("wraps a selection in a fence and unwraps an existing one", () => {
    const source = "const value = 1;";
    const wrapped = planCodeFenceToggle(contextAt(source, 0, source.length));

    expect(applyPlan(source, wrapped)).toBe(`\`\`\`\n${source}\n\`\`\``);
    expect(applyPlan(FENCE, planCodeFenceToggle(contextAt(FENCE, 5)))).toBe("const value = 1;");
  });

  it("inserts an empty fence at a collapsed caret", () => {
    const source = "Paragraph";
    const plan = planCodeFenceToggle(contextAt(source, source.length));

    expect(applyPlan(source, plan)).toBe("Paragraph```\n\n```");
    expect(plan?.selection).toEqual({ anchor: source.length + 4, head: source.length + 4 });
  });

  it("completes the opening fence language only", () => {
    const source = ["```", "body", "```"].join("\n");
    const plan = planCodeFenceCompletion(contextAt(source, 1), "python");
    const cleared = planCodeFenceCompletion(contextAt(FENCE, 5), "");

    expect(applyPlan(source, plan)).toBe(["```python", "body", "```"].join("\n"));
    expect(applyPlan(FENCE, cleared)).toBe(["```", "const value = 1;", "```"].join("\n"));
  });

  it("inserts fence content inside the fence and leaves it at the closing marker", () => {
    const insertLine = applyPlan(FENCE, planCodeFenceEnter(contextAt(FENCE, FENCE.indexOf("value"))));
    const leaveFence = applyPlan(FENCE, planCodeFenceEnter(contextAt(FENCE, FENCE.length)));

    expect(insertLine.split("\n")).toHaveLength(4);
    expect(leaveFence.endsWith("```\n")).toBe(true);
  });

  it("keeps quoted fences inside their quote prefix", () => {
    const quoted = ["> ```ts", "> body", "> ```"].join("\n");
    const plan = planCodeFenceCompletion(contextAt(quoted, quoted.indexOf("body")), "json");

    expect(applyPlan(quoted, plan)).toBe(["> ```json", "> body", "> ```"].join("\n"));
  });

  it("indents and outdents fence content only", () => {
    const source = ["```", "  body", "```"].join("\n");
    const outdented = applyPlan(source, planCodeFenceIndent(contextAt(source, source.indexOf("body")), "out"));
    const indented = applyPlan(source, planCodeFenceIndent(contextAt(source, source.indexOf("body")), "in"));

    expect(outdented).toBe(["```", "body", "```"].join("\n"));
    expect(indented).toBe(["```", "    body", "```"].join("\n"));
  });

  it("returns null outside a fence", () => {
    const source = "Paragraph";

    expect(planCodeFenceCompletion(contextAt(source, 2), "ts")).toBeNull();
    expect(planCodeFenceIndent(contextAt(source, 2), "in")).toBeNull();
    expect(planCodeFenceEnter(contextAt(source, 2))).toBeNull();
  });
});
