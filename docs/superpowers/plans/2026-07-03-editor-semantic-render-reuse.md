# Editor Semantic Render Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Markdown block rendering inside blockquote containers reuse the same semantic block capabilities as body rendering, starting with quote-internal tables and keeping Markdown text as the only source of truth.

**Architecture:** Keep `MarkdownDocument` / `MarkdownBlock` as parser output, not a new truth model. Add small recursive block-tree helpers, derive table cursor/context from the semantic tree, and let blockquote inner blocks call the same table widget path with a container context. `ActiveBlockState` stays compatible while table/list/table-widget consumers gradually move to `EditorSemanticContext`.

**Tech Stack:** TypeScript, React, CodeMirror 6 decorations/widgets, FishMark markdown-engine, Vitest, Electron editing-experience probes.

---

## Current Problem

Top-level body tables render through `TableWidget`, but table discovery and table interaction are still mostly top-level:

- `deriveTableCursorState()` scans only `markdownDocument.blocks`.
- `findTableBlockByStartOffset()` scans only `activeState.blockMap.blocks`.
- `appendBlockquoteInnerBlockDecorations()` skips active quote-internal inner blocks except lists.
- `TableWidget` has no blockquote container class/depth, so even inactive quote-internal table widgets cannot inherit quote rail/content-column geometry cleanly.

The parser already creates `blockquote.innerBlocks` from a virtual quote-stripped source and normalizes `table` line ranges back to original source offsets. The rendering plan should use that instead of adding another parser truth model.

---

## File Structure

- `packages/editor-core/src/context/block-tree.ts`
  - New recursive read-only helpers for walking `MarkdownBlock` trees, including blockquote `innerBlocks` and list child blocks.
- `packages/editor-core/src/context/block-tree.test.ts`
  - Unit coverage for recursive table lookup and stable source-order traversal.
- `packages/markdown-engine/src/parse-block-map.test.ts`
  - Parser characterization that quote-internal pipe tables exist as `blockquote.innerBlocks`.
- `packages/editor-core/src/table-cursor-state.ts`
  - Use recursive table discovery, preserving public `TableCursorState`.
- `packages/editor-core/src/table-cursor-state.test.ts`
  - New focused tests for quote-internal table cursor inside/adjacent behavior.
- `packages/editor-core/src/commands/table-context.ts`
  - Resolve table blocks by start offset recursively.
- `packages/editor-core/src/commands/table-context.test.ts`
  - Coverage that `readTableContext()` resolves quote-internal table cells.
- `packages/editor-core/src/decorations/table-widget.ts`
  - Add optional render container metadata to the existing `TableWidget`.
- `packages/editor-core/src/decorations/block-decorations.ts`
  - Pass blockquote container context when rendering inner blocks; render active quote-internal tables via the same table widget path.
- `packages/editor-core/src/decorations/block-decorations.test.ts`
  - Coverage that quote-internal tables produce `TableWidget` and blockquote line classes.
- `packages/editor-core/src/extensions/markdown.test.ts`
  - Focus and shortcut tests for quote-internal table widgets.
- `src/renderer/code-editor.test.ts`
  - Renderer controller coverage for quote-internal table widget rendering and editing.
- `src/renderer/markdown-editing-experience-probe.ts`
  - Real Chromium/Electron probe for quote-internal table visual geometry.
- `src/renderer/styles/markdown-render.css`
  - Quote-aware table widget geometry that reuses existing table visual rules.
- `docs/test-report.md`
  - Add validation entry after gates.
- `reports/task-summaries/TASK-064.md`
  - Add task summary.

---

## Task 0: Characterize Quote-Internal Table Semantics

**Files:**
- Modify: `packages/markdown-engine/src/parse-block-map.test.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.test.ts`

- [ ] **Step 1: Add parser characterization for quote-internal pipe tables**

Add this test near the existing blockquote `innerBlocks` tests in `packages/markdown-engine/src/parse-block-map.test.ts`:

