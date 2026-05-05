# Nested Blockquote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-grade nested blockquote support without changing Markdown source truth or replacing the CodeMirror decoration pipeline.

**Architecture:** `packages/markdown-engine` becomes the single owner of blockquote prefix parsing and quote depth. `editor-core` consumes that metadata for inactive/active decorations and commands, so rendering, Enter, Backspace, toggle, pointer mapping, and hidden selection normalization agree on one source of truth. This plan intentionally stops before a full nested container AST; blockquote/list mixed child blocks remain a follow-up task.

**Tech Stack:** Electron, React, TypeScript, CodeMirror 6, micromark, Vitest.

---

### Task 1: Parser-Owned Blockquote Prefix Metadata

**Files:**
- Modify: `packages/markdown-engine/src/block-map.ts`
- Create: `packages/markdown-engine/src/blockquote.ts`
- Modify: `packages/markdown-engine/src/parse-markdown-document.ts`
- Modify: `packages/markdown-engine/src/index.ts`
- Test: `packages/markdown-engine/src/parse-block-map.test.ts`

- [x] **Step 1: Write failing parser tests**

Add tests proving nested quote prefixes are removed from inline content:

```ts
it("stitches nested blockquote markers and inline content from the deepest quote prefix", () => {
  const source = ["> outer", "> > **nested**", ">> `compact`"].join("\n");
  const result = parseMarkdownDocument(source);
  const blockquote = result.blocks[0] as BlockquoteBlock;

  expect(blockquote.lines?.[0]).toMatchObject({
    quoteDepth: 1,
    markerEnd: 1,
    contentStartOffset: 2
  });
  expect(blockquote.lines?.[1]).toMatchObject({
    quoteDepth: 2,
    markerEnd: source.indexOf("**nested**") - 1,
    contentStartOffset: source.indexOf("**nested**"),
    inline: { children: [{ type: "strong" }] }
  });
  expect(blockquote.lines?.[2]).toMatchObject({
    quoteDepth: 2,
    contentStartOffset: source.indexOf("`compact`"),
    inline: { children: [{ type: "codeSpan", text: "compact" }] }
  });
});

it("keeps CRLF offsets correct for nested blockquote inline content", () => {
  const source = ["> first", "> > **second**"].join("\r\n");
  const result = parseMarkdownDocument(source);
  const blockquote = result.blocks[0] as BlockquoteBlock;

  expect(blockquote.lines?.[1]).toMatchObject({
    quoteDepth: 2,
    contentStartOffset: source.indexOf("**second**"),
    contentEndOffset: source.length,
    inline: { startOffset: source.indexOf("**second**") }
  });
});
```

- [x] **Step 2: Run parser tests and verify RED**

Run:

```powershell
npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts
```

Expected: the new tests fail because blockquote lines do not expose `quoteDepth`, and nested markers are parsed as inline text.

- [x] **Step 3: Add blockquote prefix types and parser helper**

Add `BlockquoteMarker` fields to `block-map.ts`, and implement `parseBlockquoteLinePrefix(source, lineStartOffset, lineEndOffset)` in `blockquote.ts`. The helper must parse one or more markers with up to three leading spaces before each marker and optional one-space/tab marker padding.

- [x] **Step 4: Wire rich blockquote lines to the helper**

Update `createBlockquoteLines()` so each line has:

```ts
quoteDepth: prefix.markers.length,
markers: prefix.markers,
sourcePrefixEndOffset: prefix.sourcePrefixEndOffset,
markerEnd: prefix.markerEnd,
contentStartOffset: prefix.contentStartOffset
```

Then call `parseInlineAst(source, contentStartOffset, contentEndOffset)`.

- [x] **Step 5: Export the helper and verify GREEN**

Export the new helper/types through `packages/markdown-engine/src/index.ts`, then rerun:

```powershell
npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts
```

Expected: parser tests pass.

### Task 2: Nested Blockquote Decorations

**Files:**
- Modify: `packages/editor-core/src/decorations/block-lines.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.ts`
- Test: `packages/editor-core/src/decorations/block-decorations.test.ts`
- Modify: `src/renderer/styles/markdown-render.css`
- Modify: `docs/standards/markdown-text-rendering-standard.json`

- [x] **Step 1: Write failing decoration tests**

Add a decoration test for inactive nested blockquotes:

```ts
it("hides full nested blockquote prefixes and tags quote depth", () => {
  const source = ["> outer", "> > **nested**", "Paragraph"].join("\n");
  const blockMap = parseMarkdownDocument(source);
  const activeState = createActiveBlockStateFromBlockMap(blockMap, {
    anchor: source.indexOf("Paragraph"),
    head: source.indexOf("Paragraph")
  });
  const ranges = collectDecorations(
    source,
    createBlockDecorations({ activeBlockState: activeState, hasEditorFocus: true, source }).decorationSet
  );

  expectExactRangeClasses(ranges, source.indexOf("> >"), source.indexOf("**nested**"), [
    "cm-inactive-blockquote-marker"
  ]);
  expectExactRangeClasses(ranges, source.indexOf("> >"), source.indexOf("> >"), [
    "cm-inactive-blockquote cm-inactive-blockquote-depth-2 cm-inactive-blockquote-end"
  ]);
  expectCoveredRangeClasses(ranges, source.indexOf("nested"), source.indexOf("nested") + "nested".length, [
    "cm-inactive-inline-strong"
  ]);
});
```

