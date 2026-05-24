# TASK-055 Physical Line Decoration Surfaces Intake

Date: 2026-05-24
Task: TASK-055
Status: DEV_IN_PROGRESS

## Goal

Use the TASK-054 physical editing line model to drive visible editing surfaces for active empty lines, active whitespace-only lines, and inactive structural separators. Every visible CodeMirror line should get stable `cm-fm-line-*` classes, and whitespace editability must not depend on parser-first fake Markdown blocks.

## In Scope

- Add physical editing line decorations for each CodeMirror visible source line.
- Add stable line classes such as `cm-fm-line`, `cm-fm-line-empty`, `cm-fm-line-whitespace`, `cm-fm-line-text`, `cm-fm-line-active`, `cm-fm-line-structural-separator`, and `cm-fm-line-extra-blank`.
- Ensure active empty and whitespace-only lines have stable height and measurable caret geometry.
- Preserve existing inactive structural separator collapse, but never collapse the active physical line.
- Replace decoration behavior that depends on whitespace-only semantic fake blocks.
- Add focused editor-core decoration tests, renderer/CSS contract tests, and Electron probe coverage for empty / whitespace line geometry where practical.

## Out Of Scope

- Do not change Enter or Backspace routing; TASK-056 owns line-first command behavior.
- Do not split hidden marker versus structural navigation selection normalization; TASK-057 owns that.
- Do not claim full Typora-like alignment; TASK-058 owns the final oracle gate.
- Do not modify main, preload, packaging, or shell-level tab/window behavior.
- Do not introduce editor-only sentinel characters or saved hidden source markers.

## Landing Area

- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- `packages/editor-core/src/derived-state/inactive-block-decorations.ts`
- `packages/editor-core/src/extensions/markdown.ts`
- `src/renderer/styles/markdown-render.css`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `scripts/probe-markdown-editing-experience.mjs`
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-055.md`

## Acceptance

- Empty document and active empty physical lines expose `cm-fm-line cm-fm-line-empty cm-fm-line-active` without changing saved source.
- Whitespace-only active lines expose `cm-fm-line-whitespace cm-fm-line-active`, preserve real spaces, and keep caret geometry measurable.
- Mixed documents keep pure whitespace lines as editable whitespace surfaces, not collapsed structural separators.
- Inactive structural separators can still receive `cm-inactive-blank-line`, but the active line wins over collapse classes.
- CSS keeps active empty / whitespace lines at normal editable line height and `white-space: pre-wrap`.
- Existing paragraph, heading, list, blockquote, code fence, table, image, and inline decoration behavior does not regress.

## Verification

- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts`
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
- `npm.cmd run test:editing-experience -- --case empty-type-one-space`
- `npm.cmd run test:editing-experience -- --case empty-type-three-spaces`
- `npm.cmd run test:editing-experience -- --case heading-empty-paragraph-space`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check -- packages/editor-core/src/decorations/block-decorations.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/derived-state/inactive-block-decorations.ts packages/editor-core/src/extensions/markdown.ts src/renderer/styles/markdown-render.css src/renderer/code-editor.test.ts src/renderer/markdown-editing-experience-probe.ts scripts/probe-markdown-editing-experience.mjs MVP_BACKLOG.md docs/progress.md docs/plans/2026-05-24-task-055-physical-line-decoration-surfaces-intake.md docs/plans/2026-05-24-task-055-physical-line-decoration-surfaces-handoff.md docs/test-report.md reports/task-summaries/TASK-055.md`

## Risks

- CodeMirror line decorations must use valid line start offsets; trailing newline and CRLF handling should reuse TASK-054 `EditingLine` offsets.
- Decoration signature caching must account for active physical line changes even when `activeBlock` is null.
- Existing dirty worktree changes include renderer tests and markdown extension edits; preserve them and do not revert unrelated work.
- CSS must not hide active physical lines while preserving current inactive blank-line collapse.

## Doc Updates

- Update `MVP_BACKLOG.md` TASK-055 status and execution slices.
- Update `docs/progress.md` TASK-055 status.
- Write `docs/plans/2026-05-24-task-055-physical-line-decoration-surfaces-handoff.md` after implementation.
- Update `docs/test-report.md` and `reports/task-summaries/TASK-055.md` during acceptance.

## Next Skill

`$fishmark-task-execution`
