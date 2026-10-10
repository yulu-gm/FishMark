# RF901 plain paragraph decoration reuse — withdrawn local experiment

The experiment produced repeatable synchronous input gains, but did not satisfy the predeclared native acceptance condition. The candidate and its active test/tool wiring were withdrawn. Product modules now match published main `1654e82cd28008cc4f6ae9adec04c5a4d56389ec`; existing diagnostic checkpoints `a195200` and `05e20bc` remain intact. Nothing was pushed. This is not M9 completion.

## Scope and stopping rule

Reuse the decoration StateField's already-mapped unaffected ranges and rebuild only the active single-line plain paragraph plus physical line decoration. The experiment introduced no cache architecture. Its opt-in was default-off; only the dedicated Vite B transform enabled it. A loaded both original product modules directly from the fixed published commit with recorded hashes.

Eligible input was one exact `input.type` transaction, one Unicode letter/digit insertion inside or at the end of a stable single-line paragraph. Whole-document plain heading/paragraph inline text, mapped root identities/ranges, active physical/semantic line identity and collapsed selection progression were verified. Paragraph-start insertion, multi-character input, replacement/deletion, cross-line edits, source/presentation/reveal changes, effects, multiple transactions/selections, rich/complex Markdown, external definitions, composition and undo/redo used the existing paths. Only the affected half-open content span was replaced; physical line classes were explicitly rebuilt. Runtime and source-sensitive signature were refreshed.

Before measurement: three fresh-process pairs ordered A/B, B/A, A/B; phase timing OFF. Each pair required ≥10% 20k typing median improvement and ≤5% 5k median regression, plus behavioral equivalence and all native checks passing. No extension to a multi-module optimization or a 16ms chase was authorized.

## Same-protocol results

YULUSTATION Windows 11 Enterprise build 26200, i7-13700K / 24 logical CPUs, 34,088,263,680 bytes RAM, RTX 4070, Electron 41.2 / Chrome 146, display DPR 1. Exact process environment, userData, GPU status, fixture SHA and fonts are in raw reports. Performance fixture stayed at monospace 16px / 22.4px, 1000×720 editor in a paintable offscreen BrowserWindow. It is not the normal app's font configuration or native presentation timing.

| Pair | 5k A → B p50 | Gain | 20k A → B p50 | Gain |
| --- | --- | --- | --- | --- |
| A/B | 11.4 → 8.6ms | 24.56% | 42.5 → 31.0ms | 27.06% |
| B/A | 11.5 → 8.5ms | 26.09% | 42.9 → 30.9ms | 27.97% |
| A/B | 11.3 → 8.6ms | 23.89% | 43.3 → 30.9ms | 28.64% |

20k typing p95 A: 68.1 / 66.0 / 64.7ms; B: 33.7 / 33.2 / 32.6ms. All six runs completed, preserved the expected source and emitted 30 change frames per fixture. Six fresh userData paths, two identical fixtures, 30 ordinary inserts and 30 selection movements per fixture yielded 1080 raw dispatch/frame/selection values. Independent review recomputed the statistics, byte hashes and transform provenance. This is a narrow local fixture result; B still exceeds 16ms. Two animation frames do not measure native paint. No ON-timing samples were pooled into this experiment.

## Behavior, failures and withdrawal

Candidate related tests passed 169/169, including 40 full-decoration/effect/provenance cases and actual extension activation/fallback, immediate post-input DOM equality, source/selection and history. Build, typecheck, lint and foundation 310/310 passed. Initial red/failed attempts and final passing logs are retained. A later added multi-selection test initially had a TypeScript type error; it was corrected with EditorSelection.create and the final typecheck passed.

Strict Windows full regression: **FAIL** — 3321 passed, 10 exact known failures, one unexpected symlink skip, zero collection/hook/unhandled errors. Exact test: `file identity resolver gives symlink aliases one physical identity when the platform permits symlinks`. This reproduces the known platform limitation; no allowlist or system/security/Developer Mode setting was changed. The prior batch-specific release exception was not treated as a new waiver.

Visible owned Electron A/B windows used isolated userData and the product controller/CSS. Ordinary English input, native Ctrl+Z/Ctrl+Y, directly inserted Chinese text and undo, heading reading/editing DOM changes, table-document ordinary-input fallback and paragraph undo passed. B's scoped counter advanced 0→1 for English and →2 for Chinese, and did not advance for the table document. Direct Chinese insertion does not test an OS IME.

The initial native harness omitted the `document-editor` CSS class. Its table click/edit failure was preserved, then the class was corrected. A subsequent Ctrl+A cell-selection attempt failed identically in A/B and remains recorded. Explicit DOM range preparation inside Alpha was then recorded before native insertText. That edit succeeded in both variants; the first exact-source assertion incorrectly assumed no existing table formatting. The expected canonical bytes were amended using published A evidence and independently checked against the unchanged table serializer. These protocol amendments and all failed runs are preserved, rather than pooled or reported as passes.

Final native runs each reported **13 PASS + 1 FAIL**. Ctrl+Z restored the cell text **Delta → Alpha**, while canonical table padding and `:----` delimiters remained; original table source bytes were not restored. Both variants produced exactly the same final source with cell focus. This is not evidence of a candidate-introduced table regression, but the predeclared all-native-pass condition was not fulfilled. No table/history product fix was started.

The entire candidate patch was archived, then both product files, candidate tests and experiment tool wiring were restored/removed from active source. A final rebuilt product and related checks verify withdrawal. No production opt-in or default behavior change remains. Independent review found no concrete introduced P0/P1/P2 and supported stopping and withdrawal.

## Evidence and next decision

Reviewable candidate: [candidate.patch](../experiments/rf901-plain-input-20261010/candidate.patch). Raw reports, transform manifests, logs, screenshots, analysis, native harness revisions as represented by outputs, review and source identity are preserved in [evidence.json.gz](../experiments/rf901-plain-input-20261010/evidence.json.gz). Its index lists byte hashes and paths; entries retain original file bytes as base64. The expanded originals remain under `.artifacts/rf901-plain-reuse-20261010/`. Test userData/cache is intentionally excluded from the archive.

Next decision: separately establish whether table-cell undo must restore original Markdown bytes or may retain existing canonical formatting, and verify the supported native selection/undo route on published main. Reconsider this saved candidate only after that acceptance boundary is explicit and the native gate can pass. No silent relaxation of this experiment's gate occurred.

Unmeasured: OS IME, native paint timing, packaged Explorer/file association, Typora comparison, unusual fonts/themes, integrated 176-marker/38-search suites for this candidate, and frozen cp13/cp16. RF902/903 and M10 were not started; no Library access workaround was attempted.
