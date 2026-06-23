# TASK-061 Quoted Bare List Marker Tab Fix Handoff

Date: 2026-06-23

## Scope

Restore Tab indentation for an empty list item after Enter has promoted it to a bare marker such as `> > -`.

## Root Cause

The non-empty quote-list Tab path was covered and remained functional. A promoted bare marker has no trailing space, so micromark represents it as lazy continuation text inside the previous list item instead of a separate list item. `computeIndentListItem()` therefore resolved the previous item at index zero and returned `null`.

## Implementation

- Detect a bare marker before the ordinary list-item indentation path.
- Reuse the active quote's list root when the parser has absorbed the marker as lazy continuation text.
- Match marker kind and indentation only along the trailing list ancestor chain.
- Insert indentation after the quote prefix and append marker padding so the line commits as a list item.
- Reset an indented bare ordered marker to ordinal `1`, matching ordinary ordered-list indentation.

## Changed Files

- `packages/editor-core/src/commands/list-edits.ts`
- `packages/editor-core/src/commands/list-edits.test.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `docs/plans/2026-06-23-task-061-quoted-bare-list-tab-fix-handoff.md`
- `docs/progress.md`
- `docs/test-cases.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-061.md`

## Verification

- Focused unit tests cover body unordered, nested quote unordered, nested quote ordered, and separator rejection.
- Controller coverage dispatches the real Tab command on a nested quote bare marker.
- Electron editing-experience probe verifies final Markdown, caret, quote depth, and list depth.
- Full verification: 112 Vitest files / 1296 tests, blockquote and list editing-experience groups, typecheck, lint, build, and `git diff --check`.

## Manual Acceptance

1. In a depth-two blockquote, create two sibling list items.
2. Leave the second item empty so its source is a bare `> > -`.
3. Press Tab.
4. Confirm it becomes `> >   - `, remains at quote depth two, and displays as a nested list item.

## Residual Risk

- Shift+Tab on a bare marker is not part of this fix because the failing path occurs before the marker has become a parsed nested list item.