```ts
it("stitches blockquote inner pipe tables with original offsets", () => {
  const source = [
    "> | name | qty |",
    "> | --- | ---: |",
    "> | pen | 2 |",
    "",
    "Plain"
  ].join("\n");
  const result = parseMarkdownDocument(source);
  const blockquote = result.blocks[0] as BlockquoteBlock;
  const table = blockquote.innerBlocks?.[0];

  expect(blockquote.type).toBe("blockquote");
  expect(table?.type).toBe("table");
  if (table?.type !== "table") {
    throw new Error("Expected quote-internal table block");
  }

  expect(table.startOffset).toBe(0);
  expect(table.endOffset).toBe(source.indexOf("\n\nPlain"));
  expect(table.startLine).toBe(1);
  expect(table.endLine).toBe(3);
  expect(table.header.map((cell) => cell.text)).toEqual(["name", "qty"]);
  expect(table.rows.map((row) => row.map((cell) => cell.text))).toEqual([["pen", "2"]]);
  expect(table.header[0]?.contentStartOffset).toBe(source.indexOf("name"));
  expect(table.rows[0]?.[0]?.contentStartOffset).toBe(source.indexOf("pen"));
});
```

- [ ] **Step 2: Add current rendering characterization for inactive quote-internal tables**

Add this test near the existing table decoration test in `packages/editor-core/src/decorations/block-decorations.test.ts`:

```ts
it("renders inactive quote-internal tables through the shared table widget", () => {
  const source = [
    "> | name | qty |",
    "> | --- | ---: |",
    "> | pen | 2 |",
    "",
    "Plain"
  ].join("\n");
  const blockMap = parseMarkdownDocument(source);
  const activeState = createActiveBlockStateFromBlockMap(blockMap, {
    anchor: source.indexOf("Plain"),
    head: source.indexOf("Plain")
  });

  const result = createBlockDecorations({
    activeBlockState: activeState,
    hasEditorFocus: true,
    source
  });
  const ranges = collectDecorations(source, result.decorationSet);
  const widgets = collectWidgets(source, result.decorationSet);

  expectExactRangeClasses(ranges, 0, 0, [
    "cm-inactive-blockquote cm-inactive-blockquote-depth-1 cm-inactive-blockquote-start"
  ]);
  expect(widgets).toContainEqual({
    from: 0,
    to: source.indexOf("\n\nPlain"),
    name: "TableWidget"
  });
});
```

- [ ] **Step 3: Run focused characterization tests**

```powershell
npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts -t "blockquote inner pipe tables|quote-internal tables"
```

Expected: parser test should PASS. Decoration test may PASS for inactive widgets or FAIL if the widget is not currently produced; record the actual result in the task notes before implementing.

- [ ] **Step 4: Commit characterization**

```powershell
git add -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts
git commit -m "Characterize quote-internal table rendering"
```

---

## Task 1: Add Recursive Block Tree Helpers

**Files:**
- Create: `packages/editor-core/src/context/block-tree.ts`
- Create: `packages/editor-core/src/context/block-tree.test.ts`
- Modify: `packages/editor-core/src/index.ts`

- [ ] **Step 1: Add tests for recursive traversal and lookup**

Create `packages/editor-core/src/context/block-tree.test.ts`:

```ts
import type { MarkdownBlock, TableBlock } from "@fishmark/markdown-engine";
import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import {
  findBlockByStartOffsetDeep,
  findBlocksByTypeDeep,
  walkMarkdownBlocks
} from "./block-tree";

describe("block-tree", () => {
  it("walks top-level and blockquote inner blocks in source order", () => {
    const source = [
      "> alpha",
      ">",
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |",
      "",
      "Plain"
    ].join("\n");
    const document = parseMarkdownDocument(source);

    expect(walkMarkdownBlocks(document.blocks).map((entry) => entry.block.type)).toEqual([
      "blockquote",
      "paragraph",
      "table",
      "paragraph"
    ]);
  });

  it("finds quote-internal tables by type and start offset", () => {
    const source = [
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |"
    ].join("\n");
    const document = parseMarkdownDocument(source);
    const tables = findBlocksByTypeDeep(document.blocks, "table");
    const table = tables[0] as TableBlock | undefined;

    expect(tables).toHaveLength(1);
    expect(table?.startOffset).toBe(0);
    expect(findBlockByStartOffsetDeep(document.blocks, "table", 0)).toBe(table);
  });

  it("returns null when no block of the requested type starts at the offset", () => {
    const document = parseMarkdownDocument("Plain");

    expect(findBlockByStartOffsetDeep(document.blocks, "table", 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement recursive block helpers**

Create `packages/editor-core/src/context/block-tree.ts`:

```ts
import type { ListBlock, MarkdownBlock } from "@fishmark/markdown-engine";

