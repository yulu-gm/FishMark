# Heading Enter List Context Handoff

Date: 2026-06-02
Task: heading-enter-list-context

## What Changed

- Fixed `resolveLineStartOffset` so offset `0` always resolves to line start `0`, even when the document begins with a newline.
- Added regression coverage for a heading above an ordered-list gap based on `C:/Users/wuche/Desktop/todo.md`.
- Added focused unit coverage for the leading-newline line-start boundary.

## Root Cause

When a document began with `\n` and the first semantic block was a styled block such as a heading, `resolveLineStartOffset(source, 0)` returned `1`. The structural blank-line decoration for the leading empty row was therefore applied to the heading row. CSS then collapsed that row through `cm-inactive-blank-line`, making the heading visually disappear after `Enter` moved the caret to the new blank paragraph.

## Landing Files

- `packages/editor-core/src/source-utils.ts`
- `packages/editor-core/src/source-utils.test.ts`
- `src/renderer/code-editor.test.ts`
- `docs/plans/2026-06-02-heading-enter-list-context-intake.md`

## Verification Run

- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "keeps a heading visible after Enter when it sits above an ordered list gap"`: PASS
- `npm.cmd run test -- packages/editor-core/src/source-utils.test.ts`: PASS
- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "creates a visible empty paragraph block on Enter at heading end"`: PASS
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts`: PASS
- `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts`: PASS
- `npm.cmd run test -- src/renderer/code-editor.test.ts`: PASS
- `npm.cmd run test`: PASS, 107 files / 1178 tests
- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd run build`: PASS
- `git diff --check -- packages/editor-core/src/source-utils.ts packages/editor-core/src/source-utils.test.ts src/renderer/code-editor.test.ts docs/plans/2026-06-02-heading-enter-list-context-intake.md`: PASS

## Known Risks Or Notes

- `npm.cmd run test:editing-experience -- --case heading-end-enter` timed out twice in this environment and left Electron probe child processes; those were cleaned up. No Electron probe PASS is claimed.
- Plain `git diff --check` still reports pre-existing trailing whitespace in `tmp/test.md` lines 167-168, unrelated to this change.
- `npm ci` was run to restore missing local `.bin` links after the environment no longer had a usable `node_modules/.bin`.

## Manual Acceptance Draft

1. Open `C:/Users/wuche/Desktop/todo.md` in FishMark.
2. Put the caret at the end of `### Todo`.
3. Press `Enter`.
4. Confirm `### Todo` remains visible as a rendered heading.
5. Confirm the caret lands on a visible empty editable line above `1. 脚注`.
6. Repeat after inserting a heading above the first list item by removing the list marker and creating a blank line; the new heading should remain visible after pressing `Enter`.
