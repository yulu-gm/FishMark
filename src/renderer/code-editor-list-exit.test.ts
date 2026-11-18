// @vitest-environment jsdom
import { redo, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { createCodeEditorController } from "./code-editor";

const deepList = [
  "   -  表单清单",
  "       -  报名表",
  "           -  新增编号字段，整数",
  "             -   用于核对报名信息",
  "       -   用品表",
  "           -   新增用品类别",
  "       -   签到表",
  "           -   整理历史备注并移入归档表"
].join("\n");

function mount(source: string, viewMode: "wysiwym" | "source" = "wysiwym") {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = createCodeEditorController({ parent: host, initialContent: source, onChange: () => undefined, viewMode });
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  const lastRow = () => host.querySelector(".cm-line:last-child")!;
  const dispose = () => { editor.destroy(); host.remove(); };
  return { editor, view, lastRow, dispose };
}

describe("empty list item exit on Backspace", () => {
  it.each([deepList, "- parent", "1. parent\n   1. child"])("continues the list on Enter, then starts standalone body after Backspace: %s", (source) => {
    const { editor, view, lastRow, dispose } = mount(source);
    try {
      editor.setSelection(source.length);
      editor.pressEnter();
      const continued = editor.getContent();
      expect(continued.slice(source.length + 1)).toMatch(/^ *(?:-|\d+\.) +$/u);
      expect(lastRow().classList.contains("cm-inactive-list")).toBe(true);

      editor.pressBackspace();
      const outside = source + "\n\n";
      expect(editor.getContent()).toBe(outside);
      expect(editor.getSelection()).toEqual({ anchor: outside.length, head: outside.length });

      expect(undo(view)).toBe(true);
      expect(editor.getContent()).toBe(continued);
      expect(redo(view)).toBe(true);
      expect(editor.getContent()).toBe(outside);

      editor.insertText("备注");
      expect(editor.getContent()).toBe(outside + "备注");
      expect(lastRow().textContent).toBe("备注");
      expect(lastRow().className).toMatch(/cm-(?:active|inactive)-paragraph-leading/u);
      expect(lastRow().className).not.toContain("list-continuation");
    } finally { dispose(); }
  });

  it("writes the paragraph boundary at a list end before a later block", () => {
    const source = deepList + "\n\n后续正文";
    const { editor, dispose } = mount(source);
    try {
      editor.setSelection(deepList.length);
      editor.pressEnter();
      editor.pressBackspace();
      expect(editor.getSelection()).toEqual({ anchor: deepList.length + 2, head: deepList.length + 2 });
      editor.insertText("备注");
      expect(editor.getContent()).toBe(deepList + "\n\n备注\n\n后续正文");
    } finally { dispose(); }
  });

  it("keeps an adjacent heading independent when leaving the list", () => {
    const source = "- parent\n# Next";
    const { editor, dispose } = mount(source);
    try {
      editor.setSelection("- parent".length);
      editor.pressEnter();
      editor.pressBackspace();
      editor.insertText("备注");
      expect(editor.getContent()).toBe("- parent\n\n备注\n\n# Next");
    } finally { dispose(); }
  });

  it("keeps a literal line break and input in source view", () => {
    const source = "- parent";
    const { editor, dispose } = mount(source, "source");
    try {
      editor.setSelection(source.length);
      editor.insertText("\n备注");
      expect(editor.getContent()).toBe("- parent\n备注");
    } finally { dispose(); }
  });

  it("does not rewrite hand-authored lazy continuation on opening", () => {
    const source = deepList + "\n备注";
    const { editor, lastRow, dispose } = mount(source);
    try {
      expect(editor.getContent()).toBe(source);
      expect(lastRow().className).toContain("list-continuation");
    } finally { dispose(); }
  });
});
