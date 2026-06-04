# TASK-061 Blockquote Marker Commit And Quote List Editing Handoff

Date: 2026-06-04

## Scope

Follow-up for TASK-061. Fixes live blockquote marker input and quote-internal list editing so FishMark behaves like the same marker / list model used outside blockquotes:

- Bare `>` remains paragraph text.
- `>text` remains paragraph text.
- `> ` commits a blockquote.
- After `> ` commits, the empty quote line immediately shows a caret inside the quote, and native text insertion stays inside the quote to produce `> quote`.
- Inside an already committed quote, an inner bare `>` remains current-depth quote content with a visible caret; `> > ` commits the nested quote level and keeps the caret visible inside it.
- Quote-internal lists use the same Enter / Backspace / Tab / Shift+Tab editing semantics as body lists.
- Enter on an empty top-level quote list item inserts a quoted structural separator before the quote body line, so the list and following quote body remain separate blocks.
- Backspace at quote list content start removes the list marker while preserving the quote prefix; Backspace on an empty nested quote list item removes the marker first, then clears indentation one space at a time inside the quote.
- Backspace at an ordered quote list second item content start detaches that item with a quoted structural separator, matching the body ordered-list content-start behavior.

## Changed Files

- `packages/markdown-engine/src/parse-block-map.ts`
- `packages/markdown-engine/src/parse-block-map.test.ts`
- `packages/markdown-engine/src/blockquote.ts`
- `packages/editor-core/src/commands/line-parsers.ts`
- `packages/editor-core/src/commands/line-parsers.test.ts`
- `packages/editor-core/src/commands/list-commands.ts`
- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/commands/markdown-commands.test.ts`
- `packages/editor-core/src/active-block.test.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `src/renderer/styles/markdown-render.css`
- `docs/standards/markdown-text-rendering-standard.json`
- `docs/test-cases.md`
- `docs/progress.md`
- `reports/task-summaries/TASK-061.md`

## Verification Run

- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=blockquote npm.cmd run test:editing-experience`
- `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=nested-blockquote-marker-commits-after-padding npm.cmd run test:editing-experience`
- `npm.cmd run test -- packages/editor-core/src/commands/line-parsers.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/active-block.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts src/renderer/code-editor.test.ts src/renderer/editor-source-layout.test.ts src/shared/markdown-text-rendering-standard.test.ts`
- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts`

## Recommended Final Gates

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## Manual Check

1. Open an empty editor line.
2. Type `>` and confirm it remains visible paragraph text.
3. Type a space and confirm the quote rail appears while the raw marker stays hidden.
4. Confirm the caret is visible after `> ` before typing body text.
5. Type `quote` and confirm the source becomes `> quote`, not `quote\n> `.
6. In that quote, type `>` and confirm the caret remains visible in `> >`.
7. Type a space and confirm the line becomes nested quote style with the caret visible after `> > `.
8. Type `alpha` in the nested quote and press Enter; confirm the source becomes `> > alpha\n> > \n> > ` and no bare `>` is visible between the nested quote lines.
9. On an empty `> > > ` line, press Enter and confirm it becomes `> > ` with the caret still inside the parent quote. Press Enter again on `> > ` and confirm it becomes `> `. Only pressing Enter on the top-level `> ` line exits the blockquote.
10. In `> - 内容\n> - 内容2`, put the caret at `内容2` start and press Backspace; confirm the source becomes `> - 内容\n> 内容2`.
11. In `> - parent\n> - `, press Enter at the empty item end; confirm the source becomes `> - parent\n>\n> ` and the caret lands in the last quoted body line.
12. In `> - parent\n>   - `, press Backspace three times at the child item end; confirm the sequence reaches `> - parent\n> ` without removing the quote prefix.
13. In `> 1. 内容\n> 2. 内容2`, put the caret at `内容2` start and press Backspace; confirm the source becomes `> 1. 内容\n>\n> 2.内容2`.
14. In `> - parent\n> - child\n> - sibling`, put the caret inside `child`; confirm only that row shows the active list marker, while `parent` and `sibling` keep inactive list markers.
15. In `> - parent\n> - child`, press Tab on `child`, then Shift+Tab; confirm the source becomes `> - parent\n>   - child` and then returns to `> - parent\n> - child`.
