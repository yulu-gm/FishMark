# TASK-064 Quote-Internal Semantic Render Reuse

## Summary

Quote-internal tables now reuse the same semantic table widget, cursor, and table context path as body tables. Blockquote rendering supplies container metadata instead of duplicating table styling or parsing.

## Changed

- Added recursive Markdown block tree helpers.
- Derived table cursor state from nested semantic blocks.
- Resolved table context recursively.
- Rendered quote-internal tables through `TableWidget` with blockquote container classes.
- Added renderer and editing-experience coverage for blockquote table rendering.

## Validation

- `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/context/block-tree.test.ts packages/editor-core/src/table-cursor-state.test.ts packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts`: PASS
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='blockquote-table-rendering'; npm.cmd run test:editing-experience`: PASS
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience`: PASS
- `npm.cmd run test`: PASS
- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd run build`: PASS
- `git diff --check`: PASS

## Follow-Up

- Move list context onto `EditorSemanticContext`.
- Move remaining decoration active-state decisions onto leaf/container context.
- Add quote-internal coverage for heading, thematic break, image preview, footnotes, Mermaid, and HTML blocks when each parser shape is stable.
