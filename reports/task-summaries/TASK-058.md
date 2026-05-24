# TASK-058 Summary

Status: DEV_DONE
Result: PASS
Date: 2026-05-24

## Scope

Run the Phase 1 Typora oracle alignment gate after TASK-054 through TASK-057, publish the pass/fail report, and keep blocked Typora oracle rows out of scoring.

## Changes

- Ran `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=oracle-captured` and saved the full JSON artifact at `.artifacts/test-runs/2026-05-24-task-058-oracle-captured-probe.json`.
- Published `docs/plans/typora-like-editor/2026-05-24-phase-1-alignment-gate-report.md`.
- Recorded that all 12 captured TASK-053 oracle rows pass against FishMark.
- Kept the 4 blocked oracle rows explicitly blocked / not scored, with manual capture next steps.
- Updated backlog, progress, and test-report status for TASK-058.

## Evidence

- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='oracle-captured'; npm.cmd run test:editing-experience`: passed, 12 captured cases, 0 failures, exit `0`.
- `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts`: passed, 4 files / 111 tests.
- `npm.cmd run test -- src/renderer/code-editor.test.ts`: passed, 1 file / 189 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.

## Case Totals

- Captured oracle rows: 12 PASS / 0 FAIL.
- Blocked oracle rows: 4 blocked / not scored.
- Pending oracle rows: 0.

## Manual Acceptance

1. Open `docs/plans/typora-like-editor/2026-05-24-phase-1-alignment-gate-report.md` and confirm all 12 captured rows have explicit PASS conclusions.
2. Confirm `whitespace-line-type-text`, `whitespace-line-enter`, `whitespace-line-backspace-inside`, and `structural-blank-backspace-at-next-block` are still blocked / not scored.
3. Inspect `.artifacts/test-runs/2026-05-24-task-058-oracle-captured-probe.json` and confirm `pass: true` with an empty `failures` array.

## Residual Risk

- Undo granularity is not emitted by the existing Typora oracle artifacts or FishMark probe output, so TASK-058 records no available undo notes to score.
- The alignment claim is limited to the 12 captured rows. The 4 blocked rows still require manual Typora capture before they can enter scoring.
