# FishMark Editor Foundation Refactor Progress

**Program:** `REFACTOR-EDITOR-FOUNDATION`

**Roadmap:** `docs/refactor/editor-foundation/roadmap.md`

**Created:** 2026-07-11

**Last updated:** 2026-07-14

**Overall status:** `IN_PROGRESS`

**Current task:** `RF-002` — Architecture and performance guards

**Next required skill:** `$fishmark-architecture-acceptance` for `RF-002`, followed by `$fishmark-task-acceptance`

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
| M0 | Invariants and executable baselines | `IN_PROGRESS` | 1 | 2 | Behavior matrix and architecture/performance baseline exist |
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

**Program completion:** 1 / 38 tasks.

## 3. Task ledger

Evidence columns are filled only with fresh command output/report paths from the task's own turn. A task cannot be marked `COMPLETE` with blank required evidence.

| ID | Task | Depends on | Status | Focused evidence | Full gates | Acceptance record | Commit/branch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-001 | Editing behavior baseline | — | `COMPLETE` | Canonical/formal runner, observer, protocol, launcher, identity, Typora conversion, listener, and process-tree boundaries accepted; fresh harness + driver: 27 files / 165 tests; public scenario: 121/121 steps in one batch. | Fresh formal Electron gate: 121/121 cases, 2,541/2,541 targets, 79 existing + 1,928 runner matches, 534 exact known defects, 0 unexpected, 0 not-run, 24.573s; public scenario 25.351s; editing experience 79/79; lint 0 errors (8 pre-existing warnings), typecheck, 135-file/1,487-test suite, build, and diff check passed. | Architecture `PASS`; task `PASS`; `reports/task-summaries/RF-001.md` | `codex/editor-foundation-refactor` |
| RF-002 | Architecture and performance guards | RF-001 | `DEV_DONE` | Architecture guard 96/96; analyzer contract 30/30; final unified focused gate 7 files/156 tests. `perf:baseline` loaded and passed the same manifest-owned 23 emitted-bundle checks, then passed 156/156 focused tests; 73 exact CodeMirror targets equal scanner evidence. | lint 0 errors/8 existing warnings; typecheck; 138-file/1,640-test suite; build with 0 ordinary `.map` artifacts; diff checks; prior formal behavior 121/121 cases and 2,541/2,541 targets with 0 unexpected/not-run remains applicable because this repair changed no product runtime file. | Architecture `FAIL` at `869b9f9`; four P1 repairs pending architecture re-review, then task acceptance; `docs/plans/2026-07-14-rf-002-handoff.md` | `codex/editor-foundation-refactor` |
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

## 5. Latest accepted task handoff

### Task

`RF-001 — Editing behavior baseline`

### Status

`COMPLETE` — architecture and task acceptance passed on 2026-07-14. `RF-002` is `DEV_DONE` under its separate execution handoff; architecture acceptance failed at `869b9f9`, returned to execution, and is pending re-review after all four P1 findings were repaired.

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
- `src/renderer/editor-behavior-manifest-runner.ts`
- `src/renderer/editor-behavior-observer.ts`
- `scripts/probe-editor-behavior.mjs`
- `docs/test-cases.md`
- `docs/refactor/editor-foundation/progress.md`

### Acceptance

- Every command/container path in roadmap section 7.7 has at least one typed case.
- Enter, Backspace, Tab, Shift+Tab, ArrowUp/Down, selection, repeat, and undo expectations are explicit.
- Cases at depth 0–8 exist for representative mixed containers.
- Known defects are labeled and are not adopted as desired behavior.
- Scenario filtering can select a command or container path.
- Every canonical checkpoint/aspect target is exactly one validated `Verified` or `known-defect-observed` value; pre-composition gaps are eliminated.
- Typed observations and persisted provenance are bound to the exact case/checkpoint/aspect; equal values cannot be reused across cases, replacement uses structural equality against the checkpoint-owned expected result, and dynamic observations reject non-finite numbers and catalog-owned probe provenance.
- Named probe registry entries are bound to the catalog through the actual `run.name`, and verified FishMark provenance is narrowed exactly during manifest composition without a generic model/catalog dependency cycle.
- Opaque code/math projection consumes a CommonMark-equivalent ordered outer quote/list signature, exits and reprocesses a line when the container no longer continues, and only accepts closing delimiters with a matching prefix and 0–3 relative spaces.
- `fixtures/editor-behavior` is the only fixture public entry; the test harness exposes scenario APIs but no fixture compatibility facade.
- A test-only Electron batch runner re-executes every selected target; ordinary headless scenario steps fail closed and are never counted as passes.

