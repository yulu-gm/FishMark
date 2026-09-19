import { describe, expect, it } from "vitest";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "../derived/editor-derived-snapshot";
import { createEditorSemanticContext, type EditorSemanticContext } from "../context/editor-semantic-context";
import { type EditTransactionPlan } from "../transactions/edit-transaction-plan";
import { planEnter } from "./enter";
import { planBackspace } from "./backspace";
import { planDelete } from "./delete";
import { planIndentIn, planIndentOut } from "./indent";
import { planMoveListItemDown, planMoveListItemUp } from "./list-move";
import { planNormalizeOrderedListScopes } from "./ordered-list";

// Text/selection scenarios retained from the retired list helper tests. This test adapter
// composes the same model edit and ordered-normalization plans used by the runtime filter.
const buildContext = (source: string, anchor: number, head = anchor): EditorSemanticContext =>
  createEditorSemanticContext({ snapshot: createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source)), selection: { anchor, head } });
type Result = { changes: { from: number; to: number; insert: string }; selection: { anchor: number; head: number }; filter?: boolean; userEvent?: string };
function project(context: EditorSemanticContext, plan: EditTransactionPlan | null): Result | null {
  if (plan === null) return null;
  let text = context.source;
  for (const edit of [...plan.edits].reverse()) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  let selection = plan.selection;
  const normalization = planNormalizeOrderedListScopes(buildContext(text, selection.anchor, selection.head), { changedRanges: [] });
  for (const edit of [...(normalization?.edits ?? [])].reverse()) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  selection = normalization?.selection ?? selection;
  let from = 0;
  while (from < context.source.length && from < text.length && context.source[from] === text[from]) from += 1;
  let suffix = 0;
  while (suffix < context.source.length - from && suffix < text.length - from && context.source.at(-1 - suffix) === text.at(-1 - suffix)) suffix += 1;
  return { changes: { from, to: context.source.length - suffix, insert: text.slice(from, text.length - suffix) }, selection, userEvent: plan.userEventName };
}
const computeDeleteOrderedListRange = (context: EditorSemanticContext) => project(context, planDelete(context));
const computeIndentListItem = (context: EditorSemanticContext) => project(context, planIndentIn(context));
const computeOutdentListItem = (context: EditorSemanticContext) => project(context, planIndentOut(context));
const computeMoveListItemDown = (context: EditorSemanticContext) => project(context, planMoveListItemDown(context));
const computeMoveListItemUp = (context: EditorSemanticContext) => project(context, planMoveListItemUp(context));
const computeListItemEnter = (context: EditorSemanticContext) => project(context, planEnter(context));
const computeOrderedListEnter = (context: EditorSemanticContext, empty: boolean) => { void empty; return project(context, planEnter(context)); };
const computeUpgradeEmptyLeftListItemEnter = (context: EditorSemanticContext, offset: number) => { void offset; return project(context, planEnter(context)); };
const computeBackspaceEmptyListMarker = (context: EditorSemanticContext) => project(context, planBackspace(context));
const computeBackspaceListMarker = computeBackspaceEmptyListMarker;
const applyEdit = (source: string, result: Result | null) => result === null ? source : source.slice(0, result.changes.from) + result.changes.insert + source.slice(result.changes.to);