export type MarkdownBlockTreeEntry = {
  readonly block: MarkdownBlock;
  readonly parents: readonly MarkdownBlock[];
};

export function walkMarkdownBlocks(
  blocks: readonly MarkdownBlock[],
  parents: readonly MarkdownBlock[] = []
): MarkdownBlockTreeEntry[] {
  const entries: MarkdownBlockTreeEntry[] = [];

  for (const block of blocks) {
    entries.push({ block, parents });
    entries.push(...walkMarkdownBlocks(getChildBlocks(block), [...parents, block]));
  }

  return entries;
}

export function findBlocksByTypeDeep<TType extends MarkdownBlock["type"]>(
  blocks: readonly MarkdownBlock[],
  type: TType
): Array<Extract<MarkdownBlock, { type: TType }>> {
  return walkMarkdownBlocks(blocks)
    .map((entry) => entry.block)
    .filter((block): block is Extract<MarkdownBlock, { type: TType }> => block.type === type);
}

export function findBlockByStartOffsetDeep<TType extends MarkdownBlock["type"]>(
  blocks: readonly MarkdownBlock[],
  type: TType,
  startOffset: number | undefined
): Extract<MarkdownBlock, { type: TType }> | null {
  if (typeof startOffset !== "number") {
    return null;
  }

  return (
    findBlocksByTypeDeep(blocks, type).find((block) => block.startOffset === startOffset) ?? null
  );
}

function getChildBlocks(block: MarkdownBlock): readonly MarkdownBlock[] {
  if (block.type === "blockquote") {
    return block.innerBlocks ?? [];
  }

  if (block.type === "list") {
    return getListChildBlocks(block);
  }

  return [];
}

function getListChildBlocks(block: ListBlock): readonly MarkdownBlock[] {
  return block.items.flatMap((item) => item.children ?? []);
}
```

- [ ] **Step 3: Export helper module**

Add to `packages/editor-core/src/index.ts`:

```ts
export {
  findBlockByStartOffsetDeep,
  findBlocksByTypeDeep,
  walkMarkdownBlocks,
  type MarkdownBlockTreeEntry
} from "./context/block-tree";
```

- [ ] **Step 4: Run focused tests**

```powershell
npm.cmd run test -- packages/editor-core/src/context/block-tree.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- packages/editor-core/src/context/block-tree.ts packages/editor-core/src/context/block-tree.test.ts packages/editor-core/src/index.ts
git commit -m "Add recursive markdown block tree helpers"
```

---

## Task 2: Derive Table Cursor From the Semantic Block Tree

**Files:**
- Modify: `packages/editor-core/src/table-cursor-state.ts`
- Create: `packages/editor-core/src/table-cursor-state.test.ts`

- [ ] **Step 1: Add table cursor tests for quote-internal tables**

Create `packages/editor-core/src/table-cursor-state.test.ts`:

```ts
import { parseMarkdownDocument } from "@fishmark/markdown-engine";

import { deriveTableCursorState } from "./table-cursor-state";

