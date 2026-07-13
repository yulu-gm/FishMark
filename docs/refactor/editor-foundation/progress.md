# FishMark Editor Foundation Refactor Progress

**Program:** `REFACTOR-EDITOR-FOUNDATION`

**Roadmap:** `docs/refactor/editor-foundation/roadmap.md`

**Created:** 2026-07-11

**Last updated:** 2026-07-14

**Overall status:** `IN_PROGRESS`

**Current task:** `RF-001`

**Next required skill:** `$fishmark-task-execution` for the executable RF-001 evidence runner

## 1. Status vocabulary

Only these states are valid:

- `PLANNED`: scoped in the roadmap but implementation has not started.
- `IN_PROGRESS`: the task is the only active implementation task.
- `DEV_DONE`: implementation and focused verification are complete; formal acceptance is pending.
- `ACCEPTING`: architecture/task acceptance is running.
- `BLOCKED`: acceptance or implementation cannot continue without an external decision or state change; the blocker is written below.
- `COMPLETE`: implementation, deletion obligations, docs, required gates, and acceptance all passed.

At most one `RF-xxx` task may be `IN_PROGRESS` or `ACCEPTING` at a time. A later task cannot start until its dependencies are `COMPLETE`.

## 2. Program dashboard

| Milestone | Purpose | Status | Complete | Total | Blocking gate |
| --- | --- | --- | ---: | ---: | --- |
| M0 | Invariants and executable baselines | `IN_PROGRESS` | 0 | 2 | Behavior matrix and architecture/performance baseline exist |
| M1 | Canonical workspace domain | `PLANNED` | 0 | 2 | Old main-local workspace service/application removed |
| M2 | Revisioned edit transport | `PLANNED` | 0 | 4 | Full-draft sync and renderer writable projection removed |
| M3 | Data safety and recovery | `PLANNED` | 0 | 4 | Inactive files protected; save/recovery/close are canonical |
| M4 | Recursive parser and incremental cache | `PLANNED` | 0 | 5 | One recursive parser remains; differential cache tests pass |
| M5 | Pure semantic editor model | `PLANNED` | 0 | 6 | All semantic commands migrated; old command engine removed |
| M6 | Thin CodeMirror adapter | `PLANNED` | 0 | 4 | Old `editor-core` package removed |
| M7 | Shared presentation and derived consumers | `PLANNED` | 0 | 3 | Editor/export/outline/metrics share canonical derived inputs |
| M8 | Renderer/main composition cleanup | `PLANNED` | 0 | 3 | React/main/preload are composition or presentation only |
| M9 | Performance, E2E, and security | `PLANNED` | 0 | 3 | Budgets, Playwright flows, and Electron security pass |
| M10 | Purge and final acceptance | `PLANNED` | 0 | 2 | No compatibility/dead code; final verdict `PASS` |

**Program completion:** 0 / 38 tasks.

## 3. Task ledger

Evidence columns are filled only with fresh command output/report paths from the task's own turn. A task cannot be marked `COMPLETE` with blank required evidence.

