# Typora Blank Line Rendering

Date: 2026-05-05
Result: PASS

## Summary

FishMark now treats structural Markdown blank source lines more like Typora in inactive reading state. The first blank source line in each block gap receives `cm-inactive-blank-line` and collapses to zero visual height, so paragraph spacing is not double-counted by raw empty editor rows.

If a block gap contains multiple blank source lines, only the first is hidden as the structural separator; the remaining user-authored blank rows stay visible and keyboard-reachable in both the editor and exported HTML. ArrowUp and ArrowDown skip only the collapsed separator row, Backspace deletes visible extra blank rows before crossing the separator, and ordinary paragraph Enter creates a new block boundary by inserting the structural blank separator unless the cursor is already at an existing block start. The focused blank line remains editable when directly selected, and CRLF files now collapse only the actual structural blank row.

## Changed Files

- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/interactions/adapters/line-block-adapter.ts`
- `src/renderer/export-html.ts`
- `src/renderer/styles/markdown-render.css`
- `docs/standards/markdown-text-rendering-standard.json`
- Focused tests in `packages/editor-core/src/decorations`, `src/renderer`, and `src/shared`
- Task handoff files under `docs/plans/`

## Verification

- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`: PASS, 174 tests
- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts`: PASS, 150 tests
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/export-html.test.ts packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts`: PASS, 191 tests
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/export-html.test.ts packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts src/shared/markdown-text-rendering-standard.test.ts src/renderer/editor-source-layout.test.ts`: PASS, 205 tests
- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts`: PASS, 158 tests
- `npm.cmd run test -- src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/markdown-engine/src/parse-block-map.test.ts src/renderer/export-html.test.ts src/renderer/editor-source-layout.test.ts`: PASS, 385 tests
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts src/renderer/editor-source-layout.test.ts`: PASS, 183 tests
- `npm.cmd run test -- src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/markdown-engine/src/parse-block-map.test.ts src/renderer/export-html.test.ts src/renderer/editor-source-layout.test.ts`: PASS, 368 tests
- Electron blank-line geometry probe: PASS, inactive blank row height `0`, line-height `0px`
- `npm.cmd run test`: PASS, 94 files / 911 tests
- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS with existing Fast Refresh warning in `src/renderer/editor/App.tsx`
- `npm.cmd run build`: PASS with existing Vite chunk-size warning
- `npm.cmd run test:list-geometry`: PASS
- `git diff --check`: PASS with CRLF normalization warnings only

## Manual Acceptance

1. Open Markdown documents containing two paragraphs separated by one blank source line and by multiple blank source lines.
2. Move the cursor into the second paragraph and confirm only the first blank row in each gap collapses; extra blank rows remain visible.
3. Press `ArrowDown` / `ArrowUp` across the gap and confirm the caret skips only the hidden separator while still reaching visible extra blank rows.
4. Press `Backspace` from the next paragraph start and confirm visible extra blank rows are removed before the structural separator joins content.
5. Press `Enter` inside a normal paragraph and confirm it creates a new block with a structural blank separator.
6. Press `Enter` at the start of an existing block and confirm it inserts only one newline instead of creating another structural separator.
7. Repeat with a CRLF Markdown file.
8. Directly move the cursor onto the blank line and confirm it remains editable.
9. Export the document to HTML and confirm the exported file has the same blank-line spacing as FishMark inactive reading state.
10. Save the document and confirm the blank source line is still present in the Markdown file.

## Notes

- This task only aligns blank-line rendering behavior. It does not change FishMark's font, heading style, page width, or Markdown dialect coverage to match Typora.
- This was an ad-hoc rendering refinement rather than a numbered backlog task, so no `MVP_BACKLOG.md` checkbox was changed.
