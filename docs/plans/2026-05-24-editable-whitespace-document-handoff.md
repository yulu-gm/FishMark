# Editable Whitespace Document Handoff

## Changes

- Added editor-core materialization for non-empty whitespace-only documents.
- Whitespace-only source such as `" "` remains unchanged as Markdown text, but the editor semantic layer now exposes it
  as an active paragraph block.
- Selection normalization now sees that materialized paragraph and no longer snaps the caret back to offset `0`.
- Follow-up Enter/navigation fixes distinguish truly empty physical lines from whitespace-only physical lines:
  - pressing Enter on an already empty or whitespace-only physical line inserts one physical newline instead of two;
  - inactive whitespace-only lines are no longer decorated as collapsed blank lines;
  - ArrowUp from the following line no longer routes around a visible whitespace-only line.
- The Electron editing-experience probe has targeted cases for:
  - empty document + space input,
  - heading end + Enter + space input.

## Files

- `packages/editor-core/src/active-block.ts`
- `packages/editor-core/src/active-block.test.ts`
- `packages/editor-core/src/derived-state/editor-derived-state.ts`
- `packages/editor-core/src/derived-state/editor-derived-state.test.ts`
- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/commands/markdown-commands.test.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `packages/editor-core/src/interactions/adapters/line-block-adapter.ts`
- `packages/editor-core/src/interactions/registry.test.ts`
- `packages/editor-core/src/extensions/markdown.ts`
- `src/renderer/styles/markdown-render.css`
- `src/renderer/markdown-editing-experience-probe.ts`
- `scripts/probe-markdown-editing-experience.mjs`

## Verification

- `npm.cmd run test -- packages/editor-core/src/active-block.test.ts packages/editor-core/src/derived-state/editor-derived-state.test.ts`
- `cmd /c "set FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=empty-document-space-caret&& npm.cmd run test:editing-experience"`
- `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/active-block.test.ts packages/editor-core/src/derived-state/editor-derived-state.test.ts`
- `npm.cmd run test -- packages/editor-core/src/commands`
- `npm.cmd test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/interactions/registry.test.ts packages/editor-core/src/commands/markdown-commands.test.ts`
- `npm.cmd test -- src/renderer/editor-source-layout.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd test`

Note: the full `npm.cmd run test:editing-experience` probe timed out locally after 184 seconds with no output in this
follow-up run; the spawned Electron/Node probe processes were cleaned up. The targeted/unit gates above passed.

## Manual Check

1. Open a new empty document.
2. Type one space.
3. Confirm the caret advances one space-width to the right.
4. Continue typing text and confirm it appears after the space on the same editable paragraph line.
5. Create an empty physical line and press Enter on it; confirm exactly one additional empty line is created.
6. Create a line containing only spaces between two text lines, move focus away and back, and confirm the caret can land
   within the spaces instead of snapping to the line start.
7. Put the caret on the line below a spaces-only line and press ArrowUp; confirm the caret enters the spaces-only line
   instead of jumping to the previous text line.
