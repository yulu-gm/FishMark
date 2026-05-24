# TASK-053 Typora Oracle And FishMark Baseline Intake

Date: 2026-05-24
Task: TASK-053

## Goal

Create the first measurable gate for Typora-like editing alignment: a stable oracle artifact protocol, a named behavior matrix, and a FishMark baseline report for whitespace, empty-line, Enter, Backspace, and Markdown activation behavior.

## In Scope

- Register the Typora-like editing alignment work as numbered backlog tasks.
- Create `docs/plans/typora-like-editor/oracle/` as the canonical oracle artifact directory.
- Define a case matrix with stable `caseId` values, initial source, action sequence, evidence requirements, and capture status.
- Start a baseline report that separates Typora oracle capture from FishMark probe output.
- Preserve current editing behavior during this task unless a change is strictly probe infrastructure.

## Out Of Scope

- Do not implement the physical editing line model in this task.
- Do not remove `materializeEditableWhitespaceDocument` in this task.
- Do not change Enter, Backspace, selection normalization, list, blockquote, code fence, table, or IME behavior in this task.
- Do not claim alignment before oracle and FishMark comparison artifacts exist.

## Landing Area

- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/plans/typora-like-editor/README.md`
- `docs/plans/typora-like-editor/oracle/README.md`
- `docs/plans/typora-like-editor/oracle/case-matrix.json`
- `docs/plans/typora-like-editor/2026-05-24-phase-1-baseline-report.md`

Later TASK-053 slices may also touch:

- `src/renderer/markdown-editing-experience-probe.ts`
- `scripts/probe-markdown-editing-experience.mjs`

## Acceptance

- `MVP_BACKLOG.md` contains the full Typora-like alignment task split.
- `docs/progress.md` mirrors the new task statuses.
- Oracle artifacts have a stable structure and case matrix.
- The baseline report states what has been captured and what remains pending.
- No FishMark editing behavior changes are introduced in this setup slice.

## Verification

Documentation-only setup slice:

- Manually inspect the new backlog section and oracle paths.
- Confirm all paths referenced by this intake exist.
- Run `git diff --check -- MVP_BACKLOG.md docs/progress.md docs/plans/2026-05-24-task-053-typora-oracle-baseline-intake.md docs/plans/typora-like-editor/README.md docs/plans/typora-like-editor/oracle/README.md docs/plans/typora-like-editor/oracle/case-matrix.json docs/plans/typora-like-editor/2026-05-24-phase-1-baseline-report.md`.

Later code-bearing TASK-053 slices should run:

- `npm run test:editing-experience`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Risks

- Typora GUI automation may be unreliable on Windows; manual capture is acceptable only when it records version, settings, source, actions, saved result, caret sentinel, and visual observation.
- Existing local changes already touch `src/renderer/markdown-editing-experience-probe.ts` and `scripts/probe-markdown-editing-experience.mjs`; probe work must preserve those changes.
- The current whitespace-only document materialization is an intentional short-term fix, but the architecture design marks it as a transitional wrong abstraction to replace in TASK-055.

## Doc Updates

- `MVP_BACKLOG.md`: add TASK-053 through TASK-058.
- `docs/progress.md`: add status rows for TASK-053 through TASK-058.
- `docs/plans/typora-like-editor/`: add oracle protocol and baseline report.

## Next Skill

`$fishmark-task-execution`