describe("deriveTableCursorState", () => {
  it("detects a cursor inside a quote-internal table cell", () => {
    const source = [
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |"
    ].join("\n");
    const document = parseMarkdownDocument(source);
    const cursor = deriveTableCursorState(
      source,
      {
        anchor: source.indexOf("pen"),
        head: source.indexOf("pen")
      },
      document,
      null
    );

    expect(cursor).toEqual({
      mode: "inside",
      tableStartOffset: 0,
      row: 1,
      column: 0,
      offsetInCell: 0
    });
  });

  it("detects quote-internal table adjacency from the quoted line above", () => {
    const source = [
      "> Intro",
      ">",
      "> | name | qty |",
      "> | --- | ---: |",
      "> | pen | 2 |"
    ].join("\n");
    const document = parseMarkdownDocument(source);
    const cursor = deriveTableCursorState(
      source,
      {
        anchor: source.indexOf("> Intro") + "> Intro".length,
        head: source.indexOf("> Intro") + "> Intro".length
      },
      document,
      null
    );

    expect(cursor).toMatchObject({
      mode: "adjacent-above",
      tableStartOffset: source.indexOf("> | name"),
      row: 0,
      column: 0
    });
  });
});
```

- [ ] **Step 2: Use recursive table discovery in cursor derivation**

Modify `packages/editor-core/src/table-cursor-state.ts`:

```ts
import { findBlocksByTypeDeep } from "./context/block-tree";
```

Replace the top-level table scan:

```ts
const tableBlocks = markdownDocument.blocks.filter(
  (block): block is TableBlock => block.type === "table"
);
```

with:

```ts
const tableBlocks = findBlocksByTypeDeep(markdownDocument.blocks, "table");
```

Keep the rest of `deriveTableCursorState()` unchanged. This preserves `TableCursorState` compatibility while allowing nested tables.

- [ ] **Step 3: Run focused tests**

```powershell
npm.cmd run test -- packages/editor-core/src/table-cursor-state.test.ts packages/editor-core/src/context/block-tree.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add -- packages/editor-core/src/table-cursor-state.ts packages/editor-core/src/table-cursor-state.test.ts
git commit -m "Derive table cursor from semantic block tree"
```

---

## Task 3: Resolve Table Context Recursively

**Files:**
- Modify: `packages/editor-core/src/commands/table-context.ts`
- Modify: `packages/editor-core/src/commands/table-context.test.ts`

- [ ] **Step 1: Add recursive table context test**

Add to `packages/editor-core/src/commands/table-context.test.ts`:

```ts
it("reads table context for quote-internal table cells", () => {
  const doc = [
    "> | name | qty |",
    "> | --- | ---: |",
    "> | pen | 2 |"
  ].join("\n");
  const activeState = createActiveState(doc, doc.indexOf("pen"));
  const state = EditorState.create({ doc });

  const context = readTableContext(state, activeState);

  expect(context).toMatchObject({
    block: {
      type: "table",
      startOffset: 0
    },
    cell: {
      text: "pen",
      rowIndex: 1,
      columnIndex: 0
    },
    position: {
      mode: "inside",
      tableStartOffset: 0,
      row: 1,
      column: 0,
      offsetInCell: 0
    },
    columnCount: 2
  });
});
```

Use the existing `buildTableContext(doc, anchor)` helper in this file. It already creates `EditorState`, `ActiveBlockState`, and `tableCursor`.

- [ ] **Step 2: Resolve table blocks through the block tree**

Modify `packages/editor-core/src/commands/table-context.ts`:

```ts
import { findBlockByStartOffsetDeep } from "../context/block-tree";
```

Replace `findTableBlockByStartOffset()` implementation with:

```ts
export function findTableBlockByStartOffset(
  activeState: ActiveBlockState,
  tableStartOffset: number | undefined
): TableBlock | null {
  return findBlockByStartOffsetDeep(activeState.blockMap.blocks, "table", tableStartOffset);
}
```

- [ ] **Step 3: Run focused tests**

```powershell
npm.cmd run test -- packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/table-cursor-state.test.ts
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add -- packages/editor-core/src/commands/table-context.ts packages/editor-core/src/commands/table-context.test.ts
git commit -m "Resolve table context from nested semantic blocks"
```

---

## Task 4: Make TableWidget Container-Aware

**Files:**
- Modify: `packages/editor-core/src/decorations/table-widget.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.test.ts`
- Modify: `src/renderer/styles/markdown-render.css`

- [ ] **Step 1: Add table widget class test for quote-internal tables**

Add to `packages/editor-core/src/decorations/block-decorations.test.ts`:

```ts
it("adds blockquote container metadata to quote-internal table widgets", () => {
  const source = [
    "> | name | qty |",
    "> | --- | ---: |",
    "> | pen | 2 |"
  ].join("\n");
  const blockMap = parseMarkdownDocument(source);
  const activeState = createActiveBlockStateFromBlockMap(blockMap, {
    anchor: 0,
    head: 0
  });

  const result = createBlockDecorations({
    activeBlockState: activeState,
    hasEditorFocus: false,
    source
  });

  const widget = collectWidgets(source, result.decorationSet).find((entry) => entry.name === "TableWidget");

  expect(widget).toMatchObject({
    from: 0,
    to: source.length,
    name: "TableWidget"
  });
  expect(result.signature).toContain("table:");
  expect(result.signature).toContain("container:blockquote:1");
});
```

- [ ] **Step 2: Add render options to table widget**

Modify `packages/editor-core/src/decorations/table-widget.ts`:

```ts
export type TableWidgetRenderOptions = {
  readonly containerClassName?: string;
  readonly containerDepth?: number;
};
```

Update the constructor:

```ts
constructor(
  private readonly block: TableBlock,
  private readonly activePosition: TablePosition | null,
  private readonly callbacks: TableWidgetCallbacks | null,
  private readonly footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>,
  private readonly renderOptions: TableWidgetRenderOptions = {}
) {
  super();
}
```

Update `eq()`:

```ts
other.renderOptions.containerClassName === this.renderOptions.containerClassName &&
other.renderOptions.containerDepth === this.renderOptions.containerDepth
```

Update `toDOM()` after `root.className = "cm-table-widget";`:

```ts
if (this.renderOptions.containerClassName) {
  root.classList.add(this.renderOptions.containerClassName);
}