describe("list command text and selection contracts", () => {
it("deletes a middle ordered item and renumbers the following sibling", () => {
    const doc = ["5. first", "6. second", "7. third"].join("\n");
    const context = buildContext(doc, "5. first\n".length, doc.indexOf("7. third"));
    const result = computeDeleteOrderedListRange(context);

    expect(applyEdit(doc, result)).toBe(["5. first", "6. third"].join("\n"));
    expect(result?.selection).toEqual({ anchor: 9, head: 9 });
  });

it("indents an ordered item into a child scope and restarts child numbering from 1", () => {
    const doc = ["5. parent", "6. child", "7. sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeIndentListItem(context);

    expect(applyEdit(doc, result)).toBe(["5. parent", "  1. child", "6. sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: 15, head: 15 });
  });

it("indents a nested unordered item into a third-level child list", () => {
    const doc = ["- parent", "  - child", "  - leaf", "- sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("leaf"));
    const result = computeIndentListItem(context);

    expect(applyEdit(doc, result)).toBe(["- parent", "  - child", "    - leaf", "- sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: doc.indexOf("leaf") + 2, head: doc.indexOf("leaf") + 2 });
  });

it("keeps unordered indentation edits scoped to the changed subtree", () => {
    const doc = ["- parent", "  - child", "  - leaf", "- sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("leaf"));
    const result = computeIndentListItem(context);
    const changedLineStart = doc.indexOf("  - leaf");
    const changedLineEnd = changedLineStart + "  - leaf".length;

    expect(result?.changes.from).toBeGreaterThanOrEqual(changedLineStart);
    expect(result?.changes.to).toBeLessThanOrEqual(changedLineEnd);
    expect(result?.changes.from).not.toBe(0);
    expect(result?.changes.to).not.toBe(doc.length);
  });

it("indents a nested task item into a third-level task list", () => {
    const doc = ["- [ ] parent", "  - [x] done", "  - [ ] next"].join("\n");
    const context = buildContext(doc, doc.indexOf("next"));
    const result = computeIndentListItem(context);

    expect(applyEdit(doc, result)).toBe(["- [ ] parent", "  - [x] done", "    - [ ] next"].join("\n"));
    expect(result?.selection).toEqual({ anchor: doc.indexOf("next") + 2, head: doc.indexOf("next") + 2 });
  });

it("outdents an ordered item back to the parent scope and keeps following siblings in sequence", () => {
    const doc = ["5. parent", "  6. child", "7. sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeOutdentListItem(context);

    expect(applyEdit(doc, result)).toBe(["5. parent", "6. child", "7. sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: 13, head: 13 });
  });

it("outdents an unordered item subtree into the parent scope", () => {
    const doc = ["- parent", "  - child", "    - leaf", "    continuation", "- sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeOutdentListItem(context);

    expect(applyEdit(doc, result)).toBe(["- parent", "- child", "  - leaf", "  continuation", "- sibling"].join("\n"));
    expect(result?.selection).toEqual({ anchor: doc.indexOf("child") - 2, head: doc.indexOf("child") - 2 });
  });

it("keeps unordered outdent edits scoped to the changed subtree", () => {
    const doc = ["- parent", "  - child", "    - leaf", "    continuation", "- sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeOutdentListItem(context);
    const changedSubtreeStart = doc.indexOf("  - child");
    const changedSubtreeEnd = doc.indexOf("\n- sibling");

    expect(result?.changes.from).toBeGreaterThanOrEqual(changedSubtreeStart);
    expect(result?.changes.to).toBeLessThanOrEqual(changedSubtreeEnd);
    expect(result?.changes.from).not.toBe(0);
    expect(result?.changes.to).not.toBe(doc.length);
  });

it("pressing Enter on an empty ordered child item creates an empty parent sibling item", () => {
    const doc = ["5. parent", "  1. "].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeOrderedListEnter(context, true);

    expect(applyEdit(doc, result)).toBe(["5. parent", "6. "].join("\n"));
    expect(result?.selection).toEqual({ anchor: 13, head: 13 });
  });

it("exits a bare empty top-level body list item with a structural separator", () => {
    const doc = ["1. 111", "2."].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);
    const expected = ["1. 111", "", ""].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.length,
      head: expected.length
    });
  });

it("upgrades a top-level list item to body text when its left split content is empty", () => {
    const doc = ["1. one", "2. two", "3. tail"].join("\n");
    const context = buildContext(doc, doc.indexOf("tail"));
    const result = computeUpgradeEmptyLeftListItemEnter(context, doc.indexOf("tail"));

    expect(applyEdit(doc, result)).toBe(["1. one", "2. two", "", "tail"].join("\n"));
    expect(result?.selection).toEqual({
      anchor: ["1. one", "2. two", "", ""].join("\n").length,
      head: ["1. one", "2. two", "", ""].join("\n").length
    });
  });

it("upgrades a single top-level list item to body text without a leading separator", () => {
    const doc = "1. tail";
    const context = buildContext(doc, doc.indexOf("tail"));
    const result = computeUpgradeEmptyLeftListItemEnter(context, doc.indexOf("tail"));

    expect(applyEdit(doc, result)).toBe("tail");
    expect(result?.selection).toEqual({
      anchor: 0,
      head: 0
    });
  });

it("upgrades a nested item to the parent list when its left split content is empty", () => {
    const doc = ["- parent", "  - child"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeUpgradeEmptyLeftListItemEnter(context, doc.indexOf("child"));

    expect(applyEdit(doc, result)).toBe(["- parent", "- child"].join("\n"));
    expect(result?.selection).toEqual({
      anchor: ["- parent", "- "].join("\n").length,
      head: ["- parent", "- "].join("\n").length
    });
  });

it("continues a non-empty list item inside a blockquote at the same quote/list depth", () => {
    const doc = "> - item";
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);

    expect(applyEdit(doc, result)).toBe(["> - item", "> - "].join("\n"));
    expect(result?.selection).toEqual({
      anchor: ["> - item", "> - "].join("\n").length,
      head: ["> - item", "> - "].join("\n").length
    });
  });

it("upgrades an empty child list item inside a blockquote to the parent quote list", () => {
    const doc = ["> - parent", ">   - "].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);

    expect(applyEdit(doc, result)).toBe(["> - parent", "> - "].join("\n"));
    expect(result?.selection).toEqual({
      anchor: ["> - parent", "> - "].join("\n").length,
      head: ["> - parent", "> - "].join("\n").length
    });
  });

it("continues ordered numbering when a nested empty quote list item upgrades to its parent list", () => {
    const doc = [
      "> 1. 111",
      "> 2. 333",
      ">   1. 222",
      ">     1. 1.1",
      ">     2. "
    ].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);
    const expected = [
      "> 1. 111",
      "> 2. 333",
      ">   1. 222",
      ">     1. 1.1",
      ">   2. "
    ].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.length,
      head: expected.length
    });
  });

it("promotes an empty ordered child item inside a blockquote and keeps parent numbering", () => {
    const doc = [
      "> 1. 111",
      "> 2. 333",
      ">    1. 222",
      ">       1. 1.1",
      ">       2."
    ].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);
    const expected = [
      "> 1. 111",
      "> 2. 333",
      ">    1. 222",
      ">       1. 1.1",
      ">    2."
    ].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({ anchor: expected.length, head: expected.length });
  });

it("promotes a bare empty ordered child item in body text and preserves its existing child subtree", () => {
    const doc = [
      "1. 111",
      "2. 333",
      "    1. 222",
      "       1. 1.1",
      "       2."
    ].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);
    const expected = [
      "1. 111",
      "2. 333",
      "    1. 222",
      "       1. 1.1",
      "    2."
    ].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({ anchor: expected.length, head: expected.length });
  });

it("exits an empty top-level quote list item to quote body text", () => {
    const doc = ["> - parent", "> - "].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);
    const expected = ["> - parent", ">", "> "].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.length,
      head: expected.length
    });
  });

it("exits a promoted top-level list marker at its existing nested quote depth", () => {
    const doc = [
      "> 引用块",
      ">",
      "> > 二级引用块",
      "> > - List 1",
      "> > - List 2",
      "> >   - List 2.1",
      "> > -"
    ].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);
    const expected = [
      "> 引用块",
      ">",
      "> > 二级引用块",
      "> > - List 1",
      "> > - List 2",
      "> >   - List 2.1",
      "> > ",
      "> > "
    ].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({ anchor: expected.length, head: expected.length });
  });

it("exits a top-level empty ordered quote list item into quoted body text with a structural separator", () => {
    const doc = ["> 1. 111", "> 2."].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeListItemEnter(context);
    const expected = ["> 1. 111", ">", "> "].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({ anchor: expected.length, head: expected.length });
  });

it("renumbers ordered quote list siblings when Enter inserts a same-level item", () => {
    const doc = ["> 1. one", "> 2. two"].join("\n");
    const context = buildContext(doc, doc.indexOf("one") + "one".length);
    const result = computeListItemEnter(context);

    expect(applyEdit(doc, result)).toBe(["> 1. one", "> 2. ", "> 3. two"].join("\n"));
    expect(result?.selection).toEqual({
      anchor: ["> 1. one", "> 2. "].join("\n").length,
      head: ["> 1. one", "> 2. "].join("\n").length
    });
  });

it("indents and outdents list items inside blockquotes after the quote prefix", () => {
    const doc = ["> - parent", "> - child"].join("\n");
    const indentContext = buildContext(doc, doc.indexOf("child"));
    const indentResult = computeIndentListItem(indentContext);
    const indented = ["> - parent", ">   - child"].join("\n");

    expect(applyEdit(doc, indentResult)).toBe(indented);
    expect(indentResult?.selection).toEqual({
      anchor: indented.indexOf("child"),
      head: indented.indexOf("child")
    });

    const outdentContext = buildContext(indented, indented.indexOf("child"));
    const outdentResult = computeOutdentListItem(outdentContext);

    expect(applyEdit(indented, outdentResult)).toBe(doc);
    expect(outdentResult?.selection).toEqual({
      anchor: doc.indexOf("child"),
      head: doc.indexOf("child")
    });
  });

it.each([
    ["body unordered", ["- parent", "-"].join("\n"), ["- parent", "  - "].join("\n")],
    [
      "body mixed unordered markers",
      ["* parent", "- child"].join("\n"),
      ["* parent", "  - child"].join("\n")
    ],
    [
      "single quote padded unordered",
      ["> - parent", "> - "].join("\n"),
      ["> - parent", ">   - "].join("\n")
    ],
    [
      "single quote mixed unordered markers",
      ["> * List 1", "> - 2"].join("\n"),
      ["> * List 1", ">   - 2"].join("\n")
    ],
    [
      "single quote list after a residual structural separator",
      ["> - List 1", ">", "> - 2"].join("\n"),
      ["> - List 1", ">   - 2"].join("\n")
    ],
    [
      "single quote list after repeated residual structural separators",
      ["> - List 1", ">", "> ", "> - 2"].join("\n"),
      ["> - List 1", ">   - 2"].join("\n")
    ],
    [
      "nested quote unordered",
      ["> > - parent", "> > -"].join("\n"),
      ["> > - parent", "> >   - "].join("\n")
    ],
    [
      "nested quote ordered",
      ["> > 1. parent", "> > 2."].join("\n"),
      ["> > 1. parent", "> >   1. "].join("\n")
    ]
  ])("indents a promoted bare %s list marker", (_kind, doc, expected) => {
    const context = buildContext(doc, doc.length);
    const result = computeIndentListItem(context);

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.length,
      head: expected.length
    });
  });

