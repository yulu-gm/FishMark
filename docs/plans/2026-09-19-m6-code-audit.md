# M6 code audit and bounded implementation contract

Date: 2026-09-19. Scope: current uncommitted RF-601/RF-506 code in the main checkout, not the older refactor worktree. Read-only audit; this report does not certify milestone completion or claim fresh test results. Baseline: architecture-acceptance skill and its architecture, testing, and documentation references.

## Blocking findings in the adapter before production activation

- **P1 — foreign plan/session acceptance.** `packages/codemirror-adapter/src/transaction-adapter.ts`, `preparePlan`, substitutes the current generation when `EditorPlanSessions.read(plan)` returns null. A plan from another adapter with the same revision is accepted despite the stated foreign-session contract. `recordEditorDispatch` checks revision and text but not the prepared session's generation/tab, so a matching state after rebind can admit an old frame. Require provenance and validate session identity at dispatch/record boundaries; test two views with equal revisions and rebind between prepare and record. Sent directly to the M5 runtime agent.
- **P1 — transport rejection hidden at the command boundary.** `packages/editor-core/src/commands/semantic-keypress.ts`, `applyPreparedSemanticCommand`, ignores `recordEditorDispatch`'s outcome; `extensions/markdown.ts` supplies synthetic admitted sequence 0 when there is no frame callback. Production must have one transport admission owner shared by typing, semantic commands, undo/redo, and composition. Prefer the existing host update listener/queue; do not duplicate dispatch admission or silently lose an edited frame. A dispatched command must remain consumed, while a persistence/admission failure must remain observable. Sent to M5 runtime agent.
- Composition and history code has a reasonable separation, but helper tests do not prove production wiring. The extension currently has its own composition runtime guard while the adapter exposes another lifecycle. Freeze layout/structural commands through the same actual browser lifecycle and keep text updates flowing to the existing queue; verify end-of-composition refresh and tab rebind. This is an integration obligation, not evidence that native IME already fails.

Result for the inspected adapter's unrestricted production activation: **FAIL** until the first two findings and production integration are resolved. This is not a verdict on code written after the audit.

### Follow-up implementation and focused evidence

Parent subsequently authorized bounded fixes in adapter guards and model physical-line indexing. Unknown-origin plans are now rejected, late receipts validate current generation/tab and provenance, and a receipt can be admitted only once. `frames` is optional for the production host-observed transport mode; explicit record calls then report `rejected: host-observed`. Runtime agent owns the production single-listener integration.

Physical-document construction now indexes sibling starts and prefix maximum ends (preserving first-overlap semantics), and binary-searches line coverage for fences and node queries instead of scanning all siblings/lines repeatedly. Model-agent-requested fixes also retain an empty final caret line after a terminal newline (including an empty document), and recognize container-prefixed matching fence closers. Deterministic regression bounds range-property reads for 2,000 sibling nodes and compares nested/CRLF lookup results to the original traversal; focused physical/derived/context run passed 4 files / 26 tests.

The parent's same local cache/snapshot measurement script now reports 5k lines at 7.7–17.2 ms per warm edit and 20k at 28.1–33.0 ms (20k snapshot 7–11 ms, cache 20–25 ms), versus the parent's measured ~300 ms and ~4.8–5.3 seconds respectively before indexing. This is cache + snapshot CPU time, not input-to-paint proof. Output: `.artifacts/rf506-cache-measurement.json`. A broader concurrent model+adapter run had 178 passing / 4 failing tests: two EOF Backspace policies and two navigation expectations, passed to the model agent for resolution. No milestone PASS is claimed from this intermediate run.

A fixture consisting of 2,000 blank-separated numbered plain paragraphs stalled inside `parseFullDocumentTree` for more than 30 seconds during investigation and was interrupted; the mixed heading/paragraph performance fixture did not. The deterministic physical-index test therefore constructs a legal tree independently of that parser path. Parser behavior on repeated sibling shapes remains a separate unresolved measurement issue reported to the parent.

## Dependency order and completion boundaries

1. Finish RF-506 production command routing and remove superseded semantic planners/entry points, with full-runtime behavior checkpoints. Adapter boundary fixes above are prerequisites.
2. RF-701: create `markdown-presentation` with a pure render-plan builder over the canonical tree, and land an actual editor consumer in this same slice. The package does not exist at audit time. Roles, ranges, marker spans, preview capabilities, fallback text and nested traversal belong here; DOM, active editing visibility, pixels and theme CSS do not.
3. RF-602: use the adapter's canonical `DocumentStructureCache` and revision-keyed `EditorDerivedSnapshot` for render-plan and selection consumers. Migrate geometry/decorations with one owner. RF-701 and this slice may be developed together, but a render-plan sidecar unused by production does not satisfy either.
4. RF-603: finish widgets and typed interaction adapters on canonical nodes and semantic command submission; own async lifecycle and measurement at the adapter boundary.
5. RF-604: switch renderer imports/factory, remove editor-core and its obsolete configuration. Re-run editing/geometry/round-trip behavior checks after deletion, not only before the import rename.

M6 may depend on the small RF-701 prerequisite without claiming M7 complete. RF-702/703 HTML export, outline and metrics consumer work remains separately scoped. Do not silently enlarge M6 to their entire migration.

## Actual responsibilities and consumers

