# Table boundary structural blank handoff

## Changed

- Updated table exit-below planning so a trailing table creates a structural separator and editable blank line.
- Added a table-specific Backspace route from the editable line below a table into the table's last cell.
- Restricted that Backspace route to empty physical lines so text such as `---` below a table remains normally editable.
- Preserved existing CRLF table navigation compatibility.

## Files

- `packages/editor-core/src/commands/table-edits.ts`
- `packages/editor-core/src/commands/table-commands.ts`
- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/commands/codemirror-markdown-command-adapter.ts`
- `packages/editor-core/src/commands/index.ts`
- `packages/editor-core/src/commands/table-edits.test.ts`
- `packages/editor-core/src/commands/table-commands.test.ts`
- `packages/editor-core/src/commands/markdown-commands.test.ts`
- `src/renderer/code-editor.test.ts`

## Verification

- `npx.cmd vitest run packages/editor-core/src/commands/table-edits.test.ts packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`

## Manual Acceptance

1. Create a table with header `A | B | C` and an empty body row.
2. Put the caret in the last body cell and press Enter.
3. Confirm the table now has a collapsed structural separator plus a visible editable blank line below it.
4. Press Backspace from that visible blank line.
5. Confirm focus returns to the table's last cell and the source still keeps the table boundary blank lines.
6. Type `---` on the editable line below the table and press Backspace.
7. Confirm the last `-` is deleted instead of focus jumping back into the table.

## Notes

- No backlog task id was associated with this direct bugfix, so backlog/progress status files were not changed.
