import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { decideEnter, planEnter, type EnterPlanKind } from "./enter";

function contextAt(source: string, offset: number): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor: offset, head: offset } });
}

function applyPlan(source: string, offset: number): { text: string; cursor: number; kind: EnterPlanKind | null } {
  const plan = planEnter(contextAt(source, offset));

  if (plan === null) {
    return { text: source, cursor: offset, kind: null };
  }

  let text = source;
  const cursor = plan.selection.anchor;

  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return { text, cursor, kind: decideEnter(contextAt(source, offset))?.kind ?? null };
}

describe("planEnter", () => {
  it("inserts a plain line break at the end of a paragraph", () => {
    const source = "Alpha";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("plain");
    expect(result.text).toBe("Alpha\n");
    expect(result.cursor).toBe(6);
  });

  it("exits a heading instead of continuing it", () => {
    const source = "# Title";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("heading-exit");
    expect(result.text).toBe("# Title\n");
  });

  it("continues an unordered list item with the same marker", () => {
    const source = "- one";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("list-continue");
    expect(result.text).toBe("- one\n- ");
    expect(result.cursor).toBe(result.text.length);
  });

  it("continues an ordered list item with the next ordinal and delimiter", () => {
    const source = ["5. five", "6. six"].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.text).toBe(["5. five", "6. six", "7. "].join("\n"));
  });

  it("keeps a task marker unchecked on the new item", () => {
    const source = "- [x] done";
    const result = applyPlan(source, source.length);

    expect(result.text).toBe("- [x] done\n- [ ] ");
  });

  it("exits an empty top-level list item", () => {
    const source = ["- one", "- "].join("\n");
    const offset = source.length;
    const result = applyPlan(source, offset);

    expect(result.kind).toBe("list-exit");
    expect(result.text).toBe(["- one", "", ""].join("\n"));
    expect(result.cursor).toBe(result.text.length);
  });

  it("continues a quoted paragraph inside the same quote level", () => {
    const source = "> quoted";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("quote-continue");
    expect(result.text).toBe("> quoted\n> ");
    expect(result.cursor).toBe(result.text.length);
  });

  it("exits exactly one quote level from an empty quoted line", () => {
    const source = ["> outer", "> > inner", "> > "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("quote-exit");
    expect(result.text).toBe(["> outer", "> > inner", "> ", "> "].join("\n"));
  });

  it("preserves enclosing container prefixes on a structural blank line", () => {
    const source = ["> - item", "> "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.text.startsWith("> - item\n> ")).toBe(true);
  });

  it("keeps fenced content lines free of structure", () => {
    const source = ["```ts", "const value = 1;", "```"].join("\n");
    const offset = source.indexOf("\n```");
    const result = applyPlan(source, offset);

    expect(result.kind).toBe("fence-line");
    expect(result.text).toBe(["```ts", "const value = 1;", "", "```"].join("\n"));
  });

  it("grows a table by one empty row at its boundary", () => {
    const source = ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("table-row");
    expect(result.text.endsWith("| 1 | 2 |\n|  |  |")).toBe(true);
  });

  it("keeps parent prefixes while the deepest handler edits the leaf", () => {
    const source = ["> - parent", ">   - child"].join("\n");
    const offset = source.length;
    const result = applyPlan(source, offset);

    expect(result.kind).toBe("list-continue");
    expect(result.text).toBe(["> - parent", ">   - child", ">   - "].join("\n"));
  });

  it("keeps depth 8 nesting and unwinds one quote level per Enter on an empty line", () => {
    let current = "leaf";
    for (let depth = 0; depth < 8; depth += 1) {
      current = current.split("\n").map((line) => `> ${line}`).join("\n");
    }

    let cursor = current.length;
    const first = applyPlan(current, cursor);
    current = first.text;
    cursor = first.cursor;

    let lines = current.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("> ".repeat(8));

    // Each further Enter on the empty quoted line leaves exactly one quote level.
    for (let level = 7; level >= 1; level -= 1) {
      const result = applyPlan(current, cursor);
      current = result.text;
      cursor = result.cursor;
      lines = current.split("\n");
      expect(lines[lines.length - 1]).toBe("> ".repeat(level));
    }
  });

  it("reports one undo-friendly transaction per Enter", () => {
    const source = "> - item";
    const plan = planEnter(contextAt(source, source.length));

    expect(plan).not.toBeNull();
    expect(plan?.intent).toBe("structural");
    expect(plan?.edits.length).toBeGreaterThan(0);
    expect(plan?.selection).toEqual({ anchor: source.length + 1 + "> - ".length, head: source.length + 1 + "> - ".length });
  });
});