if (typeof this.renderOptions.containerDepth === "number") {
  root.dataset.containerDepth = String(this.renderOptions.containerDepth);
  root.classList.add(`cm-table-widget-blockquote-depth-${Math.max(1, Math.min(this.renderOptions.containerDepth, 4))}`);
}
```

Update `syncDOM()` if needed so it preserves the same class/data attributes when the widget is reused.

- [ ] **Step 3: Pass render options through table decoration creation**

Modify `createTableWidgetDecoration()` in `packages/editor-core/src/decorations/table-widget.ts` to accept the new final parameter:

```ts
export function createTableWidgetDecoration(
  block: TableBlock,
  activePosition: TablePosition | null,
  callbacks: TableWidgetCallbacks | null,
  footnoteDefinitions?: ReadonlyMap<string, FootnoteDefinition>,
  renderOptions: TableWidgetRenderOptions = {}
): Range<Decoration> {
  return Decoration.replace({
    widget: new TableWidget(block, activePosition, callbacks, footnoteDefinitions, renderOptions),
    block: true
  }).range(block.startOffset, block.endOffset);
}
```

- [ ] **Step 4: Add block decoration container context**

In `packages/editor-core/src/decorations/block-decorations.ts`, add:

```ts
type BlockDecorationContainerContext =
  | {
      readonly type: "blockquote";
      readonly depth: number;
    }
  | null;
```

Change `appendDecorationsForBlock()` signature:

```ts
function appendDecorationsForBlock(
  block: DecoratableBlock,
  context: BlockDecorationContext,
  ranges: Range<Decoration>[],
  signatures?: string[],
  containerContext: BlockDecorationContainerContext = null
): void
```

When `block.type === "table"`, pass render options:

```ts
const tableRenderOptions =
  containerContext?.type === "blockquote"
    ? {
        containerClassName: "cm-table-widget-blockquote",
        containerDepth: containerContext.depth
      }
    : {};