| ID | Task | Depends on | Status | Focused evidence | Full gates | Acceptance record | Commit/branch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-001 | Editing behavior baseline | — | `IN_PROGRESS` | Evidence correction: matrix 1 file / 23 tests; harness + driver: 14 files / 91 tests; defect evidence: 2 files / 78 tests. | lint: 0 errors (8 pre-existing warnings); typecheck passed; full test: 119 files / 1390 tests; build passed. The prior 79-case probe run is historical regression evidence, not proof that all typed matrix aspects executed. | Executable geometry/repeat/undo/mode evidence pending before acceptance | `codex/editor-foundation-refactor` |
| RF-002 | Architecture and performance guards | RF-001 | `PLANNED` | — | Test + perf baseline | — | — |
| RF-101 | Extract workspace domain | RF-002 | `PLANNED` | — | lint/typecheck/test/build | — | — |
| RF-102 | Extract workspace application ports/use cases | RF-101 | `PLANNED` | — | lint/typecheck/test/build | — | — |
| RF-201 | Persistent text buffer and session revisions | RF-102 | `PLANNED` | — | typecheck/test/build | — | — |
| RF-202 | Shared edit contract and main handler | RF-201 | `PLANNED` | — | typecheck/test | — | — |
| RF-203 | Renderer workspace client and pending queue | RF-202 | `PLANNED` | — | typecheck/test | — | — |
| RF-204 | Full-draft synchronization hard cutover | RF-203 | `PLANNED` | — | lint/typecheck/test/build | — | — |
| RF-301 | Per-document watch registry | RF-204 | `PLANNED` | — | typecheck/test/build | — | — |
| RF-302 | Conflict-aware safe save | RF-301 | `PLANNED` | — | typecheck/test/build | — | — |
| RF-303 | Recovery journal and session restore | RF-302 | `PLANNED` | — | typecheck/test/build | — | — |
| RF-304 | Main-owned conflict and close workflows | RF-303 | `PLANNED` | — | lint/typecheck/test/build/scenario | — | — |
| RF-401 | Recursive node model and source mapping | RF-304 | `PLANNED` | — | typecheck/test | — | — |
| RF-402 | Full recursive parser | RF-401 | `PLANNED` | — | typecheck/test | — | — |
| RF-403 | Physical line and prefix index | RF-402 | `PLANNED` | — | typecheck/test | — | — |
| RF-404 | Incremental structure cache | RF-403 | `PLANNED` | — | test/perf baseline | — | — |
| RF-405 | Parser hard cutover | RF-404 | `PLANNED` | — | lint/typecheck/test/build | — | — |
| RF-501 | Semantic context and derived snapshot | RF-405 | `PLANNED` | — | typecheck/test | — | — |
| RF-502 | Enter planner | RF-501 | `PLANNED` | — | focused behavior tests | — | — |
| RF-503 | Backspace and Delete planners | RF-502 | `PLANNED` | — | focused behavior tests | — | — |
| RF-504 | Indent, navigation, and selection policies | RF-503 | `PLANNED` | — | focused behavior tests | — | — |
| RF-505 | Formatting, table, and fence planners | RF-504 | `PLANNED` | — | command package tests | — | — |
| RF-506 | Semantic engine hard cutover | RF-505 | `PLANNED` | — | lint/typecheck/test/build | — | — |
| RF-601 | Transaction bridge, history, and IME | RF-506 | `PLANNED` | — | adapter tests | — | — |
| RF-602 | Viewport-scoped decorations | RF-601 | `PLANNED` | — | adapter tests/perf | — | — |
| RF-603 | Interaction adapters and widgets | RF-602 | `PLANNED` | — | adapter/visual tests | — | — |
| RF-604 | CodeMirror adapter hard cutover | RF-603 | `PLANNED` | — | lint/typecheck/test/build/probes | — | — |
| RF-701 | Semantic render plan | RF-604 | `PLANNED` | — | typecheck/test | — | — |
| RF-702 | HTML export cutover | RF-701 | `PLANNED` | — | test/build | — | — |
| RF-703 | Outline and metrics cutover | RF-702 | `PLANNED` | — | test/perf baseline | — | — |
| RF-801 | Non-React workspace client/store | RF-703 | `PLANNED` | — | typecheck/test | — | — |
| RF-802 | React shell decomposition | RF-801 | `PLANNED` | — | lint/typecheck/test | — | — |
| RF-803 | Main/preload composition split | RF-802 | `PLANNED` | — | lint/typecheck/test/build | — | — |
| RF-901 | Final performance gate | RF-803 | `PLANNED` | — | perf/editing probes | — | — |
| RF-902 | Playwright Electron data-safety/editing suite | RF-901 | `PLANNED` | — | build/e2e | — | — |
| RF-903 | Electron security hardening | RF-902 | `PLANNED` | — | test/build/e2e | — | — |
| RF-1001 | Dead code and compatibility purge | RF-903 | `PLANNED` | — | lint/typecheck/test/build/bundle | — | — |
| RF-1002 | Final architecture/behavior/docs acceptance | RF-1001 | `PLANNED` | — | all final gates | — | — |

## 4. Current accepted decisions

