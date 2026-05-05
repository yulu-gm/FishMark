# Typora Blank Line Rendering Handoff

Date: 2026-05-05
Task: typora-blank-line-rendering

## What Changed

- Added an inactive reading-state class for the first structural Markdown blank source line in each block gap.
- Collapsed inactive blank-line rows to zero height in editor reading CSS.
- Applied the same inactive blank-line class in exported HTML so editor reading state and exported HTML share the same visual rule.
- Preserved visible, keyboard-reachable extra blank rows when users type more than one blank source line between blocks.
- Kept the focused blank line editable by excluding the current selection line from the inactive blank-line decoration.
- Made ArrowUp/ArrowDown skip only collapsed structural blank separators instead of skipping user-authored extra blank rows.
- Made Backspace at the next paragraph start delete visible extra blank rows first, then delete the structural separator and join content once only the separator remains.
- Made ordinary paragraph Enter create a new block by inserting a structural blank separator before the next block start, while reusing an existing block boundary when the cursor is already at a block start.
- Fixed CRLF blank-line scanning so Windows line endings collapse only the actual structural blank row.
- Updated the canonical Markdown text rendering standard with the blank-line collapse rule.
- Updated standard tests to match the current list marker-column geometry already present in the JSON/CSS contract.

## Landing Files

- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/commands/markdown-commands.test.ts`
- `packages/editor-core/src/interactions/adapters/line-block-adapter.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/export-html.ts`
- `src/renderer/export-html.test.ts`
- `src/renderer/styles/markdown-render.css`
- `src/renderer/editor-source-layout.test.ts`
- `src/shared/markdown-text-rendering-standard.test.ts`
- `docs/standards/markdown-text-rendering-standard.json`
- `docs/plans/2026-05-05-typora-blank-line-rendering-intake.md`

## Verification Run

- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`
- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/export-html.test.ts packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts src/shared/markdown-text-rendering-standard.test.ts src/renderer/editor-source-layout.test.ts`
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/export-html.test.ts packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run test -- src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/markdown-engine/src/parse-block-map.test.ts src/renderer/export-html.test.ts src/renderer/editor-source-layout.test.ts`
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts src/renderer/editor-source-layout.test.ts`
- `npm.cmd run test -- src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/markdown-engine/src/parse-block-map.test.ts src/renderer/export-html.test.ts src/renderer/editor-source-layout.test.ts`
- Electron blank-line geometry probe: blank row `height: 0`, `lineHeight: "0px"`, paragraph row height `35.094px`
- `npm.cmd run test`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run test:list-geometry`
- `git diff --check`

## Manual Acceptance Draft

1. Open Markdown documents containing paragraphs or headings separated by one blank source line and by multiple blank source lines.
2. Move the cursor into a later paragraph so the previous blocks are inactive.
3. Confirm only the first blank row in each inactive block gap collapses; extra blank rows remain visible.
4. Put the caret at the end of the previous block and press `ArrowDown`; confirm it skips only the hidden separator and can land on visible extra blank rows.
5. Put the caret at the start of the next block and press `ArrowUp`; confirm it can land on visible extra blank rows before crossing the hidden separator.
6. Put the caret at the start of the next paragraph and press `Backspace`; confirm it removes visible extra blank rows first, then joins content after the separator is the only remaining gap.
7. Press `Enter` inside a normal paragraph and confirm it creates a new block boundary with one structural blank separator.
8. Press `Enter` at the start of an existing block and confirm it inserts only one newline instead of creating another structural separator.
9. Repeat the same check with a CRLF Markdown file.
10. Directly place the caret onto the blank source line and confirm it becomes editable/visible enough to edit source.
11. Export the document to HTML and open it in a browser.
12. Confirm the exported HTML uses the same collapsed blank-line spacing as FishMark's inactive reading state.
13. Save the Markdown file and confirm the original blank lines are still present in source.

## Known Risks Or Notes

- This aligns only Typora-style blank-line treatment, keyboard navigation, paragraph Enter, and Backspace behavior over collapsed separators. Font, heading borders, page width, and Markdown dialect rendering remain FishMark-specific.
- `npm.cmd run lint` still reports the existing `react-refresh/only-export-components` warning in `src/renderer/editor/App.tsx`; there are no lint errors.
- `npm.cmd run build` still reports the existing Vite chunk-size warning.
- `git diff --check` reports Windows line-ending conversion warnings only.
- This was a new ad-hoc rendering refinement, not an existing numbered backlog task, so no `MVP_BACKLOG.md` checkbox was changed.

## Next Skill

`$fishmark-task-acceptance`