it("moves an ordered subtree down together with its continuation lines", () => {
    const doc = ["5. parent", "6. child", "  continuation", "  - nested", "7. sibling"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeMoveListItemDown(context);

    expect(applyEdit(doc, result)).toBe(
      ["5. parent", "6. sibling", "7. child", "  continuation", "  - nested"].join("\n")
    );
    expect(result?.selection).toEqual({ anchor: 24, head: 24 });
  });

it("moves an ordered subtree up together with its continuation lines", () => {
    const doc = ["5. parent", "6. sibling", "7. child", "  continuation", "  - nested"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));
    const result = computeMoveListItemUp(context);

    expect(applyEdit(doc, result)).toBe(
      ["5. parent", "6. child", "  continuation", "  - nested", "7. sibling"].join("\n")
    );
    expect(result?.selection).toEqual({ anchor: 13, head: 13 });
  });

it("removes an empty ordered list marker while preserving the blank line", () => {
    const doc = ["1. one", "2. two", "3. four", "4. ", "5. six", "6. seven"].join("\n");
    const context = buildContext(doc, ["1. one", "2. two", "3. four", "4. "].join("\n").length);
    const result = computeBackspaceEmptyListMarker(context);
    const expected = ["1. one", "2. two", "3. four", "", "5. six", "6. seven"].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: ["1. one", "2. two", "3. four", ""].join("\n").length,
      head: ["1. one", "2. two", "3. four", ""].join("\n").length
    });
  });

