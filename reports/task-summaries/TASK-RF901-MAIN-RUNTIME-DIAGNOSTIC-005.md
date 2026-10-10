# Main runtime controller diagnostic on YULUSTATION

This bounded diagnostic measures publicly available main `1654e82cd28008cc4f6ae9adec04c5a4d56389ec`, tree `3ea42b35ece431db21c6eb44e28fd8c7e0404214`. A fresh read-only remote check still returned that main SHA. Only three existing runtime-probe files were instrumented; production logic, dependencies, budgets, allowlists, system settings and user Markdown content did not change. No push is authorized for this stage.

## Isolation and protocol

The launcher creates a unique userData below the fresh evidence directory before Electron readiness. appData, userData, sessionData and logs are isolated. Output uses exclusive creation and refuses an existing report. The existing process-tree runner cleans only its own launch; timeout remains 180 seconds. Port 5197 was free before and after. The limited before process inventory serialized as null and is treated as unknown, not proof of absence. The after inventory found no FishMark/electron processes. This inventory does not prove the state of every desktop application.

The published generator, sequence and timing boundaries are retained: 5,000 then 20,000 lines; 30 controller `insertText("x")` operations near the first paragraph, followed by 30 `setSelection` operations over five nearby offsets, with two rAF callbacks after each operation. This is one sequential run in a fresh renderer/session; the 20k case follows the 5k case in the same process. No sample or warmup was discarded. Each completed operation is recorded both in raw arrays and stdout. Partial report retrieval is attempted for caught exceptions, including the live document-change callback count. A hung/crashed renderer or hard timeout can prevent retrieval of in-memory partial JSON; surviving stdout/stderr and exit status are the available evidence in that case. Failure-path retrieval was reviewed but not fault-injected in this run.

The generated fixtures contain headings and plain paragraphs, not the roadmap's canonical mixed fixture. Full UTF-8 source is retained in JSON and extracted Markdown:

| Lines | UTF-8 bytes | SHA256 |
| --- | ---: | --- |
| 5,000 | 44,779 | `c9edc64fe03b5d87136741441f420cd5f000857b3209bd84ca9031aae3f5a43f` |
| 20,000 | 185,779 | `4af71bdbbe558acc9cbbdff2534638f0966e7249df536c317d90d0373d36f4a4` |

## Host and measurement boundaries

YULUSTATION: Windows 11 Enterprise 10.0.26200, Intel i7-13700K (16 cores/24 logical CPUs), 34,088,263,680 bytes RAM, RTX 4070 driver 32.0.15.9186, balanced power. CLI Node 24.13.0/npm 11.6.2; Electron 41.2.0/Chrome 146.0.7680.179. Primary display 2560x1440 at 165Hz, scale factor/DPR 1. The probe uses the unchanged offscreen helper (`show:true`, x/y -10000, skipTaskbar, 1280x900, sandbox/context isolation, background throttling disabled); editor root is 1000x720. GPU compositing/rasterization reported enabled. Probe computed content CSS was `monospace`, 16px, line-height 22.4px; this is not a resolved glyph/font or product-theme audit. Installed language/IME inventory is retained separately; actual OS IME behavior was not exercised.

The Vite development renderer calls the production controller directly. It does not measure native keyboard/pointer delivery, main/preload IPC, persistence/ACK, packaged application startup or compositor presentation. `openMs` is synchronous controller construction, not editor-ready/first paint. Two rAF callbacks offer rendering opportunities and may run at this display's refresh cadence; they are not paint timestamps. `emittedFrames` counts document-change callbacks, not visual frames. Per-operation logging occurs after the timing endpoint but may perturb later work. No function-level phase timers, parse/reuse counters, scroll jumps, long tasks, memory, dropped frames or native IME measurements were collected.

## Raw results

All values below are milliseconds. Each input/selection distribution contains 30 original samples; open has only one observation per size. Percentiles use nearest rank. CSV and JSON retain full precision, ordering and outliers.

| Lines | Construct | Input p50 / p95 / max | Input + two rAF p50 / p95 / max | Selection p50 / p95 / max |
| --- | ---: | ---: | ---: | ---: |
| 5,000 | 147.0 | 11.9 / 17.0 / 27.2 | 18.0 / 20.3 / 29.9 | 1.7 / 2.1 / 2.3 |
| 20,000 | 397.3 | 43.3 / 66.6 / 74.3 | 48.4 / 72.7 / 78.7 | 5.9 / 6.5 / 8.5 |

