# FishMark Editor Foundation Refactor Progress

**Program:** `REFACTOR-EDITOR-FOUNDATION`

**Roadmap:** `docs/refactor/editor-foundation/roadmap.md`

**Created:** 2026-07-11

**Last updated:** 2026-07-28

**Overall status:** `IN_PROGRESS`

**Current task:** `RF-101` — `DEV_DONE`; independent architecture acceptance and task acceptance pending

**Next required skill:** `$fishmark-architecture-acceptance` for `RF-101`, then `$fishmark-task-acceptance` if architecture passes

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
| M0 | Invariants and executable baselines | `COMPLETE` | 2 | 2 | Behavior matrix and architecture/performance baseline exist |
| M1 | Canonical workspace domain | `IN_PROGRESS` | 0 | 2 | Old main-local workspace service/application removed |
| M2 | Revisioned edit transport | `PLANNED` | 0 | 4 | Full-draft sync and renderer writable projection removed |
| M3 | Data safety and recovery | `PLANNED` | 0 | 4 | Inactive files protected; save/recovery/close are canonical |
| M4 | Recursive parser and incremental cache | `PLANNED` | 0 | 5 | One recursive parser remains; differential cache tests pass |
| M5 | Pure semantic editor model | `PLANNED` | 0 | 6 | All semantic commands migrated; old command engine removed |
| M6 | Thin CodeMirror adapter | `PLANNED` | 0 | 4 | Old `editor-core` package removed |
| M7 | Shared presentation and derived consumers | `PLANNED` | 0 | 3 | Editor/export/outline/metrics share canonical derived inputs |
| M8 | Renderer/main composition cleanup | `PLANNED` | 0 | 3 | React/main/preload are composition or presentation only |
| M9 | Performance, E2E, and security | `PLANNED` | 0 | 3 | Budgets, Playwright flows, and Electron security pass |
| M10 | Purge and final acceptance | `PLANNED` | 0 | 2 | No compatibility/dead code; final verdict `PASS` |

**Program completion:** 2 / 38 tasks.

## 3. Task ledger

Evidence columns are filled only with fresh command output/report paths from the task's own turn. A task cannot be marked `COMPLETE` with blank required evidence.

| ID | Task | Depends on | Status | Focused evidence | Full gates | Acceptance record | Commit/branch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-001 | Editing behavior baseline | — | `COMPLETE` | Canonical/formal runner, observer, protocol, launcher, identity, Typora conversion, listener, and process-tree boundaries accepted; fresh harness + driver: 27 files / 165 tests; public scenario: 121/121 steps in one batch. | Fresh formal Electron gate: 121/121 cases, 2,541/2,541 targets, 79 existing + 1,928 runner matches, 534 exact known defects, 0 unexpected, 0 not-run, 24.573s; public scenario 25.351s; editing experience 79/79; lint 0 errors (8 pre-existing warnings), typecheck, 135-file/1,487-test suite, build, and diff check passed. | Architecture `PASS`; task `PASS`; `reports/task-summaries/RF-001.md` | `codex/editor-foundation-refactor` |
| RF-002 | Architecture and performance guards | RF-001 | `COMPLETE` | Fresh public foundation gate 7 files/253 tests; fresh `perf:baseline` 23/23 contract checks and 7 files/253 tests. The manifest owns 73 exact CodeMirror targets; real micromark scan counters, resolved/case-folded repository paths, transparent dependency/site module arguments and literal `require` callees, and schema-v1 Vite module provenance close the reviewed evidence gaps. | Fresh lint 0 errors/8 pre-existing warnings; typecheck; 138-file/1,738-test suite; renderer/Electron/CLI build; exclusive formal behavior 121/121 cases and 2,541/2,541 targets with 79 existing + 1,928 runner + 534 known + 0 unexpected/not-run in 24.570s; ordinary dist 0 maps/0 provenance; diff check all passed. | Architecture `PASS` over `a6da237..53824a7`, 0 blocking findings/no open questions; task `PASS`; `reports/task-summaries/RF-002.md` | `codex/editor-foundation-refactor` at implementation head `53824a7` |
| RF-101 | Extract workspace domain | RF-002 | `DEV_DONE` | Production `@fishmark/workspace-domain`; independent location/object ownership registries; fail-closed filesystem identity resolution; prospective-location open locking; owner-tab lifecycle CAS; typed owner snapshot delivery before focus; opaque active close-save lease capability; one `tab -> location -> object` transaction order shared by open/save/reload/close and transfer; typed reload stale/error results; stateless latest-intent watcher ownership; persisted adapter validation; live sender/window validation; old service, duplicate close-save facade, legacy test dialog facade, and dead APIs deleted. | Fresh identity/domain/coordinator focus 3 files/58 tests; open/race focus 2/12; close/file focus 4/56; owner snapshot 7/220; reload error focus 40/40. Full gates: typecheck; 158 files/2,000 passed + 1 explicit Windows symlink capability skip; lint 0 errors/8 pre-existing warnings; renderer/workspace-domain/Electron/CLI build and runtime verifier; diff/residue checks passed. | Pending independent architecture acceptance, then task acceptance; execution handoff: `docs/plans/2026-07-16-rf-101-handoff.md` | `codex/editor-foundation-refactor`, implementation commits `387db42` through current RF-101 closure |
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
| 2026-07-16 / amended 2026-07-28 | `@fishmark/workspace-domain` owns the single canonical workspace/session state; main owns its only live instance and maps immutable projections to shared workspace snapshot DTOs. File-backed ownership is the conjunction of canonical location and filesystem object identity. | Draft mutation is a sender-derived owner compare-and-set; stale renderers neither mutate nor receive the target owner's projection. The coordinator owns tab/location/object lock ordering and issues opaque active capabilities for close-held IO. Duplicate open revalidates the owner under its tab lease and sends the synchronized owner snapshot before focus. Reload revision staleness and stable identity/read/conflict errors are distinct no-projection results. Native close carries one request generation and its multi-tab capability through confirmation/save/drain. No service facade, reload allow-stale path, parameterless close compatibility path, duplicate close-save facade, dual state, or dead application Save API remains. |

