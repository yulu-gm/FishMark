# Table Cursor Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Yulora's ad hoc table navigation with one unified table cursor model that controls entry, intra-table movement, exit, cell highlight, and editing context transitions.

**Architecture:** Keep CodeMirror document selection as the editor truth, but add an explicit `tableCursor` state in `editor-core` that is re-derived after every relevant transaction and threaded through commands, decorations, and renderer callbacks. Table widgets continue to host text inputs, but all navigation semantics move into shared table commands and editor-level key routing.

**Tech Stack:** TypeScript, CodeMirror 6, React, Vitest

---

## File Structure

- Create: `packages/editor-core/src/table-cursor-state.ts`
  Shared `tableCursor` types and resolver helpers for inside-table and adjacent-to-table states.
- Modify: `packages/editor-core/src/active-block.ts`
  Extend exported editor state shape to include `tableCursor`.
- Modify: `packages/editor-core/src/derived-state/inactive-block-decorations.ts`
  Derive `tableCursor` together with `activeBlockState`.
- Modify: `packages/editor-core/src/decorations/block-decorations.ts`
  Use `tableCursor` instead of `activeBlock === table` as the source of active cell highlight.
- Modify: `packages/editor-core/src/commands/table-context.ts`
  Read inside/adjacent table context from `tableCursor`.
- Modify: `packages/editor-core/src/commands/table-commands.ts`
  Centralize enter, move, and exit behavior using the unified cursor model.
- Modify: `packages/editor-core/src/commands/markdown-commands.ts`
  Route editor-level adjacent `ArrowUp` / `ArrowDown` into table entry commands.
- Modify: `packages/editor-core/src/extensions/markdown.ts`
  Keep one runtime `tableCursor` value, synchronize DOM focus from it, and notify renderer with it.
- Modify: `packages/editor-core/src/index.ts`
  Re-export `tableCursor` types if renderer needs them.
- Modify: `src/renderer/code-editor.ts`
  Store the richer active editor state and keep imperative table actions aligned.
- Modify: `src/renderer/editor/App.tsx`
  Switch shortcut group / rail mode from `tableCursor.mode === "inside"` instead of only `activeBlock`.
- Test: `packages/editor-core/src/commands/table-commands.test.ts`
  Add unit coverage for above/below entry and exit.
- Test: `packages/editor-core/src/extensions/markdown.test.ts`
  Verify editor-level arrow routing into tables.
- Test: `src/renderer/code-editor.test.ts`
  Verify visual cursor movement, cell highlight, and focus for cross-block arrow navigation.
- Docs: `docs/decision-log.md`, `docs/test-cases.md`
  Record the new cursor model and manual acceptance rules.

## Task 1: Introduce Explicit Table Cursor State

**Files:**
- Create: `packages/editor-core/src/table-cursor-state.ts`
- Modify: `packages/editor-core/src/active-block.ts`
- Modify: `packages/editor-core/src/derived-state/inactive-block-decorations.ts`

- [ ] Define `TableCursorMode` and `TableCursorState` plus helpers for `inside`, `adjacent-above`, `adjacent-below`, and `null`.
- [ ] Add a resolver that derives the next cursor from `EditorState`, parsed markdown blocks, and the previous cursor so adjacent states can preserve logical row/column.
- [ ] Extend `ActiveBlockState` with `tableCursor: TableCursorState | null`.
- [ ] Update derived-state plumbing so every `onActiveBlockChange` notification carries the latest `tableCursor`.

## Task 2: Move Highlight Ownership to Table Cursor

**Files:**
- Modify: `packages/editor-core/src/decorations/block-decorations.ts`
- Modify: `packages/editor-core/src/commands/table-context.ts`

- [ ] Change table decoration generation so the highlighted cell comes from `tableCursor` when the current block matches `tableCursor.tableStartOffset`.
- [ ] Keep inactive tables unhighlighted when `tableCursor` is `null`.
- [ ] Update `readTableContext()` to trust `tableCursor.mode === "inside"` rather than inferring the current cell only from `selection.head`.

## Task 3: Unify Table Navigation Commands

**Files:**
- Modify: `packages/editor-core/src/commands/table-commands.ts`
- Modify: `packages/editor-core/src/commands/markdown-commands.ts`
- Modify: `packages/editor-core/src/index.ts`

- [ ] Add shared command entrypoints for:
  - enter from line above
  - enter from line below
  - move up/down inside table
  - exit above
  - exit below
- [ ] Ensure `ArrowUp` / `ArrowDown` use symmetric adjacent-line rules instead of direct offset guesses.
- [ ] Keep `ArrowLeft` / `ArrowRight`, `Tab`, `Shift-Tab`, and `Enter` using the same command stack.
- [ ] Route editor-level adjacent `ArrowUp` / `ArrowDown` through these commands before normal CodeMirror fallback.

## Task 4: Centralize Focus Synchronization

**Files:**
- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Modify: `packages/editor-core/src/decorations/table-widget.ts`

- [ ] Replace scattered “if table then focus input” checks with one post-command focus sync step based on `tableCursor.mode`.
- [ ] When `tableCursor.mode === "inside"`, focus the resolved cell input and restore `offsetInCell`.
- [ ] When `tableCursor.mode` is adjacent or `null`, return focus to CodeMirror and do not leave stale input focus behind.
- [ ] Keep widget responsibilities limited to click/input capture and inside-table key forwarding.

## Task 5: Update Renderer Context Switching

**Files:**
- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/editor/App.tsx`

- [ ] Preserve the richer active editor state in the controller.
- [ ] Base table rail visibility and shortcut group switching on `tableCursor.mode === "inside"`.
- [ ] Keep default text context while adjacent-to-table, even if the highlighted boundary cell remains visible.

## Task 6: Add Regression Coverage

**Files:**
- Modify: `packages/editor-core/src/commands/table-commands.test.ts`
- Modify: `packages/editor-core/src/extensions/markdown.test.ts`
- Modify: `src/renderer/code-editor.test.ts`

- [ ] Add command tests for:
  - above-line `ArrowDown` enters first cell
  - below-line `ArrowUp` enters last-row boundary cell
  - first-row `ArrowUp` exits to adjacent above line
  - last-row `ArrowDown` and `Enter` exit to adjacent below line
- [ ] Add renderer tests for:
  - entering from above preserves visible active cell highlight
  - entering from below lands inside the last row instead of skipping over the table
  - moving between adjacent line and table does not drop active cell highlight unexpectedly

## Task 7: Verify and Document

**Files:**
- Modify: `docs/decision-log.md`
- Modify: `docs/test-cases.md`

- [ ] Record the new unified table cursor model in the decision log.
- [ ] Update manual test cases to include above/below directional entry and highlight persistence.
- [ ] Run:
  - `npx.cmd vitest run packages\\editor-core\\src\\commands\\table-commands.test.ts src\\renderer\\code-editor.test.ts packages\\editor-core\\src\\extensions\\markdown.test.ts packages\\editor-core\\src\\commands\\table-edits.test.ts packages\\editor-core\\src\\extensions\\markdown-shortcuts.test.ts src\\renderer\\editor\\shortcut-hint-overlay.test.tsx src\\renderer\\app.autosave.test.ts`
  - `npm.cmd run typecheck`
  - `npm.cmd run lint`
  - `npm.cmd run build`
