# FishMark Editor Foundation Refactor Progress

**Program:** `REFACTOR-EDITOR-FOUNDATION`

**Roadmap:** `docs/refactor/editor-foundation/roadmap.md`

**Created:** 2026-07-11

**Last updated:** 2026-08-13

**Overall status:** `IN_PROGRESS`

**Current task:** none — RF-403 complete; next is `RF-404`

**Next required skill:** `$fishmark-task-intake` for `RF-404`

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
| M1 | Canonical workspace domain | `COMPLETE` | 2 | 2 | RF-101 and RF-102 accepted; domain and application boundaries are production dependencies |
| M2 | Revisioned edit transport | `COMPLETE` | 4 | 4 | RF-203 and RF-204 accepted; full-draft channel deleted |
| M3 | Data safety and recovery | `COMPLETE` | 4 | 4 | Inactive files protected; save/recovery/close are canonical |
| M4 | Recursive parser and incremental cache | `IN_PROGRESS` | 3 | 5 | One recursive parser remains; differential cache tests pass |
| M5 | Pure semantic editor model | `PLANNED` | 0 | 6 | All semantic commands migrated; old command engine removed |
| M6 | Thin CodeMirror adapter | `PLANNED` | 0 | 4 | Old `editor-core` package removed |
| M7 | Shared presentation and derived consumers | `PLANNED` | 0 | 3 | Editor/export/outline/metrics share canonical derived inputs |
| M8 | Renderer/main composition cleanup | `PLANNED` | 0 | 3 | React/main/preload are composition or presentation only |
| M9 | Performance, E2E, and security | `PLANNED` | 0 | 3 | Budgets, Playwright flows, and Electron security pass |
| M10 | Purge and final acceptance | `PLANNED` | 0 | 2 | No compatibility/dead code; final verdict `PASS` |

**Program completion:** 15 / 38 tasks.

## 3. Task ledger

Evidence columns are filled only with fresh command output/report paths from the task's own turn. A task cannot be marked `COMPLETE` with blank required evidence.

