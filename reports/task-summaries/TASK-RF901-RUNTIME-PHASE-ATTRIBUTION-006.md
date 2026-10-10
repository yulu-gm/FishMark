# RF901 synchronous runtime phase attribution

On YULUSTATION, the measured 20k plain-input workload does **not** support full decoration construction as the largest single synchronous function or a majority of dispatch time. It is a significant cost (26.2%), alongside incremental cache/tree maintenance (30.4%) and model/snapshot/line derivation (30.8%). This stage implements diagnostics only, not an optimization.

## Code identity and isolation

Official main remains `1654e82cd28008cc4f6ae9adec04c5a4d56389ec`, tree `3ea42b35ece431db21c6eb44e28fd8c7e0404214`. The local starting probe checkpoint is `a195200a5c49b94af4e008056da4d9cd2e3eecd5`. All 12 instrumented product modules are unchanged from main. The normal Vite configuration and product entry are unchanged. The dedicated probe launcher installs the source transform only with `FISHMARK_RUNTIME_PHASE_TIMING=on`; OFF has no plugin or injected product hooks. AST edits wrap only validated synchronous function bodies with begin/try/finally/end, preserving parameter defaults, lexical receiver, original returns and throws. Match counts, original/transformed SHA256s and original source locations are saved for every transformed module: 23 selected functions in 12 modules. A hooked body can still be disturbed by diagnostic bookkeeping; these are measured instrumented intervals, not unchanged runtime instruction bytes.

Each launch uses fresh independent appData/userData/sessionData/log paths, the unchanged sandboxed offscreen window helper, free localhost port 5197, and the original 5k then 20k generated headings/plain paragraphs. Each fixture has 30 `insertText("x")` calls followed by 30 nearby `setSelection` calls, with two rAF callbacks between operations. Fixture hashes remain the prior public probe's `c9edc64fe03b5d87136741441f420cd5f000857b3209bd84ca9031aae3f5a43f` (5k) and `4af71bdbbe558acc9cbbdff2534638f0966e7249df536c317d90d0373d36f4a4` (20k). These are not canonical mixed fixtures.

Host: Windows 11 Enterprise 26200, i7-13700K, 34,088,263,680 bytes RAM, RTX 4070 driver 32.0.15.9186, balanced power; Node 24.13.0/npm 11.6.2, Electron 41.2.0/Chrome 146.0.7680.179. Primary display is 2560x1440/165Hz, DPR 1. Probe CSS remains monospace 16px/22.4px; no resolved glyph-face/product-theme audit or native IME test was performed. Before host snapshot is retained in the provisional directory, and final runs carry their own Electron/display/GPU/userData metadata. No OS setting, association, license, user Markdown, budget, allowlist or dependency changed.

## Boundaries and accounting

Capture is active only around each synchronous controller call. Construction, initial selection/focus, rAF work, delayed document-change flush and calibration are outside the captured phase window. `dispatchMs` retains the original outer performance.now boundary. Each raw span saves id, parent id, label, absolute start/end, inclusive duration, direct-child total and exclusive duration.

- **Inclusive** is body end minus body start, including all instrumented descendants and uninstrumented work within that body.
- **Exclusive** is inclusive minus the sum of **direct** instrumented children's inclusive intervals. All share/total tables below use exclusive values only. Grandchild intervals are already inside a direct child and are not subtracted twice.
- Exclusive duration is not pure CPU or engine self-time: it still includes uninstrumented children, synchronous DOM/CodeMirror work, pauses/GC and hook bookkeeping that falls between captured child intervals. Argument evaluation and default parameters precede body entry. Body-edge bookkeeping lies in the outer dispatch residual; other bookkeeping may fall into a parent exclusive interval.

Every sample's closed tree was checked for finite/nonnegative durations, child containment, direct-child sum and exclusive sum equal to the root inclusive interval within 0.000001ms. The root is the actual `insertText`/`setSelection` body, and its inclusive duration is bounded by the outer dispatch. Original per-function intervals and per-operation closures are retained; no overlapping inclusive values are added as independent costs. Parser spans are separate from `applyIncrementalEdit` cache/tree work. The full parser records input length; inline spans record requested end minus start offsets, which are valid ranges for this fixture.

