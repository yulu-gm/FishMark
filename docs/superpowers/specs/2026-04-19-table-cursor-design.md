# Table Cursor Design

Date: 2026-04-19

## Task

Refactor Yulora's table cursor, selection, and navigation model so table entry, intra-table movement, exit, highlight, and shortcut context all follow one coherent state machine instead of ad hoc focus patches.

## Problem

The current table editing implementation mixes two competing cursor systems:

- CodeMirror document selection
- DOM input focus and caret inside the table widget

Today, several behaviors are derived from `ActiveBlockState.selection`, while real text input and directional movement often depend on the currently focused table input. This creates unstable transitions:

- entering a table from above and below behaves asymmetrically
- exiting a table depends on scattered special cases
- cell highlight can disappear when document selection leaves `table` briefly
- rail and shortcut context can desynchronize from the visible active cell
- DOM focus restoration uses a series of local callbacks rather than one explicit navigation model

The bug pattern is architectural, not isolated. The editor currently lacks a first-class representation of "the table cursor".

## Goal

Introduce a unified table cursor model so these operations all share the same rules:

- enter a table from an adjacent non-table line
- move between cells
- move out of a table into adjacent non-table lines
- preserve active cell highlight while navigating
- keep rail mode and shortcut context aligned with the logical active cell
- maintain normal DOM caret editing once inside a cell

Markdown text remains the only persisted truth. This change is about selection architecture, not a second document model.

## Non-Goals

- changing table Markdown syntax support
- changing canonical table formatting behavior
- expanding structural table commands
- adding spreadsheet features
- replacing CodeMirror selection with a DOM-only state model

## Design Summary

Add a first-class `table cursor state` inside `editor-core` and make it the shared source for table navigation semantics.

CodeMirror document selection remains the canonical editor selection, but table-specific movement no longer infers table intent opportunistically from `selection.head` alone. Instead, the editor derives and updates a logical table cursor whenever navigation interacts with a table.

The table widget becomes a view of this logical cursor state, not a second source of navigation rules.

## Key Decision

### 1. Table navigation gets its own explicit semantic state

Introduce a lightweight table cursor shape:

- `tableStartOffset`
- `row`
- `column`
- `offsetInCell`
- `entrySide`

`entrySide` is not persisted user data. It is transient navigation context:

- `inside`
- `adjacent-above`
- `adjacent-below`
- `none`

This state is always derived from, or synchronized back to, the current editor transaction. It does not replace Markdown source or CodeMirror selection.

### 2. Cell highlight follows logical table cursor state, not just `activeBlock === table`

Today, highlight is effectively tied to whether `ActiveBlockState.activeBlock` is a table. That is too fragile around transitions. After this refactor:

- when navigation resolves into a table, the active cell highlight is driven by the resolved table cursor
- when navigation resolves outside the table, highlight is removed intentionally
- moving into or out of tables never depends on stale DOM focus to preserve the selected cell

### 3. Entering a table is a symmetric editor-level rule

The editor should support directional entry from adjacent lines as a formal navigation behavior:

- from the line immediately above a table, `ArrowDown` enters the table
- from the line immediately below a table, `ArrowUp` enters the table

This must be handled at the editor command layer, not by hoping DOM focus falls into a widget.

### 4. The widget no longer owns table navigation semantics

The widget still owns:

- rendering cells
- forwarding click and typing events
- preserving DOM caret inside the currently focused input

The widget no longer decides the meaning of entering or leaving the table. Those semantics move to shared commands.

## Navigation Model

## States

The editor can be in one of three effective navigation states relative to a table:

1. Outside table
2. Adjacent to table
3. Inside table

Adjacent means the CodeMirror selection is on the line directly above or below a table block.

## Directional Rules

### Outside -> Adjacent

Normal CodeMirror movement applies. No table-specific behavior yet.

### Adjacent -> Inside

If the current selection is on the line immediately above a table:

- `ArrowDown` enters the table at the top boundary cell
- default target is row `0`, column `0`
- future enhancement may reuse the last remembered column for that table, but first pass uses column `0`

If the current selection is on the line immediately below a table:

- `ArrowUp` enters the table at the bottom boundary cell
- target row is the last logical row of the table
- default target column is `0` in this refactor for determinism

### Inside -> Inside

- `ArrowUp` moves to the previous row in the same column
- `ArrowDown` moves to the next row in the same column
- `ArrowLeft` moves to the previous cell only when the caret is at the start boundary
- `ArrowRight` moves to the next cell only when the caret is at the end boundary
- `Tab` and `Shift-Tab` continue cell-wise movement
- `Enter` moves to the next row in the same column