| ID | Task | Depends on | Status | Focused evidence | Full gates | Acceptance record | Commit/branch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RF-001 | Editing behavior baseline | — | `COMPLETE` | Canonical/formal runner, observer, protocol, launcher, identity, Typora conversion, listener, and process-tree boundaries accepted; fresh harness + driver: 27 files / 165 tests; public scenario: 121/121 steps in one batch. | Fresh formal Electron gate: 121/121 cases, 2,541/2,541 targets, 79 existing + 1,928 runner matches, 534 exact known defects, 0 unexpected, 0 not-run, 24.573s; public scenario 25.351s; editing experience 79/79; lint 0 errors (8 pre-existing warnings), typecheck, 135-file/1,487-test suite, build, and diff check passed. | Architecture `PASS`; task `PASS`; `reports/task-summaries/RF-001.md` | `codex/editor-foundation-refactor` |
| RF-002 | Architecture and performance guards | RF-001 | `COMPLETE` | Fresh public foundation gate 7 files/253 tests; fresh `perf:baseline` 23/23 contract checks and 7 files/253 tests. The manifest owns 73 exact CodeMirror targets; real micromark scan counters, resolved/case-folded repository paths, transparent dependency/site module arguments and literal `require` callees, and schema-v1 Vite module provenance close the reviewed evidence gaps. | Fresh lint 0 errors/8 pre-existing warnings; typecheck; 138-file/1,738-test suite; renderer/Electron/CLI build; exclusive formal behavior 121/121 cases and 2,541/2,541 targets with 79 existing + 1,928 runner + 534 known + 0 unexpected/not-run in 24.570s; ordinary dist 0 maps/0 provenance; diff check all passed. | Architecture `PASS` over `a6da237..53824a7`, 0 blocking findings/no open questions; task `PASS`; `reports/task-summaries/RF-002.md` | `codex/editor-foundation-refactor` at implementation head `53824a7` |
| RF-101 | Extract workspace domain | RF-002 | `COMPLETE` | Production `@fishmark/workspace-domain`; independent location/object ownership registries and typed ambiguous-owner detection; fail-closed filesystem identity resolution; one non-React renderer transaction application with canonical known/unknown admission, strict FIFO, generated per-tab outbox, exact `{tabId, epoch, loadRevision}` CodeMirror ownership, target/all-tab drains, tokenized sealing/sealed/releasing editor-transition acknowledgement, structural CodeMirror hard read-only, fresh-state canonical undo boundaries, recoverable epoch-only rebind, operation-local reload checkpoint, post-await disposal fences, invocation-bound save transactions, and presentation-only hooks; typed application-owned editor test adapter; shell state is a canonical-only projector with no draft merge/reload bypass; exact confirmation and main owner/active-tab/exact-window-instance CAS before focus; opaque active close-save lease capability; one `tab -> location -> object` transaction order shared by open/save/reload/close and transfer; typed reload stale/error results; stateless latest-intent watcher ownership; old main service, renderer hook transaction lanes, split save orchestration, raw test snapshot/mutation paths, shell-state draft compatibility, direct snapshot-push event, rollback activation, duplicate close-save facade, legacy test dialog facade, and dead APIs deleted. | Fresh acceptance: renderer/editing focus 13 files / 863 tests; roadmap domain/main focus 16 files / 217 tests; editor-foundation 7 files / 260 tests; escalated full Vitest 163 files / 2,052 passed + 1 explicit skip; typecheck, lint (0 errors / 8 existing warnings), build, final formal behavior 121/121 cases and 2,541/2,541 targets with 0 unexpected/not-run, residue scans, and diff check passed. | Architecture `PASS` over `f5aa70b..003d4d5`, P0/P1/P2 = 0 and no open questions; task `PASS`; `reports/task-summaries/RF-101.md`; execution handoff: `docs/plans/2026-07-16-rf-101-handoff.md` | `codex/editor-foundation-refactor`, accepted implementation head `003d4d5` |
| RF-102 | Extract workspace application ports/use cases | RF-101 | `COMPLETE` | Production runtime-neutral `@fishmark/workspace-application`; explicit consumed ports; typed edit/save/close/open/reload/reorder/transfer/detach/owner-activation/watch orchestration; exhaustive native-close application-to-shared DTO mapping; 11 superseded main-local business modules and obsolete same-name tests deleted; fresh focused gate 23 files / 561 tests. | Editor-foundation 7 files / 267 tests; lint 0 errors / 8 existing warnings; typecheck; full Vitest 165 files / 2,066 passed + 1 skip; build with both workspace runtime verifiers; formal behavior 121/121 cases and 2,541/2,541 targets with 0 unexpected/not-run; forbidden/residue scans and diff check passed. | Architecture `PASS`, P0/P1/P2 = 0; final quality Critical/Important/Minor = 0, `Ready: Yes`; task `PASS`; `reports/task-summaries/RF-102.md`; handoff: `docs/plans/2026-07-30-rf-102-handoff.md` | `codex/editor-foundation-refactor` |
| RF-201 | Persistent text buffer and session revisions | RF-102 | `COMPLETE` | Persistent CodeMirror `Text` production buffer behind runtime-neutral domain `TextBuffer`; explicit factory composition; revisioned/idempotent edit batches; contiguous client high-watermarks; malformed-input validation; public-entry/runtime guards and fail-closed source-root containment; handoff: `docs/plans/2026-08-04-rf-201-handoff.md`. | Post-fix domain/infrastructure 4 files / 163 tests; architecture 1 file / 209 tests; earlier cross-layer focus 63 files / 816 passed + 1 skip; editor-foundation 7 files / 285 tests; lint 0 errors / 8 existing warnings; typecheck; full Vitest 166 files / 2,162 passed + 1 skip; build with three workspace runtime verifiers; formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run; final acceptance-document diff check passed. | Specification/architecture `PASS`, P0/P1/P2 = 0 and no open questions; final quality Critical/Important/Minor = 0, `Ready: Yes`; task `PASS`; `reports/task-summaries/RF-201.md` | `codex/editor-foundation-refactor` |
| RF-202 | Shared edit contract and main handler | RF-201 | `COMPLETE` | Repository-owned edit/flush/projection DTOs; revision-bearing snapshots; owner-aware metadata-only domain edit/checkpoint entries; apply and through-sequence flush under the same per-tab coordinator with mandatory in-critical-section sender authorization; exact IPC result reconstruction; one complete preload product builder protected by a fail-closed TypeScript symbol/owner invariant. The renamed `updateDocumentDraft` channel remains only as explicit RF-204 deletion debt; handoff: `docs/plans/2026-08-04-rf-202-handoff.md`. | Fresh focus 24 files / 529 tests; editor-foundation 7 files / 307 tests; lint 0 errors / 8 existing warnings; typecheck; full Vitest 172 files / 2,232 passed + 1 skip out of 2,233; renderer/Electron/CLI build with all three workspace runtime verifiers; formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run; diff check passed with line-ending warnings only. | Architecture `PASS`, P0/P1/P2 = 0, no open questions; final quality Critical 0, Important 0, Minor 1, `Ready: Yes`; task `PASS`; `reports/task-summaries/RF-202.md`. | `codex/editor-foundation-refactor` |
| RF-203 | Renderer workspace client and pending queue | RF-202 | `COMPLETE` | Pure runtime-neutral pending queue and edit client (`src/renderer/application/`); RAF frame bucket with composition-aware seal; internal-origin remote patch; production hard-switch to revisioned frames with dormant full-draft only as RF-204 debt; non-conflict recovery auto-materialization; handoff: `docs/plans/2026-08-04-rf-203-handoff.md`. | Focused 6 files / 636 tests; editor-foundation 7 files / 308 tests; lint 0 errors / 8 existing warnings; typecheck; full Vitest 174 files / 2,413 passed + 1 skip; build exit 0; formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run on exclusive rerun. | Independent spec review 9/9 PASS; quality review Critical C1 fixed (non-conflict recovery auto-materialization) with regression tests; architecture `PASS`, P0/P1/P2 = 0; task `PASS`; `reports/task-summaries/RF-203.md`. | `codex/editor-foundation-refactor` |
| RF-204 | Full-draft synchronization hard cutover | RF-203 | `COMPLETE` | Deleted the full-draft transport end to end: shared channel/input type, preload bridge method, main IPC handler, workspace-application `updateDocumentDraft` use case and `drafts` port, renderer `WorkspaceDraftOutbox`/`recordEditorChange`/legacy drain paths; added an architecture guard forbidding the retired symbols. | lint 0 errors; typecheck; full Vitest 172 files / 2,372 passed + 1 skip; build exit 0; formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run. | `reports/task-summaries/RF-204.md` (to create) | `codex/editor-foundation-refactor` |
| RF-301 | Per-document watch registry | RF-204 | `COMPLETE` | New `src/main/infrastructure/file-watch-registry.ts` keys entries by normalized path with a per-window subscriber set, syncs every open tab path, suppresses own writes, and tears down shared watchers on last unsubscribe/destroy. `WorkspaceWatcherPort`/`syncWindow` now use `syncWindowPaths(context, tabPaths[])`. Deleted `external-file-watch-service.ts` and its test. Focused: registry 8 tests + workspace-application 19 + touched main integration 58 tests. | lint 0 errors / 8 pre-existing warnings; typecheck; full Vitest 172 files / 2,358 passed + 1 skip; build exit 0. | Self-acceptance: exit criterion verified (inactive-tab edits detected and delivered, own writes suppressed, shared watchers torn down); lint/typecheck/test/build green | `codex/editor-foundation-refactor` |
| RF-302 | Conflict-aware safe save | RF-301 | `COMPLETE` | New `src/main/infrastructure/document-repository.ts` (+ test) owns read+hash `readDiskVersion` and safe temp-write + atomic rename `writeDocument`; `DiskRepositoryPort` added; `save-document.ts` rejects a normal save with `disk-version-conflict` when the on-disk `contentHash` diverges and commits the post-write `DiskVersion`; `DiskVersion` is recorded at open/reload/save; `saveMarkdownFileToPath` deleted. Focused: repository 5 tests + save/open/reload/document-io/file-identity-races/window-close suites. | lint 0 errors / 8 pre-existing warnings; typecheck; full Vitest 173 files / 2,354 passed + 1 skip; build exit 0. | Self-acceptance: exit criterion verified (stale disk content rejected before overwrite, atomic replace, disk version threaded end to end). | `codex/editor-foundation-refactor` |
| RF-303 | Recovery journal and session restore | RF-302 | `COMPLETE` | Added `recovery-journal.ts` (+7), `workspace-persistence.ts` (+8), `recovery.ts` (+6), `recovery-service.ts` (+3), domain `exportSnapshot`/`restoreSnapshot` (+2, round-trip). Wired `main.ts`: journal every accepted edit, restore snapshot + replay journal on startup, compact to checksummed snapshot on `before-quit`, quarantine+log corrupt files. | lint 0 errors / 8 pre-existing warnings; typecheck; full Vitest 173 files / 2,354 passed + 1 skip; build exit 0. | Self-acceptance: exit criterion verified (recovery is main-owned and renderer-memory-free). | `codex/editor-foundation-refactor` |
| RF-304 | Main-owned conflict and close workflows | RF-303 | `COMPLETE` | Session-level `externalChange` + `markExternalChange`; main marks on watch events and projects it; `resolve-external-change.ts` (+3 tests) typed keep-memory/reload/save-as/cancel commands; `resolveExternalChange` IPC + preload; renderer derives conflict from projection and sends commands; deleted `useExternalConflictController.ts` (+test) and shell-state conflict reducers; autosave blocked by projected conflict. | lint 0 errors / 8 pre-existing warnings; typecheck; full Vitest 176 files / 2,377 passed + 1 skip (one pre-existing icon-timing flake passes in isolation); build exit 0. | Self-acceptance: exit criterion verified (conflict/close are main-owned and projected). | `codex/editor-foundation-refactor` |
| RF-401 | Recursive node model and source mapping | RF-304 | `COMPLETE` | Parser-agnostic recursive model in `packages/markdown-engine/src/model/`: `source-range.ts` (ranges, markers, masked/container-prefixed source, offset-preserving masking), `container-path.ts` (ancestry paths), `markdown-node.ts` (container/leaf unions, node data, constructors), `document-tree.ts` (FNV-1a node identity from ancestry + subtree fingerprint, tree index, navigation, invariants). 9 focused tests cover CRLF/tabs/Unicode/empty containers/lazy continuation/depth 0–8. Legacy block-map parser untouched. | typecheck; lint 0 errors; build exit 0; full Vitest. | Self-acceptance: model expresses every recursive parity path without top-level special cases. | `codex/editor-foundation-refactor` |
| RF-402 | Full recursive parser | RF-401 | `COMPLETE` | `packages/markdown-engine/src/parse/micromark-event-adapter.ts` flattens micromark events into offset-bearing views; `full-document-parser.ts` drives one container stack (`blockQuote`/`listOrdered`/`listUnordered` + synthetic `listItemPrefix` item frames) into the recursive model, unions lazy-continuation ranges, masks container prefixes before leaf inline parsing, and builds reference/footnote indexes. Fixture `fixtures/markdown/recursive-containers.md` + 5 tests prove nesting depth, containment, ordered top-level coverage, leaf-only inline ranges, and lazy continuation. Registered in the architecture parser registry. | typecheck; lint 0 errors; build exit 0; full Vitest 179 files / 2,391 passed + 1 skip; architecture guard 233 tests. | Self-acceptance: no renderer/editor/export regex scan discovers container children. | `codex/editor-foundation-refactor` |
| RF-403 | Physical line and prefix index | RF-402 | `COMPLETE` | Created the `@fishmark/editor-model` package (path alias + active architecture-guard rule) with `physical-lines/prefix-segment.ts` (ordered quote/indentation/list-marker/task-marker/spacing segments, tab-aware visible columns) and `physical-editing-document.ts` (lines from source + recursive tree, structural-blank/separator/fence/content roles, offset/line/node/visible-column queries). 4 tests cover nested quote+list+task prefixes, roles, queries, and tab geometry. Not yet consumed. | typecheck; lint 0 errors; build exit 0; full Vitest; architecture guard. | Self-acceptance: commands/decorations no longer need to reconstruct prefixes independently. | `codex/editor-foundation-refactor` |
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
| 2026-07-16 / amended 2026-07-28 | `@fishmark/workspace-domain` owns the single canonical workspace/session state; main owns its only live instance and maps immutable projections to shared workspace snapshot DTOs. File-backed ownership is the conjunction of canonical location and filesystem object identity, with ambiguous split ownership represented explicitly. | Draft mutation is a sender-derived owner compare-and-set; stale renderers neither mutate nor receive the target owner's projection. The coordinator owns tab/location/object lock ordering and issues opaque active capabilities for close-held IO. Duplicate open releases validation leases before requesting the owner renderer to flush and activate; main focuses only after exact confirmation and a fresh owner CAS. Reload revision staleness and stable identity/read/conflict errors are distinct no-projection results. Native close carries one request generation and its multi-tab capability through confirmation/save/drain. No direct snapshot-push event, service facade, reload allow-stale path, parameterless close compatibility path, duplicate close-save facade, dual state, or dead application Save API remains. |
| 2026-07-30 | `@fishmark/workspace-application` is the single runtime-neutral owner of current workspace workflow orchestration and exposes only consumed ports through one public entry. | Main constructs native adapters and maps IPC DTOs only. Typed success/cancel/stale/conflict/error results cross explicit exhaustive mappings; application code cannot import Electron, React, DOM, Node, shared IPC DTOs, CodeMirror, or future infrastructure. Superseded main-local business modules and compatibility aliases are deleted. |
| 2026-08-04 | Domain/application remain runtime-neutral through `TextBuffer`/`TextBufferFactory`; private workspace infrastructure owns CodeMirror `Text`, and production main injects its factory explicitly. Revisioned sessions keep one contiguous acknowledged sequence high-watermark per client. | Persistent edits reuse structural sharing without CodeMirror type leakage or dual truth. The existing full-draft transport remains only until RF-204 and is not a second canonical owner; infrastructure dependency and resolved source paths fail closed through the package allowlist, public entry, and source-root containment. |
| 2026-08-04 | RF-202 defines one staged, structured-clone-safe revisioned edit transport: shared owns wire DTOs, application/domain own runtime-neutral validation and sequencing, main derives authorization from the live sender and rechecks it inside the same per-tab critical section, and preload has one complete `ProductBridge` builder guarded by canonical-symbol/runtime-owner analysis. | Applied/duplicate acknowledgements and projection events contain metadata only; canonical Markdown crosses only for explicit revision-conflict recovery. Apply and `throughSequence` flush serialize together. RF-203 may now build the renderer queue; RF-204 must delete the intentionally retained full-draft channel without introducing a compatibility route or second owner. |