The most expensive measured part is synchronous ordinary-input controller dispatch. It accounts for 91.39% of the summed 20k input-to-two-rAF intervals (5k: 76.87%). The **paired** residual (`toTwoFrames - dispatch` for each sample) has 20k mean 4.26ms and p95 6.50ms; this is not the difference of marginal percentiles or a direct paint cost. All 30/30 20k dispatches exceed 16ms; 5k has 2/30. The 20k maximum is original sample 18, retained; the 5k maximum is original sample 0, retained. No runtime exception or timeout occurred.

The diagnostic exposes a substantial synchronous-input concern relative to the roadmap's 20k 16ms target. It is **not** a canonical mixed-fixture M9 gate result. Construction observations likewise cannot pass the roadmap's mixed-fixture full editor-ready budgets. Selection has no latency-budget assertion in this probe. Exit 0 only confirms source preservation and exactly 30 document-change callbacks per fixture; it does not certify latency acceptance.

## Narrow next hypothesis, not an implemented optimization

Hypothesis: global decoration reconstruction contributes substantially to the 20k ordinary-input dispatch time, whereas selection benefits from scoped reuse. Source evidence: `extensions/markdown.ts` update listener calls `recomputeDerivedState` with `reuseMappedDecorations: !update.docChanged && update.selectionSet` (around lines 1352-1354). In `recomputeDerivedState` (around 636-690), text changes take `createDecoratedDerivedState`; `deriveInactiveBlockDecorationsState` delegates to `createBlockDecorations`, whose ordinary preview path iterates the root's children (around `decorations/block-decorations.ts:132`). Selection can take `createSelectionScopedBlockDecorations`. This difference is consistent with, but does not prove, the measured input/selection gap. Other synchronous work, including semantic planning, cache updates, whole-text serialization and controller observers, remains unaccounted for.

Next falsification step for parent coordination: on this exact main and protocol, separately time/count decoration derivation/build/application versus semantic planning/cache/controller observation. Reject this hypothesis if decoration work is not a substantial fraction of the same 20k dispatch distribution. Only if attribution supports it, propose a narrowly scoped ordinary-paragraph stable-input candidate reusing unaffected mapped decorations, with equal-source/history/selection validation and identical-fixture A/B timing. No candidate, bypass or product optimization was implemented here.

## Verification and evidence

- Final build, typecheck and lint: PASS. Existing editor-foundation architecture/probe tests: **310/310 PASS**, 6 files. Initial typecheck failed for an implicitly typed report array; the explicit report interface fixes it, and both failed/final logs remain.
- Raw validation: 120 stdout operation records, 30 values in each of six timing arrays, all finite/nonnegative; recomputed percentiles match JSON; every stdout timing matches its raw array; both fixture hashes, exact source preservation and 30 callbacks match.
- All 13 pinned probe/product/helper/config/lock/style file hashes match before/after; no production code change. Frozen probe patch SHA256: `92fbd9e9e505c180193823ef4d9f4adc1d6c3acd3f2363e9615aa6f023a76f25`.
- Independent source and data review: no remaining introduced P0/P1/P2; reviewer checked the raw distributions, ordered stdout/CSV correspondence, fixture identities and scope limits. The early inaccurate partial callback counter was corrected before sampling. Report wording now treats the null pre-run process inventory as unknown.
- Fresh complete unfiltered Windows regression and native actual-window input were not repeated for this instrumentation-only stage. Main's earlier Windows symlink skip remains historical strict failure evidence with its batch-only release exception, not a new waiver.

Raw directory: `.artifacts/rf901-main-1654e82-diagnostic-20261010/`. It contains `runtime.json`, `run.log`, `exit-code.txt`, `analysis.json`, before/after host snapshots, separate IME inventory, remote-main identity, frozen provenance/patch, both fixture Markdown files and both sample CSVs. Analysis includes SHA256s for core raw evidence. Verification logs use `.artifacts/rf901-diagnostic-{build-final,typecheck-final,lint-final,foundation}.log`; earlier failed typecheck is `.artifacts/rf901-diagnostic-typecheck.log`. Independent review is saved with the raw directory.

This new-main diagnostic does not replace frozen cp13/cp16 evidence or native cp16 validation (still 0/16). It does not change cp16's 1,431,000 ceiling or its recorded 1,431,588 result. The cloud/Library access blockage remains. **M9 remains incomplete; RF902/903 and M10 were not started.** Further optimization is left to the parent.
