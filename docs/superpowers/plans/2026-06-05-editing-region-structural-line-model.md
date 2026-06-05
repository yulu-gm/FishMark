# Editing Region Structural Line Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make blockquote, list, and body flow editing share one structural line contract for Enter, Backspace, ArrowUp, ArrowDown, and selection normalization.

**Architecture:** Add a shared `StructuralLineModel` in editor-core, then migrate existing selection, navigation, and Backspace code paths to consume it. Keep the first slice incremental: existing command functions stay in place, but their structural separator decisions come from one parser-owned model.

**Tech Stack:** TypeScript, CodeMirror 6, FishMark markdown-engine metadata, Vitest, renderer editing probes.

---

## Baseline

The isolated worktree is `D:\FishMark\FishMark\.worktrees\editing-region-structural-model` on branch `codex/editing-region-structural-model`.

`npm.cmd install` completed. `npm.cmd test` currently has one pre-existing failure:

```text
src/renderer/app.autosave.test.ts > App autosave > renders markdown lists and quotes with explicit markers instead of solid blocks
expected stylesheet to contain "var(--fishmark-blockquote-padding-inline) +\n    var(--fishmark-blockquote-depth-offset)"
```

This is a Windows line-ending-sensitive CSS assertion in the blockquote/list stylesheet contract. Fix it first so later test failures represent this implementation.

## File Structure

- Create: `packages/editor-core/src/structural-line-model.ts`
  - Owns body and blockquote structural line roles.
  - Provides editable-line navigation helpers and separator delete ranges.
- Create: `packages/editor-core/src/structural-line-model.test.ts`
  - Unit coverage for line roles, quote separators, Arrow target helpers, and delete ranges.
- Modify: `packages/editor-core/src/blockquote-structural-separators.ts`
  - Keep compatibility exports, delegate to `StructuralLineModel` where practical.
- Modify: `packages/editor-core/src/line-visibility.ts`
  - Replace duplicated structural blank/quote separator selection normalization with `StructuralLineModel`.
- Modify: `packages/editor-core/src/interactions/adapters/line-block-adapter.ts`
  - Use the shared model for ArrowUp/ArrowDown and adjacent collapsed separator behavior.
- Modify: `packages/editor-core/src/commands/blockquote-commands.ts`
  - Use the shared model for Backspace separator deletion and nested quote empty-line exit.
- Modify: `packages/editor-core/src/commands/list-edits.ts`
  - Fix quoted ordered-list parent-prefix and normalization parity.
- Modify: `packages/editor-core/src/commands/list-edits.test.ts`
  - Add quote-list parity tests.
- Modify: `packages/editor-core/src/commands/blockquote-commands.test.ts`
  - Add nested quote exit and separator Backspace tests.
- Modify: `packages/editor-core/src/extensions/markdown.test.ts`
  - Add keyboard-level selection normalization tests for quote structural lines.
- Modify: `src/renderer/code-editor.test.ts`
  - Add renderer-level caret/editing tests for ArrowUp, Backspace, and quote-list Enter parity.
- Modify: `src/renderer/markdown-editing-experience-probe.ts`
  - Add or extend blockquote/list probe cases matching the acceptance examples.
- Modify: `src/renderer/app.autosave.test.ts`
  - Fix baseline CSS assertion.

---

### Task 0: Restore Green Baseline

**Files:**
- Modify: `src/renderer/app.autosave.test.ts`

- [ ] **Step 1: Update the line-ending-sensitive CSS assertion**

Replace this assertion:

```ts
expect(markdownRenderStylesheet).toContain(
  "var(--fishmark-blockquote-padding-inline) +\n    var(--fishmark-blockquote-depth-offset)"
);
```

with assertions against the extracted blockquote-list rule:

```ts
const blockquoteListRule = getCssRule(
  markdownRenderStylesheet,
  ".document-editor .cm-line.cm-inactive-blockquote.cm-inactive-list"
);

expect(blockquoteListRule).toContain("--fishmark-list-container-offset: calc(");
expect(blockquoteListRule).toContain("var(--fishmark-blockquote-padding-inline) +");
expect(blockquoteListRule).toContain("var(--fishmark-blockquote-depth-offset)");
```

Place `blockquoteListRule` next to the other local CSS rule constants in the same test.

- [ ] **Step 2: Run the focused baseline test**

Run:

```powershell
npm.cmd test -- src/renderer/app.autosave.test.ts -t "renders markdown lists and quotes with explicit markers instead of solid blocks"
```

Expected: PASS.

- [ ] **Step 3: Run the full unit baseline**

