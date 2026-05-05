# Typora Blank Line Rendering Handoff

Date: 2026-05-05
Task: typora-blank-line-rendering

## What Changed

- Added an inactive reading-state class for structural Markdown blank source lines between blocks.
- Collapsed inactive blank-line rows to zero height in editor reading CSS.
- Applied the same inactive blank-line class in exported HTML so editor reading state and exported HTML share the same visual rule.
- Kept the focused blank line editable by excluding the current selection line from the inactive blank-line decoration.
- Made ArrowUp/ArrowDown skip collapsed structural blank separators between adjacent blocks instead of letting the caret land in the unrendered separator row.
- Fixed CRLF blank-line scanning so Windows line endings collapse only the actual structural blank row.
- Updated the canonical Markdown text rendering standard with the blank-line collapse rule.
- Updated standard tests to match the current list marker-column geometry already present in the JSON/CSS contract.

## Landing Files

- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
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

1. Open a Markdown document containing paragraphs or headings separated by a single blank source line.
2. Move the cursor into a later paragraph so the previous blocks are inactive.
3. Confirm the blank source line between inactive blocks does not create a visible empty row.
4. Put the caret at the end of the previous block and press `ArrowDown`; confirm the caret moves to the next block's first visible content line, not the hidden separator row.
5. Put the caret at the start of the next block and press `ArrowUp`; confirm the caret moves to the previous block's last visible content line, not the hidden separator row.
6. Repeat the same check with a CRLF Markdown file.
7. Directly place the caret onto the blank source line and confirm it becomes editable/visible enough to edit source.
8. Export the document to HTML and open it in a browser.
9. Confirm the exported HTML uses the same collapsed blank-line spacing as FishMark's inactive reading state.
10. Save the Markdown file and confirm the original blank lines are still present in source.

## Known Risks Or Notes

- This aligns only Typora-style blank-line treatment and keyboard navigation over collapsed separators. Font, heading borders, page width, and Markdown dialect rendering remain FishMark-specific.
- `npm.cmd run lint` still reports the existing `react-refresh/only-export-components` warning in `src/renderer/editor/App.tsx`; there are no lint errors.
- `npm.cmd run build` still reports the existing Vite chunk-size warning.
- `git diff --check` reports Windows line-ending conversion warnings only.
- This was a new ad-hoc rendering refinement, not an existing numbered backlog task, so no `MVP_BACKLOG.md` checkbox was changed.

## Next Skill

`$fishmark-task-acceptance`
