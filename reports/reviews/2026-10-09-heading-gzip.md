# Independent review — heading gzip simplification (2026-10-09)

Scope: v4 uncommitted candidate based on 35a8a75. Two production files: `decorations/block-decorations.ts` and `extensions/markdown.ts`. Reviewer is independent of implementation; read-only review, no production edit or test execution. Earlier v1/v2/v3 experiments are not approved by this report.

## Preliminary verdict

**Source audit found no remaining blocker. See the final bounded-evidence section below for acceptance scope and remaining release failures.** Budget compliance alone is not sufficient. The compact canonical signature is not a self-sufficient fingerprint of every rendering dependency; correctness depends on the preserved host invalidation rules documented below. Public legacy signature API remains intact and available for rollback.

## Source-change guarantee

All three internal legacy serialization calls now reuse canonical node kind/id/ranges. In the complete rebuild branch, `sourceChanged` compares old and next exact source before `runtime.editorDerivedState` is overwritten. `applyBlockDecorations` receives `force || sourceChanged`; `notifyActiveBlockChange` still receives the original force argument. Any actual source change therefore applies freshly computed decorations even if node IDs, ranges and signatures collide. The selection-only shortcut is entered only when the source is equal, and retains existing scoped refresh. No extra source serialization, cache, statefield or new architecture was introduced.

This addresses the earlier external-definition counterexample: unchanged referencing leaf source/id/position does not suppress a new destination/title when a later active definition changes, including a real FNV ID collision in that definition. It also handles semantic metadata such as duplicate-footnote status that is not determined by one leaf's local slice. Do not remove this guard merely because ordinary-reference tests happen to pass without it.

## Same-source dependency audit

| Supported entry | Invalidation owner observed in source |
| --- | --- |
| Document path / relative image resolution | `setDocumentPath` calls `refreshMarkdownDecorations`; force-refresh effect takes the full forced rebuild/apply path. |
| Source/WYSIWYM view setting | `setMarkdownEditorViewModeEffect` is included in `didChangeViewMode`; forced rebuild/apply. |
| Heading presentation / explicit marker reveal | Both heading effects are included in that same forced path. |
| Lazy code-highlight parser arrival | Subscription emits `forceRefreshMarkdownDecorationsEffect`, including when text is unchanged. |
| Editor focus / blur | Existing focus lifecycle calls full `recomputeDerivedState(..., true)`. |
| Composition completion | Existing deferred flush forces the final rebuild after composition; source guard does not introduce a mid-composition refresh. |
| Document replacement / canonical restore | Controller calls `view.setState(createState(...))`, rebuilding state and decorations even for equal text. |
| Fonts, sizes, theme styling | `useThemePresentation` updates CSS properties/theme stylesheet runtime directly; browser style resolution is not cached by the decoration signature. No Markdown parser/inline semantic metadata setting is supplied through this path. |
| Read-only and Search | Existing CodeMirror compartments own these updates. They do not change the Markdown parse tree; no signature-based cache has been substituted for their behavior. |
| Reference/footnote definitions and container parsing context | Owned by canonical document parsing. Supported product edits change source or replace state; no audited production setter injects an independently mutable definition map or grammar into unchanged text without rebuilding. |

The audit is limited to supported in-repository production entry points, not hypothetical callers mutating canonical objects or changing callback closure dependencies without the exposed explicit refresh. A future new parser/render-context setter must retain an explicit refresh/rebuild or add its dependency to invalidation; canonical ID/range alone is insufficient.

## Test-strength review

Inspected five new `canonical decoration cache invalidation` tests in `src/renderer/code-editor.test.ts`. They assert actual DOM state plus undo/redo, not just signature text: inactive heading-depth FNV collision, active external definition URL FNV collision, same-length external URL/title change, duplicate-footnote ownership change, and source-offset movement. The two collision tests explicitly assert equal canonical IDs before checking updated output. Existing signature-format assertions are updated rather than removing behavior checks.

Implementation owner reports targeted 5/5 PASS, and a guard-removal negative control with exactly two failures/three passes, which would demonstrate the guard's necessity. Raw negative/full-gate/final Electron evidence is pending direct review at this point. Owner also reports full regression 3218 passed plus ten exact known failures and the existing unexpected Windows symlink skip; that remains a FAIL gate, not an unrestricted release pass.

