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
  it("continues the innermost quote inside a list without cloning its ancestor marker", () => {
    const first = applyPlan("- > alpha", 6);
    expect(first.text).toBe("- > al\n  > \n  > pha");
    expect(applyPlan(first.text, first.cursor).text).toBe("- > al\n  > \n  > \n  > \n  > pha");
    const end = applyPlan("- > quote", 9);
    expect(end.text).toBe("- > quote\n  > ");
    expect(applyPlan(end.text, end.cursor).text).toBe("- > quote\n  \n");
  });
  it("continues an inner list using indentation for the enclosing item", () => {
    const first = applyPlan("- > - alpha", 8);
    expect(first.text).toBe("- > - al\n  > - pha");
    expect(applyPlan(first.text, first.cursor).text).toBe("- > - al\n  > \n  > pha");
  });
  it("keeps the quoted body separator prefix when a split list item is promoted", () => {
    const first = applyPlan("> - alpha", "> - al".length);
    expect(first.text).toBe("> - al\n> - pha");
    const second = applyPlan(first.text, first.cursor);
    expect(second.text).toBe("> - al\n> \n> pha");
    expect(second.cursor).toBe(12);
  });
  it("promotes the complete subtree and separates a promoted root body from following list content", () => {
    const source = "- parent\n  - child\n    - grandchild\n- sibling";
    expect(applyPlan(source, source.indexOf("child")).text).toBe("- parent\n- child\n  - grandchild\n- sibling");
    expect(applyPlan(source, source.indexOf("parent")).text).toBe("parent\n\n- child\n  - grandchild\n- sibling");
  });

  it("materializes a draft table and selects the first editable body cell without reparsing the formatted text", () => {
    const source = "| a | b |";
    const result = applyPlan(source, source.length);
    expect(result.text).toBe("| a | b |\n| :--- | :--- |\n|   |   |");
    expect(result.cursor).toBe(result.text.lastIndexOf("|   |   |") + 2);
  });
  it("keeps the checkbox when an empty nested task item is promoted", () => {
    const source = ["- [ ] parent", "  - [ ] "].join("\n");
    const result = applyPlan(source, source.length);

    // Promotion only changes the level, so the marker and the checkbox both survive.
    expect(result.text).toBe(["- [ ] parent", "- [ ] "].join("\n"));
  });

  it("separates paragraphs with a blank line", () => {
    const source = "Alpha";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("plain");
    expect(result.text).toBe("Alpha\n\n");
    expect(result.cursor).toBe(7);
  });

  it("pushes one extra blank line in before following content", () => {
    const source = ["Alpha", "Beta"].join("\n");
    const result = applyPlan(source, "Alpha".length);

    expect(result.text).toBe("Alpha\n\n\n\nBeta");
    expect(result.cursor).toBe(7);
  });

  it("opens a new paragraph from the start of a line after a blank line", () => {
    const source = ["Alpha", "", "Beta"].join("\n");
    const result = applyPlan(source, "Alpha\n\n".length);

    expect(result.text).toBe("Alpha\n\n\n\nBeta");
    expect(result.cursor).toBe("Alpha\n\n".length + 1);
  });

  it("separates a whitespace-only line with a blank line", () => {
    const source = "   ";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("structural-blank");
    expect(result.text).toBe("   \n\n");
    expect(result.cursor).toBe(5);
  });

  it("exits a heading into a new paragraph", () => {
    const source = "# Title";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("heading-exit");
    expect(result.text).toBe("# Title\n\n");
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

  it("writes a paragraph break inside a quote as a separator carrying the marker", () => {
    const source = "> quoted";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("quote-continue");
    expect(result.text).toBe("> quoted\n>\n> ");
    expect(result.cursor).toBe(result.text.length);
  });

  it("keeps every marker on a separator line of a nested quote", () => {
    const source = "> > quoted";
    const result = applyPlan(source, source.length);

    expect(result.text).toBe("> > quoted\n> > \n> > ");
  });

  it("commits an unterminated quote marker before breaking the line", () => {
    expect(applyPlan(">", 1).text).toBe("> \n> ");
    expect(applyPlan("> >", 3).text).toBe("> > \n> > ");
  });

  it("exits exactly one quote level from an empty quoted line", () => {
    const source = ["> outer", "> > inner", "> > "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("quote-exit");
    expect(result.text).toBe(["> outer", "> > inner", "> "].join("\n"));
  });

  it("leaves the quote from an empty innermost quoted line", () => {
    const source = ["> outer", "> "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("quote-exit");
    expect(result.text).toBe("> outer\n");
    expect(result.cursor).toBe("> outer\n".length);
  });

  it("keeps fenced content lines free of structure", () => {
    const source = ["```ts", "const value = 1;", "```"].join("\n");
    const offset = source.indexOf("\n```");
    const result = applyPlan(source, offset);

    expect(result.kind).toBe("fence-line");
    expect(result.text).toBe(["```ts", "const value = 1;", "", "```"].join("\n"));
  });

  // The recursive tree stores indented items as flat siblings of one list, so an empty nested
  // item's level is read from its own indentation run rather than from tree ancestry. Enter on it
  // promotes the item one level, keeping the marker so the ordered-list normalizer renumbers it.
  it("promotes an empty nested ordered item to its parent's level", () => {
    const source = ["1. Parent", "  1. "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.text).toBe(["1. Parent", "1. "].join("\n"));
  });

  it("promotes an empty nested bullet item to its parent's level", () => {
    const source = ["- parent", "  - "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.text).toBe(["- parent", "- "].join("\n"));
  });

  it("promotes an empty nested quoted item while preserving the quote", () => {
    const source = ["> - parent", ">   - "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.text).toBe(["> - parent", "> - "].join("\n"));
  });

  it("grows a table by one empty row at its boundary", () => {    const source = ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");
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
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("> ".repeat(8));
    expect(lines[2]).toBe("> ".repeat(8));

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



