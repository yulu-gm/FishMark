# Structural Line Break Editing Handoff

## Scope

- Keep CommonMark-compatible parsing and rendering behavior.
- Treat editor `Enter` as structural line creation.
- Treat `Shift+Enter` as an inline hard break by inserting `<br>`.
- Avoid falling back into lazy continuation when backspacing from a body paragraph across a blank boundary after a list.
- Keep middle empty list items visibly stable when another empty list item is active.

## Changes

- Added `runMarkdownHardBreakCommand` and wired `Shift-Enter` through the CodeMirror keymap.
- Added table-cell `Shift+Enter` handling in `TableWidget`, using `<br>` inside the current cell and restoring the caret after the inserted hard break.
- Added a Backspace boundary command for `list item + blank line + paragraph` so the paragraph joins the previous list item directly instead of producing lazy continuation.
- Added `min-height: 1.84em` to active and inactive list rows so empty list items keep their visual row height even when source prefixes are hidden or absolutely positioned.

## Verification

- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts src/renderer/editor-source-layout.test.ts`
- `npm.cmd run test -- src/renderer/editor-source-layout.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/markdown-engine/src/parse-block-map.test.ts`
- `npm.cmd run test:list-geometry`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## Notes

- The first sandboxed Vitest, geometry, and build runs failed with Vite/Rolldown `spawn EPERM`; reruns outside the sandbox passed.
- Lint still reports the existing `src/renderer/editor/App.tsx:215` `react-refresh/only-export-components` warning.
- `tmp/test.md` was already modified and unrelated to this task; it was left untouched.
