import { describe, expect, it } from "vitest";

import { createDocumentStructureCache } from "@fishmark/markdown-engine";

import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { decideBackspace, planBackspace, type BackspacePlanKind } from "./backspace";

function contextAt(source: string, anchor: number, head = anchor): EditorSemanticContext {
  const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));

  return createEditorSemanticContext({ snapshot, selection: { anchor, head } });
}

function applyPlan(
  source: string,
  anchor: number,
  head = anchor
): { text: string; cursor: number; kind: BackspacePlanKind | null } {
  const context = contextAt(source, anchor, head);
  const decision = decideBackspace(context);
  const plan = planBackspace(context);

  if (plan === null || decision === null) {
    return { text: source, cursor: anchor, kind: null };
  }

  let text = source;
  for (const edit of [...plan.edits].sort((left, right) => right.from - left.from)) {
    text = `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
  }

  return { text, cursor: plan.selection.anchor, kind: decision.kind };
}

describe("planBackspace", () => {
  it("degrades a populated ordered sibling but removes an empty marker completely", () => {
    const populated = "1. first\n2. second\n3. third";
    expect(applyPlan(populated, populated.indexOf("second")).text).toBe("1. first\n\n2.second\n3. third");
    const empty = "1. first\n2. ";
    expect(applyPlan(empty, empty.length).text).toBe("1. first\n");
    expect(applyPlan("Intro\n1. first", "Intro\n1. ".length).text).toBe("Intro\nfirst");
  });

  it("enters adjacent fenced content without deleting the separator newline", () => {
    const source = "```\ncode\n```\n";
    const result = applyPlan(source, source.length);
    expect(result.text).toBe(source);
    expect(result.cursor).toBe(source.indexOf("code") + 4);
  });

  it("enters the last table cell from the editable line below without rewriting the table", () => {
    const source = "| a | b |\n| --- | --- |\n| x | y |\n\n";
    const result = applyPlan(source, source.length);
    expect(result.text).toBe(source);
    expect(result.cursor).toBe(source.indexOf("y") + 1);
  });
  it("removes one repeated empty paragraph per press below a heading", () => {
    const source = "# Title\n\n\n\n";
    const result = applyPlan(source, source.length);

    // The corpus case for this shape (`removes one repeated empty paragraph with one Backspace from
    // consecutive trailing blank lines`) presses Enter twice and expects one press to go back to
    // `# Title\n\n`, i.e. one empty paragraph per press.
    expect(result.kind).toBe("subtree-join");
    expect(result.text).toBe("# Title\n\n");
  });

  it("shortens a run of separators by one line per press", () => {
    // The caret sits at the start of the last separator, so one press removes one line from the run.
    // The corpus case `removes a visible extra blank row before joining across the structural
    // separator on Backspace` is the binding check for this shape; the planner's own landing offset
    // inside a longer run still needs its own decision (recorded in the handoff).
    const result = applyPlan("Alpha\n\n\nBeta", "Alpha\n\n\n".length);

    expect(result.kind).toBe("subtree-join");
  });

  it("only moves the caret back on a later line of the same quote", () => {
    const source = ["Paragraph", "", "> quote one", "> quote two", "After blockquote"].join("\n");
    const contentStart = source.indexOf("> quote two") + "> ".length;
    const result = applyPlan(source, contentStart);

    // The quote's later lines keep both the document and their marker: the legacy path dispatches a
    // selection only, so the caret steps back to the end of the line above.
    expect(result.kind).toBe("quote-degrade");
    expect(result.text).toBe(source);
    expect(result.cursor).toBe(source.indexOf("> quote one") + "> quote one".length);
  });

  it("steps a quoted line up when the caret is at its content start", () => {
    const source = ["Paragraph", "", "> quote one", "> quote two", "After blockquote"].join("\n");
    const contentStart = source.indexOf("> quote one") + "> ".length;
    const result = applyPlan(source, contentStart);

    // The renderer normalizes a caret on a hidden quote marker to that line's content start, so the
    // rule has to work from there: the break before the line goes, and the line steps up intact
    // instead of losing its marker and keeping the gap.
    expect(result.kind).toBe("quote-degrade");
    expect(result.text).toBe("Paragraph\n> quote one\n> quote two\nAfter blockquote");
  });

  it("keeps a deeper quoted line in place by deleting only the separator row", () => {
    const source = "> 11\n>\n> > 1";
    const result = applyPlan(source, source.indexOf("> >"));

    // The line below the separator is one quote level deeper than the line above it, so pulling the
    // lines together would silently promote it; only the separator row and its break go away.
    expect(result.kind).toBe("subtree-join");
    expect(result.text).toBe("> 11\n> > 1");
  });

  it("joins quoted lines by dropping the bare quote separator between them", () => {
    const source = "> 11\n>\n> 222";
    const result = applyPlan(source, source.indexOf("222"));

    // One press removes the separator row with the break before and after it, so only the first
    // line's content end and this line's own content survive.
    expect(result.kind).toBe("subtree-join");
    expect(result.text).toBe("> 11222");
    expect(result.cursor).toBe("> 11".length);
  });

  it("deletes one ordinary character", () => {
    const source = "Alpha";
    const result = applyPlan(source, 3);

    expect(result.kind).toBe("default");
    expect(result.text).toBe("Alha");
    expect(result.cursor).toBe(2);
  });

  it("deletes a selected range", () => {
    const source = "Alpha Beta";
    const result = applyPlan(source, 2, 6);

    expect(result.kind).toBe("range-delete");
    expect(result.text).toBe("AlBeta");
    expect(result.cursor).toBe(2);
  });

  it("degrades a list marker to its indentation", () => {
    const source = "- item";
    const result = applyPlan(source, "- ".length);

    expect(result.kind).toBe("marker-degrade");
    expect(result.text).toBe("item");
    expect(result.cursor).toBe(0);
  });

  it("degrades a quoted item marker before touching the quote level", () => {
    const source = "> - item";
    const result = applyPlan(source, "> - ".length);

    expect(result.kind).toBe("marker-degrade");
    expect(result.text).toBe("> item");
  });

  it("degrades one quote level when the cursor is at the content start", () => {
    const source = "> quoted";
    const result = applyPlan(source, "> ".length);

    expect(result.kind).toBe("quote-degrade");
    expect(result.text).toBe("quoted");
  });

  it("moves a complete nested subtree when outdenting", () => {
    const source = ["- parent", "  - child", "    - leaf"].join("\n");
    const offset = source.indexOf("- child");
    const result = applyPlan(source, offset);

    expect(result.kind).toBe("indent-degrade");
    expect(result.text).toBe(["- parent", "- child", "  - leaf"].join("\n"));
  });

  it("degrades one step per press for repeated deletion", () => {
    const source = "- item";
    const first = applyPlan(source, "- ".length);
    const second = applyPlan(first.text, first.text.length);

    expect(first.kind).toBe("marker-degrade");
    expect(first.text).toBe("item");
    expect(second.kind).toBe("default");
    expect(second.text).toBe("ite");
  });

  it("keeps a whitespace line untouched when there is no marker", () => {
    const source = "Alpha\n   ";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("default");
    expect(result.text).toBe("Alpha\n  ");
  });

  it("collapses a trailing blank line back to the last line with content", () => {
    const source = "Alpha\n\n";
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("subtree-join");
    expect(result.text).toBe("Alpha");
    expect(result.cursor).toBe("Alpha".length);
  });

  it("collapses a trailing run of empty quote lines", () => {
    const source = ["> 1111", ">", "> "].join("\n");
    const result = applyPlan(source, source.length);

    expect(result.kind).toBe("subtree-join");
    expect(result.text).toBe("> 1111");
    expect(result.cursor).toBe("> 1111".length);
  });
});