it("removes an empty unordered list marker while preserving its indentation", () => {
    const doc = ["- parent", "  - "].join("\n");
    const context = buildContext(doc, doc.length);
    const result = computeBackspaceEmptyListMarker(context);
    const expected = ["- parent", "  "].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.length,
      head: expected.length
    });
  });

it("removes an unordered list marker at the current item content start on Backspace", () => {
    const doc = ["- 内容", "- 内容2", "- 内容3"].join("\n");
    const cursor = doc.indexOf("内容2");
    const context = buildContext(doc, cursor);
    const result = computeBackspaceListMarker(context);
    const expected = ["- 内容", "内容2", "- 内容3"].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.indexOf("内容2"),
      head: expected.indexOf("内容2")
    });
  });

it("degrades ordered list rendering at content start through the complete command", () => {
    const doc = ["1. 内容", "2. 内容2", "3. 内容3"].join("\n");
    const cursor = doc.indexOf("内容2");
    const context = buildContext(doc, cursor);
    const result = computeBackspaceListMarker(context);
    // The retired marker helper alone removed the whole marker. The production command
    // instead breaks the run and keeps the number; code-editor.test.ts covers this route.
    const expected = ["1. 内容", "", "2.内容2", "3. 内容3"].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.indexOf("内容2"),
      head: expected.indexOf("内容2")
    });
  });

