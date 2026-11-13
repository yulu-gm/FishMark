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

  it("缩进反向选区覆盖的两行，末端所在行保持不变", () => {
    const source = ["```python", "alpha", " beta", "gamma", "```"].join("\n");
    const anchor = source.indexOf("gamma");
    const head = source.indexOf("alpha") + 2;
    const plan = planCodeFenceIndent(contextAt(source, anchor, head), "in");
    const indented = applyPlan(source, plan);
    expect(indented).toBe(["```python", "  alpha", "   beta", "gamma", "```"].join("\n"));
    expect(plan?.selection).toEqual({ anchor: anchor + 4, head: head + 2 });
    const out = planCodeFenceIndent(contextAt(indented, anchor + 4, head + 2), "out");
    expect(applyPlan(indented, out)).toBe(source);
    expect(out?.selection).toEqual({ anchor, head });
  });

  it("反缩进按实际删除量定位，未缩进的行不会移动光标", () => {
    const source = ["```", " alpha", "beta", "```"].join("\n");
    const head = source.indexOf("beta");
    const plan = planCodeFenceIndent(contextAt(source, source.indexOf(" alpha"), head + 1), "out");
    expect(applyPlan(source, plan)).toBe(source.replace(" alpha", "alpha"));
    expect(plan?.selection).toEqual({ anchor: source.indexOf(" alpha"), head });
    expect(planCodeFenceIndent(contextAt(source, head), "out")?.edits).toEqual([]);
  });

  it.each([
    ["", "", "    "],
    ["> ", "> ", "\t "],
    ["- ", "  ", "    "],
    ["> - ", ">   ", "    "],
    ["- > ", "  > ", "    "]
  ])("在容器 %s 中保留代码缩进并保护容器前缀", (opening, prefix, indent) => {
    const code = `${prefix}${indent}return 1`;
    const source = [opening + "```python", code, prefix + "```"].join("\n");
    const end = source.indexOf("return 1") + "return 1".length;
    const enter = planCodeFenceEnter(contextAt(source, end));
    const newLine = "\n" + prefix + indent;
    expect(applyPlan(source, enter)).toBe(source.slice(0, end) + newLine + source.slice(end));
    expect(enter?.selection.head).toBe(end + newLine.length);
    const start = source.indexOf("return 1");
    const out = planCodeFenceIndent(contextAt(source, start), "out");
    expect(applyPlan(source, out)).toBe(source.replace(code, prefix + indent.slice(2) + "return 1"));
  });

  it("从行首缩进中间拆行，只继承光标左侧的空格", () => {
    const source = ["> - ```python", ">       return 1", ">   ```"].join("\n");
    const offset = source.indexOf("return 1") - 2;
    const plan = planCodeFenceEnter(contextAt(source, offset));
    expect(applyPlan(source, plan)).toBe(["> - ```python", ">     ", ">       return 1", ">   ```"].join("\n"));
    expect(plan?.selection.head).toBe(offset + "\n>     ".length);
  });

  it("空代码行可缩进并继承缩进，反缩进只移除容器后的空格", () => {
    const source = ["> - ```python", ">   ", ">   ```"].join("\n");
    const offset = source.indexOf("\n", source.indexOf("\n") + 1);
    expect(planCodeFenceIndent(contextAt(source, offset), "out")?.edits).toEqual([]);
    const tab = planCodeFenceIndent(contextAt(source, offset), "in");
    const indented = applyPlan(source, tab);
    expect(indented).toBe(["> - ```python", ">     ", ">   ```"].join("\n"));
    const caret = tab!.selection.head;
    const enter = planCodeFenceEnter(contextAt(indented, caret));
    expect(applyPlan(indented, enter)).toBe(["> - ```python", ">     ", ">     ", ">   ```"].join("\n"));
    expect(applyPlan(indented, planCodeFenceIndent(contextAt(indented, caret), "out"))).toBe(source);
  });

  it("returns null outside a fence", () => {
    const source = "Paragraph";

    expect(planCodeFenceCompletion(contextAt(source, 2), "ts")).toBeNull();
    expect(planCodeFenceIndent(contextAt(source, 2), "in")).toBeNull();
    expect(planCodeFenceEnter(contextAt(source, 2))).toBeNull();
  });
});
