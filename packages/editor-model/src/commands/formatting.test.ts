import { describe, expect, it } from "vitest";

import { createDocumentStructureCache, parseInlineAst, type InlineNode } from "@fishmark/markdown-engine";

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

  it.each([
    ["粗体前半段", planStrongToggle, "前 **alpha beta** 后", "alpha", "前 alpha **beta** 后"],
    ["粗体中间段", planStrongToggle, "**one two three**", "two", "**one** two **three**"],
    ["斜体后半段", planEmphasisToggle, "_alpha beta_", "beta", "_alpha_ beta"],
    ["保留已有删除线", planStrongToggle, "**~~one two~~**", "one", "~~one~~ **~~two~~**"],
    ["粗体里的斜体不丢失", planStrongToggle, "**one *two three* four**", "two", "**one** *two* ***three* four**"],
    ["三重星号只去粗体", planStrongToggle, "***one two***", "one", "*one **two***"],
    ["三重星号只去斜体", planEmphasisToggle, "***one two***", "one", "**one** ***two***"],
    ["从已有粗体跨到普通文字", planStrongToggle, "**one two** three", "two** three", "**one two three**"],
    ["从普通文字跨到已有粗体", planStrongToggle, "one **two three**", "one **two", "**one two three**"],
    ["横跨两个粗体片段仍可取消", planStrongToggle, "**one two** **three four**", "two** **three", "**one** two three **four**"],
    ["选区两端空格不进入标记", planStrongToggle, "one two three", " two ", "one **two** three"],
    ["单词中间取消", planStrongToggle, "**alpha**", "ph", "**al**ph**a**"],
    ["节点带转义和实体", planStrongToggle, "**one \\* &amp; two**", "two", "**one \\* &amp;** two"],
    ["保留其它样式中的完整链接", planStrongToggle, "**one [two](url) three**", "one", "one **[two](url) three**"],
    ["原有下划线拼写", planStrongToggle, "__one two three__", "two", "__one__ two __three__"]
  ] as const)("%s", (_label, toggle, source, selected, expected) => {
    const from = source.indexOf(selected);
    const plan = toggle(contextAt(source, from, from + selected.length));
    expect(applyPlan(source, plan)).toBe(expected);
  });


  it.each([
    {
      source: "**one *two three* four**", selected: "two", toggle: planStrongToggle,
      styles: { one: ["strong"], two: ["emphasis"], three: ["emphasis", "strong"], four: ["strong"] }
    },
    {
      source: "***one two***", selected: "one", toggle: planEmphasisToggle,
      styles: { one: ["strong"], two: ["emphasis", "strong"] }
    },
    {
      source: "**~~one two~~**", selected: "one", toggle: planStrongToggle,
      styles: { one: ["strikethrough"], two: ["strikethrough", "strong"] }
    },
    {
      source: "**one two** **three four**", selected: "two** **three", toggle: planStrongToggle,
      styles: { one: ["strong"], two: [], three: [], four: ["strong"] }
    },
    {
      source: "**one two** three", selected: "two** three", toggle: planStrongToggle,
      styles: { one: ["strong"], two: ["strong"], three: ["strong"] }
    }
  ])("重解析后每个词的样式符合选区：$source", ({ source, selected, toggle, styles }) => {
    const from = source.indexOf(selected);
    const plan = toggle(contextAt(source, from + selected.length, from));
    expect(plan).not.toBeNull();
    expect(plan!.selection.anchor).toBeGreaterThan(plan!.selection.head);
    const edited = applyPlan(source, plan);
    const root = parseInlineAst(edited, 0, edited.length);
    const actual: Record<string, string[]> = {};
    const readStyles = (nodes: readonly InlineNode[], inherited: string[] = []) => {
      for (const node of nodes) {
        if (node.type === "strong" || node.type === "emphasis" || node.type === "strikethrough") {
          readStyles(node.children, [...inherited, node.type]);
        } else if (node.type === "text") {
          for (const word of node.value.match(/\S+/gu) ?? []) actual[word] = [...inherited].sort();
        }
      }
    };
    readStyles(root.children);
    expect(actual).toEqual(styles);
    expect(edited.slice(plan!.selection.head, plan!.selection.anchor)).toBe(selected.replaceAll("*", ""));
  });

  it("保留反向选区，且不会重写未选文本的原始拼写", () => {
    const source = "外面  **one  two  three**  [link](<a b>)";
    const from = source.indexOf("two");
    const plan = planStrongToggle(contextAt(source, from + 3, from));
    const edited = applyPlan(source, plan);
    expect(edited).toBe("外面  **one**  two  **three**  [link](<a b>)");
    expect(plan?.selection).toEqual({ anchor: edited.indexOf("two") + 3, head: edited.indexOf("two") });
    expect(plan?.edits.every(edit => edit.from >= source.indexOf("one") && edit.to <= source.indexOf("three"))).toBe(true);
  });

  it("混合选区反向补齐时只选原来的文字", () => {
    const source = "one **two three**";
    const plan = planStrongToggle(contextAt(source, source.indexOf("two") + 3, 0));
    expect(applyPlan(source, plan)).toBe("**one two three**");
    expect(plan?.selection).toEqual({ anchor: 9, head: 2 });
  });

  it.each([
    ["[link](https://example.test)", "in", "[l**in**k](https://example.test)"],
    ["`code`", "od", "`c**od**e`"],
    ["First\n\nSecond", "First\n\nSecond", "**First\n\nSecond**"]
  ])("保留原包裹路径：%s", (source, part, expected) => {
    const from = source.indexOf(part);
    expect(applyPlan(source, planStrongToggle(contextAt(source, from, from + part.length)))).toBe(expected);
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