### Verification

```powershell
npm.cmd run test -- packages/test-harness src/renderer/editor-test-driver.test.ts
npm.cmd run test:editor-behavior
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

`$fishmark-architecture-acceptance` for `RF-002`, followed by `$fishmark-task-acceptance`

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
| 2026-07-14 | RF-001 | Added the single-window Electron manifest runner and hardened it with canonical/formal support ports, line-local observation, aspect-mapped values, deterministic calibration identity, catalog-driven Typora conversion, calibration-independent raw cases, disposable step abort listeners, and bounded cross-platform process-tree ownership; corrected top-level and quoted nested-list Shift+Tab contracts without changing product runtime behavior. | Fresh harness + driver 27 files / 165 tests; public scenario 121/121 one batch; architecture review also confirmed formal identity, listener, timeout/abort/nonzero/root-exited descendant, hung Windows terminator, POSIX group escalation, test-window security, and no compatibility/dead path. | Fresh formal runner 121/121 and 2,541/2,541 in 24.573s with 79 existing/1,928 runner/534 known/0 unexpected/0 not-run; legacy 79/79; lint 0 errors/8 existing warnings; typecheck; 135-file/1,487-test suite; build; diff check all passed. | Architecture `PASS`; task `PASS`; `reports/task-summaries/RF-001.md` | Raw JSON remains ignored; calibration `fnv1a32-2a007600` persists 2,007 explicit verified targets and 534 exact typed defect observations from run `d7705d03-b141-46dd-8b4b-4559024c14bc`. The 534 observations are later-roadmap product work, not unexecuted RF-001 targets. |
| 2026-07-14 | RF-002 | Slice A added the fail-closed package/import/parser lifecycle guard; Slice B froze the committed 20,000-line fixture/current counters; Slice C added deterministic emitted-bundle evidence. Architecture acceptance at `869b9f9` then failed four P1s and returned the task to execution: wildcard CodeMirror debt, weak package/rule binding, missing require/import-equals syntax and CLI-owned bundle policy. The repair deleted the allowance path, registered 73 scanner-equal exact exceptions, enforced one-to-one matching package rules, closed import-type/import-equals/literal-require scanning and moved all 23 public bundle checks into the same manifest contract. | Repair architecture RED 96 tests/24 expected failures -> GREEN 96/96; analyzer contract RED 30 tests/10 expected failures -> GREEN 30/30; unified focused gate 7 files/156 tests; real `perf:baseline` passed 23/23 manifest checks plus 156/156 tests. Earlier analyzer/source-map/virtual-map RED/GREEN evidence remains recorded in the execution handoff. | lint 0 errors/8 existing warnings; typecheck; 138 files/1,640 tests; build with 0 ordinary `.map` artifacts; diff checks passed. Prior formal behavior gate remains 121/121 cases, 2,541/2,541 targets, 534 exact known defects, 0 unexpected/not-run; repair changed no product runtime and did not rerun Electron behavior. | Architecture `FAIL` at `869b9f9`; returned to execution; re-review pending, then task acceptance | M0 remains 1/2 and program 1/38. No product editing behavior, fixture identity, stable counter baseline or roadmap target changed. Manifest is the only package/import/parser/bundle policy data; package script contains no baseline policy flags/values. |

## 8. Blockers and deviations

There are no accepted external blockers or roadmap deviations. RF-001 is complete: its explicit 2,007 verified targets and 534 exact target mismatches cover the whole contract, and the mismatches are recorded current product defects for later roadmap tasks rather than unexecuted evidence. RF-002 implementation is `DEV_DONE`; architecture re-review and task acceptance are the only allowed next phases, and RF-101 must not start before both pass. M0 remains 1/2 and program completion remains 1/38 until acceptance succeeds.

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
