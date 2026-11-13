import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";
import { createEditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { planBackspace } from "./backspace";
import { planDelete } from "./delete";

function snapshot(source: string) {
  return createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
}

function run(key: "Delete" | "Backspace", source: string, anchor: number, head = anchor) {
  const context = createEditorSemanticContext({ snapshot: snapshot(source), selection: { anchor, head } });
  const plan = (key === "Delete" ? planDelete : planBackspace)(context);
  expect(plan).not.toBeNull();
  let text = source;
  for (const { from, to, insert } of [...plan!.edits].reverse()) {
    text = text.slice(0, from) + insert + text.slice(to);
  }
  expect(plan!.selection.anchor).toBe(plan!.selection.head);
  expect(plan!.selection.anchor).toBeGreaterThanOrEqual(0);
  expect(plan!.selection.anchor).toBeLessThanOrEqual(text.length);
  return { text, anchor: plan!.selection.anchor, intent: plan!.intent };
}

const code = "```py\n  code\n```";
const table = "| Head | Key |\n| --- | --- |\n| val | End |";

describe("正文和结构块的折叠选区删除", () => {
  it.each([
    [code, "code-fence", "  code", "  code", "\n"],
    [table, "table", "Head", "End", "\n"],
    [table, "table", "Head", "End", "\n\n"],
    ["Head\n====", "heading", "Head", "Head", "\n\n"],
    ["    code", "code-fence", "    code", "code", "\n\n"]
  ])("两侧只移动到可编辑内容，保留 %s", (block, kind, first, last, gap) => {
    const before = "Alpha" + gap + block;
    expect(run("Delete", before, 5)).toEqual({
      text: before, anchor: before.indexOf(first), intent: "navigation"
    });
    expect(run("Backspace", before, 5 + gap.length)).toEqual({
      text: before, anchor: 5, intent: "navigation"
    });
    expect(snapshot(before).tree.root.children.map(node => node.kind)).toEqual(["paragraph", kind]);

    const after = block + gap + "Alpha";
    expect(run("Delete", after, block.length)).toEqual({
      text: after, anchor: after.indexOf("Alpha"), intent: "navigation"
    });
    expect(run("Backspace", after, after.indexOf("Alpha"))).toEqual({
      text: after, anchor: after.indexOf(last) + last.length, intent: "navigation"
    });
    expect(snapshot(after).tree.root.children.map(node => node.kind)).toEqual([kind, "paragraph"]);
  });

  it("代码正文两端不吞围栏，同一围栏内仍可删除换行", () => {
    const source = "Alpha\n" + code + "\nOmega";
    expect(run("Backspace", source, source.indexOf("  code"))).toEqual({
      text: source, anchor: 5, intent: "navigation"
    });
    expect(run("Delete", source, source.indexOf("code") + 4)).toEqual({
      text: source, anchor: source.indexOf("Omega"), intent: "navigation"
    });
    const inside = "```\none\ntwo\n```";
    for (const [key, from] of [["Delete", 7], ["Backspace", 8]] as const) {
      expect(run(key, inside, from)).toEqual({ text: "```\nonetwo\n```", anchor: 7, intent: "structural" });
    }
  });

  it("围栏前后可删掉多余 CRLF，再按只跨边界，不拆开围栏", () => {
    const fence = code.replaceAll("\n", "\r\n");
    const source = fence + "\r\n\r\nAlpha";
    const next = fence + "\r\nAlpha";
    expect(run("Delete", source, fence.length)).toEqual({ text: next, anchor: fence.length, intent: "structural" });
    expect(run("Backspace", source, source.indexOf("Alpha"))).toEqual({
      text: next, anchor: next.indexOf("Alpha"), intent: "structural"
    });
    expect(run("Backspace", next, next.indexOf("Alpha"))).toEqual({
      text: next, anchor: next.indexOf("code") + 4, intent: "navigation"
    });
  });

  it("正文向前合并标题时只带文字；显式编辑标题标记仍逐字删除", () => {
    const source = "Alpha\n\n## Head ##";
    expect(run("Delete", source, 5)).toEqual({ text: "AlphaHead", anchor: 5, intent: "structural" });
    expect(run("Backspace", source, source.indexOf("Head"))).toEqual({
      text: "Alpha\n\n##Head ##", anchor: 9, intent: "edit"
    });
  });

  it.each(["Delete", "Backspace"] as const)("标题尾标记留在合并文字之后：%s", key => {
    const source = "## Head ##\n\nAlpha";
    const from = key === "Delete" ? source.indexOf("Head") + 4 : source.indexOf("Alpha");
    const result = run(key, source, from);
    expect(result).toEqual({ text: "## HeadAlpha ##", anchor: 7, intent: "structural" });
    expect(snapshot(result.text).tree.root.children[0]?.kind).toBe("heading");
  });

  it.each(["- Parent\n  - child", "- [x] Task\n  - child", "> Quote\n> > Deep"])(
    "不剥掉后续行所属的父级：%s", block => {
      const source = "Alpha\n" + block;
      const target = snapshot(source).document.lines[1]!.contentStartOffset;
      expect(run("Delete", source, 5)).toEqual({ text: source, anchor: target, intent: "navigation" });
      expect(run("Backspace", source, target)).toEqual({ text: source, anchor: 5, intent: "navigation" });
    }
  );

  it.each(["- [x] Task\n  - child", "> Quote\n> > Deep"])(
    "从容器离开时不把下一段吸进最后一个子项：%s", block => {
      const source = block + "\n\nAlpha";
      expect(run("Delete", source, block.length)).toEqual({
        text: source, anchor: source.indexOf("Alpha"), intent: "navigation"
      });
      expect(run("Backspace", source, source.indexOf("Alpha"))).toEqual({
        text: source, anchor: block.length, intent: "navigation"
      });
    }
  );

  it("父项末尾 Delete 不吞掉第一个子项；同级普通叶子仍可合并", () => {
    const nested = "- Parent\n  - child";
    expect(run("Delete", nested, "- Parent".length)).toEqual({
      text: nested, anchor: nested.indexOf("child"), intent: "navigation"
    });
    expect(run("Delete", "- One\n- Two", "- One".length)).toEqual({
      text: "- OneTwo", anchor: "- One".length, intent: "structural"
    });
  });

  it("跨过额外空行时只移除一个 CRLF，保留正文和表格分隔", () => {
    const source = "Alpha\r\n\r\n\r\n" + table;
    const next = "Alpha\r\n\r\n" + table;
    expect(run("Delete", source, 5)).toEqual({ text: next, anchor: 5, intent: "structural" });
    expect(run("Backspace", source, source.indexOf("|"))).toEqual({
      text: next, anchor: next.indexOf("|"), intent: "structural"
    });
  });

  it("单行引用仍可去掉一级；保留 CRLF", () => {
    const source = "Alpha\r\n> Quote";
    expect(run("Backspace", source, source.indexOf("Quote"))).toEqual({
      text: "Alpha\r\nQuote", anchor: 7, intent: "structural"
    });
  });

  it.each(["Delete", "Backspace"] as const)("反向非空选区只删选中源码：%s", key => {
    const source = "Alpha\n\n" + code + "\n\nOmega";
    expect(run(key, source, source.indexOf("Omega") + 2, 2)).toEqual({
      text: "Alega", anchor: 2, intent: "structural"
    });
  });
});