Run:

```powershell
npm.cmd test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```powershell
git add -- src/renderer/app.autosave.test.ts
git commit -m "Fix markdown stylesheet assertion on Windows"
```

---

### Task 1: Add Shared StructuralLineModel

**Files:**
- Create: `packages/editor-core/src/structural-line-model.ts`
- Create: `packages/editor-core/src/structural-line-model.test.ts`
- Modify: `packages/editor-core/src/blockquote-structural-separators.ts`

- [ ] **Step 1: Write failing unit tests for body and quote line roles**

Create `packages/editor-core/src/structural-line-model.test.ts` with tests covering:

```ts
import { parseMarkdownDocument } from "@fishmark/markdown-engine";
import { describe, expect, it } from "vitest";
import {
  createStructuralLineModel,
  resolveStructuralLineDeleteRange
} from "./structural-line-model";

describe("StructuralLineModel", () => {
  it("classifies the first blank body line between blocks as structural and the next as editable extra blank", () => {
    const source = ["Alpha", "", "", "Beta"].join("\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));

    expect(model.getLineRole(2)).toBe("structural-separator");
    expect(model.getLineRole(3)).toBe("extra-blank");
    expect(model.getLineRole(1)).toBe("editable-content");
    expect(model.getLineRole(4)).toBe("editable-content");
  });

  it("classifies a bare quote line between quote inner blocks as a structural separator", () => {
    const source = ["> 1", ">", "> 222"].join("\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));

    expect(model.getLineRole(2)).toBe("structural-separator");
    expect(model.findPreviousEditableLine(source.indexOf("222"))?.number).toBe(1);
    expect(model.findSeparatorBeforeLine(source.indexOf("> 222"))?.lineNumber).toBe(2);
  });

  it("keeps a trailing editable quote line distinct from a quote structural separator", () => {
    const source = ["> 1", ">"].join("\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));

    expect(model.getLineRole(2)).toBe("editable-empty");
  });

  it("returns deletion range for a quote structural separator including its trailing newline", () => {
    const source = ["> 1", ">", "> 222"].join("\n");
    const model = createStructuralLineModel(source, parseMarkdownDocument(source));
    const separator = model.findSeparatorBeforeLine(source.indexOf("> 222"));

    expect(separator).not.toBeNull();
    expect(resolveStructuralLineDeleteRange(source, separator!)).toEqual({
      from: "> 1\n".length,
      to: "> 1\n>\n".length
    });
  });
});
```

- [ ] **Step 2: Run the new test to confirm it fails**

Run:

```powershell
npm.cmd test -- packages/editor-core/src/structural-line-model.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `structural-line-model.ts`**

Implement these exports:

```ts
import type { MarkdownBlock, MarkdownDocument } from "@fishmark/markdown-engine";
import { createPhysicalEditingDocument, type EditingLine } from "./physical-editing-document";
import {
  findBlockquoteStructuralSeparatorAt,
  findPreviousBlockquoteStructuralSeparator,
  type BlockquoteStructuralSeparator
} from "./blockquote-structural-separators";

export type StructuralLineRole =
  | "editable-content"
  | "editable-empty"
  | "structural-separator"
  | "extra-blank"
  | "hidden-marker-line";

export type StructuralLineSeparator = {
  lineNumber: number;
  lineStartOffset: number;
  lineEndOffset: number;
  lineBreakTo: number;
  previousBlockEnd: number | null;
  nextBlockStart: number | null;
};

export type StructuralLineModel = {
  getLineRole: (lineNumber: number) => StructuralLineRole;
  getLineAtOffset: (offset: number) => EditingLine | null;
  findPreviousEditableLine: (offset: number, goalColumn?: number) => EditingLine | null;
  findNextEditableLine: (offset: number, goalColumn?: number) => EditingLine | null;
  findSeparatorAt: (offset: number) => StructuralLineSeparator | null;
  findSeparatorBeforeLine: (lineStartOffset: number) => StructuralLineSeparator | null;
};
```

Implementation rules:

- Build physical lines with `createPhysicalEditingDocument(source, markdownDocument)`.
- For body structural and extra blank lines, consume `semanticLineMap` roles from `physical-editing-document`.
- For quote structural lines, adapt `findBlockquoteStructuralSeparatorAt` and `findPreviousBlockquoteStructuralSeparator` into `StructuralLineSeparator`.
- A quote line with no inner content is `structural-separator` only when the parser-owned blockquote separator helper finds previous and next `innerBlocks`; otherwise it is `editable-empty`.
- `findPreviousEditableLine` and `findNextEditableLine` skip only `structural-separator` and `hidden-marker-line`; they may return `extra-blank`.

- [ ] **Step 4: Keep compatibility exports stable**

Leave `packages/editor-core/src/blockquote-structural-separators.ts` public API intact. Do not remove `findBlockquoteStructuralSeparatorAt` or `findPreviousBlockquoteStructuralSeparator`; existing callers should still compile.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd test -- packages/editor-core/src/structural-line-model.test.ts packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/editor-core/src/structural-line-model.ts packages/editor-core/src/structural-line-model.test.ts packages/editor-core/src/blockquote-structural-separators.ts
git commit -m "Add shared structural line model"
```

---

### Task 2: Use StructuralLineModel For Selection Normalization And Arrow Navigation

**Files:**
- Modify: `packages/editor-core/src/line-visibility.ts`
- Modify: `packages/editor-core/src/interactions/adapters/line-block-adapter.ts`
- Modify: `packages/editor-core/src/extensions/markdown.test.ts`
- Modify: `src/renderer/code-editor.test.ts`

- [ ] **Step 1: Add keyboard-level failing tests**

In `packages/editor-core/src/extensions/markdown.test.ts`, extend the existing quote structural separator coverage with:

```ts
it("normalizes ArrowUp away from a quote-internal structural separator", () => {
  const source = ["> 1", ">", "> 222"].join("\n");
  const view = createMarkdownTestView(source, { selection: source.indexOf("222") });

  view.dispatch({
    selection: { anchor: source.indexOf("> 222"), head: source.indexOf("> 222") },
    annotations: Transaction.userEvent.of("select")
  });

  expect(view.state.selection.main.anchor).not.toBe(source.indexOf("> 222"));
  expect(view.state.selection.main.anchor).toBe(source.indexOf("1") + 1);
});
```

If the local helper names differ, reuse the helpers already present in the same test file rather than introducing a second harness.

In `src/renderer/code-editor.test.ts`, add a renderer test beside the existing blockquote structural tests:

```ts
it("skips a quote-internal structural separator on ArrowUp from the next quoted block", async () => {
  const source = ["> 1", ">", "> 222"].join("\n");
  const harness = createCodeEditorHarness({ content: source });
  const cursor = source.indexOf("222") + "222".length;

  harness.controller.setSelection(cursor);
  harness.controller.pressArrowUp();

  expect(harness.controller.getSelection().anchor).not.toBe(source.indexOf("> 222"));
  expect(harness.controller.getSelection().anchor).toBeGreaterThanOrEqual(source.indexOf("1"));
  expect(harness.controller.getSelection().anchor).toBeLessThanOrEqual(source.indexOf("1") + 1);

  harness.destroy();
});
```

Adjust harness names to match nearby tests.

- [ ] **Step 2: Run focused tests to confirm failure**

Run:

```powershell
npm.cmd test -- packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts -t "quote-internal structural"
```

Expected: at least the new ArrowUp assertion fails before implementation.

- [ ] **Step 3: Replace duplicate structural normalization**

In `line-visibility.ts`:

- Import `createStructuralLineModel`.
- In `normalizeStructuralBlankSelectionAnchor`, build `const model = createStructuralLineModel(source, markdownDocument)`.
- Replace the local body/quote separator lookup with `model.findSeparatorAt(anchor)`.
- Preserve existing direction behavior:
  - trailing separator with no next block returns `separator.lineStartOffset`;
  - `direction > 0` returns `separator.nextBlockStart`;
  - otherwise prefer `separator.previousBlockEnd`.

Keep the old local helpers only if another caller still needs them; otherwise remove private duplicate helpers in this file.

- [ ] **Step 4: Route vertical navigation through the shared model**

In `line-block-adapter.ts`:

- Import `createStructuralLineModel`.
- Add a small helper:

```ts
function createLineModel(context: VerticalInteractionContext) {
  return createStructuralLineModel(context.source, context.document);
}
```

- Replace `isStructuralSeparatorLine`, `findBlockAboveStructuralSeparator`, `findBlockBelowStructuralSeparator`, `resolveLineAfterStructuralSeparator`, and `isVisibleExtraBlankLineImmediatelyAfterSeparator` internals so they ask the model for line roles and separator metadata.
- Preserve existing table-specific behavior and visible extra blank behavior.
- Ensure a source line with text `>` can be treated as a structural separator when parser-owned quote metadata says so.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd test -- packages/editor-core/src/structural-line-model.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts -t "structural separator"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- packages/editor-core/src/line-visibility.ts packages/editor-core/src/interactions/adapters/line-block-adapter.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts
git commit -m "Use structural line model for quote separator navigation"
```

---

### Task 3: Use StructuralLineModel For Backspace And Nested Quote Exit

**Files:**
- Modify: `packages/editor-core/src/commands/blockquote-commands.ts`
- Modify: `packages/editor-core/src/commands/blockquote-commands.test.ts`
- Modify: `src/renderer/code-editor.test.ts`

- [ ] **Step 1: Add failing command tests**

In `packages/editor-core/src/commands/blockquote-commands.test.ts`, add:

```ts
it("exits only one nested quote level from an empty quoted line", () => {
  const source = ["> 11", "> > 222", "> > >"].join("\n");
  const harness = createBlockquoteCommandHarness(source, source.length);

  expect(harness.runEnter()).toBe(true);
  expect(harness.doc()).toBe(["> 11", "> > 222", "> > "].join("\n"));
  expect(harness.selection()).toEqual({ anchor: ["> 11", "> > 222", "> > "].join("\n").length });
});

it("deletes the quote structural separator before moving the caret at a quoted content start", () => {
  const source = ["> 11", ">", "> 222"].join("\n");
  const harness = createBlockquoteCommandHarness(source, source.indexOf("222"));

  expect(harness.runBackspace()).toBe(true);
  expect(harness.doc()).toBe(["> 11", "> 222"].join("\n"));
  expect(harness.selection().anchor).toBe(["> 11", "> "].join("\n").length);
});
```

Use the actual harness helper names already present in the file.

- [ ] **Step 2: Add renderer regression tests**

In `src/renderer/code-editor.test.ts`, near the blockquote Backspace tests, add:

```ts
it("deletes a bare quote separator on Backspace at the following content start", async () => {
  const source = ["> 11", ">", "> 222"].join("\n");
  const harness = createCodeEditorHarness({ content: source });

  harness.controller.setSelection(source.indexOf("222"));
  harness.controller.pressBackspace();

  expect(harness.controller.getContent()).toBe(["> 11", "> 222"].join("\n"));
  expect(harness.controller.getSelection().anchor).toBe(["> 11", "> "].join("\n").length);

  harness.destroy();
});
```

- [ ] **Step 3: Run focused tests to confirm failure**

Run:

```powershell
npm.cmd test -- packages/editor-core/src/commands/blockquote-commands.test.ts src/renderer/code-editor.test.ts -t "quote"
```

Expected: the new cases fail before implementation.

- [ ] **Step 4: Implement Backspace with shared separator deletion**

In `blockquote-commands.ts`:

- Import `createStructuralLineModel` and `resolveStructuralLineDeleteRange`.
- Build a model from `source` and `activeState.blockMap`.
- Replace direct calls to `findBlockquoteStructuralSeparatorAt` and `findPreviousBlockquoteStructuralSeparator` with:

```ts
const model = createStructuralLineModel(source, activeState.blockMap);
const currentSeparator = model.findSeparatorAt(selection.head);
const previousSeparator = model.findSeparatorBeforeLine(lineStart);
```

- Delete separator ranges through `resolveStructuralLineDeleteRange`.
- Selection after deleting a quote separator before a content line should land at the same visible content start after the source shift:

```ts
const selectionAnchor =
  separator.nextBlockStart !== null && separator.nextBlockStart >= range.to
    ? separator.nextBlockStart - (range.to - range.from)
    : separator.previousBlockEnd ?? range.from;
```

- Keep first-line quote marker deletion behavior unchanged.

- [ ] **Step 5: Preserve one-level nested quote exit**

Keep `runBlockquoteEnter` behavior where an empty `> > >` line becomes `> > `. Add tests proving it does not delete the whole quote until the empty line is already top-level.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm.cmd test -- packages/editor-core/src/commands/blockquote-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts -t "blockquote"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- packages/editor-core/src/commands/blockquote-commands.ts packages/editor-core/src/commands/blockquote-commands.test.ts src/renderer/code-editor.test.ts
git commit -m "Handle quote separators through structural line model"
```

---

### Task 4: Make Quoted List Enter And Backspace Match Body Lists

**Files:**
- Modify: `packages/editor-core/src/commands/list-edits.ts`
- Modify: `packages/editor-core/src/commands/list-edits.test.ts`
- Modify: `src/renderer/code-editor.test.ts`

- [ ] **Step 1: Add failing list-edit tests**

In `packages/editor-core/src/commands/list-edits.test.ts`, add:

```ts
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
    ">    2."
  ].join("\n");

  expect(applyEdit(doc, result)).toBe(expected);
  expect(result?.selection).toEqual({
    anchor: expected.length,
    head: expected.length
  });
});

