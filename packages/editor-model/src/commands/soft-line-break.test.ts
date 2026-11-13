import { describe, expect, it } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { planHardBreak } from "./navigation";

function apply(source: string, anchor: number, head = anchor) {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
  const plan = planHardBreak(createEditorSemanticContext({ snapshot, selection: { anchor, head } }));
  let text = source;
  for (const edit of [...plan.edits].sort((a, b) => b.from - a.from)) {
    text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  }
  return { text, caret: plan.selection.anchor };
}

describe("Shift+Enter 段内换行", () => {
  it.each([
    ["AlphaBeta", 5, "Alpha\nBeta", 6],
    ["Alpha", 5, "Alpha\n", 6],
    ["Alpha\nBeta", 6, "Alpha\n\nBeta", 7],
    ["> AlphaBeta", 7, "> Alpha\n> Beta", 10],
    ["- AlphaBeta", 7, "- Alpha\n  Beta", 10],
    ["- [ ] AlphaBeta", 11, "- [ ] Alpha\n      Beta", 18],
    ["```js\nAlphaBeta\n```", 11, "```js\nAlpha\nBeta\n```", 12],
    ["> ```\n> AlphaBeta\n> ```", 13, "> ```\n> Alpha\n> Beta\n> ```", 16],
    ["# AlphaBeta", 7, "# Alpha\nBeta", 8]
  ])("在对应容器内换行：%j", (source, anchor, text, caret) => {
    expect(apply(source, anchor)).toEqual({ text, caret });
  });

  it("替换反向选区仍停在换行后", () => {
    expect(apply("AlphaXYZBeta", 8, 5)).toEqual({ text: "Alpha\nBeta", caret: 6 });
  });

  it("表格换行保留 Markdown 行列结构", () => {
    const source = "| AlphaBeta | B |\n| --- | --- |\n| value | C |";
    const result = apply(source, source.indexOf("Beta"));
    expect(result.text).toBe("| Alpha<br>Beta | B |\n| --- | --- |\n| value | C |");
  });

  it("连续两次段内换行形成段落分隔", () => {
    const first = apply("AlphaBeta", 5);
    expect(apply(first.text, first.caret)).toEqual({ text: "Alpha\n\nBeta", caret: 7 });
  });
});
