# TASK-057 Selection Normalization Boundaries Handoff

Date: 2026-05-24
Task: TASK-057
Status: DEV_DONE

## What Changed

- Split selection normalization in the Markdown extension into explicit hidden-marker and structural-navigation predicates.
- Structural blank normalization now runs only for selection navigation transactions, not ordinary printable `input*` transactions.
- Hidden marker normalization still applies for non-printable document/selection updates and transformed inactive presentations.
- Single-line paste/drop-style `input*` transactions no longer get classified as ordinary typing; hidden marker selection repair still runs for those non-typing inputs.
- ArrowDown over a collapsed structural separator now preserves the visible column when moving from the previous block into the next text block, so paragraph-end to paragraph-end navigation lands at the next paragraph end.
- Added regression coverage for printable/composition input transactions and structural blank ArrowDown.

## Landing Files

- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/extensions/markdown.test.ts`
- `packages/editor-core/src/line-visibility.ts`
- `packages/editor-core/src/interactions/adapters/line-block-adapter.ts`
- `src/renderer/code-editor.test.ts`
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-057.md`

## Verification Run

- RED: `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts -t "moves ArrowDown from a paragraph end"`
  - Failed as expected: selection was `15`, expected `28`.
- RED: `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts -t "does not run structural blank normalization"`
  - Failed as expected: `input.type` selection was pulled from `15` to `14`.
- RED: `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts -t "repairs hidden inline marker selection"`
  - Failed as expected: `input.paste` selection stayed at hidden marker offset `1`, expected `2`.
- `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/markdown-commands.test.ts`
  - Passed: 3 files, 101 tests.
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
  - Passed: 1 file, 189 tests.
- Editing-experience probes passed:
  - `structural-blank-arrow-down`
  - `empty-type-hash`
  - `empty-type-one-space`
  - `empty-type-three-spaces`
  - `heading-empty-paragraph-space`
  - `heading-empty-paragraph-backspace`
- `npm.cmd run typecheck`
  - Passed.
- `npm.cmd run lint`
  - Passed.
- `npm.cmd run build`
  - Passed.

## Manual Acceptance Draft

1. Type `#`, plain text, Chinese IME text, and one or more spaces into empty or blank editable lines. Confirm the caret remains after inserted source text.
2. In `Paragraph one\n\nParagraph two`, place the caret at the end of `Paragraph one`, press ArrowDown, and confirm the caret lands at the end of `Paragraph two`.
3. Click or arrow around inactive headings, inline markers, lists, and blockquotes. Confirm marker boundaries still normalize to editable source positions.
4. Start IME composition in paragraph/list contexts and confirm derived state waits until composition end before flushing.

## Known Risks Or Follow-Ups

- TASK-058 still owns full Typora oracle alignment and any broader visual/selection PASS claim.
- Structural separator column preservation is intentionally limited to non-table text-like blocks; table navigation keeps its existing table-entry behavior.