it("exits a top-level empty ordered quote list item into quoted body text with a structural separator", () => {
  const doc = ["> 1. 111", "> 2."].join("\n");
  const context = buildContext(doc, doc.length);
  const result = computeListItemEnter(context);
  const expected = ["> 1. 111", ">", "> "].join("\n");

  expect(applyEdit(doc, result)).toBe(expected);
  expect(result?.selection).toEqual({
    anchor: expected.length,
    head: expected.length
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm.cmd test -- packages/editor-core/src/commands/list-edits.test.ts -t "blockquote"
```

Expected: the new quoted ordered-list parity test fails with the current wrong marker level or numbering.

- [ ] **Step 3: Fix parent-prefix calculation**

In `list-edits.ts`:

- Keep `readContainerPrefixLength` and `readListContentLine` as the source of quote container prefix width.
- Update `buildParentEmptyListItemPrefix` so ordered quoted lists compute the next parent marker from the parent scope but keep the exact parent item's container prefix:

```ts
const parentPrefix = readListItemMarkerPrefix(ctx, parentItem);
return `${parentPrefix}${scope.startOrdinal + parentItemIndex + 1}${scope.delimiter} `;
```

- If this already exists, inspect why `current.parentScope` is wrong for quoted nested lists. The fix should make `findListItemContext` choose the deepest item containing `selection.from`, not the outer item, and should preserve `parentScope` from parser-owned children.
- Do not add quote-specific edit branches in `runListEnter`; the semantic edit should work for body and quote roots.

- [ ] **Step 4: Ensure ordered normalization respects quote-prefixed roots**

If the test still normalizes `>    2.` into `> 1.`, update `parseListBlockForNormalization` and `normalizeOrderedListBlock` so a quoted list's `innerList` is normalized with its own root offsets and quote container prefixes preserved.

- [ ] **Step 5: Add renderer tests for actual key behavior**

In `src/renderer/code-editor.test.ts`, add one test that uses `controller.pressEnter()` from the quoted empty child item and asserts the same source as the unit test.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm.cmd test -- packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts -t "quote list"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- packages/editor-core/src/commands/list-edits.ts packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts
git commit -m "Align quoted list editing with body list semantics"
```

---

### Task 5: Update Editing Experience Probe And Final Regression Gates

**Files:**
- Modify: `src/renderer/markdown-editing-experience-probe.ts`
- Modify: `src/renderer/code-editor.test.ts` only if renderer coverage needs a small helper cleanup.

- [ ] **Step 1: Extend probe cases**

In `src/renderer/markdown-editing-experience-probe.ts`, extend the blockquote group with checks for:

```ts
const source = ["> 1", ">", "> 222"].join("\n");
```

Required probe assertions:

- bare `>` separator line renders as blockquote separator, not visible raw source while inactive;
- ArrowUp from `222` does not leave selection on the bare separator source line;
- Backspace from the start of `222` deletes the bare separator line;
- nested empty quote `> > >` exits to `> > ` with one Enter;
- quoted ordered-list empty child item promotes one level and keeps expected ordered marker.

Reuse the existing blockquote probe helper functions. Do not create a second probe harness.

- [ ] **Step 2: Run focused probes**

Run:

```powershell
npm.cmd run test:editing-experience -- --group blockquote
```

If the script does not support `--group`, run:

```powershell
npm.cmd run test:editing-experience
```

Expected: all probe cases pass.

- [ ] **Step 3: Run required quality gates**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: all pass.

- [ ] **Step 4: Commit probe updates**

```powershell
git add -- src/renderer/markdown-editing-experience-probe.ts src/renderer/code-editor.test.ts
git commit -m "Add blockquote structural editing probes"
```

---

## Final Acceptance Checklist

- [ ] Body structural separators still behave as before.
- [ ] Quote bare separator lines render as quote structure, not raw `>`, after commit.
- [ ] The caret cannot enter quote-internal structural separator lines by ArrowUp, ArrowDown, mouse selection, or programmatic selection normalization.
- [ ] Backspace at the following quoted content start deletes the quote separator instead of only moving the caret.
- [ ] Empty nested quote lines exit one quote level per Enter.
- [ ] Lists inside blockquotes use the same Enter and Backspace behavior as body lists, including ordered numbering after promotion.
- [ ] `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check` pass.
