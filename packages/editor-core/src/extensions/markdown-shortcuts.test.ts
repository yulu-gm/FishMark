// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "@yulora/markdown-engine";

import { createActiveBlockStateFromMarkdownDocument } from "../active-block";
import {
  createTextEditingShortcutKeymap,
  formatShortcutHintKey,
  TEXT_EDITING_SHORTCUTS
} from "./markdown-shortcuts";

const createHarness = (doc: string, selection: { anchor: number; head?: number }) => {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection,
      extensions: []
    }),
    parent: document.createElement("div")
  });

  const getActiveBlockState = () =>
    createActiveBlockStateFromMarkdownDocument(
      parseMarkdownDocument(view.state.doc.toString()),
      {
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head
      }
    );

  return {
    view,
    getActiveBlockState,
    destroy: () => view.destroy()
  };
};

describe("markdown shortcut metadata", () => {
  it("lists all text-editing shortcuts in display order", () => {
    expect(
      TEXT_EDITING_SHORTCUTS.map(({ id, key, label }) => ({ id, key, label }))
    ).toEqual([
      { id: "toggle-strong", key: "Mod-b", label: "Bold" },
      { id: "toggle-emphasis", key: "Mod-i", label: "Italic" },
      { id: "toggle-heading-1", key: "Mod-1", label: "Heading 1" },
      { id: "toggle-heading-2", key: "Mod-2", label: "Heading 2" },
      { id: "toggle-heading-3", key: "Mod-3", label: "Heading 3" },
      { id: "toggle-heading-4", key: "Mod-4", label: "Heading 4" },
      { id: "toggle-bullet-list", key: "Mod-Shift-7", label: "Bullet List" },
      { id: "toggle-blockquote", key: "Mod-Shift-9", label: "Blockquote" },
      { id: "toggle-code-fence", key: "Mod-Alt-Shift-c", label: "Code Block" }
    ]);
  });

  it("formats Mod shortcuts for win32 and darwin", () => {
    expect(formatShortcutHintKey("Mod-Shift-7", "win32")).toBe("Ctrl+Shift+7");
    expect(formatShortcutHintKey("Mod-Shift-7", "darwin")).toBe("Cmd+Shift+7");
    expect(formatShortcutHintKey("Mod-Alt-Shift-c", "darwin")).toBe("Cmd+Alt+Shift+C");
  });

  it("derives runtime key bindings from the shortcut table", () => {
    const harness = createHarness("alpha bold beta", { anchor: 6, head: 10 });
    const keymap = createTextEditingShortcutKeymap(harness.getActiveBlockState);

    expect(keymap.map(({ key }) => key)).toEqual(
      TEXT_EDITING_SHORTCUTS.map(({ key }) => key)
    );

    harness.destroy();
  });

  it.each([
    {
      id: "toggle-strong",
      doc: "alpha bold beta",
      selection: { anchor: 6, head: 10 },
      expected: "alpha **bold** beta"
    },
    {
      id: "toggle-emphasis",
      doc: "alpha word beta",
      selection: { anchor: 6, head: 10 },
      expected: "alpha *word* beta"
    },
    {
      id: "toggle-heading-1",
      doc: "Paragraph",
      selection: { anchor: 0 },
      expected: "# Paragraph"
    },
    {
      id: "toggle-heading-2",
      doc: "Paragraph",
      selection: { anchor: 0 },
      expected: "## Paragraph"
    },
    {
      id: "toggle-heading-3",
      doc: "Paragraph",
      selection: { anchor: 0 },
      expected: "### Paragraph"
    },
    {
      id: "toggle-heading-4",
      doc: "Paragraph",
      selection: { anchor: 0 },
      expected: "#### Paragraph"
    },
    {
      id: "toggle-bullet-list",
      doc: "alpha",
      selection: { anchor: 2 },
      expected: "- alpha"
    },
    {
      id: "toggle-blockquote",
      doc: "alpha",
      selection: { anchor: 2 },
      expected: "> alpha"
    },
    {
      id: "toggle-code-fence",
      doc: "alpha\n",
      selection: { anchor: 6 },
      expected: "alpha\n```\n\n```"
    }
  ] as const)("runs $id from the shared table", ({ id, doc, selection, expected }) => {
    const shortcut = TEXT_EDITING_SHORTCUTS.find((entry) => entry.id === id);

    expect(shortcut).toBeDefined();

    const harness = createHarness(doc, selection);
    const keymap = createTextEditingShortcutKeymap(harness.getActiveBlockState);
    const binding = keymap.find(({ key }) => key === shortcut?.key);

    expect(binding).toBeDefined();
    expect(binding?.run?.(harness.view)).toBe(true);
    expect(harness.view.state.doc.toString()).toBe(expected);

    harness.destroy();
  });
});
