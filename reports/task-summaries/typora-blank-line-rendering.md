# Typora Blank Line Rendering

Date: 2026-05-05, follow-up 2026-05-06
Result: PASS

## Summary

FishMark now treats structural Markdown blank source lines more like Typora in inactive reading state. The first blank source line in each block gap receives `cm-inactive-blank-line` and collapses to zero visual height, so paragraph spacing is not double-counted by raw empty editor rows.

If a block gap contains multiple blank source lines, only the first is hidden as the structural separator; the remaining user-authored blank rows stay visible and keyboard-reachable in both the editor and exported HTML. ArrowUp and ArrowDown skip only the collapsed separator row, Backspace deletes visible extra blank rows before crossing the separator, and CRLF files now collapse only the actual structural blank row.

The 2026-05-06 follow-up closes the editing-model gap: structural blank separators are now hidden in active editing state as well as inactive reading state, and selection normalization prevents the caret from entering them. Plain paragraph Enter inserts one source line break instead of manufacturing `\n\n`; if that single line break forms the separator before an existing next block, the caret crosses the hidden separator to the next editable block start.

Root cause: the previous implementation mixed two concepts. Structural blank separators were view-generated block boundaries, but parts of the editor still treated their source row as an editable blank line. Decorations skipped collapse when the separator was focused, selection normalization only protected inline hidden markers, and paragraph Enter inserted a two-newline block boundary directly into source text. Those mismatches made the hidden separator participate in Backspace, cursor placement, and line-count changes.

## Changed Files

- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/line-visibility.ts`
- `packages/editor-core/src/table-cursor-state.ts`
- `packages/editor-core/src/commands/table-edits.ts`
- `packages/editor-core/src/interactions/adapters/line-block-adapter.ts`
- `src/renderer/export-html.ts`
- `src/renderer/styles/markdown-render.css`
- `docs/standards/markdown-text-rendering-standard.json`
- `docs/test-cases.md`
- `docs/test-report.md`
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
- `npm run test -- packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts src/shared/markdown-text-rendering-standard.test.ts`: PASS, 177 tests
- `npm run test -- src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/commands/table-edits.test.ts packages/editor-core/src/commands/table-context.test.ts`: PASS, 420 tests
- `npm run typecheck`: PASS
- `npm run lint`: PASS with existing Fast Refresh warning in `src/renderer/editor/App.tsx`
- `npm run build`: PASS with existing Vite chunk-size warning
- `git diff --check`: PASS with CRLF normalization warnings only

## Manual Acceptance

1. Open Markdown documents containing two paragraphs separated by one blank source line and by multiple blank source lines.
2. Move the cursor into the second paragraph and confirm only the first blank row in each gap collapses; extra blank rows remain visible.
3. Press `ArrowDown` / `ArrowUp` across the gap and confirm the caret skips only the hidden separator while still reaching visible extra blank rows.
4. Press `Backspace` from the next paragraph start and confirm visible extra blank rows are removed before the structural separator joins content.
5. Press `Enter` at the end of a normal paragraph at document end, then press `Backspace` once; confirm one Backspace returns to the previous line end.
6. With `AAAAA|` followed by `BBBBB`, press `Enter`; confirm the source becomes `AAAAA\n\nBBBBB` and the caret lands at the start of `BBBBB`, not on the hidden separator.
7. Press `Enter` at the start of an existing block and confirm it inserts only one newline instead of creating another structural separator.
8. Repeat with a CRLF Markdown file.
9. Directly move the cursor onto the structural blank separator and confirm the caret normalizes to an adjacent editable block instead of staying there.
10. Export the document to HTML and confirm the exported file has the same blank-line spacing as FishMark inactive reading state.
11. Save the document and confirm the blank source line is still present in the Markdown file.

## Notes

- This task only aligns blank-line rendering behavior. It does not change FishMark's font, heading style, page width, or Markdown dialect coverage to match Typora.
- This was an ad-hoc rendering refinement rather than a numbered backlog task, so no `MVP_BACKLOG.md` checkbox was changed.
