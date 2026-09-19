import { describe, expect, it } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import type { EditTransactionPlan } from "../transactions/edit-transaction-plan";
import { planEnter } from "./enter";
import { planBackspace } from "./backspace";

// Preserve quote text/selection behavior while retiring CodeMirror-bound quote planners.
function createHarness(init: { doc: string; anchor: number; head?: number }) {
  let text = init.doc;
  let selection = { anchor: init.anchor, head: init.head ?? init.anchor };
  function run(planner: (context: EditorSemanticContext) => EditTransactionPlan | null) {
    const plan = planner(createEditorSemanticContext({
      snapshot: createEditorDerivedSnapshotFromCache(createDocumentStructureCache(text)), selection
    }));
    if (plan === null) return false;
    for (const edit of [...plan.edits].reverse()) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
    selection = plan.selection;
    return true;
  }
  return { runEnter: () => run(planEnter), runBackspace: () => run(planBackspace), text: () => text,
    selectionHead: () => selection.head, destroy: () => {} };
}

describe("runBlockquoteEnter", () => {
  it("creates an internal structural separator and a new quoted block from content lines", () => {
    const harness = createHarness({ doc: "> alpha", anchor: "> alpha".length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> alpha", ">", "> "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("keeps nested quote depth when creating the next quoted block", () => {
    const source = "> > alpha";
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> > alpha", "> > ", "> > "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("exits a blockquote from an empty quoted line", () => {
    const source = ["> alpha", ">", "> "].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> alpha", "", ""].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("does not leave a trailing quote separator after exiting a quoted list", () => {
    const source = ["> - List1", ">", "> "].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> - List1", "", ""].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("outdents a trailing nested quote separator together with its empty line", () => {
    const source = ["> > - List1", "> > ", "> > "].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> > - List1", ">", "> "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> > - List1", "", ""].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("outdents an empty nested quoted line one level at a time", () => {
    const source = ["> 11", "> > 222", "> > > 33333", "> > > "].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 222", "> > > 33333", "> > "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 222", "> > > 33333", "> "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 222", "> > > 33333", ""].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });

  it("exits only one nested quote level from an empty quoted line", () => {
    const source = ["> 11", "> > 222", "> > >"].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runEnter()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 222", "> > "].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().length);

    harness.destroy();
  });
});

describe("runBlockquoteBackspace", () => {
  it("joins same-depth quote text across a quote-internal structural separator from the next quote line start", () => {
    const source = ["> 11", ">", "> 222"].join("\n");
    const harness = createHarness({ doc: source, anchor: source.indexOf("222") });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe("> 11222");
    expect(harness.selectionHead()).toBe("> 11".length);

    harness.destroy();
  });

  it("joins a trailing empty quoted line across its structural separator", () => {
    const source = ["> 1111", ">", "> "].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe("> 1111");
    expect(harness.selectionHead()).toBe("> 1111".length);

    harness.destroy();
  });

  it("deletes trailing empty quoted lines after a quoted list", () => {
    const source = [
      "> 111",
      ">",
      "> - list1",
      "> - list2",
      ">   - child list",
      ">",
      "> "
    ].join("\n");
    const expected = [
      "> 111",
      ">",
      "> - list1",
      "> - list2",
      ">   - child list"
    ].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe(expected);
    expect(harness.selectionHead()).toBe(expected.length);

    harness.destroy();
  });

  it("treats a bare trailing quoted line after a quoted list as an empty quote line", () => {
    const source = [
      "> 111",
      ">",
      "> - list1",
      "> - list2",
      ">   - child list",
      ">",
      ">"
    ].join("\n");
    const expected = [
      "> 111",
      ">",
      "> - list1",
      "> - list2",
      ">   - child list"
    ].join("\n");
    const harness = createHarness({ doc: source, anchor: source.length });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe(expected);
    expect(harness.selectionHead()).toBe(expected.length);

    harness.destroy();
  });

  it("deletes a quote-internal structural separator from the next quote line start", () => {
    const source = ["> 11", ">", "> > 1"].join("\n");
    const harness = createHarness({ doc: source, anchor: source.lastIndexOf("1") });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 1"].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().lastIndexOf("1"));

    harness.destroy();
  });

  it("deletes a quote-internal structural separator when Backspace starts from that separator", () => {
    const source = ["> 11", ">", "> > 1"].join("\n");
    const harness = createHarness({ doc: source, anchor: source.indexOf("\n>\n") + 2 });

    expect(harness.runBackspace()).toBe(true);
    expect(harness.text()).toBe(["> 11", "> > 1"].join("\n"));
    expect(harness.selectionHead()).toBe(harness.text().lastIndexOf("1"));

    harness.destroy();
  });
});