| Date | Decision | Consequence |
| --- | --- | --- |
| 2026-07-11 | Main-process `DocumentSession` is the sole writable business document truth. | Renderer sends revisioned edit commands and cannot maintain an independently writable workspace document snapshot. |
| 2026-07-11 | CodeMirror local input is represented as an ordered pending command queue. | Optimistic typing is allowed; save/switch/move/detach/reload/close require `flushEdits()`. |
| 2026-07-11 | Main text storage uses a domain `TextBuffer` port backed by CodeMirror `Text` in infrastructure. | Persistent text performance is reused without exposing CodeMirror types through domain contracts. |
| 2026-07-11 | Markdown containers use one recursive tree. | Lists, blockquotes, and their children share the same leaf semantics and source-range model. |
| 2026-07-11 | Incremental structure caching is a foundation requirement. | Selection changes do not parse; local edits invalidate bounded windows; fresh parse is the only correctness fallback. |
| 2026-07-11 | Editing experience has higher priority than syntax count and visual features. | Enter, Backspace, cursor, IME, undo, and round-trip gates can block every migration task. |
| 2026-07-11 | No permanent compatibility layer or dead code is allowed. | Every milestone ends with a hard cutover and deletion task. |
| 2026-07-11 | No parser worker is introduced in this program. | The synchronous incremental model must first meet measured budgets; another process requires a separate decision. |

## 5. Active task handoff

### Task

`RF-001 — Editing behavior baseline`

### Goal

Create one executable behavior corpus for structural Markdown editing before changing parser, document ownership, semantic commands, or CodeMirror integration.

### In scope

- Consolidating existing Typora oracle cases, FishMark editing probes, and relevant unit cases.
- Adding recursive list/blockquote/code-fence paths required by the roadmap.
- Recording source, selection, visible-line role, repeat-operation, and undo expectations.
- Separating intended behavior from current known defects.

### Out of scope

- Changing editor behavior.
- Fixing current defects.
- Introducing new parser/cache/domain packages.
- Changing product UI.

### Landing area

- `fixtures/editor-behavior/`
- `packages/test-harness/src/scenarios/`
- `src/renderer/editor-test-driver.ts`
- `docs/test-cases.md`
- `docs/refactor/editor-foundation/progress.md`

### Acceptance

- Every command/container path in roadmap section 7.7 has at least one typed case.
- Enter, Backspace, Tab, Shift+Tab, ArrowUp/Down, selection, repeat, and undo expectations are explicit.
- Cases at depth 0–8 exist for representative mixed containers.
- Known defects are labeled and are not adopted as desired behavior.
- Scenario filtering can select a command or container path.
- Every current-evidence aspect is either verified by a matching probe/test or explicitly marked as a coverage gap.
- A test-only runner executes the matrix before RF-001 returns to `DEV_DONE`; metadata-only scenario steps are never counted as passes.

### Verification

```powershell
npm.cmd run test -- packages/test-harness src/renderer/editor-test-driver.test.ts
npm.cmd run test:editing-experience
```

### Risks

- Accidentally treating current implementation quirks as the target contract.
- Overfitting to Typora where FishMark has an explicit round-trip or cross-platform requirement.
- Capturing DOM classes instead of source/selection/geometry semantics.

### Documentation updates

- Update this task row and evidence fields.
- Add stable manual behavior cases to `docs/test-cases.md`.
- Record implementation evidence in `docs/test-report.md` only after execution.
- Add a task summary under `reports/task-summaries/` after acceptance.

### Next skill

`$fishmark-task-execution` for the executable evidence runner slice

## 6. Milestone deletion checklist

A milestone cannot become `COMPLETE` until its row below is checked.

- [ ] M1: `src/main/workspace-service.ts`, main-local workspace application/coordinator, and obsolete tests are deleted.
- [ ] M2: full-draft update IPC, renderer local content projection mutation, snapshot-preservation logic, and old mocks are deleted.
- [ ] M3: active-tab-only watcher and renderer-owned external conflict controller/state are deleted.
- [ ] M4: old block-map parser, rich-parser stitching, container rescans, and duplicate inline parsing paths are deleted.
- [ ] M5: old semantic commands, physical-line/prefix parsers, and semantic context implementations are deleted.
- [ ] M6: `packages/editor-core` and its aliases/imports are deleted after valid code is moved.
- [ ] M7: export/outline/metrics parser duplication and duplicate semantic render helpers are deleted.
- [ ] M8: direct privileged bridge calls from components and workflow effects in React/main entry files are deleted.
- [ ] M9: temporary performance logging, unrestricted asset paths, unsandboxed renderer configuration, and missing E2E placeholders are deleted.
- [ ] M10: every remaining compatibility symbol, unused dependency, dead export, stale test, stale probe, and contradictory document is deleted or corrected.