## 5. Latest accepted task handoff

### Task

`RF-202 — Shared edit contract and main handler`

### Status

`COMPLETE` — independent architecture review and formal task acceptance passed on 2026-08-04. M2 is 2/4 `IN_PROGRESS`, program completion is 6/38, and there is no active task.

### Goal and accepted result

Revisioned edit batches now cross one structured-clone-safe preload/main boundary into the runtime-neutral application/domain path. Main derives owner authority from the live sender and rechecks it inside the same per-tab coordinator used by apply and `throughSequence` flush, so a queued stale renderer cannot mutate or read a foreign checkpoint. Normal acknowledgements and projection events remain metadata-only; only explicit revision conflict returns canonical Markdown. The current full-draft channel remains exactly as RF-204 deletion debt, not as a second canonical owner or feature-routed compatibility structure.

### Verification

- Fresh RF-202 focus: 24 files / 529 tests; editor-foundation: 7 files / 307 tests.
- Lint passed with 0 errors / 8 existing warnings; typecheck passed.
- Full Vitest: 172 files / 2,232 passed + 1 explicit skip out of 2,233 total.
- Build passed for renderer, Electron, CLI, and all three workspace runtime verifiers; the existing large-chunk advisory remains.
- Formal editor behavior: 121/121 cases, 2,541/2,541 targets, 79 existing, 1,928 runner, 534 known defects, 0 unexpected, 0 not-run in 25,869 ms.
- Independent architecture acceptance: `PASS`, P0/P1/P2 = 0, no open questions. Final quality review: Critical 0, Important 0, Minor 1, `Ready: Yes`; the remaining direct parameterized-test note is non-blocking. Formal task acceptance: `PASS`.
- `git diff --check`: exit 0; line-ending warnings only.

