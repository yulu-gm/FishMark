# Table Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-pass persistent table rendering with direct cell editing, canonical Markdown rewrites, dense table rail actions, and context-aware shortcut groups for default text editing versus table editing.

**Architecture:** Extend `markdown-engine` with a top-level `table` block and a canonical table formatter, then add a table-specific command stack in `editor-core` that mirrors the new shortcut architecture (`context -> pure edits -> command -> keymap`). Renderer stays responsible for shell behavior only: it switches the rail and shortcut hint overlay based on the current editing context, while CodeMirror remains the single keyboard entrypoint and Markdown remains the only stored document truth.

**Tech Stack:** TypeScript, CodeMirror 6, React, micromark, Vitest

---

## File Structure

- `packages/markdown-engine/src/block-map.ts`
  Add `TableBlock`, `TableRow`, and `TableCell` types.
- `packages/markdown-engine/src/parse-block-map.ts`
  Recognize top-level pipe tables and emit lean `table` blocks.
- `packages/markdown-engine/src/parse-markdown-document.ts`
  Enrich `table` blocks with canonical row/cell metadata used by editor commands.
- `packages/markdown-engine/src/table-model.ts`
  Shared canonical table model helpers and normalization logic.
- `packages/markdown-engine/src/format-table-markdown.ts`
  Canonical formatter that rewrites the full Markdown table after each edit.
- `packages/markdown-engine/src/parse-block-map.test.ts`
  Add parser coverage for common table variants.
- `packages/editor-core/src/commands/table-context.ts`
  Read table-focused semantic context from `EditorState` plus `ActiveBlockState`.
- `packages/editor-core/src/commands/table-edits.ts`
  Pure table edit planners for navigation, row insertion, row/column deletion, and full-table removal.
- `packages/editor-core/src/commands/table-commands.ts`
  Dispatch a single transaction from `table-context` and `table-edits`.
- `packages/editor-core/src/commands/markdown-commands.ts`
  Route `Tab` and `Mod-Enter` through table commands before existing Markdown fallbacks.
- `packages/editor-core/src/extensions/markdown-shortcuts.ts`
  Replace the flat shortcut list with grouped shortcut metadata and grouped keymap builders.
- `packages/editor-core/src/extensions/markdown.ts`
  Wire both default text shortcuts and table shortcuts from the grouped catalog.
- `packages/editor-core/src/index.ts`
  Re-export any new shortcut metadata, helper types, and table commands needed by renderer tests.
- `packages/editor-core/src/commands/table-context.test.ts`
  Verify table context extraction.
- `packages/editor-core/src/commands/table-edits.test.ts`
  Verify pure table edit planning.
- `packages/editor-core/src/commands/table-commands.test.ts`
  Verify one-dispatch command behavior.
- `packages/editor-core/src/extensions/markdown-shortcuts.test.ts`
  Verify grouped shortcut metadata and derived keymaps.
- `packages/editor-core/src/extensions/markdown.test.ts`
  Verify table keymap routing through the extension.
- `src/renderer/code-editor.ts`
  Expose any imperative helpers needed by renderer-side tests for table interactions.
- `src/renderer/code-editor.test.ts`
  Add integration coverage for table shortcuts and document rewrites.
- `src/renderer/editor/App.tsx`
  Derive editing context (`default-text` vs `table-editing`) from active editor state and switch rail plus hint overlay accordingly.
- `src/renderer/editor/shortcut-hint-overlay.tsx`
  Accept grouped shortcut content and animate content changes without full teardown.
- `src/renderer/styles/app-ui.css`
  Add rail transition and shortcut-group transition styles.
- `docs/decision-log.md`
  Record the final architecture choices.
- `docs/test-cases.md`
  Add manual acceptance steps for table editing and context-aware shortcut hints.

## Task 1: Add Grouped Shortcut Metadata

**Files:**
- Modify: `packages/editor-core/src/extensions/markdown-shortcuts.ts`
- Test: `packages/editor-core/src/extensions/markdown-shortcuts.test.ts`

- [ ] **Step 1: Write the failing grouped-shortcut metadata tests**