ranges.push(
  createTableWidgetDecoration(
    block,
    cursorForBlock ? { ... } : null,
    context.tableWidgetCallbacks ?? null,
    context.footnoteDefinitions,
    tableRenderOptions
  )
);
signatures?.push(
  `${createBlockDecorationSignature(block)}${
    containerContext ? `:container:${containerContext.type}:${containerContext.depth}` : ""
  }`
);
```

- [ ] **Step 5: Pass blockquote container context for inner blocks**

In `appendBlockquoteInnerBlockDecorations()`, compute the quote depth from the line touched by the inner block:

```ts
const containerContext = resolveBlockquoteContainerContextForInnerBlock(innerBlock, context.source);
appendInactiveDecorationsForBlock(innerBlock, context, ranges, containerContext);
```

Add:

```ts
function resolveBlockquoteContainerContextForInnerBlock(
  block: DecoratableBlock,
  source: string
): BlockDecorationContainerContext {
  const lineStart = findLineStartOffset(source, block.startOffset);
  const lineEnd = findLineEndOffset(source, lineStart, source.length);
  const parsed = parseBlockquoteLine(source.slice(lineStart, lineEnd));

  return {
    type: "blockquote",
    depth: parsed?.quoteDepth ?? 1
  };
}
```

If `findLineStartOffset` is not present in this file, add the local implementation:

```ts
function findLineStartOffset(source: string, offset: number): number {
  const previousBreak = source.lastIndexOf("\n", Math.max(0, offset - 1));
  return previousBreak === -1 ? 0 : previousBreak + 1;
}
```

- [ ] **Step 6: Add quote-aware table widget CSS**

Add near `.cm-table-widget` rules in `src/renderer/styles/markdown-render.css`:

```css
.document-editor .cm-table-widget.cm-table-widget-blockquote {
  --fishmark-table-widget-blockquote-depth-offset: 0rem;
  position: relative;
  padding-left: calc(
    var(--fishmark-blockquote-rail-width, 4px) +
    var(--fishmark-blockquote-padding-inline) +
    var(--fishmark-table-widget-blockquote-depth-offset)
  );
  padding-right: var(--fishmark-blockquote-padding-inline);
  border-left: var(--fishmark-blockquote-rail-width, 4px) solid var(--fishmark-blockquote-border, #dfe2e5);
}

.document-editor .cm-table-widget.cm-table-widget-blockquote-depth-2 {
  --fishmark-table-widget-blockquote-depth-offset: var(--fishmark-blockquote-nested-indent);
}

.document-editor .cm-table-widget.cm-table-widget-blockquote-depth-3 {
  --fishmark-table-widget-blockquote-depth-offset: calc(var(--fishmark-blockquote-nested-indent) * 2);
}

.document-editor .cm-table-widget.cm-table-widget-blockquote-depth-4 {
  --fishmark-table-widget-blockquote-depth-offset: calc(var(--fishmark-blockquote-nested-indent) * 3);
}
```

Do not duplicate `.cm-table-widget-table`, `.cm-table-widget-cell`, or `.cm-table-widget-input` visual rules.

- [ ] **Step 7: Run focused tests**

```powershell
npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts -t "quote-internal table|table widget"
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- packages/editor-core/src/decorations/table-widget.ts packages/editor-core/src/decorations/block-decorations.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/styles/markdown-render.css
git commit -m "Render quote-internal tables with shared table widget"
```

---

## Task 5: Keep Active Quote-Internal Tables Rendered And Editable

**Files:**
- Modify: `packages/editor-core/src/decorations/block-decorations.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.test.ts`
- Modify: `packages/editor-core/src/extensions/markdown.test.ts`

- [ ] **Step 1: Add active decoration regression**

Add to `packages/editor-core/src/decorations/block-decorations.test.ts`:

```ts
it("keeps quote-internal table widgets mounted when selection is inside a table cell", () => {
  const source = [
    "> | name | qty |",
    "> | --- | ---: |",
    "> | pen | 2 |"
  ].join("\n");
  const blockMap = parseMarkdownDocument(source);
  const activeState = createActiveBlockStateFromBlockMap(blockMap, {
    anchor: source.indexOf("pen"),
    head: source.indexOf("pen")
  });

  const result = createBlockDecorations({
    activeBlockState: activeState,
    hasEditorFocus: true,
    source
  });

  expect(collectWidgets(source, result.decorationSet)).toContainEqual({
    from: 0,
    to: source.length,
    name: "TableWidget"
  });
});
```

- [ ] **Step 2: Render active quote-internal tables instead of skipping them**

In `appendBlockquoteInnerBlockDecorations()`, replace the active-line branch with:

```ts
if (activeLineStart !== null && blockTouchesLine(innerBlock, activeLineStart, context.source)) {
  if (innerBlock.type === "list") {
    appendActiveListDecorations(
      innerBlock,
      context.source,
      activeLineStart,
      ranges,
      context.resolveImagePreviewUrl,
      context.referenceDefinitions,
      context.footnoteDefinitions
    );
    continue;
  }

  if (innerBlock.type === "table") {
    appendDecorationsForBlock(
      innerBlock,
      context,
      ranges,
      undefined,
      resolveBlockquoteContainerContextForInnerBlock(innerBlock, context.source)
    );
    continue;
  }

  continue;
}
```

- [ ] **Step 3: Add extension focus regression**

Add to `packages/editor-core/src/extensions/markdown.test.ts`:

```ts
it("focuses a quote-internal table cell through the shared table widget", async () => {
  const doc = [
    "> | name | qty |",
    "> | --- | ---: |",
    "> | pen | 2 |"
  ].join("\n");
  const harness = createHarness({
    source: doc
  });

  await flushMicrotasks();

  const input = harness.view.dom.querySelector<HTMLElement>('[data-table-cell="1:0"]');

  expect(input?.textContent).toBe("pen");
  expect(input?.closest(".cm-table-widget-blockquote")).not.toBeNull();

  harness.destroy();
});
```

- [ ] **Step 4: Run focused tests**

```powershell
npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts -t "quote-internal table|table cell"
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- packages/editor-core/src/decorations/block-decorations.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts
git commit -m "Keep active quote-internal table widgets mounted"
```

---

## Task 6: Renderer And Probe Coverage

**Files:**
- Modify: `src/renderer/code-editor.test.ts`
- Modify: `src/renderer/markdown-editing-experience-probe.ts`

- [ ] **Step 1: Add renderer controller test**

Add to `src/renderer/code-editor.test.ts`:

```ts
it("renders and edits a table inside a blockquote", async () => {
  const initialContent = [
    "> | name | qty |",
    "> | --- | ---: |",
    "> | pen | 2 |"
  ].join("\n");
  const host = document.createElement("div");
  const controller = createCodeEditorController({
    parent: host,
    initialContent,
    onChange: vi.fn()
  });

  controller.setSelection(initialContent.indexOf("pen"));
  await flushMicrotasks();

  const table = host.querySelector<HTMLElement>(".cm-table-widget-blockquote");
  const cell = host.querySelector<HTMLElement>('[data-table-cell="1:0"]');

  expect(table).not.toBeNull();
  expect(cell?.textContent).toBe("pen");

  cell?.focus();
  cell?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }));
  await flushMicrotasks();

  expect(controller.getContent()).toContain("> | pen | 2 |");

  controller.destroy();
});
```

- [ ] **Step 2: Add editing-experience probe case**

Add a case id `blockquote-table-rendering` to `src/renderer/markdown-editing-experience-probe.ts`:

```ts
async function runBlockquoteTableRenderingCase(): Promise<CaseResult> {
  const initialContent = [
    "> Before",
    ">",
    "> | name | qty |",
    "> | --- | ---: |",
    "> | pen | 2 |",
    ">",
    "> After"
  ].join("\n");
  const harness = setupHarness(initialContent);

  harness.controller.setSelection(initialContent.indexOf("pen"));
  await settle();

  const table = harness.view.dom.querySelector<HTMLElement>(".cm-table-widget-blockquote");
  const firstCell = harness.view.dom.querySelector<HTMLElement>('[data-table-cell="1:0"]');
  const quoteLine = Array.from(harness.view.dom.querySelectorAll<HTMLElement>(".cm-line"))
    .find((line) => line.textContent?.includes("Before"));
  const tableRect = table?.getBoundingClientRect() ?? null;
  const quoteRect = quoteLine?.getBoundingClientRect() ?? null;
  const cellText = firstCell?.textContent ?? "";
  const geometryPass = Boolean(
    tableRect &&
    quoteRect &&
    tableRect.left >= quoteRect.left &&
    tableRect.width > 120
  );

  harness.destroy();

  return {
    caseId: "blockquote-table-rendering",
    grammar: "blockquote",
    name: "renders a table inside a blockquote through the shared table widget",
    pass: cellText === "pen" && geometryPass,
    expectedContent: initialContent,
    actualContent: initialContent,
    details: {
      cellText,
      geometryPass,
      tableClass: table?.className ?? null,
      tableRect,
      quoteRect
    }
  };
}
```

Register the case in the same case map/group switch that contains `blockquote-code-fence-input`. Add it to the `blockquote` group.

- [ ] **Step 3: Run renderer and probe tests**

```powershell
npm.cmd run test -- src/renderer/code-editor.test.ts -t "table inside a blockquote"
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='blockquote-table-rendering'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience
```

Expected: PASS. The probe must report `.cm-table-widget-blockquote` and `cellText: "pen"`.

- [ ] **Step 4: Commit**

```powershell
git add -- src/renderer/code-editor.test.ts src/renderer/markdown-editing-experience-probe.ts
git commit -m "Cover quote-internal table rendering in renderer probes"
```

---

## Task 7: Documentation And Focused Regression Sweep

**Files:**
- Modify: `docs/test-report.md`
- Create: `reports/task-summaries/TASK-064.md`

- [ ] **Step 1: Run focused semantic rendering suite**

```powershell
npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/context/block-tree.test.ts packages/editor-core/src/table-cursor-state.test.ts packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='blockquote-table-rendering'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience
```

Expected: PASS.

- [ ] **Step 2: Append test report entry**

Append to `docs/test-report.md`:

```md
| 2026-07-03 | TASK-064 引用块内统一语义渲染复用 | `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/context/block-tree.test.ts packages/editor-core/src/table-cursor-state.test.ts packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts` / `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='blockquote-table-rendering'; npm.cmd run test:editing-experience` / `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience` / `npm.cmd run test` / `npm.cmd run typecheck` / `npm.cmd run lint` / `npm.cmd run build` / `git diff --check` | 通过 | 引用块内 table 复用正文 `TableWidget`，table cursor/context 通过递归 semantic block tree 解析 quote-internal table；probe 验证 `.cm-table-widget-blockquote`、单元格内容和引用内容列几何。`build` 如仍输出 Vite chunk-size warning，按既有 warning 记录。 |
```

- [ ] **Step 3: Create task summary**

Create `reports/task-summaries/TASK-064.md`:

```md
# TASK-064 Quote-Internal Semantic Render Reuse

