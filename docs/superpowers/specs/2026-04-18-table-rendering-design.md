# Table Rendering Design

Date: 2026-04-18

## Task

Add first-pass table rendering and direct table editing to Yulora.

## Goal

Render common GFM pipe tables as persistent table views inside the editor instead of falling back to raw Markdown source when active. Users should edit cell contents directly, use a dense table utility rail for structural actions, and rely on a context-aware shortcut system that switches both real bindings and visible shortcut hints when focus moves into or out of a table.

Markdown remains the single source of truth. Table edits still rewrite Markdown text, but table formatting is normalized immediately after each edit so the rendered table and stored Markdown stay in sync.

## Context

Yulora's current editing stack already has a stable architecture for Markdown semantics:

- `packages/markdown-engine` parses block and inline structure.
- `packages/editor-core` owns editing commands, decorations, and CodeMirror integration.
- `src/renderer` owns shell UI such as the rail and shortcut hint overlay.

Recent keyboard work added a shared shortcut catalog plus a layered command model:

- shortcut metadata in `packages/editor-core/src/extensions/markdown-shortcuts.ts`
- context readers in `packages/editor-core/src/commands/semantic-context.ts`
- pure edit planners in `packages/editor-core/src/commands/semantic-edits.ts`
- command entrypoints in `toggle-*-commands.ts`
- keymap wiring in `packages/editor-core/src/extensions/markdown.ts`
- shortcut hint overlay in `src/renderer/editor/shortcut-hint-overlay.tsx`

The original table design treated table keys as a mostly isolated behavior (`Tab`, `Shift+Tab`, `Ctrl+Enter`). That no longer fits the current project direction. Table shortcuts should follow the same architecture as the rest of the editor: shared definitions, command-layer entrypoints, one-dispatch edits, and renderer hints derived from the same source of truth.

## In Scope

- Parse common GFM pipe table variants as a new top-level `table` block.
- Keep tables rendered in both inactive and active states.
- Allow direct cell editing.
- Normalize table Markdown after each cell edit or structural edit.
- Add a dense table utility rail for row/column/table actions.
- Add table keyboard commands for:
  - `Tab` -> next cell
  - `Shift-Tab` -> previous cell
  - `Mod-Enter` -> insert row below and stay in the current column
- Upgrade the shortcut catalog from a single flat group to context-aware groups.
- Make the shortcut hint overlay switch groups based on editor context.
- Animate table rail entry/exit without hard cuts.
- Add parser, command, keymap, renderer, and manual acceptance coverage.

## Out Of Scope

- HTML tables
- `rowspan` / `colspan`
- block content inside cells
- floating modal table editors
- drag-resizing columns
- formulas, sorting, filtering
- a large first-pass table shortcut surface beyond `Tab`, `Shift-Tab`, and `Mod-Enter`

## Supported Syntax

First pass supports common GFM pipe table shapes:

- leading and trailing outer pipes
- no outer pipes
- delimiter alignments `---`, `:---`, `---:`, `:---:`
- empty cells
- header + delimiter + body rows

All accepted variants are normalized into one canonical table model and formatted back out in a single consistent Markdown style.

## Key Decisions

### 1. Tables stay rendered when active

Tables are the first block type that should not return to raw Markdown source on focus. The active experience is still a rendered table, with cell focus and table commands layered on top.

### 2. Markdown is still the only truth

The table widget does not become a second document model. All edits flow through:

`table context -> table edit planner -> formatted Markdown replacement -> document reparse`

### 3. Every table edit reformats the whole table

The user explicitly wants live formatting. That means:

- cell edits reflow the table immediately
- row and column operations reflow the table immediately
- delimiter alignment and spacing are regenerated every time

This intentionally sacrifices preservation of the user's original table spacing style, but preserves table semantics and content.

### 4. Dense table utility rail remains the primary structural UI

When focus is inside a table cell, the left rail switches to a dense utility stack in this order:

- `+ Row Above`
- `+ Row Below`
- `+ Col Left`
- `+ Col Right`
- `- Row`
- `- Col`
- `- Table`

### 5. Table shortcuts must use the new shared shortcut architecture

Table shortcuts should not be hard-coded as ad hoc special cases once the project already has a shortcut catalog and command layering. Instead:

- the shortcut catalog becomes context-aware
- table shortcuts live beside default text shortcuts in shared metadata
- CodeMirror key bindings are derived from that metadata
- the shortcut hint overlay reads the same grouped metadata

### 6. Shortcut hints become context-aware groups

The existing overlay currently shows one fixed list of text-editing shortcuts. For tables, that needs to change:

- default editing context -> show the default text shortcut group
- table cell context -> show the table editing shortcut group

Holding the primary modifier still triggers the overlay, but the visible list is the current editing-context group rather than one global fixed list.

This also means the overlay may list keys that do not themselves include the primary modifier, such as `Tab` and `Shift-Tab`, as long as they belong to the currently relevant editing group.

## Architecture

### markdown-engine

Add a top-level `table` block that exposes:

- source range
- line range
- column count
- per-column alignment
- header cells
- body rows
- stable row/cell metadata for selection remapping

The parser remains view-agnostic.

### editor-core

Add a table-specific block widget plus a table command stack that mirrors the current semantic shortcut architecture:

- `table-context.ts`
  Reads table-focused editing context from `EditorState` plus `ActiveBlockState`.
- `table-edits.ts`
  Computes pure table edits and next selection targets.
- `table-commands.ts`
  Dispatches a single transaction from those pure edits.
- `table-shortcuts.ts`
  Declares the table shortcut group and derives table key bindings from shared metadata.

