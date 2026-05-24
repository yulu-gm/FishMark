# TASK-054 Physical Editing Line Model Handoff

Date: 2026-05-24
Task: TASK-054
Status: DEV_DONE

## What Changed

- Added a source-derived `PhysicalEditingDocument` with one `EditingLine` for every physical source line.
- Covered empty, whitespace-only, and text line kinds, including an active-capable empty line for an empty document.
- Added `SemanticLineMap` overlays for headings, paragraphs, list item / continuation lines, blockquotes, code fence boundary / content lines, tables, thematic breaks, definitions, HTML images, structural separators, extra blanks, and unparsed text.
- Updated `createEditorDerivedState` to expose `editingDocument` and `activeLine`.
- Removed the parser-first whitespace fake block path from active block resolution, derived state, and the markdown extension selection normalization path.
- Kept `markdownDocument.blocks` parser-owned; whitespace-only source now has an active physical line while `activeBlock` can be null.

## Landing Files

- `packages/editor-core/src/physical-editing-document.ts`
- `packages/editor-core/src/physical-editing-document.test.ts`
- `packages/editor-core/src/derived-state/editor-derived-state.ts`
- `packages/editor-core/src/derived-state/editor-derived-state.test.ts`
- `packages/editor-core/src/active-block.ts`
- `packages/editor-core/src/active-block.test.ts`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/index.ts`
- `MVP_BACKLOG.md`
- `docs/progress.md`

## Verification Run

- RED: `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/derived-state/editor-derived-state.test.ts packages/editor-core/src/active-block.test.ts`
  - Failed as expected because `physical-editing-document` did not exist, derived state lacked `editingDocument` / `activeLine`, and whitespace-only source still materialized a fake paragraph block.
- GREEN: same command
  - Passed: 3 files, 18 tests.
- `npm.cmd run typecheck`
  - Passed.
- `npm.cmd run lint`
  - Passed.
- `npm.cmd run build`
  - Passed.
- Scoped `git diff --check`
  - Passed with Windows LF/CRLF warnings only.

## Recommended Acceptance Commands

- `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/derived-state/editor-derived-state.test.ts packages/editor-core/src/active-block.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check -- packages/editor-core/src/physical-editing-document.ts packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/derived-state/editor-derived-state.ts packages/editor-core/src/derived-state/editor-derived-state.test.ts packages/editor-core/src/active-block.ts packages/editor-core/src/active-block.test.ts packages/editor-core/src/extensions/markdown.ts packages/editor-core/src/index.ts MVP_BACKLOG.md docs/progress.md docs/plans/2026-05-24-task-054-physical-editing-line-model-handoff.md`

## Manual Acceptance Notes

- Empty document: derived state should expose `activeLine.kind === "empty"` and no active semantic block.
- Whitespace-only source: parser output should remain unchanged, `activeLine.kind === "whitespace"`, and `activeBlock` may be null.
- Mixed text / blank / whitespace source: each physical source line should be present with stable offsets and line break boundaries.
- Semantic overlays should be treated as optional metadata; do not mutate or fake `markdownDocument.blocks`.

## Known Risks Or Follow-Ups

- TASK-055 still owns visible decoration surfaces for active empty / whitespace lines.
- TASK-056 still owns Enter / Backspace line-first routing.
- TASK-057 still owns selection normalization boundary cleanup.
- `SemanticLineMap` currently chooses the first top-level block by source line range; nested list child line roles can be expanded later if command routing needs deeper item ownership.
