// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { editorStructureCacheField, readEditorStructureCache } from "@fishmark/codemirror-adapter";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";
import * as engine from "@fishmark/markdown-engine";

import {
  observePhysicalLineSemantics,
  observeLineDomMapping,
  observeSemanticPath
  , observeEditorBehaviorCheckpoint
} from "./editor-behavior-observer";

describe("editor behavior observer", () => {
  it("reuses the runtime EditorState cache across repeated and selection-only observations", () => {
    const source = "> - ```txt\n>   code\n>   ```";
    let state = EditorState.create({ doc: source, selection: { anchor: source.indexOf("code") }, extensions: [editorStructureCacheField] });
    const snapshot = createEditorDerivedSnapshotFromCache(readEditorStructureCache(state));
    const parse = vi.spyOn(engine, "createDocumentStructureCache");
    const view = { get state() { return state; }, domAtPos() { throw new Error("no DOM in state-only test"); } } as unknown as EditorView;
    const identity = { runId: "cache-reuse", manifestHash: "fixture", contractHash: "contract", caseId: "case", checkpoint: "primary" as const,
      commandPlan: [] } as unknown as Parameters<typeof observeEditorBehaviorCheckpoint>[1];
    try {
      expect(observeEditorBehaviorCheckpoint(view, identity).semanticPath).toEqual(["Document", "Blockquote", "List", "ListItem", "CodeFence"]);
      state = state.update({ selection: { anchor: source.indexOf("code") + 1 } }).state;
      const observed = observeEditorBehaviorCheckpoint(view, identity);
      expect(observed.visibleLineRoles).toEqual(["code-fence-delimiter", "code-fence-content", "code-fence-delimiter"]);
      expect(observed.physicalGeometry.every((line) => line.geometry.visibility === "collapsed")).toBe(true);
      expect(createEditorDerivedSnapshotFromCache(readEditorStructureCache(state))).toBe(snapshot);
      expect(parse).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); }
  });

  it("keeps alternating list and quote ancestry in physical prefix order", () => {
    const source = "- > - first\n  > - second\n  >   - target";
    expect(observePhysicalLineSemantics(source).map(({ semanticDepth, contentColumn, markerColumn }) => ({ semanticDepth, contentColumn, markerColumn })))
      .toEqual([{ semanticDepth: 3, contentColumn: 6, markerColumn: 4 }, { semanticDepth: 3, contentColumn: 6, markerColumn: 4 },
        { semanticDepth: 4, contentColumn: 8, markerColumn: 6 }]);
  });
  it("observes canonical list-item descendants without the lossy rich-document projection", () => {
    const paragraph = observeSemanticPath("Paragraph", 4);
    expect(paragraph).toEqual({
      raw: ["paragraph"],
      canonical: ["Document", "Paragraph"]
    });

    const source = ["> > - $$", "> >   x + y", "> >   $$"].join("\n");
    const nested = observeSemanticPath(source, source.indexOf("x + y"));
    expect(nested).toEqual({
      raw: ["blockquote", "blockquote", "list", "list-item", "block-math"],
      canonical: ["Document", "Blockquote", "Blockquote", "List", "ListItem", "BlockMath"]
    });
    expect(nested.canonical).toContain("BlockMath");
  });

  it("derives nested quote/list columns and math roles from the same canonical snapshot", () => {
    const source = ["> > - $$", "> >   x + y", "> >   $$"].join("\n");
    const lines = observePhysicalLineSemantics(source);

    expect(lines.map(({ role, semanticDepth, contentColumn, markerColumn }) => ({
      role,
      semanticDepth,
      contentColumn,
      markerColumn
    }))).toEqual([
      {
        role: "block-math-delimiter",
        semanticDepth: 3,
        contentColumn: 6,
        markerColumn: 4
      },
      {
        role: "block-math-content",
        semanticDepth: 3,
        contentColumn: 6,
        markerColumn: 2
      },
      {
        role: "block-math-delimiter",
        semanticDepth: 3,
        contentColumn: 6,
        markerColumn: 2
      }
    ]);
  });

  it("uses ordered and task marker offsets for the editable content column", () => {
    const lines = observePhysicalLineSemantics("1. leaf\n- [ ] task");

    expect(lines.map(({ semanticDepth, contentColumn, markerColumn }) => ({
      semanticDepth,
      contentColumn,
      markerColumn
    }))).toEqual([
      { semanticDepth: 1, contentColumn: 3, markerColumn: 0 },
      { semanticDepth: 1, contentColumn: 6, markerColumn: 0 }
    ]);
  });

  it("does not reinterpret ordinary leading whitespace as a semantic prefix", () => {
    const line = observePhysicalLineSemantics("   ")[0]!;
    expect(line).toMatchObject({
      semanticDepth: 0,
      contentColumn: 0,
      markerColumn: null,
      role: "whitespace-only"
    });
  });

  it("classifies physical blank, code fence, and source content roles independently", () => {
    const source = ["Paragraph", "", "```ts", "code", "```", ""].join("\n");
    const lines = observePhysicalLineSemantics(source);

    expect(lines.map(({ role }) => role)).toEqual([
      "content",
      "structural-separator",
      "code-fence-delimiter",
      "code-fence-content",
      "code-fence-delimiter",
      "empty-editing-line"
    ]);
  });

  it.each([
    {
      source: "> \n> ",
      roles: ["structural-separator", "structural-separator"],
      contentColumns: [2, 2]
    },
    {
      source: "- \n- ",
      roles: ["content", "content"],
      contentColumns: [2, 2]
    },
    {
      source: "> \n> alpha",
      roles: ["structural-separator", "content"],
      contentColumns: [2, 2]
    },
    {
      source: "- item\n  \n  continuation",
      roles: ["content", "whitespace-only", "content"],
      contentColumns: [2, 2, 2]
    }
  ])(
    "keeps content classification within each physical line for $source",
    ({ source, roles, contentColumns }) => {
      const lines = observePhysicalLineSemantics(source);
      expect(lines.map(({ role }) => role)).toEqual(roles);
      expect(lines.map(({ contentColumn }) => contentColumn)).toEqual(contentColumns);
      for (const line of lines) {
        expect(line.contentColumn).toBeLessThanOrEqual(line.sourceText.length);
      }
    }
  );

  it.each(["-", "- ", "1.", "1. ", "> > -", "> > - ",
    "> > - parent\n> >   - ", "> - List1\n>   - "])(
    "observes an empty list item as content without inventing a paragraph: %j", (source) => {
      const line = observePhysicalLineSemantics(source).at(-1)!;
      expect(line.role).toBe("content");
      const path = observeSemanticPath(source, source.length).canonical;
      expect(path.at(-1)).toBe("ListItem");
      expect(path).not.toContain("Paragraph");
    }
  );

  it.each([
    ["- item\n  \n  continuation", ["content", "whitespace-only", "content"]],
    ["> - item\n>   \n>   continuation", ["content", "structural-separator", "content"]],
    ["- >", ["structural-separator"]],
    ["- > ", ["structural-separator"]]
  ] as const)("does not classify list continuation blanks or nested empty quotes as empty items: %j", (source, roles) => {
    expect(observePhysicalLineSemantics(source).map((line) => line.role)).toEqual(roles);
  });

  it("does not treat an unclosed fence or indented code content as a closing delimiter", () => {
    expect(observePhysicalLineSemantics("```ts\ncode").map(({ role }) => role)).toEqual([
      "code-fence-delimiter",
      "code-fence-content"
    ]);
    expect(observePhysicalLineSemantics("    alpha\n    beta").map(({ role }) => role)).toEqual([
      "code-fence-content",
      "code-fence-content"
    ]);
    expect(observePhysicalLineSemantics("> ```ts\n> code").map(({ role }) => role)).toEqual([
      "code-fence-delimiter",
      "code-fence-content"
    ]);
    expect(observePhysicalLineSemantics("> ```ts\n> code\n> ```").map(({ role }) => role)).toEqual([
      "code-fence-delimiter",
      "code-fence-content",
      "code-fence-delimiter"
    ]);
  });

  it("observes parser-owned top-level block math boundaries and content", () => {
    const lines = observePhysicalLineSemantics("$$\nx + y\n$$");
    expect(lines.map(({ role }) => role)).toEqual([
      "block-math-delimiter",
      "block-math-content",
      "block-math-delimiter"
    ]);
  });

  it("records actual source-line and widget visibility instead of assuming visibility", () => {
    const sourceLine = document.createElement("div");
    sourceLine.className = "cm-line";
    sourceLine.style.display = "block";
    sourceLine.style.visibility = "visible";
    sourceLine.style.opacity = "1";
    document.body.append(sourceLine);
    vi.spyOn(sourceLine, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 20
    } as DOMRect);

    expect(observeLineDomMapping(1, sourceLine)).toEqual({
      visibility: "visible",
      mapping: expect.objectContaining({
        line: 1,
        kind: "source-line",
        display: "block",
        visibility: "visible",
        opacity: "1",
        rect: { width: 100, height: 20 }
      })
    });

    vi.mocked(sourceLine.getBoundingClientRect).mockReturnValue({
      width: 100,
      height: 0
    } as DOMRect);
    expect(observeLineDomMapping(1, sourceLine).visibility).toBe("collapsed");

    const table = document.createElement("div");
    table.className = "cm-table-widget";
    table.style.display = "none";
    document.body.append(table);
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0
    } as DOMRect);

    expect(observeLineDomMapping(2, table)).toMatchObject({
      visibility: "collapsed",
      mapping: { line: 2, kind: "table-widget", display: "none" }
    });
    expect(observeLineDomMapping(3, null)).toMatchObject({
      visibility: "collapsed",
      mapping: { line: 3, kind: "missing" }
    });
  });
});
