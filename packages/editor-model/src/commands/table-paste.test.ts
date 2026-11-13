import { describe, expect, it } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { planTablePasteCells, readTableSnapshot } from "./table";

const table = "| a | b |\n| :--- | ---: |\n| 1 | 2 |";
function context(source: string, anchor = source.indexOf("1")) {
  return createEditorSemanticContext({ snapshot: createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source)),
    selection: { anchor, head: anchor } });
}
function paste(source: string, values: string[][], row = 1, column = 1) {
  const plan = planTablePasteCells(context(source), { row, column }, values)!;
  expect(plan).not.toBeNull();
  let text = source;
  for (const edit of [...plan.edits].reverse()) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return { text, plan, snapshot: readTableSnapshot(context(text, plan.selection.anchor)) };
}
describe("表格矩形粘贴", () => {
  it("扩展行列并保留区域外内容和对齐", () => {
    const { snapshot, plan } = paste(table, [["X", "Y"], ["Z", "W"]]);
    expect(snapshot).toMatchObject({ header: ["a", "b", ""], rows: [["1", "X", "Y"], ["", "Z", "W"]], alignments: ["left", "right", "left"] });
    expect(plan.userEventName).toBe("input.paste");
  });
  it("保留表格之外的源码，转义管道并将单元格内换行保留为 br", () => {
    const { text, snapshot } = paste(`before\n\n${table}\n\nafter`, [["x|y", "a\r\nb"]]);
    expect(text.startsWith("before\n\n")).toBe(true);
    expect(text.endsWith("\n\nafter")).toBe(true);
    expect(snapshot?.rows[0]).toEqual(["1", "x|y", "a<br>b"]);
  });
  it("每行都保留引用容器而不是只有表头保留", () => {
    const source = table.split("\n").map(line => `> ${line}`).join("\n");
    const { text, snapshot } = paste(source, [["X"], ["Y"]]);
    expect(text.split("\n").every(line => line.startsWith("> |"))).toBe(true);
    expect(snapshot?.rows).toEqual([["1", "X"], ["", "Y"]]);
  });
  it("拒绝无效起点和空矩阵", () => {
    expect(planTablePasteCells(context(table), { row: 9, column: 0 }, [["x"]])).toBeNull();
    expect(planTablePasteCells(context(table), { row: 1, column: 0 }, [])).toBeNull();
  });
  it("无表头表格保留首行和原有疏松行距", () => {
    const { text, snapshot } = paste("| a | b |\n\n| 1 | 2 |", [["X"], ["Y"]]);
    expect(snapshot).toMatchObject({ hasHeader: false, header: ["a", "b"], rows: [["1", "X"], ["", "Y"]] });
    expect(text.split("\n\n")).toHaveLength(3);
  });
  it("未覆盖单元格保留转义和代码中的管道", () => {
    const { text, snapshot, plan } = paste("| `a|b` | c |\n| --- | --- |\n| 1\\|2 | 3 |", [["x|y"]]);
    expect(text).toContain("`a|b`");
    expect(text).toContain("1\\|2");
    expect(snapshot?.rows[0]).toEqual(["1|2", "x|y"]);
    expect(text.slice(0, plan.selection.anchor)).toMatch(/x\\\|y$/u);
  });
  it("不等宽矩阵只替换实际提供的单元格", () => {
    const { snapshot } = paste(`${table}\n| 3 | 4 |`, [["X", "Y"], ["Z"]], 0, 0);
    expect(snapshot).toMatchObject({ header: ["X", "Y"], rows: [["Z", "2"], ["3", "4"]] });
  });
  it("保留 CRLF 并将光标放在最后粘贴内容之后", () => {
    const { text, plan, snapshot } = paste(table.replace(/\n/gu, "\r\n"), [["X"], ["Y"]]);
    expect(text.replace(/\r\n/gu, "")).not.toContain("\n");
    expect(snapshot?.rows).toEqual([["1", "X"], ["", "Y"]]);
    expect(text[plan.selection.anchor - 1]).toBe("Y");
  });
});