### Inside -> Adjacent

At the top boundary:

- `ArrowUp` exits to the line immediately above the table
- if the table is at document start, insert a blank line above and place the selection there

At the bottom boundary:

- `ArrowDown` exits to the line immediately below the table
- `Enter` exits to the line immediately below the table
- if the table is at document end, insert a blank line below and place the selection there

This makes vertical entry and exit symmetric.

## Selection And Focus Flow

## Single Ownership Rule

At any point, one layer owns navigation intent:

- outside or adjacent to a table: CodeMirror keymap owns navigation
- inside a table: table commands own navigation semantics, then sync DOM focus to the resolved cell

## Synchronization Rule

Every navigation command resolves in this order:

1. Read current editor state and current table cursor context
2. Compute the semantic destination
3. Dispatch one transaction updating document selection and optional document text
4. Re-derive the logical table cursor from the new selection
5. Sync DOM focus:
   - if destination is inside a table, focus the corresponding input and set caret offset
   - if destination is outside the table, return focus to CodeMirror content DOM

No command should skip step 4 or 5.

## Highlight Rule

The active cell highlight is derived from the resolved table cursor after the transaction, not from pre-transaction DOM state.

That means:

- highlight persists when moving from table to adjacent line only until navigation is resolved out of the table
- highlight appears immediately when entering from above or below
- highlight does not depend on whether the previous input element survived widget reuse

## Architecture Changes

### `table-context.ts`

Expand this layer so it can describe:

- inside-table context
- adjacent-above-table context
- adjacent-below-table context

It should answer questions like:

- is the current selection inside a table?
- is the current selection immediately adjacent to a table?
- if entering, which table and which boundary row should be targeted?

### `table-edits.ts`

Keep pure edit planners, but add navigation planners that operate on the richer context:

- enter from above
- enter from below
- move up
- move down
- exit above
- exit below

These should return semantic targets, not manipulate DOM.

### `table-commands.ts`

Centralize all table cursor transitions here. This file becomes the only place that decides:

- whether a direction key enters a table
- whether a direction key moves within a table
- whether a direction key exits a table
- whether document text must be inserted to create an adjacent blank line

### `markdown-commands.ts`

Editor-level directional routing should defer to table commands for adjacent entry cases before falling back to normal CodeMirror behavior.

### `decorations/block-decorations.ts`

Active table decoration should be based on resolved table cursor data, not only `locateTablePosition(activeBlock, selection.head)`.

### `table-widget.ts`

Simplify widget responsibilities:

- reflect the current active cell
- emit click/edit events
- intercept only the keys that belong to inside-table editing

The widget should not invent new entry or exit semantics on its own.

## Acceptance Criteria

- From the line immediately above a table, pressing `ArrowDown` enters the first cell of the table.
- From the line immediately below a table, pressing `ArrowUp` enters the last row of the table.
- From the first table row, pressing `ArrowUp` exits to the immediately adjacent line above the table.
- From the last table row, pressing `ArrowDown` exits to the immediately adjacent line below the table.
- From the last table row, pressing `Enter` exits to the immediately adjacent line below the table.
- If no adjacent line exists at document start or end, the editor inserts one and places the selection there.
- Active cell highlight is preserved for all inside-table directional movement.
- Active cell highlight appears immediately on directional entry into a table.
- Rail mode and shortcut context always match whether the resolved destination is inside or outside a table.
- No table transition relies on stale DOM focus or widget reconstruction timing.

## Testing Strategy

Add regression coverage at three layers:

- pure context and planner tests for adjacent entry/exit resolution
- command tests for top, bottom, and boundary transitions
- renderer integration tests for:
  - enter from above
  - enter from below
  - exit above
  - exit below
  - preserved cell highlight during cross-block navigation
  - synchronized shortcut context and table rail mode

## Risks

### 1. Dual-source drift during migration

While migrating from the old logic, some paths may still rely on `locateTablePosition(selection.head)` while others use the new table cursor. The refactor should remove those mixed paths in the same implementation slice.

### 2. Widget focus loops

If focus syncing is not centralized after dispatch, the widget can still re-enter selection loops. The implementation must keep focus synchronization in one place.

### 3. Over-broad arrow interception

Table entry rules should trigger only for lines immediately adjacent to a table. They must not hijack normal paragraph-to-paragraph arrow navigation.

## Recommendation

Treat this as an architectural correction, not a bugfix pass. The implementation should first consolidate table navigation around the new cursor model, then reattach individual key behaviors on top of that model.