it("removes a task list marker at the current item content start on Backspace", () => {
    const doc = ["- [ ] 内容", "- [x] 内容2", "- [ ] 内容3"].join("\n");
    const cursor = doc.indexOf("内容2");
    const context = buildContext(doc, cursor);
    const result = computeBackspaceListMarker(context);
    const expected = ["- [ ] 内容", "内容2", "- [ ] 内容3"].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.indexOf("内容2"),
      head: expected.indexOf("内容2")
    });
  });

it("removes a quote list marker on Backspace while preserving the quote prefix", () => {
    const doc = ["> - 内容", "> - 内容2"].join("\n");
    const cursor = doc.indexOf("内容2");
    const context = buildContext(doc, cursor);
    const result = computeBackspaceListMarker(context);
    const expected = ["> - 内容", "> 内容2"].join("\n");

    expect(applyEdit(doc, result)).toBe(expected);
    expect(result?.selection).toEqual({
      anchor: expected.indexOf("内容2"),
      head: expected.indexOf("内容2")
    });
  });

it.each([
    ["unordered", ["> - parent", ">   - "].join("\n"), ["> - parent", ">   "].join("\n")],
    ["ordered", ["> 1. parent", ">    1. "].join("\n"), ["> 1. parent", ">    "].join("\n")]
  ])(
    "removes a quoted empty nested %s list marker before indentation backspace",
    (_kind, doc, expected) => {
      const context = buildContext(doc, doc.length);
      const result = computeBackspaceEmptyListMarker(context);

      expect(applyEdit(doc, result)).toBe(expected);
      expect(result?.selection).toEqual({
        anchor: expected.length,
        head: expected.length
      });
    }
  );

it("does not indent the first item in its current list scope", () => {
    const doc = ["- parent", "  - child", "  - leaf"].join("\n");
    const context = buildContext(doc, doc.indexOf("child"));

    expect(computeIndentListItem(context)).toBeNull();
  });

it("does not outdent a top-level unordered item", () => {
    const doc = ["- parent", "  - child"].join("\n");
    const context = buildContext(doc, doc.indexOf("parent"));

    expect(computeOutdentListItem(context)).toBeNull();
  });

it("does not treat an ordinary bare ordered marker after a blank line as a list exit", () => {
    const doc = ["1. one", "", "2."].join("\n");
    const context = buildContext(doc, doc.length);

    const result = computeListItemEnter(context);
    expect(applyEdit(doc, result)).toBe(`${doc}\n\n`);
    expect(result?.selection).toEqual({ anchor: 12, head: 12 });
  });

it("does not treat a quoted bare ordered marker after a quote separator as a list exit", () => {
    const doc = ["> 1. one", ">", "> 2."].join("\n");
    const context = buildContext(doc, doc.length);

    const result = computeListItemEnter(context);
    expect(applyEdit(doc, result)).toBe(`${doc}\n>\n> `);
    expect(result?.selection).toEqual({ anchor: 20, head: 20 });
  });

it("does not recover a bare nested marker from an earlier sibling branch", () => {
    const doc = [
      "> > - [ ] first",
      "> >   - child",
      "> > - second",
      "> >   1. ordered child",
      "> >   -"
    ].join("\n");
    const context = buildContext(doc, doc.length);

    const result = computeListItemEnter(context);
    expect(applyEdit(doc, result)).toBe(`${doc}\n> > \n> > `);
    expect(result?.selection).toEqual({ anchor: 83, head: 83 });
  });

it("does not recover an ordered bare marker from an earlier delimiter branch", () => {
    const doc = [
      "> > 1. first",
      "> >   1. child",
      "> > 2. second",
      "> >   1) ordered child",
      "> >   2."
    ].join("\n");
    const context = buildContext(doc, doc.length);

    const result = computeListItemEnter(context);
    expect(applyEdit(doc, result)).toBe(`${doc}\n> > \n> > `);
    expect(result?.selection).toEqual({ anchor: 83, head: 83 });
  });

it("does not indent a bare marker that is separated from the preceding list", () => {
    const doc = ["> > - parent", "> >", "> > -"].join("\n");
    const context = buildContext(doc, doc.length);

    expect(computeIndentListItem(context)).toBeNull();
  });

it.each([
    ["non-list quote content", ["> paragraph", ">", "> - 2"].join("\n")],
    ["an external blank line", ["> - parent", "", "> - 2"].join("\n")],
    ["a different quote depth", ["> > - parent", ">", "> > - 2"].join("\n")]
  ])("does not repair residual quote separators across %s", (_kind, doc) => {
    const context = buildContext(doc, doc.length);

    expect(computeIndentListItem(context)).toBeNull();
  });
});
