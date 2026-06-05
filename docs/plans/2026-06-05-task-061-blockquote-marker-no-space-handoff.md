# TASK-061 blockquote marker no-space commit handoff

## Changed

- Updated blockquote marker parsing so `>`, `>text`, `> >`, and `> >text` are valid blockquote prefixes without requiring marker padding.
- Kept active empty unpadded marker rows editable with a visible caret anchor, while committed or inactive rows hide the quote source prefix.
- Synced editor decorations, HTML export rendering, editing-experience probes, stylesheet contract tests, and the markdown text rendering standard.

## Files

- `packages/markdown-engine/src/blockquote.ts`
- `packages/markdown-engine/src/parse-block-map.ts`
- `packages/editor-core/src/commands/line-parsers.ts`
- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-lines.ts`
- `src/renderer/export-html.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `docs/standards/markdown-text-rendering-standard.json`
- Related Vitest / renderer tests and test documentation.

## Verification

- `npm.cmd run test -- packages/editor-core/src/commands/line-parsers.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/active-block.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run test -- src/renderer/export-html.test.ts src/shared/markdown-text-rendering-standard.test.ts src/renderer/editor-source-layout.test.ts src/renderer/app.autosave.test.ts`
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='blockquote-marker-commits-after-text'; npm.cmd run test:editing-experience`
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='nested-blockquote-marker-commits-after-text'; npm.cmd run test:editing-experience`
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## Manual Acceptance Draft

1. Type `>` on an empty line and confirm a quote row appears with a visible caret.
2. Continue typing `quote` without inserting a space and confirm the source is `>quote`, the text remains inside the quote, and the marker is hidden.
3. Type `>` on an empty line, then move the cursor to another paragraph and confirm the bare quote row hides the raw marker while the quote rail remains visible.
4. Inside an existing quote, type another `>` and then `nested`; confirm the source is `> >nested`, the row is depth 2, and the marker prefix is hidden after text is typed.
5. Confirm `>` + Enter and `> >` + Enter still create padded quote continuation lines with visible caret geometry.

## Known Notes

- `npm.cmd run build` still reports the existing Vite chunk-size warning.
- `git diff --check` reports only existing Windows LF/CRLF normalization warnings.