## Summary

Quote-internal tables now reuse the same semantic table widget, cursor, and table context path as body tables. Blockquote rendering supplies container metadata instead of duplicating table styling or parsing.

## Changed

- Added recursive Markdown block tree helpers.
- Derived table cursor state from nested semantic blocks.
- Resolved table context recursively.
- Rendered quote-internal tables through `TableWidget` with blockquote container classes.
- Added renderer and editing-experience coverage for blockquote table rendering.

## Validation

- `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/context/block-tree.test.ts packages/editor-core/src/table-cursor-state.test.ts packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts`: PASS
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='blockquote-table-rendering'; npm.cmd run test:editing-experience`: PASS
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience`: PASS
- `npm.cmd run test`: PASS
- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd run build`: PASS
- `git diff --check`: PASS

## Follow-Up

- Move list context onto `EditorSemanticContext`.
- Move remaining decoration active-state decisions onto leaf/container context.
- Add quote-internal coverage for heading, thematic break, image preview, footnotes, Mermaid, and HTML blocks when each parser shape is stable.
```

- [ ] **Step 4: Commit docs**

```powershell
git add -- docs/test-report.md reports/task-summaries/TASK-064.md
git commit -m "Document quote-internal semantic render reuse"
```

---

## Task 8: Full Quality Gates