```ts
import {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  TABLE_EDITING_SHORTCUT_GROUP,
  createGroupedShortcutKeymaps,
  formatShortcutHintKey
} from "./markdown-shortcuts";

it("exposes default and table shortcut groups in display order", () => {
  expect(DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts.map(({ key }) => key)).toEqual([
    "Mod-b",
    "Mod-i",
    "Mod-1",
    "Mod-2",
    "Mod-3",
    "Mod-4",
    "Mod-Shift-7",
    "Mod-Shift-9",
    "Mod-Alt-Shift-c"
  ]);

  expect(TABLE_EDITING_SHORTCUT_GROUP.shortcuts.map(({ key }) => key)).toEqual([
    "Tab",
    "Shift-Tab",
    "Mod-Enter"
  ]);
});

it("derives grouped runtime key bindings from the grouped catalog", () => {
  const groups = createGroupedShortcutKeymaps(() => activeBlockStateHarness);

  expect(groups.defaultText.map(({ key }) => key)).toContain("Mod-b");
  expect(groups.tableEditing.map(({ key }) => key)).toEqual(["Tab", "Shift-Tab", "Mod-Enter"]);
});

it("formats Mod and non-Mod table keys for win32 and darwin", () => {
  expect(formatShortcutHintKey("Mod-Enter", "win32")).toBe("Ctrl+Enter");
  expect(formatShortcutHintKey("Mod-Enter", "darwin")).toBe("Cmd+Enter");
  expect(formatShortcutHintKey("Shift-Tab", "win32")).toBe("Shift+Tab");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/editor-core/src/extensions/markdown-shortcuts.test.ts`
Expected: FAIL because grouped exports and grouped keymap helpers do not exist yet.

- [ ] **Step 3: Write the minimal grouped shortcut implementation**

```ts
export type ShortcutGroupId = "default-text" | "table-editing";

export type TextEditingShortcut = {
  id: string;
  key: string;
  label: string;
  run: TextEditingShortcutRunner;
};

export type ShortcutGroup = {
  id: ShortcutGroupId;
  label: string;
  shortcuts: readonly TextEditingShortcut[];
};

export const DEFAULT_TEXT_SHORTCUT_GROUP: ShortcutGroup = {
  id: "default-text",
  label: "Text",
  shortcuts: [/* existing Mod-* shortcuts */]
};

export const TABLE_EDITING_SHORTCUT_GROUP: ShortcutGroup = {
  id: "table-editing",
  label: "Table",
  shortcuts: [
    { id: "table-next-cell", key: "Tab", label: "Next Cell", run: runTableNextCell },
    { id: "table-prev-cell", key: "Shift-Tab", label: "Previous Cell", run: runTablePreviousCell },
    { id: "table-insert-row-below", key: "Mod-Enter", label: "Insert Row Below", run: runTableInsertRowBelow }
  ]
};

export const SHORTCUT_GROUPS = [DEFAULT_TEXT_SHORTCUT_GROUP, TABLE_EDITING_SHORTCUT_GROUP] as const;

export function createGroupedShortcutKeymaps(getActiveBlockState: () => ActiveBlockState) {
  const toBindings = (group: ShortcutGroup): KeyBinding[] =>
    group.shortcuts.map(({ key, run }) => ({
      key,
      run: (view) => run(view, getActiveBlockState())
    }));

  return {
    defaultText: toBindings(DEFAULT_TEXT_SHORTCUT_GROUP),
    tableEditing: toBindings(TABLE_EDITING_SHORTCUT_GROUP)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/editor-core/src/extensions/markdown-shortcuts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/editor-core/src/extensions/markdown-shortcuts.ts packages/editor-core/src/extensions/markdown-shortcuts.test.ts
git commit -m "feat(editor-core): group shortcut metadata by editing context"
```

## Task 2: Parse and Format Canonical Table Blocks

**Files:**
- Create: `packages/markdown-engine/src/table-model.ts`
- Create: `packages/markdown-engine/src/format-table-markdown.ts`
- Modify: `packages/markdown-engine/src/block-map.ts`
- Modify: `packages/markdown-engine/src/parse-block-map.ts`
- Modify: `packages/markdown-engine/src/parse-markdown-document.ts`
- Test: `packages/markdown-engine/src/parse-block-map.test.ts`

- [ ] **Step 1: Write the failing table parser and formatter tests**

```ts
it("parses common pipe table variants into a top-level table block", () => {
  const source = ["name | qty", "--- | ---:", "pen | 2"].join("\n");
  const result = parseMarkdownDocument(source);

  expect(result.blocks[0]).toMatchObject({
    type: "table",
    columnCount: 2,
    alignments: ["left", "right"],
    header: [{ text: "name" }, { text: "qty" }],
    rows: [[{ text: "pen" }, { text: "2" }]]
  });
});

it("formats canonical table markdown with outer pipes and padded columns", () => {
  expect(
    formatTableMarkdown({
      alignments: ["left", "right"],
      header: ["name", "qty"],
      rows: [["pen", "2"]]
    })
  ).toBe(["| name | qty |", "| :--- | --: |", "| pen  |   2 |"].join("\n"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/markdown-engine/src/parse-block-map.test.ts`