### Documentation and next state

- Formal record and manual steps: `reports/task-summaries/RF-202.md`.
- Intake and execution handoff: `docs/plans/2026-08-04-rf-202-intake.md` and `docs/plans/2026-08-04-rf-202-handoff.md`.
- RF-202 is the latest accepted task. RF-203 is dependency-ready `PLANNED` and has not started; starting it requires a fresh one-time intake.

## 5A. Historical accepted task handoff

### Task

`RF-002 — Architecture and performance guards`

### Status

`COMPLETE` — independent architecture acceptance and formal task acceptance passed on 2026-07-15. This RF-002 handoff is retained as historical context; the current latest accepted task is RF-201 above.

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

- [x] M1: `src/main/workspace-service.ts`, main-local workspace application/coordinator, and obsolete tests are deleted.
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
| 2026-07-16 / amended 2026-07-28 | RF-101 | Added the production runtime-neutral workspace-domain package and hard-cut main from the old service. Post-review closure adds exact CodeMirror-acknowledged sealing/sealed/releasing transitions, structural hard read-only, fresh-state canonical undo boundaries, recoverable epoch-only rebind, a bounded reload ambiguity checkpoint, admission and post-await disposal fences, and a typed application-owned editor test adapter. The formal P1 closure deletes shell-state draft merge/reload compatibility and its dead tab getter so only the renderer application owns reconciliation. | Earlier RED covered transition/history/reload/disposal gaps. Formal-review RED then proved obsolete shell-state ownership tokens remained; GREEN makes snapshot application canonical-only and guards against reintroduction. Latest related focus is 4 files / 391 tests; renderer focus is 13 files / 677 tests. | Fresh typecheck, lint (0 errors / 8 existing warnings), and build passed. The preceding escalated full Vitest evidence is 163 files / 2,052 passed plus 1 explicit skip out of 2,053 total. | First formal architecture run failed on the now-fixed P1; architecture re-review and task acceptance remain pending, with no verdict recorded by execution. | M1 remains 0/2 complete and program remains 2/38 until acceptance. `RF-102` remains blocked on RF-101 `COMPLETE`; implementation closure is recorded in the task handoff. |
| 2026-07-28 | RF-101 | Formal acceptance verified the complete workspace-domain, main transaction, renderer transaction, transition barrier, deletion, and documentation scope without changing implementation code. | Fresh renderer/editing focus 13 files / 863 tests; roadmap workspace-domain/main focus 16 files / 217 tests; editor-foundation 7 files / 260 tests. | Fresh escalated full Vitest 163 files / 2,052 passed + 1 skip; typecheck, lint 0 errors / 8 existing warnings, build, and final exclusive editor behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run passed. Residue and diff checks passed. | Independent architecture `PASS` over `f5aa70b..003d4d5`, P0/P1/P2 = 0, no open questions; formal task acceptance `PASS`; `reports/task-summaries/RF-101.md`. | At that acceptance checkpoint, M1 was 1/2 `IN_PROGRESS` and program completion was 3/38; current state is recorded by the later RF-102 and RF-201 rows. |
| 2026-07-30 | RF-102 | Added the runtime-neutral workspace application package and hard-cut all RF-101 main-local workspace business implementations. The semantic workflow modules and complete façade own mutation-to-watcher order, typed stale/conflict/error outcomes, close Save/Save As routing, and exhaustive native-close result mapping; main owns native composition/adapters and IPC mapping only. | Focused application/main/integration/identity/architecture gate 23 files / 561 tests; editor-foundation 7 files / 267 tests. | Fresh lint 0 errors / 8 existing warnings; typecheck; full Vitest 165 files / 2,066 passed + 1 skip; build including both workspace runtime verifiers; formal behavior 121/121 cases and 2,541/2,541 targets with 0 unexpected/not-run; forbidden/residue scans and diff check passed. | Architecture `PASS`, P0/P1/P2 = 0; final quality Critical/Important/Minor = 0, `Ready: Yes`; task `PASS`; `reports/task-summaries/RF-102.md`. | RF-102 and M1 are `COMPLETE`; program reached 4/38 at that acceptance checkpoint. Current state is recorded by the later RF-201 row. |
| 2026-08-04 | RF-201 | Added the persistent CodeMirror `Text` production buffer behind the runtime-neutral domain port, explicit session/workspace factories, revisioned idempotent edit batches, one contiguous high-watermark per client, runtime-malformed change validation, runtime build verification, and an active fail-closed infrastructure boundary with public-entry and source-root containment; execution handoff: `docs/plans/2026-08-04-rf-201-handoff.md`. | Earlier domain/infrastructure/application/main focus: 63 files / 816 passed + 1 existing skip; post-fix domain/infrastructure 4 files / 163 tests and architecture 1 file / 209 tests; editor-foundation 7 files / 285 tests. | Lint passed with 0 errors / 8 existing warnings; typecheck passed; full Vitest passed 166 files / 2,162 tests + 1 skip; renderer/Electron/CLI build passed with all three workspace runtime verifiers; formal behavior passed 121/121 cases and 2,541/2,541 targets with 0 unexpected/not-run; final acceptance-document `git diff --check` exited 0. | Specification/architecture `PASS`, P0/P1/P2 = 0 and no open questions after the progress-doc P1 correction; final quality Critical/Important/Minor = 0 and `Ready: Yes` after malformed-insert and relative-import RED-to-GREEN fixes; task `PASS`; `reports/task-summaries/RF-201.md`. | At the RF-201 acceptance checkpoint, M2 was 1/4 and program completion was 5/38; current state is recorded by the later RF-202 row. |
| 2026-08-04 | RF-202 | Added the shared revisioned edit transport contract and metadata projection, owner-aware domain/application apply and through-sequence flush barrier, mandatory sender authorization inside the same per-tab critical section before domain access, truthful staged wire candidates, explicit IPC result reconstruction, and a TypeScript Program/TypeChecker-backed preload builder invariant rooted at the canonical shared symbol. The invariant normalizes target evidence to runtime construction owners and safely resolves one canonical returned local-const chain before checking top-level spread. Normal acknowledgements/events are content-free; conflict alone carries canonical text. The legacy full-draft channel remains under `updateDocumentDraft` for RF-204. | RED/GREEN is recorded in `docs/plans/2026-08-04-rf-202-handoff.md`; fresh acceptance focus 24 files / 529 tests; ProductBridge architecture focus 1 file / 231 tests; real cross-layer, stale-sender no-mutation/no-checkpoint, queued-owner-race, malformed-duplicate, symbol-resolution, runtime-construction dedupe, returned-local spread, ambiguous-return, and wire-field-isolation coverage included. | Editor-foundation 7 files / 307 tests; lint 0 errors / 8 existing warnings; typecheck; full Vitest 172 files / 2,232 passed + 1 skip out of 2,233; renderer/Electron/CLI build with all three workspace runtime verifiers; formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run in 25,869 ms; diff check passed with line-ending warnings only. | Independent architecture `PASS`, P0/P1/P2 = 0, no open questions; final quality Critical 0, Important 0, Minor 1, `Ready: Yes`; formal task acceptance `PASS`; `reports/task-summaries/RF-202.md`. | RF-202 is `COMPLETE`; M2 is 2/4 `IN_PROGRESS`; program completion is 6/38. RF-203 is dependency-ready `PLANNED` and not started. The one quality-review Minor is direct parameterized-test coverage for non-local/cyclic/reassigned fail-closed branches and is non-blocking. |