## 5. Latest accepted task handoff

### Task

`RF-002 — Architecture and performance guards`

### Status

`COMPLETE` — independent architecture acceptance and formal task acceptance passed on 2026-07-15. M0 is 2/2 complete. At that acceptance checkpoint, `RF-101` had not started; it is now tracked as the active task in the dashboard and ledger above.

### Goal

Freeze current dependency/parser lifecycle, one canonical 20,000-line RF fixture, honest operation counters, and deterministic emitted-bundle evidence before moving editor foundations.

### In scope

- One fail-closed architecture manifest for active/planned packages, parser lifecycle, exact debt exceptions, retirements, and public bundle checks.
- Registered public/internal document parser surfaces and supported direct micromark document-site forms.
- One committed, hash-bound 20,000-line Markdown fixture.
- Real current open/edit/selection/ordered-list/outline/metrics counters with explicit unavailable capability reasons.
- Schema-v1 Vite provenance and strict emitted Source Map validation, with `moduleIds` as forbidden source-group authority.

### Out of scope

- Recursive parser/cache implementation, parser worker, semantic command refactor, CodeMirror adapter extraction, workspace ownership migration, and persistence changes.
- Millisecond CI thresholds or claims of incremental reuse that does not exist yet.
- User-visible syntax, formatting, selection, IME, undo, autosave, or save behavior changes.

### Landing area

- `fixtures/architecture/editor-foundation-guard.json`
- `fixtures/performance/complex-20000-lines.md`
- `fixtures/performance/editor-foundation-current-baseline.json`
- `src/main/editor-foundation-architecture*.ts`
- `packages/markdown-engine/src/parse-instrumentation.ts`
- `packages/editor-core/src/performance/`
- `src/renderer/performance/`
- `scripts/analyze-renderer-bundle.mjs`
- `scripts/bundle-provenance-evidence.mjs`
- `scripts/vite-bundle-provenance.ts`

### Acceptance

- The canonical manifest is versioned, non-empty, exact, lifecycle-owned, and fail-closed for invalid paths/rules, stale debt, boundary bypasses, and unauthorized parser surfaces/sites.
- The committed RF fixture is exactly 20,000 LF-only lines and matches SHA-256 `545601ad9d770898e23e5551e938bcaa4ebaecd8446941a4145a4db8777f6d37` before measurement.
- Every operation exposes deterministic integer counters. Unavailable incremental behavior remains zero with `incremental-structure-cache-not-implemented`.
- Bundle JSON/provenance are deterministic, schema-versioned, hash-bound, graph-authoritative, and explicit about emitted maps versus `NOT_EMITTED`.
- No compatibility identity-map/helper or dead subordinate formatter remains in RF-002 scope.
- Product behavior remains unchanged under the formal Electron gate.

### Verification

```powershell
npm.cmd run test:editor-foundation
npm.cmd run perf:baseline
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:editor-behavior
git diff --check
```