**Files:**
- No source changes unless a gate exposes a required fix.

- [ ] **Step 1: Run focused tests**

```powershell
npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/context/block-tree.test.ts packages/editor-core/src/table-cursor-state.test.ts packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run editing-experience probes**

```powershell
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='blockquote-table-rendering'; npm.cmd run test:editing-experience
$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience
```

Expected: PASS.

- [ ] **Step 3: Run full gates**

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

Expected: all commands pass. `npm.cmd run build` may emit the existing Vite chunk-size warning; record it if present.

- [ ] **Step 4: Final review**

Review the diff for:

- No new Markdown parser truth model.
- No source rewriting, save-path formatting, or document reflow.
- `MarkdownDocument` and `MarkdownBlock` remain parser output and the only structural source.
- `ActiveBlockState.tableCursor` remains compatible.
- Quote-internal tables use the same `TableWidget` and table commands as body tables.
- CSS only adds container geometry; it does not duplicate table cell/header visual rules.
- Follow-up styles are enabled through recursive block context, not one-off blockquote regexes.

---

## Acceptance Checklist

- [ ] Quote-internal pipe tables parse as `blockquote.innerBlocks[]` with `type: "table"` and original source offsets.
- [ ] Table cursor detection works inside quote-internal table cells.
- [ ] `readTableContext()` resolves quote-internal table cells.
- [ ] Inactive quote-internal tables render as `TableWidget`.
- [ ] Active quote-internal table cells keep the table widget mounted and editable.
- [ ] Quote-internal table widget has blockquote container class/depth and aligns inside the quote content column.
- [ ] Existing body table behavior and shortcuts still pass.
- [ ] Existing blockquote list/code/math behavior still passes.
- [ ] Full gates pass.