Expected: FAIL because `table` blocks and formatter helpers do not exist.

- [ ] **Step 3: Write the minimal parser and formatter implementation**

```ts
export type TableAlignment = "left" | "center" | "right" | "none";

export type TableBlock = BaseBlock & {
  type: "table";
  columnCount: number;
  alignments: readonly TableAlignment[];
  header: readonly TableCell[];
  rows: readonly (readonly TableCell[])[];
};

export function looksLikePipeTable(lines: readonly string[]): boolean {
  return lines.length >= 2 && hasPipe(lines[0]) && isDelimiterRow(lines[1]);
}

export function formatTableMarkdown(model: CanonicalTableModel): string {
  const widths = computeColumnWidths(model);
  return [formatRow(model.header, widths), formatDelimiter(model.alignments, widths), ...model.rows.map((row) => formatRow(row, widths))].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/markdown-engine/src/parse-block-map.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/markdown-engine/src/block-map.ts packages/markdown-engine/src/parse-block-map.ts packages/markdown-engine/src/parse-markdown-document.ts packages/markdown-engine/src/table-model.ts packages/markdown-engine/src/format-table-markdown.ts packages/markdown-engine/src/parse-block-map.test.ts
git commit -m "feat(markdown-engine): add canonical table parsing and formatting"
```

## Task 3: Add Table Context and Pure Edit Planning

**Files:**
- Create: `packages/editor-core/src/commands/table-context.ts`
- Create: `packages/editor-core/src/commands/table-edits.ts`
- Test: `packages/editor-core/src/commands/table-context.test.ts`
- Test: `packages/editor-core/src/commands/table-edits.test.ts`

- [ ] **Step 1: Write the failing table context and edit-planner tests**

```ts
it("reads the active table cell context from the active block", () => {
  const ctx = readTableContext(editorStateHarness, activeTableStateHarness);

  expect(ctx).toMatchObject({
    blockType: "table",
    position: { row: 1, column: 0 },
    columnCount: 2
  });
});

it("computes next-cell navigation on Tab", () => {
  const edit = computeMoveToNextTableCell(tableContextHarness);

  expect(edit).toMatchObject({
    selectionTarget: { row: 1, column: 1 },
    changes: null
  });
});

it("computes insert-row-below as one full-table markdown replacement", () => {
  const edit = computeInsertTableRowBelow(tableContextHarness);

  expect(edit?.changes).toMatchObject({
    from: 0,
    to: tableSource.length,
    insert: expect.stringContaining("|  |")
  });
  expect(edit?.selectionTarget).toEqual({ row: 2, column: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/commands/table-edits.test.ts`
Expected: FAIL because the new table context and edit planners do not exist.

- [ ] **Step 3: Write the minimal context and pure-edit implementation**

```ts
export type TableSelectionTarget = {
  row: number;
  column: number;
  offsetInCell?: number;
};

export type TableContext = {
  source: string;
  block: Extract<NonNullable<ActiveBlockState["activeBlock"]>, { type: "table" }>;
  position: { row: number; column: number };
  model: CanonicalTableModel;
};

export function readTableContext(state: EditorState, activeState: ActiveBlockState): TableContext | null {
  if (activeState.activeBlock?.type !== "table") {
    return null;
  }

  return {
    source: state.doc.toString(),
    block: activeState.activeBlock,
    position: locateTableCell(activeState.activeBlock, state.selection.main.head),
    model: tableBlockToCanonicalModel(activeState.activeBlock)
  };
}

export function computeInsertTableRowBelow(ctx: TableContext): TableSemanticEdit | null {
  const nextModel = insertRow(ctx.model, ctx.position.row + 1);
  return buildWholeTableReplacement(ctx, nextModel, { row: ctx.position.row + 1, column: ctx.position.column });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/commands/table-edits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/editor-core/src/commands/table-context.ts packages/editor-core/src/commands/table-edits.ts packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/commands/table-edits.test.ts
git commit -m "feat(editor-core): add table context and edit planners"
```

## Task 4: Add Table Commands and Route Keyboard Entry Points

**Files:**
- Create: `packages/editor-core/src/commands/table-commands.ts`
- Modify: `packages/editor-core/src/commands/markdown-commands.ts`
- Modify: `packages/editor-core/src/commands/index.ts`
- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Test: `packages/editor-core/src/commands/table-commands.test.ts`
- Test: `packages/editor-core/src/extensions/markdown.test.ts`

- [ ] **Step 1: Write the failing command-routing tests**