The existing Markdown key handling path should remain the top-level entry:

- `runMarkdownTab()` should become table-aware before list-indent fallback
- `runMarkdownEnter()` should become table-aware for `Mod-Enter` behavior without changing plain `Enter`
- shared shortcut keymaps should be created in the extension, not in the renderer

### renderer

Renderer only consumes minimal context state:

- whether the current editing context is `default-text` or `table-editing`
- current table coordinates when relevant
- whether the table rail is visible

Renderer uses that context to:

- switch the rail content
- switch the shortcut hint group
- animate the transitions

## Editing Model

### Cell Editing

- Clicking a cell focuses it.
- Typing edits the cell content directly.
- Every committed change rewrites the whole table Markdown in canonical form.
- Selection is remapped back into the corresponding logical cell afterward.

### Keyboard

- `Tab` -> move to the next cell; wrap to the next row when needed
- `Shift-Tab` -> move to the previous cell; wrap to the previous row when needed
- `Mod-Enter` -> insert a row below and keep focus in the same column

No larger table shortcut matrix is introduced in the first pass.

### Rail Actions

The rail triggers structural commands:

- insert row above
- insert row below
- insert column left
- insert column right
- delete row
- delete column
- delete table

These commands use the same table edit planner path as keyboard actions and should also dispatch once.

## Shortcut Catalog Model

The current flat `TEXT_EDITING_SHORTCUTS` model should become a grouped catalog, for example:

- `default-text`
- `table-editing`

Each shortcut entry should still provide:

- `id`
- `key`
- `label`
- `run`

And each group should provide:

- `id`
- `label`
- `shortcuts`

The grouped catalog becomes the shared source of truth for:

- default text keymap
- table keymap
- shortcut hint overlay content

## Shortcut Hint Overlay

The overlay no longer shows a single fixed list. Instead it shows the currently active shortcut group:

- default paragraph/list/heading editing -> default text group
- table cell editing -> table editing group

Important UX rules:

- entering a table cell switches the visible group
- moving between cells in the same table updates context without replaying enter/exit animations
- leaving the table switches the overlay back to the default text group
- overlay visibility rules still depend on editor focus plus primary modifier hold

## Formatting Strategy

Canonical formatter output should:

- always include outer pipes
- use a single space around each cell value
- regenerate delimiter markers from alignment metadata
- size column widths from the max visible content width across header and body rows

## Motion And UX

### Table Rail Transition

- entering table mode fades/slides the table rail content in while fading/sliding the default rail content out
- exiting table mode reverses that motion
- the rail container itself stays mounted to avoid layout jumps
- motion only affects content layers, not the overall shell layout

### Shortcut Hint Group Transition

- switching between shortcut groups should feel like a content refresh, not a teardown
- the overlay should avoid hard flicker when the user tabs between cells
- group changes inside the same open overlay should use lightweight content transitions instead of full hide/show churn

## Risks

### IME stability

If the table widget bypasses the existing composition guard path, IME regressions are very likely.

### Selection remapping

Whole-table rewrites increase the risk of drifting to the wrong cell or caret offset after edits.

### Shortcut drift

If table key bindings and table hint groups are modeled separately, they will diverge. The shared grouped catalog is the mitigation.

### Enter/Tab conflicts

Tables now compete with existing list/code-fence/tab semantics. The table command path must be ordered carefully so table-specific behavior wins only in table context.

## Testing

### markdown-engine

- parse common table variants
- parse alignments
- preserve correct block ranges under CRLF and EOF cases

### editor-core

- table context reader
- pure table edit planner
- `Tab`, `Shift-Tab`, `Mod-Enter`
- row/column insertion and deletion
- whole-table rewrite and selection remap
- grouped shortcut catalog exports the correct default and table groups
- keymaps derive from the grouped catalog

### renderer

- rail switches between default and table content with state-driven animation
- shortcut hint overlay switches groups by editing context
- the overlay still obeys focus and modifier visibility rules
- switching cells inside one table does not cause repeated hard enter/exit transitions

### Manual Acceptance

Add table cases to `docs/test-cases.md` covering:

- Chinese IME input inside cells
- repeated `Tab` / `Shift-Tab`
- repeated `Mod-Enter`
- row/column actions from the rail
- context-aware shortcut hints in default vs table editing contexts
- rail and hint transitions without hard cuts or obvious flicker

## Landing Area

- `packages/markdown-engine/src/block-map.ts`
- `packages/markdown-engine/src/parse-block-map.ts`
- `packages/markdown-engine/src/parse-markdown-document.ts`
- new table parser/model helpers under `packages/markdown-engine/src/`
- new table command and shortcut helpers under `packages/editor-core/src/commands/` and `packages/editor-core/src/extensions/`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/extensions/markdown-shortcuts.ts`
- `packages/editor-core/src/index.ts`
- `src/renderer/code-editor.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/editor/App.tsx`
- `src/renderer/editor/shortcut-hint-overlay.tsx`
- relevant renderer stylesheets
- `docs/decision-log.md`
- `docs/test-cases.md`

## Acceptance

This design is ready for implementation planning when all of the following are true:

- common GFM pipe tables parse into a top-level `table` block
- tables remain rendered while active
- cells are directly editable
- `Tab`, `Shift-Tab`, and `Mod-Enter` work in table context
- table key bindings and table shortcut hints come from the same grouped catalog model
- the shortcut hint overlay switches groups by editing context
- the dense table rail appears with a smooth transition
- every table edit rewrites canonical Markdown and remains readable
- tests cover parser behavior, command planning, keymaps, renderer context switching, and IME-sensitive risks