## Final OFF/ON/ON/OFF results and perturbation

Four fresh sequential launches completed; all 480 operation samples are retained. Each run has 120 operations. ON adds 120 phase samples per run, totalling 4,680 raw spans across both ON runs (26 spans per input, 13 per selection). Each case preserves exact resulting source and 30 document-change callbacks per fixture. Source hashes did not change during either four-run group. Percentiles use nearest rank. Rows below are input dispatch in milliseconds:

| Final run | 5k mean / p50 / p95 | 20k mean / p50 / p95 |
| --- | ---: | ---: |
| 01 OFF | 12.23 / 11.50 / 14.60 | 44.07 / 43.00 / 49.70 |
| 02 ON | 12.37 / 11.10 / 16.30 | 44.98 / 43.30 / 66.00 |
| 03 ON | 12.31 / 11.40 / 15.70 | 46.60 / 44.50 / 66.70 |
| 04 OFF | 12.33 / 11.30 / 17.40 | 45.86 / 43.90 / 65.70 |

Descriptively pooling 60 samples per size/mode gives 5k OFF/ON means 12.2817/12.3400ms (+0.0583ms, +0.47%); 20k means 44.9667/45.7900ms (+0.8233ms, +1.83%). Pooled 20k p95 is OFF 53.1ms versus ON 66.0ms. The two OFF runs themselves have mean spread 1.79ms and p95 spread 16.0ms. These four ordered runs do not isolate timing overhead from JIT, GC, scheduler/process variation or logging perturbation, and do not establish an upper bound or causal improvement/regression. The previous bounded a195 diagnostic (20k p95 66.6ms) remains separate historical evidence, not a substituted control.

After all operations, each ON run retained 10,000 empty spans in 2.5ms: gross average about **0.25 microseconds per span**, including clock/stack/record bookkeeping in a flat empty-span microbenchmark. The separate unused arithmetic loop measured 0.0–0.1ms and may be optimized; it is not an equivalent baseline or valid exact subtractive correction. Nested call costs and extra ON phase-log I/O are not isolated by that calibration. Per-operation logging occurs after measured intervals but can perturb subsequent operations. Individual sub-millisecond spans are quantized at about 0.1ms in these records; small parser means are only aggregated descriptive values. No overhead correction was subtracted from any raw timing.

## Exclusive phase attribution

The two final ON runs contain 60 ordinary-input samples per size. Means below divide summed exclusive intervals by all 60 inputs; shares divide those sums by summed outer dispatch. They are ratios of sums, not sums of marginal percentiles.

| Exclusive phase | 5k mean / share | 20k mean / share |
| --- | ---: | ---: |
| Model/snapshot/physical and semantic line derivation | 3.60ms / 29.19% | 14.09ms / 30.77% |
| Incremental cache/tree maintenance, excluding parser child | 3.52ms / 28.50% | 13.92ms / 30.41% |
| Decoration construction | 2.84ms / 23.04% | 12.01ms / 26.24% |
| Decoration application, including its uninstrumented CM/DOM work | 0.98ms / 7.94% | 3.01ms / 6.57% |
| Other CM dispatch/command application | 1.08ms / 8.75% | 1.89ms / 4.12% |
| Controller document observation | 0.10ms / 0.80% | 0.47ms / 1.03% |
| Semantic preparation | 0.13ms / 1.01% | 0.33ms / 0.71% |
| Inline/full parser bodies | 0.065ms / 0.53% | 0.058ms / 0.13% |

Small controller/markdown and outer-boundary residuals complete the accounting; `analysis.json` retains those precise values. In each ON input capture there was one inline-parser call and **zero full-parser calls**. `createBlockDecorations` ran once per input. This observation concerns only this stable plain-paragraph synchronous window; it is not a claim about all documents, native input, construction, asynchronous work or structural edits.

The largest single instrumented 20k function is `applyIncrementalEdit`: **13.91ms exclusive mean, 30.38%** (inclusive 13.97ms, including its inline parse child). `createBlockDecorations` is second: **12.005ms, 26.22%**. Physical line/document construction is 6.497ms/14.19%; semantic line construction is 4.980ms/10.88%; outline construction is 1.430ms/3.12%. `applyPreparedSemanticCommand` has inclusive mean 45.48ms but exclusive only 1.887ms: quoting its inclusive value as an additional cost would double-count almost the whole call.

