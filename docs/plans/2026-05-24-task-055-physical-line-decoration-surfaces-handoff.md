# TASK-055 Physical Line Decoration Surfaces Handoff

Date: 2026-05-24
Task: TASK-055
Status: DEV_DONE

## What Changed

- Added physical CodeMirror line decorations from `PhysicalEditingDocument` / `activeLine`.
- Every physical source line now receives stable `cm-fm-line` plus kind classes:
  - `cm-fm-line-empty`
  - `cm-fm-line-whitespace`
  - `cm-fm-line-text`
- Focused active physical lines receive `cm-fm-line-active`.
- Structural and extra blank physical overlays receive:
  - `cm-fm-line-structural-separator`
  - `cm-fm-line-extra-blank`
- Active empty / whitespace lines keep normal editable line box CSS with `white-space: pre-wrap`.
- Whitespace-only input on active empty / whitespace lines keeps selection after the inserted real spaces without adding hidden source markers.
- The semantic line map now marks only the first blank physical line in a block gap as `structural-separator`; later blank lines in the same gap are `extra-blank`.
- Editing-experience probe whitespace cases now assert physical line classes and `pre-wrap` geometry.

## Landing Files

- `packages/editor-core/src/physical-editing-document.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `packages/editor-core/src/derived-state/inactive-block-decorations.ts`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/extensions/markdown.test.ts`
- `src/renderer/styles/markdown-render.css`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-055.md`

## Verification Run

- RED: `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts`
  - Failed as expected before implementation because `cm-fm-line-*` decorations and CSS rules were missing.
- GREEN: `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts`
  - Passed: 2 files, 76 tests.
- `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts`
  - Passed: 1 file, 10 tests.
- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "active empty and whitespace-only physical lines|active physical blank and whitespace line CSS|selection after inserted spaces"`
  - Passed: 1 file, 3 focused TASK-055 tests.
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
  - Failed: 185 passed / 1 failed.
  - Remaining failure: `breaks ordered list rendering from the current item when Backspace is pressed at content start`.
  - This failure was already present during the first RED run and belongs to out-of-scope TASK-056 Backspace command routing.
- `npm.cmd run typecheck`
  - Passed.
- `npm.cmd run lint`
  - Passed.
- `npm.cmd run build`
  - Passed.
- `cmd /c "set FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=empty-type-one-space&& npm.cmd run test:editing-experience"`
  - Passed.
- `cmd /c "set FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=empty-type-three-spaces&& npm.cmd run test:editing-experience"`
  - Passed.
- `cmd /c "set FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=heading-empty-paragraph-space&& npm.cmd run test:editing-experience"`
  - Passed.

## Manual Acceptance Notes

- Empty document before typing exposes `cm-fm-line cm-fm-line-empty cm-fm-line-active`.
- Empty document after typing one or three real spaces exposes `cm-fm-line cm-fm-line-whitespace cm-fm-line-active cm-fm-line-extra-blank`.
- Whitespace lines preserve actual source spaces and keep caret geometry measurable under `pre-wrap`.
- Mixed paragraph gaps keep only the first inactive blank row collapsed as `cm-inactive-blank-line`; extra blank rows remain visible and active rows do not collapse.
- No sentinel characters or hidden Markdown source markers were introduced.

## Known Risks Or Follow-Ups

- Full `src/renderer/code-editor.test.ts` is not green because of an existing ordered-list Backspace behavior failure. That is intentionally not fixed here because TASK-056 owns Enter / Backspace line-first routing.
- TASK-057 still owns deeper selection-normalization cleanup. TASK-055 only adds a narrow whitespace insertion selection guard for real spaces on empty / whitespace-only physical lines.