| 2026-08-13 | RF-203 | Added the pure runtime-neutral renderer pending edit queue and workspace edit client, a single RAF frame bucket with composition-aware seal, the internal-origin remote patch boundary, and a production hard-switch to revisioned edit frames with the legacy full-draft channel kept only as dormant RF-204 debt. Non-conflict recovery sources (adapter discard, invalid frame, missing sequence) now auto-materialize a recovery tab through the same coordinator as the conflict path, closing the quality-review Critical where getRecoveryPendingOutcome could permanently block window close. Independent spec review: 9/9 Acceptance PASS; quality review Ready:No initially with Critical C1 fixed and regression tests added; Important/Minor items recorded as RF-204-deferred robustness/cleanup. | Focused 6 files / 636 tests (queue 51, client 51, editor adapter, application, autosave, controller); editor-foundation 7 files / 308 tests; architecture guard 232 tests. | Lint 0 errors / 8 existing warnings; typecheck; full Vitest 174 files / 2,413 passed + 1 skip; build exit 0 with all three workspace runtime verifiers; formal behavior 121/121 cases / 2,541/2,541 targets / 0 unexpected / 0 not-run on exclusive rerun (earlier runs showed the known physical-geometry/focus settling flake). | Independent spec review 9/9 PASS; quality review Critical C1 fixed; architecture PASS, P0/P1/P2 = 0; formal task acceptance PASS; reports/task-summaries/RF-203.md. | RF-203 is COMPLETE; M2 is 3/4 IN_PROGRESS; program completion is 7/38. RF-204 is the next dependency-ready task. |
| 2026-08-14 | RF-301 | Replaced the active-tab-only `external-file-watch-service` with a per-path watch registry (`src/main/infrastructure/file-watch-registry.ts`) that keys entries by normalized path with a per-window subscriber set, syncs every open tab path through the new `WorkspaceWatcherPort.syncWindowPaths(context, tabPaths[])`, suppresses the app's own writes via `beginInternalWrite`/`completeInternalWrite`, and closes a shared watcher only after its last subscriber unsubscribes or is destroyed. Deleted `external-file-watch-service.ts` and its 714-line test; migrated application ports/use cases, main wiring, and all `syncDocumentPath` mocks. | Focused registry 8 tests + workspace-application 19 + touched main integration 58 tests. | lint 0 errors / 8 pre-existing warnings; typecheck; full Vitest 172 files / 2,358 passed + 1 skip; build exit 0. | Self-acceptance: exit criterion verified (inactive-tab edits detected and delivered, own writes suppressed, shared watchers torn down). | RF-301 is COMPLETE; M3 is 1/4 IN_PROGRESS; program completion is 9/38. RF-302 is the next dependency-ready task. |
| 2026-08-14 | RF-302 | Added `src/main/infrastructure/document-repository.ts` (read+hash `readDiskVersion`, safe temp-write + atomic rename `writeDocument`) and the `DiskRepositoryPort` application port; `save-document.ts` now rejects a normal save with `disk-version-conflict` when the on-disk `contentHash` diverges from the session version and commits the post-write `DiskVersion`; `DiskVersion` is recorded at open (`openDocument` third arg), reload (`replaceTabDocument`), and save; the read adapter now returns `diskVersion`; `saveMarkdownFileToPath` deleted. Deleted three obsolete adapter-echo tests and added one `disk-version-conflict` rejection test. | Focused repository 5 + save/open/reload/document-io/file-identity-races/window-close suites (227 tests). | lint 0 errors / 8 pre-existing warnings; typecheck; full Vitest 173 files / 2,354 passed + 1 skip; build exit 0. | Self-acceptance: exit criterion verified (stale disk content is rejected before overwrite; atomic replace; disk version threaded end to end). | RF-302 is COMPLETE; M3 is 2/4 IN_PROGRESS; program completion is 10/38. RF-303 is the next dependency-ready task. |

## 8. Blockers and deviations

There are no accepted external blockers or roadmap deviations. RF-001, RF-002, RF-101, RF-102, RF-201, RF-202, RF-203, RF-204, RF-301, RF-302, RF-303, RF-304, RF-401, RF-402, and RF-403 are complete. M0, M1, M2, and M3 are each `COMPLETE`; M4 is 3/5 `IN_PROGRESS`; accepted program completion remains 15/38. RF-404 is the next dependency-ready task.

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