## 7. Evidence log

Append one entry when a task changes to `DEV_DONE`, then amend the same entry after acceptance. Do not add entries for planning-only discussion.

| Date | Task | Change summary | Focused verification | Full gates | Acceptance | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13 | RF-001 | Added the first typed recursive editing-behavior corpus, exact filtering, one harness scenario, and stable documentation; corrected one stale table-exit probe expectation without changing runtime behavior. | Matrix 1/13; harness + driver 14/81; defect evidence 2/78. | Editing experience 79 cases passed; lint, typecheck, 119-file/1380-test suite, and build passed. | Superseded before acceptance | A 2026-07-14 specification review found that metadata-only parity cases had been overstated as executable evidence. RF-001 returned to `IN_PROGRESS`; this row is historical regression evidence only. |

## 8. Blockers and deviations

There are no accepted external blockers or roadmap deviations.

RF-001 has an internal execution gap that must be completed before acceptance:

- all 70 required command/container-path pairs have typed desired expectations but the current driver does not execute their semantic geometry, repeat, undo, and view-mode assertions;
- the 33 named FishMark probes are mapped to typed evidence, but each probe may verify only a subset of the RF-001 aspects;
- the two current known defects expose only the actual planner result or semantic path proven by matching unit tests; they do not claim unmeasured editor geometry;
- the next RF-001 slice must add one test-only manifest runner that returns source, selection, physical-line geometry, repeated-operation checkpoints, undo result, and view-mode result without changing product IPC or runtime behavior.

Any deviation must record:

1. affected task and requirement;
2. concrete evidence that the roadmap path is invalid;
3. replacement design and dependency impact;
4. deletion impact and whether compatibility code would be introduced;
5. user approval date;
6. corresponding update to both `roadmap.md` and this file.

Performance difficulty, test volume, or implementation inconvenience alone is not a valid reason to weaken document truth, editing behavior, round-trip safety, or deletion requirements.

## 9. Progress update procedure

When starting a task:

1. Confirm all dependencies are `COMPLETE`.
2. Change only that task to `IN_PROGRESS`.
3. Set `Current task` and `Next required skill` at the top.
4. Re-read the roadmap task, current accepted decisions, and deletion obligation.

When implementation finishes:

1. Add focused command output/report paths to the ledger.
2. Add full gate evidence required by the roadmap.
3. Change status to `DEV_DONE`.
4. Append one evidence-log row.
5. Invoke architecture acceptance and task acceptance.

When acceptance passes:

1. Record both acceptance results and task-summary paths.
2. Verify the task's required deletions and documentation updates.
3. Change status to `COMPLETE`.
4. Update milestone counts/status.
5. Select the next dependency-ready task; do not start it in the acceptance diff.

When acceptance fails:

1. Keep the same task active.
2. Record findings in its evidence-log row.
3. Return to `$fishmark-task-execution` for the same task.
4. Do not advance milestone counts.

## 10. Final completion checklist

- [ ] All 38 task rows are `COMPLETE`.
- [ ] All 11 milestone rows are `COMPLETE`.
- [ ] Every milestone deletion item is checked.
- [ ] Main owns canonical text/revision/save/disk/conflict/recovery state.
- [ ] Revisioned edit transport is the only editing path.
- [ ] Recursive parser/cache differential tests pass.
- [ ] Nested list/blockquote semantics match top-level leaf capabilities.
- [ ] Enter/Backspace/Tab/arrows/selection/IME/undo/round-trip matrices pass.
- [ ] `packages/editor-core` and every compatibility path are gone.
- [ ] Renderer presentation contains no business workflow ownership.
- [ ] Performance budgets pass with fresh evidence.
- [ ] Playwright data-safety/editing scenarios pass.
- [ ] Electron sandbox/CSP/sender/path security gates pass.
- [ ] `npm run lint`, `typecheck`, `test`, and `build` pass.
- [ ] Bundle, performance, editing-experience, and E2E gates pass.
- [ ] Architecture acceptance result is `PASS`.
- [ ] Task acceptance result is `PASS`.
- [ ] Stable docs, backlog, progress, test cases/report, package READMEs, and task summaries agree.
