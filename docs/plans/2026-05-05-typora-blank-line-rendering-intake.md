# Typora Blank Line Rendering Intake

Date: 2026-05-05
Task: typora-blank-line-rendering

## Goal

Align FishMark's editor reading state and exported HTML with Typora's treatment of structural Markdown blank lines: blank source lines between rendered blocks should not create visible extra empty rows in reading state, while Markdown source remains unchanged and directly editable.

## In Scope

- Add a shared inactive blank-line rendering class for editor reading state.
- Apply the same blank-line class in exported HTML.
- Collapse inactive blank-line visual height so paragraph spacing is controlled by block styles, not by rendered source-empty rows.
- Preserve visible/editable behavior for the active blank line where the cursor is placed.
- Add focused tests for editor decorations, export HTML structure, and CSS contract.

## Out of Scope

- Changing FishMark's font family, heading theme, page width, table theme, or link colors to match Typora.
- Replacing CodeMirror with semantic HTML in the live editor.
- Adding new Markdown dialect features such as footnotes, emoji replacement, typographer, or definition-list rendering.
- Rewriting Markdown source or removing blank lines on save.

## Landing Area

- `packages/editor-core/src/decorations/block-decorations.ts`
- `src/renderer/export-html.ts`
- `src/renderer/styles/markdown-render.css`
- `docs/standards/markdown-text-rendering-standard.json`
- Focused tests under `packages/editor-core/src/decorations`, `src/renderer/code-editor.test.ts`, `src/renderer/export-html.test.ts`, and CSS contract tests.

## Acceptance

- Inactive source blank lines between blocks receive a FishMark blank-line reading class.
- Inactive blank-line rows collapse visually in both editor reading state and exported HTML.
- A blank line that contains the cursor remains editable and is not collapsed by the inactive blank-line rule.
- Exported HTML contains the same blank-line reading class and runtime CSS needed to collapse those rows outside FishMark.
- Markdown source content and save behavior are unchanged.

## Verification

- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts src/renderer/app.autosave.test.ts`
- `npm.cmd run test:list-geometry`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## Risks

- CodeMirror empty lines are needed for cursor placement, so the collapse must be inactive-state only.
- Blank-line styling must not hide active empty rows during editing or IME composition.
- Export must stay consistent with editor reading classes rather than inventing a separate HTML-only rule.

## Next Skill

`$fishmark-task-execution`
