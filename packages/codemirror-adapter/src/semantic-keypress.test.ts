// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";

import { createMarkdownEditorViewModeExtension } from "./editor-view-mode";
import { createFishMarkMarkdownExtensions } from "./extensions/markdown";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache, createEditorSemanticContext } from "@fishmark/editor-model";
import { planSemanticEnter } from "./semantic-keypress";

const source = ["```python", "def f():", "    return 1", "```"].join("\n");

function press(view: EditorView, key: string, shiftKey = false): boolean {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}

it.each(["wysiwym", "source"] as const)("%s 模式用 Tab 缩进两行，反缩进后 Enter 继承四个空格", mode => {
  const host = document.body.appendChild(document.createElement("div"));
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: source,
      extensions: [
        createMarkdownEditorViewModeExtension(mode),
        ...createFishMarkMarkdownExtensions({ onContentChange: () => undefined, onActiveBlockChange: () => undefined })
      ]
    })
  });
  try {
    view.focus();
    const start = source.indexOf("def f");
    const end = source.indexOf("return 1") + "return 1".length;
    view.dispatch({ selection: { anchor: start, head: end } });
    expect(press(view, "Tab")).toBe(true);
    expect(view.state.doc.toString()).toBe(source.replace("def f():\n    return 1", "  def f():\n      return 1"));
    expect(view.hasFocus).toBe(true);
    expect(press(view, "Tab", true)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    view.dispatch({ selection: { anchor: end } });
    expect(press(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe(source.slice(0, end) + "\n    " + source.slice(end));
    expect(view.state.selection.main.head).toBe(end + 5);
  } finally {
    view.destroy();
    host.remove();
  }
});

it("空围栏的闭合标记仍走原有退出规则", () => {
  const doc = "```python\n\n```";
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(doc));
  const plan = planSemanticEnter(createEditorSemanticContext({
    snapshot,
    selection: { anchor: doc.length, head: doc.length }
  }));
  expect(plan?.edits).toEqual([{ from: doc.length, to: doc.length, insert: "\n" }]);
});