```ts
it("dispatches table next-cell navigation from Tab before list indent fallback", () => {
  const handled = runMarkdownTab(viewHarness, activeTableStateHarness);

  expect(handled).toBe(true);
  expect(viewHarness.dispatch).toHaveBeenCalledTimes(1);
});

it("dispatches insert-row-below from Mod-Enter in table context", () => {
  const handled = runTableInsertRowBelow(viewHarness, activeTableStateHarness);

  expect(handled).toBe(true);
  expect(viewHarness.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      changes: expect.anything(),
      selection: expect.anything()
    })
  );
});

it("adds table key bindings from the grouped shortcut catalog", () => {
  const keymap = createYuloraMarkdownExtensionsHarness().bindings;

  expect(keymap.map(({ key }) => key)).toContain("Mod-Enter");
  expect(keymap.map(({ key }) => key)).toContain("Shift-Tab");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts`
Expected: FAIL because table commands are not exported and the extension is not routing those bindings.

- [ ] **Step 3: Write the minimal command routing**

```ts
export function runTableNextCell(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(view, computeMoveToNextTableCell(readTableContext(view.state, activeState)));
}

export function runTableInsertRowBelow(view: EditorView, activeState: ActiveBlockState): boolean {
  return applyTableSemanticEdit(view, computeInsertTableRowBelow(readTableContext(view.state, activeState)));
}

export function runMarkdownTab(view: EditorView, activeState: ActiveBlockState): boolean {
  return runTableNextCell(view, activeState) || runListIndentOnTab(view, activeState);
}

const groupedKeymaps = createGroupedShortcutKeymaps(() => runtime.activeBlockState);

keymap.of([
  { key: "Backspace", run: (view) => runMarkdownBackspace(view, runtime.activeBlockState) },
  { key: "Enter", run: (view) => runMarkdownEnter(view, runtime.activeBlockState) },
  { key: "Tab", run: (view) => runMarkdownTab(view, runtime.activeBlockState) },
  ...groupedKeymaps.defaultText,
  ...groupedKeymaps.tableEditing,
  ...historyKeymap,
  ...defaultKeymap
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/editor-core/src/commands/table-commands.ts packages/editor-core/src/commands/markdown-commands.ts packages/editor-core/src/commands/index.ts packages/editor-core/src/extensions/markdown.ts packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts
git commit -m "feat(editor-core): route table shortcuts through markdown key handling"
```

## Task 5: Render Table Blocks and Wire Direct Cell Editing

**Files:**
- Create: `packages/editor-core/src/decorations/table-widget.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.ts`
- Modify: `packages/editor-core/src/decorations/signature.ts`
- Modify: `src/renderer/code-editor.ts`
- Test: `packages/editor-core/src/decorations/block-decorations.test.ts`
- Test: `src/renderer/code-editor.test.ts`

- [ ] **Step 1: Write the failing widget and controller tests**

```ts
it("renders a table block as a widget instead of raw markdown lines", () => {
  const host = renderEditor("| name | qty |\n| --- | --- |\n| pen | 2 |");

  expect(host.querySelector(".cm-table-widget")).not.toBeNull();
  expect(host.textContent).toContain("name");
});

it("rewrites canonical markdown after a cell edit", () => {
  const controller = createCodeEditorControllerHarness("| name | qty |\n| --- | --- |\n| pen | 2 |");

  controller.editTableCell({ row: 1, column: 1, text: "20" });

  expect(controller.getContent()).toContain("| pen  |  20 |");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts`
Expected: FAIL because no table widget exists and the controller has no table edit helpers.

- [ ] **Step 3: Write the minimal widget implementation**

```ts
class TableWidget extends WidgetType {
  constructor(private readonly block: TableBlock, private readonly callbacks: TableWidgetCallbacks) {
    super();
  }

  override toDOM(): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-table-widget";
    root.dataset.tableColumns = String(this.block.columnCount);
    return root;
  }
}

if (block.type === "table") {
  ranges.push(
    Decoration.replace({
      block: true,
      widget: new TableWidget(block, tableCallbacks)
    }).range(block.startOffset, block.endOffset)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/editor-core/src/decorations/table-widget.ts packages/editor-core/src/decorations/block-decorations.ts packages/editor-core/src/decorations/signature.ts src/renderer/code-editor.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts
git commit -m "feat(editor-core): render persistent table widgets"
```

