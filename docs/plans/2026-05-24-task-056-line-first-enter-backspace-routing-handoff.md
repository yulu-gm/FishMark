# TASK-056 Line-First Enter / Backspace Routing Handoff

Date: 2026-05-24
Task: TASK-056
Status: DEV_DONE

## What Changed

- Refactored plain `Backspace` routing so line-owned behavior runs before marker deletion where TASK-056 requires it:
  - non-empty selections delegate to native deletion;
  - whitespace-only physical lines delete one real whitespace character when the caret is inside the line or at line end;
  - ordered-list content-start Backspace detaches only when parsed active list metadata shows a previous sibling in the same ordered scope; first items fall through to list marker deletion;
  - existing code fence, blockquote, list marker, trailing empty block, structural separator, and native fallback behavior remains in the route.
- Refactored plain `Enter` routing so semantic handlers still run first, then generic physical paragraph fallback handles paragraph, empty, whitespace, and unparsed physical lines without requiring `activeBlock.type === "paragraph"`.
- Kept thematic break Enter ahead of heading / generic fallback, matching the Command Design order.
- Narrowed structural blank selection normalization so whitespace-only source lines are treated as real content, not structural blank anchors.
- Updated command, extension, renderer, and editing-experience probe coverage for TASK-056.

## Landing Files

- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/commands/markdown-commands.test.ts`
- `packages/editor-core/src/extensions/markdown.test.ts`
- `packages/editor-core/src/line-visibility.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-056.md`

## Verification Run

- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts`
  - Passed: 3 files, 97 tests.
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
  - Passed: 1 file, 189 tests.
- Editing-experience probes passed:
  - `empty-type-hash`
  - `empty-type-one-space`
  - `empty-type-three-spaces`
  - `paragraph-end-enter`
  - `paragraph-middle-enter`
  - `paragraph-start-enter`
  - `heading-end-enter`
  - `heading-end-repeated-enter`
  - `heading-empty-paragraph-backspace`
  - `heading-empty-paragraph-space`
- `npm.cmd run typecheck`
  - Passed.
- `npm.cmd run lint`
  - Passed.
- `npm.cmd run build`
  - Passed.

## Manual Acceptance Draft

1. In an empty document, type `#`, one space, three spaces, and normal text. Confirm caret remains after the typed source.
2. Type `# Title`, press `Enter` repeatedly from the heading end. Confirm each press creates visible editable empty lines and the caret remains on the newest active empty line.
3. On a whitespace-only line, place the caret inside the spaces or at line end and press `Backspace`. Confirm one real space is deleted.
4. In `1. 内容\n2. 内容2\n3. 内容3`, place caret before `内容2` and press `Backspace`. Confirm source becomes `1. 内容\n\n2.内容2\n3. 内容3`.
5. Smoke list / blockquote / code fence / table Enter and Backspace paths.

## Known Risks Or Follow-Ups

- TASK-057 still owns broader hidden-marker versus structural-navigation selection normalization. TASK-056 only adds the small whitespace-only guard required for real whitespace editing.
- `structural-blank-arrow-down` remains outside this task.