- [x] **Step 2: Run decoration tests and verify RED**

Run:

```powershell
npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts
```

Expected: the new depth class and full prefix hiding assertions fail.

- [x] **Step 3: Consume rich blockquote lines in decorations**

Update `appendBlockquoteDecorations()` to:
- use `line.sourcePrefixEndOffset` for marker hiding
- add `cm-inactive-blockquote-depth-${Math.min(line.quoteDepth, 4)}`
- keep start/end classes based on renderable lines
- keep inline decorations from `line.inline`

Update fallback `getInactiveBlockquoteLines()` to use the exported markdown-engine helper for lean block maps.

- [x] **Step 4: Add CSS geometry for nested quote depth**

Define blockquote depth variables and CSS rules:

```css
.document-editor .cm-inactive-blockquote {
  --fishmark-blockquote-depth-offset: 0rem;
  padding-left: calc(1.1rem + var(--fishmark-blockquote-depth-offset));
}

.document-editor .cm-inactive-blockquote-depth-2 {
  --fishmark-blockquote-depth-offset: 1rem;
  box-shadow:
    inset 2px 0 0 var(--fishmark-blockquote-border),
    inset calc(1rem + 2px) 0 0 var(--fishmark-blockquote-border);
}
```

Document nested blockquote geometry in `docs/standards/markdown-text-rendering-standard.json`.

- [x] **Step 5: Verify GREEN**

Run:

```powershell
npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts
```

Expected: decoration tests pass.

### Task 3: Commands and Interaction Semantics

**Files:**
- Modify: `packages/editor-core/src/commands/line-parsers.ts`
- Modify: `packages/editor-core/src/commands/blockquote-commands.ts`
- Modify: `packages/editor-core/src/commands/semantic-edits.ts`
- Test: `packages/editor-core/src/commands/semantic-edits.test.ts`
- Test: `packages/editor-core/src/commands/toggle-block-commands.test.ts`
- Test: `src/renderer/code-editor.test.ts`

- [x] **Step 1: Write failing command tests**

Add tests proving one-layer toggle and same-depth Enter:

```ts
it("removes only one quote layer from nested blockquote lines", () => {
  const doc = ["> > alpha", "> > beta"].join("\n");
  const result = computeBlockquoteToggle(buildContext(doc, 0, doc.length));

  expect(result!.changes).toEqual({
    from: 0,
    to: doc.length,
    insert: "> alpha\n> beta"
  });
});
```

In renderer tests, add:

```ts
it("continues nested blockquote depth on Enter", () => {
  const controller = createCodeEditorController({
    parent: host,
    initialDoc: "> > nested",
    onChange,
    parseMarkdownDocument
  });
  controller.view.dispatch({ selection: { anchor: "> > nested".length } });
  runEnter(controller.view);
  expect(controller.view.state.doc.toString()).toBe("> > nested\n> > ");
});
```

- [x] **Step 2: Run command tests and verify RED**

Run:

```powershell
npm.cmd run test -- packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts src/renderer/code-editor.test.ts
```

Expected: the new tests fail because commands only understand a single `> ` marker.

- [x] **Step 3: Route command parsing through markdown-engine helper**

Update `parseBlockquoteLine()` to return full `sourcePrefix`, `quoteDepth`, `content`, `contentStartColumn`, and `isCommitted`. Use it in:
- `runBlockquoteEnter()` for continuation prefix
- `runBlockquoteBackspace()` for content start checks
- `computeBlockquoteToggle()` for add/remove one layer

- [x] **Step 4: Preserve active blockquote selection geometry**

Confirm `line-visibility.ts` already reads `contentStartOffset`; no new parser logic should be added there. Update renderer tests only if nested prefixes expose a selection mapping regression.

- [x] **Step 5: Verify GREEN**

Run:

```powershell
npm.cmd run test -- packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts src/renderer/code-editor.test.ts
```

Expected: command and renderer tests pass.

### Task 4: Project Records and Handoff

**Files:**
- Modify: `MVP_BACKLOG.md`
- Modify: `docs/progress.md`
- Modify: `docs/test-cases.md`
- Modify: `docs/decision-log.md`
- Modify: `docs/test-report.md`
- Create: `docs/plans/2026-05-05-nested-blockquote-handoff.md`
- Create: `reports/task-summaries/TASK-044.md`

- [x] **Step 1: Update backlog and progress**

Add `TASK-044` under Epic 4 after `TASK-013`, mark it `DEV_DONE` only after implementation and development checks complete.

- [x] **Step 2: Add test cases**

Add a manual test case covering:
1. type `> outer`
2. type `> > **nested**`
3. move focus to a paragraph
4. confirm two quote rails, hidden full marker prefix, and inline bold rendering
5. return focus and confirm original Markdown is directly editable
6. press Enter at the end of `> > nested` and confirm `> > ` continuation
7. run blockquote toggle and confirm one layer is removed

- [x] **Step 3: Record decision and test evidence**

Update decision log with the parser-owned quote prefix decision. Update test report with exact commands and results from this worktree.

- [x] **Step 4: Write execution handoff and task summary**

Write the handoff and summary with changed files, verification commands, manual acceptance steps, and known follow-up for general nested container blocks.

- [x] **Step 5: Run focused checks**

Run:

```powershell
npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts src/renderer/code-editor.test.ts
```

Expected: all focused tests pass.