## Task 6: Switch the Rail and Hint Overlay by Editing Context

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/editor/shortcut-hint-overlay.tsx`
- Modify: `src/renderer/styles/app-ui.css`
- Test: `src/renderer/app.autosave.test.ts`
- Test: `src/renderer/editor/shortcut-hint-overlay.test.tsx`

- [ ] **Step 1: Write the failing renderer context-switch tests**

```ts
it("shows the table shortcut group when the active editing context is table-editing", async () => {
  renderEditorShellWithActiveTable();
  holdPrimaryModifier();

  expect(screen.getByText("Next Cell")).toBeInTheDocument();
  expect(screen.queryByText("Bold")).toBeNull();
});

it("switches the rail into table mode with animated state attributes", () => {
  renderEditorShellWithActiveTable();

  expect(container.querySelector("[data-yulora-rail-mode='table-editing']"))?.toHaveAttribute("data-state", "open");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/app.autosave.test.ts src/renderer/editor/shortcut-hint-overlay.test.tsx`
Expected: FAIL because the renderer still uses a fixed shortcut list and a single rail mode.

- [ ] **Step 3: Write the minimal renderer context switching**

```tsx
const shortcutGroup =
  activeBlockStateRef.current?.activeBlock?.type === "table"
    ? TABLE_EDITING_SHORTCUT_GROUP
    : DEFAULT_TEXT_SHORTCUT_GROUP;

<ShortcutHintOverlay
  visible={isShortcutHintVisible}
  platform={yulora.platform}
  group={shortcutGroup}
/>

<aside
  className="app-rail"
  data-yulora-rail-mode={shortcutGroup.id}
>
  <div className="app-rail-default" data-state={shortcutGroup.id === "default-text" ? "open" : "closing"} />
  <div className="app-rail-table" data-state={shortcutGroup.id === "table-editing" ? "open" : "closing"} />
</aside>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/app.autosave.test.ts src/renderer/editor/shortcut-hint-overlay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/editor/App.tsx src/renderer/editor/shortcut-hint-overlay.tsx src/renderer/styles/app-ui.css src/renderer/app.autosave.test.ts src/renderer/editor/shortcut-hint-overlay.test.tsx
git commit -m "feat(renderer): switch table rail and shortcut hints by editing context"
```

## Task 7: Record Docs and Acceptance Coverage

**Files:**
- Modify: `docs/decision-log.md`
- Modify: `docs/test-cases.md`
- Modify: `docs/test-report.md`

- [ ] **Step 1: Write the failing documentation checklist**

```md
- decision log records grouped shortcut architecture for tables
- test cases include table shortcuts and context-aware hint overlay
- test report records the exact commands used for table parser, command, keymap, and renderer verification
```

- [ ] **Step 2: Run the final verification commands**

Run: `npx vitest run packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/commands/table-edits.test.ts packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/extensions/markdown-shortcuts.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/editor/shortcut-hint-overlay.test.tsx src/renderer/app.autosave.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Record the final docs updates**

```md
| 2026-04-19 | `TASK-table-rendering` routes table shortcuts through the same grouped shortcut catalog as default text editing and makes the hint overlay context-aware. |
```

```md
TC: Table Editing Context
1. Open a document with a pipe table.
2. Place focus in a paragraph and hold Ctrl/Cmd; confirm default text shortcuts are shown.
3. Move focus into a table cell and hold Ctrl/Cmd; confirm the hint list switches to `Next Cell`, `Previous Cell`, and `Insert Row Below`.
4. Press `Tab`, `Shift+Tab`, and `Ctrl/Cmd+Enter`; confirm cell navigation, row insertion, and canonical markdown rewrites.
5. Use the table rail to add/delete rows and columns; confirm focus stays in a logical cell and the rail does not hard-cut.
```

- [ ] **Step 4: Commit**

```bash
git add docs/decision-log.md docs/test-cases.md docs/test-report.md
git commit -m "docs: record table rendering shortcut architecture and acceptance"
```

## Self-Review

- Spec coverage:
  - persistent rendered tables -> Task 5
  - canonical parser/formatter -> Task 2
  - table `Tab` / `Shift-Tab` / `Mod-Enter` -> Tasks 3 and 4
  - grouped shortcut catalog -> Task 1
  - context-aware shortcut hints -> Task 6
  - rail transitions -> Task 6
  - docs and manual acceptance -> Task 7
- Placeholder scan:
  - no `TODO`, `TBD`, or "implement later" placeholders remain
  - every task has concrete files, tests, commands, and code snippets
- Type consistency:
  - grouped shortcut model uses `DEFAULT_TEXT_SHORTCUT_GROUP` and `TABLE_EDITING_SHORTCUT_GROUP` consistently
  - table command stack is consistently named `table-context`, `table-edits`, and `table-commands`
  - keyboard binding uses `Mod-Enter` in shared metadata while renderer formatting still renders it as `Ctrl+Enter` or `Cmd+Enter`
