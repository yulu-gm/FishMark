// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";

import { createActiveBlockState } from "@fishmark/editor-model";
import { runListIndentOnTab } from "./list-commands";

describe("list commands", () => {
  it.each([
    ["body", ["- List 1", "- 2"].join("\n"), ["- List 1", "  - 2"].join("\n")],
    ["quoted", ["> - List 1", "> - 2"].join("\n"), ["> - List 1", ">   - 2"].join("\n")]
  ])("indents a %s list from the live document when active block state is stale", (_kind, source, expected) => {
    const parent = document.createElement("div");
    const view = new EditorView({
      state: EditorState.create({
        doc: source,
        selection: { anchor: source.length }
      }),
      parent
    });
    const staleState = createActiveBlockState(
      createEditorDerivedSnapshotFromCache(createDocumentStructureCache("paragraph")),
      { anchor: 0, head: 0 }
    );

    expect(runListIndentOnTab(view, staleState)).toBe(true);
    expect(view.state.doc.toString()).toBe(expected);
    expect(view.state.selection.main.anchor).toBe(expected.length);

    view.destroy();
  });
});