| Responsibility | Current code | Final owner and deletion obligation |
| --- | --- | --- |
| CM state, transaction filter, lifecycle, keymap and geometry | `editor-core/src/extensions/markdown.ts` (~1,300 lines), `markdown-shortcuts.ts` | `codemirror-adapter`; split by ownership, not file size. Remove the old runtime once renderer switches. |
| Document parsing and semantic snapshot | `derived-state/markdown-document-cache.ts`, `block-map-cache.ts`, `editor-derived-state.ts`; new `editorStructureCacheField` | One canonical cache in adapter, pure revision snapshot in editor-model. Delete old source-keyed parser/cache and duplicate physical-document reconstruction; a compatibility data projection may be derived from the canonical tree but must not parse again. |
| Pure physical/source/selection logic | `physical-editing-document.ts`, `active-block.ts`, `table-cursor-state.ts`, `context/*`, structural/source helpers | Existing editor-model/markdown-engine responsibilities; reuse or extend them. Do not move these pure semantics into adapter merely to delete the directory. |
| Block and inline decoration decisions | `decorations/block-decorations.ts`, `inline-decorations.ts`, `block-lines.ts`, `signature.ts`, `derived-state/inactive-block-decorations.ts` | Pure semantic plan in markdown-presentation; CM ranges, active/source presentation gating in adapter. Delete old traversal that re-derives semantic structure. |
| DOM navigation, table focus/selection | `interactions/{registry,context,types}.ts`, three adapters; large table section of `extensions/markdown.ts` | Typed adapter interaction registry. Keep coordinate measurement in CM; semantic offset decisions in model. |
| Table edits and widget callbacks | `decorations/table-widget.ts`, extension callbacks | Node/session-aware callbacks submit model plans. Preserve focus and cell selection without retaining stale source positions or independent text state. |
| Image/math/Mermaid/highlight | `decorations/*-widgets.ts`, preview renderer modules, code-highlight modules | Adapter presentation + shared pure render metadata. Keep lazy renderer loading; disposal/generation checks and measurement are mandatory. |
| Runtime construction/API | `src/renderer/code-editor.ts`, `code-editor-view.tsx` | Renderer calls adapter public API; preserves existing workspace edit client/queue ownership. |
| Public types and behavior probes | `editor-behavior-observer.ts`, `editor-behavior-manifest-runner.ts`, `editor/{WorkspaceShell,App,shortcut-hint-overlay}.tsx`, `performance/{document-derived-ui,editor-foundation-performance-report}.ts` | Move imports to legitimate model/adapter/performance owners; no fake editor-core re-export package. |

Also remove editor-core aliases, bundler group entries, TypeScript paths, architecture guard exceptions and obsolete README claims once all consumers have migrated. Keep tests that exercise retained behavior; rewrite their imports/contracts rather than delete coverage to obtain a green run.

## Performance and layout facts the implementation must change

- `extensions/markdown.ts:createLiveEditorDerivedState` calls `createEditorDerivedState` on every read; the old derived builder reconstructs physical lines, table cursor, active state, semantic context and outline even for selection changes. A source cache prevents a parser call on identical text but does not prevent those full-document passes.
- Activating `editorStructureCacheField` while retaining the old `markdownDocumentCache` means the same edit updates two parser-derived representations. Production performance counters must instrument actual parser calls, not only the new cache's reported counters.
- `block-decorations.ts:createBlockDecorations` loops all physical lines and blocks. The selection-scoped path falls back to this full build whenever the active physical line changes. Therefore ordinary ArrowDown is still potentially full-document decoration work.
- `block-decorations.ts` can collect missing reference and footnote definitions. Eliminate source-scan fallbacks from production decoration callers; canonical indexes must be provided, including the empty case.
- `blockDecorationsField` currently provides decorations directly via `EditorView.decorations.from(field)`. Preserve this correct ordering for tables, block previews and cross-line replacements. Moving these into a viewport-dependent ViewPlugin produces a circular dependency between viewport and height. Indirect viewport work is limited to layout-safe marks/inline presentation; layout structures need direct stable ranges before viewport calculation.
- Math/Mermaid widget promises currently have no disposal/generation check, and image preview loads have no explicit measurement request. Add lifecycle guards so removed/rebound widget work is discarded and accepted async height changes request CM measurement. Test scroll anchor stability during load and source/preview toggles.
- New editor-model snapshots are cached by cache object, correctly reusing document work across selections. They still create a full physical document for each new revision. M6 evidence must count that cost rather than call the pipeline fully incremental merely because parser count is zero. Optimize only with measured need and preserve correctness.

## Minimum meaningful acceptance evidence

- Production renderer factory consumes adapter and shared render plan; no production editor-core imports remain and package deletion is real.
- Selection-only/viewport-only updates reuse canonical document snapshot and do not invoke parser or rebuild all block decorations; tests count real builders on a large fixture.
- Plain edits plus structural fallback, nested list/quote/table, reference/footnote dependencies and multi-range transactions retain exact source and stable selection.
- Geometry probes cover table entry/exit, tall block previews, scroll during async preview load, viewport entry/exit, source toggling, composition freeze/final refresh, and stale widget callbacks after edit/rebind.
- Input performance is measured through the production editor path, including command/transaction/derive/decorations and subsequent paint; candidate parser zero-full-scan counts alone do not demonstrate user latency.
- Parent acceptance runs fresh full build/lint/typecheck/tests and formal editing probes against final code. Native IME results must name tested platform; synthetic composition is not a substitute for a real platform claim.
