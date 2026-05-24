# TASK-058 Typora-like Alignment Gate Intake

Date: 2026-05-24
Task: TASK-058
Status: DEV_IN_PROGRESS

## Goal

Run the Phase 1 Typora oracle cases against FishMark after TASK-054 through TASK-057, publish a pass/fail report, and only claim Typora-like alignment for the behavior subset when evidence supports it. Blocked oracle rows must stay explicitly blocked and must not be counted as aligned.

## In Scope

- Run the current FishMark editing-experience probe for all captured TASK-053 oracle cases.
- Compare source, selection, visual assertions, repeated action behavior, and available undo notes against the oracle matrix.
- Produce a final alignment report under `docs/plans/typora-like-editor/`.
- Update `docs/test-report.md`, `reports/task-summaries/TASK-058.md`, `MVP_BACKLOG.md`, and `docs/progress.md`.
- Record blocked cases separately with next manual capture steps.
- Run broad regressions for editor-core, renderer, typecheck, lint, and build.

## Out Of Scope

- Do not modify editing behavior unless a report-generation/test harness bug prevents the gate from running.
- Do not promote blocked Typora oracle cases without new valid Typora evidence.
- Do not add new GUI automation against Typora unless the existing report cannot distinguish blocked cases.
- Do not modify main, preload, packaging, themes, or shell/tab behavior.

## Landing Area

- `docs/plans/typora-like-editor/`
- `.artifacts/test-runs/`
- `docs/test-report.md`
- `reports/task-summaries/TASK-058.md`
- `MVP_BACKLOG.md`
- `docs/progress.md`

## Acceptance

- All 12 captured TASK-053 oracle cases have FishMark comparison results with PASS / FAIL conclusions.
- All 4 blocked oracle cases remain explicitly blocked / not scored, with next capture steps.
- The final report does not describe unverified or failing cases as aligned.
- Existing list, blockquote, code fence, table, image, inline rendering, command, selection, and physical-line tests do not regress.
- `oracle-captured` probe group exits 0 or the report accurately records any remaining failures.

## Verification

- `npm.cmd run test:editing-experience` with `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=oracle-captured`.
- `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts`
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check -- docs/plans/2026-05-24-task-058-typora-like-alignment-gate-intake.md docs/plans/2026-05-24-task-058-typora-like-alignment-gate-handoff.md docs/plans/typora-like-editor/2026-05-24-phase-1-alignment-gate-report.md docs/test-report.md reports/task-summaries/TASK-058.md MVP_BACKLOG.md docs/progress.md`

## Risks

- The oracle matrix still has four blocked Typora captures. These must remain outside pass/fail scoring.
- TASK-053 baseline report is now stale after TASK-054 through TASK-057; TASK-058 should publish a new gate report instead of rewriting history.
- Probe JSON can be verbose; store full artifacts under `.artifacts/test-runs/` and summarize high-signal fields in docs.

## Doc Updates

- Add final alignment gate report under `docs/plans/typora-like-editor/`.
- Write `docs/plans/2026-05-24-task-058-typora-like-alignment-gate-handoff.md`.
- Update `docs/test-report.md`, `reports/task-summaries/TASK-058.md`, `MVP_BACKLOG.md`, and `docs/progress.md`.

## Next Skill

`$fishmark-task-execution`