### Risks

- Current full scans are intentionally high and incremental reuse remains unavailable until RF-404/RF-405.
- The 73 exact CodeMirror edges remain RF-604 deletion debt.
- Timing remains machine-dependent until RF-901.
- The 534 known editing defects remain later-roadmap work.
- Focus-derived geometry observation settlement should be hardened separately without changing calibration or editor behavior.

### Documentation updates

- Architecture decision and `TC-060A` are recorded.
- Fresh evidence is in `docs/test-report.md`.
- Formal result and manual steps are in `reports/task-summaries/RF-002.md`.
- The independent RF roadmap/progress ledger is complete for RF-002; unrelated MVP backlog/progress were intentionally not changed.

### Next skill

`$fishmark-architecture-acceptance` for the `RF-101` implementation range, followed by `$fishmark-task-acceptance` only if the architecture review passes.

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
| 2026-07-15 | RF-002 | Final architecture closure added transparent-wrapper/computed-property micromark detection, transparent literal module-argument and literal `require` callee evidence, reverse-unique active package rules and resolved/case-folded repository path identities; replaced inferred parse-entry counts with explicit micromark document-scan instrumentation; deleted subordinate formatters; and replaced Source Map text-coverage/identity-map assumptions with schema-v1 two-phase Vite provenance. Provenance `moduleIds` are the only forbidden source-group authority; emitted maps are integrity validated and attested mapless chunks are `NOT_EMITTED`. | Initial architecture RED 145/131 pass + 14 expected failures -> GREEN 145/145. Post-`3e0c34e` RED 164/146 pass + 18 expected failures -> GREEN 164/164. Post-`3d8c2b4` RED 177/166 pass + 11 expected failures -> GREEN 177/177. Fresh public foundation 7 files/253 tests; fresh `perf:baseline` passed all 23 canonical checks and 7 files/253 tests. Exact full scans are open 504, edit 502, selection 0, ordered-list 503, outline 502, metrics 503. | Fresh lint 0 errors/8 pre-existing warnings; typecheck; 138 files/1,738 tests; renderer/Electron/CLI build; exclusive formal behavior 121/121 cases and 2,541/2,541 targets with 79 existing/1,928 runner/534 known/0 unexpected/0 not-run in 24.570s; ordinary dist 0 maps/0 provenance; diff check PASS. | Architecture `PASS` over `a6da237..53824a7`, 0 blocking findings/no open questions; task `PASS`; `reports/task-summaries/RF-002.md` | M0 is 2/2 `COMPLETE` and program is 2/38. Final closure commits: `3e0c34e`, `3d8c2b4`, `53824a7`. Earlier execution-phase focus-derived visibility-only flakes were isolated and followed by clean repeats; the first exclusive formal acceptance run was clean. No calibration/runtime change was made. |
| 2026-07-16 / amended 2026-07-28 | RF-101 | Added the production runtime-neutral workspace-domain package and hard-cut main from the old service. Final review closure added independent location/object ownership validation, fail-closed object-ID resolution, prospective-location open locking, owner-tab lifecycle CAS, synchronized owner snapshot delivery, opaque close-held lease capabilities, and typed reload failures; it also removed the duplicate close-save facade and legacy dialog-shaped test facade. | RED reproduced mixed-index overwrite/release corruption, stat-error fallback, final-location drift, Save As creation/open, open/owner-close, expired capability, owner renderer snapshot, and typed reload error cases. GREEN uses `tab -> location -> object` ordering, validates both identity components, rechecks owner lifecycle under its tab lease, and sends owner state before focus. Fresh identity/domain/coordinator 58/58; open/race 12/12; close/file 56/56; owner snapshot 220/220; reload 40/40. | Fresh lint 0 errors/8 pre-existing warnings; typecheck; 158 files/2,000 passed plus 1 explicit Windows symlink capability skip; renderer/workspace-domain/Electron/CLI build and emitted runtime verifier; diff and obsolete-token scans passed. | Pending independent architecture and task acceptance; no verdict recorded by execution. | M1 remains 0/2 complete and program remains 2/38 until acceptance. `RF-102` remains blocked on RF-101 `COMPLETE`; implementation closure commit recorded in task handoff. |

## 8. Blockers and deviations

There are no accepted external blockers or roadmap deviations. RF-001 and RF-002 are complete. M0 is 2/2 `COMPLETE`, and program completion remains 2/38. `RF-101` is the only active task at `DEV_DONE`; implementation and development gates are complete, but independent architecture and task acceptance are still required. `RF-102` has not started.

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
