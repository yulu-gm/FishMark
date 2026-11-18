// @vitest-environment jsdom

import { redo, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { micromark } from "micromark";
import { childrenOf, parseFullDocumentTree } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";

import { createCodeEditorController } from "./code-editor";

const PARENT_TEXT = "Move fields to the new table";
const LIST = [
  "   -  Other tables",
  "       -  Talent",
  "           -  Add a column",
  "             -   Use the column for lookup",
  "       -   Inventory",
  "           -   Add an inventory type",
  "       -   Equipment",
  `           -   ${PARENT_TEXT}`
].join("\n");
const TAIL = "\n           \n           \n";
const parentLine = (host: HTMLElement) =>
  [...host.querySelectorAll(".cm-line")].find((line) => line.textContent?.includes(PARENT_TEXT));
const expectPlainListParent = (host: HTMLElement) => {
  const line = parentLine(host);
  expect(line?.classList.contains("cm-inactive-list")).toBe(true);
  expect(line?.matches(".cm-active-heading, .cm-inactive-heading")).toBe(false);
};

describe("deep empty list items and Tab", () => {
  it("does not generate a Setext underline when another item has an inline child list", () => {
    const prefix = `- root\n  - - embedded\n  - ${PARENT_TEXT}\n`;
    const tail = "\n\nControl\n-------\n";
    const initial = `${prefix}  -   ${tail}`;
    const host = document.createElement("div");
    const editor = createCodeEditorController({ parent: host, initialContent: initial, onChange: () => {} });
    try {
      const cursor = prefix.length + 6;
      editor.setSelection(cursor);
      expectPlainListParent(host);

      editor.pressTab();

      expectPlainListParent(host);
      expect(editor.getContent()).toBe(`${prefix}\n    -   ${tail}`);
      expect(editor.getSelection()).toMatchObject({ anchor: cursor + 3, head: cursor + 3 });
      expect(micromark(editor.getContent())).toContain("<li></li>");
      const [outer] = childrenOf(parseFullDocumentTree(editor.getContent()).root);
      const [root] = childrenOf(outer!);
      const [, siblings] = childrenOf(root!);
      const [, parent] = childrenOf(siblings!);
      const [, nested] = childrenOf(parent!);
      expect(nested?.kind).toBe("list");
      expect(childrenOf(nested!)).toEqual([expect.objectContaining({
        kind: "list-item",
        data: expect.objectContaining({ marker: "-", indent: 4 })
      })]);
      expect(host.querySelector(".cm-inactive-heading-depth-2")?.textContent).toContain("Control");

      const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
      expect(undo(view)).toBe(true);
      expect(editor.getContent()).toBe(initial);
      expectPlainListParent(host);
      expect(redo(view)).toBe(true);
      expect(editor.getContent()).toBe(`${prefix}\n    -   ${tail}`);
      expectPlainListParent(host);
    } finally {
      editor.destroy();
    }
  });

  it("moves the empty sibling without promoting the parent text to a heading", () => {
    const prefix = `${LIST}\n`;
    const initial = `${prefix}           -   ${TAIL}`;
    const host = document.createElement("div");
    const editor = createCodeEditorController({ parent: host, initialContent: initial, onChange: () => {} });
    try {
      const cursor = prefix.length + 15;
      editor.setSelection(cursor);
      expectPlainListParent(host);

      editor.pressTab();

      expect(editor.getContent()).toBe(`${prefix}             -   ${TAIL}`);
      expect(editor.getSelection()).toMatchObject({ anchor: cursor + 2, head: cursor + 2 });
      expectPlainListParent(host);

      editor.pressTab();
      expect(editor.getContent()).toBe(`${prefix}             -   ${TAIL}`);
      expectPlainListParent(host);
    } finally {
      editor.destroy();
    }
  });

  it("keeps the pasted empty child at the parent content column separate from genuine headings", () => {
    const source = `${LIST}\n               -   ${TAIL}\nControl\n-------\n`;
    const host = document.createElement("div");
    const editor = createCodeEditorController({ parent: host, initialContent: source, onChange: () => {} });
    try {
      expect(editor.getContent()).toBe(source);
      expectPlainListParent(host);
      expect(host.querySelector(".cm-inactive-heading-depth-2")?.textContent).toContain("Control");
    } finally {
      editor.destroy();
    }
  });
});
