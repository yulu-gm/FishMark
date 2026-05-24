# TASK-057 Selection Normalization Boundaries Intake

Date: 2026-05-24
Task: TASK-057
Status: DEV_IN_PROGRESS

## Goal

Split hidden Markdown marker selection normalization from structural navigation selection normalization. Ordinary printable input, including spaces and IME composition text, must keep the browser / CodeMirror insertion selection, while arrow and pointer navigation can still normalize hidden marker and collapsed structural blank destinations intentionally.

## Current Red Evidence

- `structural-blank-arrow-down` still fails after TASK-056.
- Command run: `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE=structural-blank-arrow-down node scripts/probe-markdown-editing-experience.mjs`.
- Initial source: `Paragraph one\n\nParagraph two`.
- Actual selection after `ArrowDown` from the first paragraph end: `{ anchor: 15, head: 15 }`, the start of `Paragraph two`.
- Expected selection: `{ anchor: 28, head: 28 }`, the end of `Paragraph two`.
- Visual classes are otherwise correct, so the issue is navigation selection normalization rather than decoration.

## In Scope

- Introduce explicit boundaries equivalent to:
  - `normalizeHiddenMarkerSelection`
  - `normalizeStructuralNavigationSelection`
- Update the markdown extension transaction filter so it decides normalization by user event / transaction shape instead of always applying structural blank normalization before hidden marker normalization.
- Prevent ordinary printable input (`input`, `input.type`, spaces, `#`, normal text) from being moved by structural blank normalization.
- Preserve hidden Markdown marker normalization for headings, emphasis/strong/code spans, list/blockquote markers, and transformed inactive presentations.
- Preserve or fix structural navigation for ArrowUp / ArrowDown and mouse / pointer selection around collapsed structural blank rows.
- Keep the TASK-056 narrow whitespace-only guard as part of the final design if still needed, but avoid layering new ad-hoc printable-input exceptions.
- Add focused unit / extension / renderer / probe coverage for printable input, IME guard, arrows, mouse/pointer, and hidden marker boundaries.

## Out Of Scope

- Do not change Enter / Backspace command routing; TASK-056 owns that and is already DEV_DONE.
- Do not change physical line decoration classes or CSS; TASK-055 owns that.
- Do not add new Typora oracle capture; TASK-058 owns the final gate and report.
- Do not modify main, preload, packaging, themes, or shell/tab behavior.

## Landing Area

- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/extensions/markdown.test.ts`
- `packages/editor-core/src/line-visibility.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `scripts/probe-markdown-editing-experience.mjs`
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-057.md`

## Acceptance

- Typing spaces, `#`, normal text, and Chinese / composition text does not get pulled backward or sideways by structural blank normalization.
- `structural-blank-arrow-down` passes with selection at the expected next paragraph end.
- ArrowUp / ArrowDown and pointer selection still intentionally handle collapsed structural blank rows.
- Hidden Markdown marker boundaries still normalize predictably for transformed headings, inline markers, lists, and blockquotes.
- IME composition guard still defers derived state flush during composition and flushes once after composition ends.
- TASK-055 physical line surface tests and TASK-056 Enter / Backspace command tests remain green.

## Verification

- `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/markdown-commands.test.ts`
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
- Named editing-experience probes:
  - `structural-blank-arrow-down`
  - `empty-type-hash`
  - `empty-type-one-space`
  - `empty-type-three-spaces`
  - `heading-empty-paragraph-space`
  - `heading-empty-paragraph-backspace`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check -- packages/editor-core/src/extensions/markdown.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/line-visibility.ts src/renderer/code-editor.test.ts src/renderer/markdown-editing-experience-probe.ts scripts/probe-markdown-editing-experience.mjs MVP_BACKLOG.md docs/progress.md docs/plans/2026-05-24-task-057-selection-normalization-boundaries-intake.md docs/plans/2026-05-24-task-057-selection-normalization-boundaries-handoff.md docs/test-report.md reports/task-summaries/TASK-057.md`

## Risks

- CodeMirror user event names are subtle. Prefer small helper predicates with direct tests instead of scattered string checks.
- Hidden marker normalization and structural blank navigation currently run in one path; splitting them can regress headings, inline markers, lists, or blockquote selection if coverage is too narrow.
- IME composition transactions must not be normalized prematurely.
- Mouse / pointer selection should remain intentional around rendered blocks and collapsed structural separators.

## Doc Updates

- Update `MVP_BACKLOG.md` TASK-057 status and execution slices.
- Update `docs/progress.md` TASK-057 status.
- Write `docs/plans/2026-05-24-task-057-selection-normalization-boundaries-handoff.md` after implementation.
- Update `docs/test-report.md` and `reports/task-summaries/TASK-057.md` during acceptance.

## Next Skill

`$fishmark-task-execution`