Selection remains a separate result: pooled OFF/ON p95 is 5k 2.3/2.2ms and 20k 6.3/6.4ms. The two ON 20k selections spend approximately 79.4–79.7% in model derivation; scoped decoration construction is approximately 1.0–1.3%. It is not correct to attribute the entire input/selection gap solely to decoration rebuilding.

**Hypothesis outcome:** reject full decoration construction as the largest single function or majority cause in this workload. Confirm it as a repeated significant contributor. Combining construction and application gives 32.81%, but application includes CM/DOM work and must not be relabelled as full construction. Cache maintenance and model derivation together account for approximately 61.17%; further attribution would be needed before naming a specific internal cache loop as the root cause.

## One minimum candidate for later coordination

Candidate only: for a **proven stable plain-paragraph edit**, map the existing decoration set through the actual change and rebuild decorations only for the affected paragraph/line neighborhood, reusing unaffected decorations. The existing selection-scoped path offers reusable pieces, but must not simply be enabled for every document change. Keep all uncertain structural/global cases on the existing full rebuild path. This targets the measured 12ms construction cost while leaving cache/model ownership untouched; it cannot alone establish the 16ms target, and the observed share is not a guaranteed saving.

Semantic risks: shifted offsets/signatures, blank-line and wrapped-line decorations, active/inactive block transitions and heading-marker modes, linked definitions/footnotes, tables/containers, pending composition and undo/redo must remain aligned with the canonical source revision. Eligibility and affected-range invalidation need independent proof; rendering, source/history/selection equivalence and identical-fixture A/B plus native/IME validation would precede release. No optimization or such release is implemented/authorized by this diagnostic.

## Verification, preserved evidence and remaining limits

Final build/typecheck/lint PASS; existing foundation/architecture tests **310/310**, AST transformation semantics tests **3/3**, collector accounting tests **3/3** PASS. Independent review required one failure-evidence correction: a thrown controller call now serializes already-closed spans in a finally with `aborted:true`; missing dispatch durations are not fabricated as zero, and the original exception propagates. Failure retrieval was reviewed; the final runtime groups completed normally and did not fault-inject the controller or exercise a hard timeout/renderer crash. A crashed renderer can still prevent recovery of in-memory partial JSON; surviving stdout/stderr and launch state are the available evidence.

Final independent source/data review confirms no remaining introduced P0/P1/P2, all raw sample and span correspondences, exclusive closures, source/fixture identities and interpretation limits. The final frozen measurement patch SHA256 is `41447de3eb8abbf44a401fbf597f87c623736241a65be5a3fc9246cbb793a296`.

The first four-run group is preserved at `.artifacts/rf901-main-1654e82-phases-20261010/` as provisional evidence before that failure-path correction. Its normal runs succeeded and its frozen source hashes were stable; it is not mixed into final aggregate results. Final evidence is `.artifacts/rf901-main-1654e82-phases-20261010-final/`: each OFF/ON case retains raw JSON/stdout, launch status, transformed-source manifest, exact fixture Markdown, timing CSV and raw phase CSV. Root evidence includes analysis code/output, nested closure checks, all-case hash index, runs, frozen before/after provenance/patch, remote-main check and after host state. Verification logs are `.artifacts/rf901-phase-{build-final,typecheck-final,lint-final,foundation,transform-tests-checkpoint,collector-tests}.log`; earlier transformation-test logs also remain. Independent review is saved in the final evidence directory.

This is a Vite development, direct-controller, paintable-offscreen diagnosis. Two rAF callbacks still do not timestamp compositor paint. No new complete Windows regression, native input/IME, packaged startup, mixed-fixture acceptance, memory/long-task/scroll/dropped-frame audit, or cp16 native validation was performed. Frozen cp13/cp16 evidence/budgets and Library access blockage are unchanged; cp16 native remains 0/16. **M9 is incomplete; RF902/903 and M10 were not started. No push.**