The ongoing real Electron run includes the original heading matrix and new cache checks. Its shifted-heading probe previously dereferenced a missing element; that failed run is not a passing product measurement. Wait for the corrected final saved result before accepting the full matrix. Native Windows IME and cross-platform rendering remain unmeasured. CodeMirror undo/redo is not browser native history.

No budget increase, allowlist change, Vite/vendor change, cp16 work or app-ui reading-layout change is included or approved. Final gzip value and complete gates must be cited from their final artifacts; the reported 30-byte margin is narrow and not a reason to weaken checks.

## Evidence verified in this review

Directly inspected `.artifacts/heading-gzip-v4-bundle.log`: 1429970 / 1430000 gzip bytes, PASS (30-byte margin). Targeted cache log records 5 passing selected tests; its 293 skips are selection-filtered tests, not a full regression verdict. Decorations log records 76/76 PASS. `heading-gzip-mutation-evidence.json` identifies exactly the inactive-heading and active-reference-definition FNV collision tests as failing without the guard, with three remaining tests passing and `sourceRestored:true`; raw log is `heading-gzip-mutation.log`. Current source still contains the guard.

Verified `heading-gzip-full-final.log` and `.gate.json`: 3218 pass, ten exact known failures, one unexpected Windows symlink skip, zero collection/hook/unhandled errors; overall FAIL. No allowance change is inferred.

Final native matrix, build, typecheck, lint and formal protocol remain pending in this report. The native preceding-insertion failures were probe input issues: Electron multiline insert did not preserve the intended LF in that fixture. The owner's corrected scenario inserts single-line `Lead` before pre-existing empty lines and must still assert exact `Lead\n\n# Title\n\nTail` plus heading offset 6; it is not permissible to weaken the expected source. Product 53px reading-layout choice remains outside this gzip task and is not resolved or modified by this review.

## Final bounded evidence update

Directly verified `heading-gzip-cache-final.log`: **6/6 selected tests PASS**. The additional same-source document-path test asserts updated relative-image DOM src while source, canonical leaf ID, selection and history depth stay unchanged. This complements the source-change/collision tests with an actually exercised same-source rendering-context change.

Verified `.artifacts/heading-markers/gzip-cache-final-v3/result.json`: **194/194 checks PASS**, no error, retaining the original 178 plus 16 cache checks. Earlier native v1/v2 input/locator failures remain retained and are not counted as product passes. `heading-gzip-formal-final.log`: **121/121 cases, 2541 targets, unexpected 0, not-run 0, PASS**. Build-final/typecheck-final/lint-final logs show completion without failure diagnostics, consistent with the owner's reported exit 0; reviewer did not rerun them.

Verified `heading-gzip-full-confirmed.gate.json`: **3219 passed, ten exact known failures, one unexpected symlink skip, overall FAIL**. This supersedes the earlier 3218 result after the added test, without erasing that earlier artifact. Gzip remains the verified 1429970 / 1430000 PASS result above.

At review time, `.artifacts/heading-gzip-product-final-v2/result.json` contains **46/47 true checks**, no error, with all five newly added real product reference checks passing: initial resolution, exact native replacement, collision href refresh, undo restores source+href, redo restores source+href. The sole false check is the preserved full-shell reveal geometry check: heading y=56 -> 109 (+53px), x unchanged. It must remain FAIL. The first product probe's backend-only open did not update the UI and is retained as invalid setup evidence, not product acceptance. The owner independently confirmed process exit 1 and the corrected path: Ctrl+O invokes the actual menu open command; the isolated dialog stub returns native-cache.md; the probe waits for both workspace snapshot and rendered reference before continuing. No CSS was injected.

Current recommendation: **bounded local code/evidence PASS for the gzip simplification; release/whole-task FAIL due to the outstanding 53px product behavior and Windows symlink gate**. The final product probe confirmation completes that evidence trail and does not turn either retained failure into a passing check. Native Windows IME and cross-platform behavior remain unmeasured. Legacy signature API and baseline 35a8a75 remain intact for rollback. No reviewer production change, budget/allowlist change or push.
