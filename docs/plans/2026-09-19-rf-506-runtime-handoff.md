# RF-506 runtime execution handoff — 2026-09-19

Scope: production semantic cutover. This is execution evidence; the parent owns independent acceptance, all-repository gates, formal Electron corpus and M6.

## Implemented

- The production Markdown extension always installs the adapter and binds Enter, Backspace, Delete, Tab and navigation to editor-model plans. Formatting shortcuts, list moves, table toolbar/controller calls and table widget callbacks share the same adapter bindings.
- `packages/codemirror-adapter/src/semantic-keypress.ts` owns command preparation and dispatch. It is publicly exported. There is no optional old-engine route and no fallback to legacy Markdown editing rules.
- View geometry still resolves rendered navigation targets; those targets become model pointer-selection plans. Physical layout/decorations remain the M6 migration area.
- The renderer's existing update listener remains the sole document-frame owner. Semantic dispatch does not submit its pre-normalization frame to a second queue. The old fake frame-admission callback option was removed.
- Composition begin/end updates the adapter guard. Composition completion and decoration refresh share one effect dispatch. Stale/frozen commands cannot fall through to native structural edits.
- Renderer identity changes rebind adapter generations; document replacement releases the old adapter and binds the new one to the current tab. Destruction releases the session.
- Coarse legacy-versus-candidate parity aggregation was retired because both routes now use the same model. Actual production tests replace it with planner spies and behavioral assertions.

## Validation

Command:

```powershell
node node_modules/vitest/vitest.mjs run src/renderer/code-editor.test.ts src/renderer/code-editor-semantic-runtime.test.ts packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts packages/editor-core/src/commands/toggle-inline-commands.test.ts --reporter=json --outputFile=.artifacts/rf506-runtime-accepted-candidate.json
```

Result: **5 files, 302 tests passed**, including all 273 existing controller behavior cases. Existing behavior expectations were not relaxed. The table CRLF harness now constructs `Text.of(doc.split("\n"))` so CodeMirror actually retains CR characters; its original source-offset expectations remain unchanged.

The four new real-controller tests prove model routing for key/controller, formatting shortcut, table toolbar and widget input; one final host frame and undo; stale plans across identity/load changes and session release; and composition structural-command freezing.

Native application menus currently contain file/window/export operations and native Edit roles, not a separate Markdown formatting consumer. Do not invent a fifth product route to satisfy an abstract checklist.

## Remaining parent verification

- Run formal Electron full-checkpoint corpus, editing experience, build/lint/typecheck and full tests after the model/normalization cleanup agents finish.
- Confirm architecture retirement guard and no production legacy semantic imports after cleanup.
- M6 still owns layout/decorations/viewport/widget/cache ownership and measured actual input latency. Pure navigation and rendering geometry must remain distinct.
- The pre-existing string-based production initial state normalizes CRLF to LF. This is outside this cutover fix but should be evaluated explicitly against round-trip requirements; the test harness correction does not claim production CRLF preservation.

## Manual verification draft

1. In the actual editor, edit nested quoted lists, exit an empty item, undo/redo, and verify the caret and saved text.
2. Edit a table cell, navigate with Tab/arrows, insert/delete a row or column using toolbar actions, and confirm focus stays with the selected cell.
3. Use Chinese IME, then switch documents or close immediately after composition. Confirm text is admitted once and history remains usable.

## Additional production performance work

The existing document projection cache now consumes the adapter's canonical tree, including footnote segmentation via `createMarkdownDocumentFromTree`. Selection changes reuse the existing projection, physical geometry and outline by immutable document identity. Candidate normalization states seed the same rich projection cache, so a renderer parse is not layered on top of the adapter parser.

The old physical line mapper performed a full copied/reversed block scan and a full line filter for every blank line. Source-ordered boundary binary searches now provide equivalent results without that quadratic work. This is a bounded production-path optimization; it does not claim viewport rendering is complete.

Development verification: `.artifacts/rf506-shared-tree.json` has **338 passed, 0 failed**, including the complete existing controller behavior suite. The updated extension test spies the real `parseFullDocumentTree` implementation and the rich parser callback: an ordinary warmed paragraph edit invokes neither. A separate geometry reuse test verifies selection changes retain physical/outline identity while document changes replace it.

Navigation plans retain `scrollIntoView: true`; text edits keep their original scroll behavior. Parent acceptance must remeasure the actual long-document runtime using its before/after probe.

## Canonical instrumentation and baseline correction

The old probe injected counters only into the retired renderer parser callback and therefore missed the canonical adapter parser. `editorStructureObserver` now exposes per-view actual parser instrumentation and cache update statistics. `fullParse` retains the historical meaning of full-source scan events (tree and reference-definition phases), while `incrementalParseWindow`, `cacheHit`, and `invalidatedNodes` report actual canonical cache work; candidate transactions count as real work.

`editor-foundation-current-baseline.json` was regenerated from the verified unchanged 20k fixture as schema 2. The previous byte-for-byte file remains in `editor-foundation-rf201-baseline.json`. The mixed fixture still requires full fallback (global definitions); zero parse is asserted only for an eligible warmed plain paragraph. Outline/metrics accurately retain their own unshared-consumer capability reason.

Cross-package implementation spies were replaced by the public observer facet and public binding-construction observation. Semantic commands all request scrolling; jsdom tests supply missing Range geometry rather than weakening production scrolling behavior.
# Acceptance follow-up: Unicode deletion

Ordinary Backspace/Delete now remove one Unicode grapheme using a shared `Intl.Segmenter` helper instead of subtracting/adding one UTF-16 code unit. Segmentation is limited to the active physical line; structural joins and explicit selected-range deletion keep their existing ownership. Even an externally supplied caret inside a surrogate pair removes the complete grapheme.

Focused validation: 38 tests passed across existing Backspace/Delete tests, seven pure Unicode cases, and six real-controller keyboard cases. Coverage includes emoji, combining marks, ZWJ emoji, flags, exact resulting caret, a single correct persistence frame, undo restoration, and a 2,000-line document assertion that only the current physical line is segmented. Vitest typecheck and focused ESLint also passed.

## Composition persistence completion

The renderer now treats adapter composition state as authoritative in addition to DOM lifecycle flags. A DOM `compositionend` cannot release a persistence frame or save barrier while the adapter still awaits final native input/normalization. A finish-only state update schedules the checkpoint even when no text changed. Explicit flush after completion also resolves seal waiters safely if it cancels the scheduled animation frame.

Independent controller regression tests force an already scheduled RAF, manual flush and seal between DOM end and adapter finish; no provisional frame or seal escapes. Final native input and ordered-list normalization yield one exact frame and the same sealed source. A no-change composition also releases its barrier. The existing table composition test now awaits the real adapter finish after post-composition input, retaining all source/focus/caret/single-change assertions; model-agent changes commit table text together with the finish effect.

Controller corpus plus semantic runtime, Unicode and barrier files: 4 files, 291 tests passed. Vitest typecheck and focused ESLint passed. Parent owns the final complete gates and formal rerun.

The later full-suite table-composition case hit the global 5-second timeout (5,067.6 ms) while its isolated replay passed in 164 ms. The test now controls only `setTimeout`/`clearTimeout` during composition and advances the finish turn explicitly, then checks the real adapter idle state. It keeps every source, focus, caret and single-commit assertion and restores timers in `finally`; no timeout was increased. Controller corpus/barrier/runtime replay: 286 tests passed; focused ESLint passed.
