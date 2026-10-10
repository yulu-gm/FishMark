# Independent review: bounded integrated-marker budget cleanup

Review date: 2026-10-10. Reviewer: independent GPT-6.1-sol, high reasoning. Outcome: no pending introduced P0/P1/P2 found in the reviewed changes; acceptance **BLOCKED** by 87 excess gzip bytes and the unapproved Windows symlink skip. Optimization has stopped at the agreed scope. This is the lowest measured candidate in these bounded rounds, not a global minimum or M9 completion.

## Scope and provenance

Reviewed the exact five-file diff against `e5220cfe5296bea436513eae1bfb1e2f01469c50`: 25 insertions and 55 deletions. The changes are limited to unused private decoration-context fields, two shared presentation helpers, and TableToolbar callback forwarding. Production CSS, navigation normalization, source ownership, build configuration, licenses, budget thresholds and allowlists are unchanged.

All 30 hashes in `.artifacts/markers-budget-final-source.json` matched during evidence review. This reviewer ran no builds or tests and edited no production or emitted files. Only this report was written. The earlier integrated-marker review remains historical evidence and is not rewritten to substitute these new results.

## Behavior review

- Removed private `referenceDefinitions` and `footnoteDefinitions` context fields and their unused assignments. Public `CreateBlockDecorationsOptions` fields and scoped option forwarding remain intact. Canonical reference/footnote resolution and other context consumers are unchanged.
- `resolveListItemMarkerContentStartOffset` shares only the identical fallback: consume horizontal space after the list marker, consume the task suffix only when its start equals that cursor, then clamp to the supplied line end. CM still returns an existing numeric content offset unchanged; HTML still clamps that value to its line end. The callers retain their different CRLF line-end handling and existing prefix-length calculations.
- Shared `createInactiveBlockquoteDepthClass` retains the exact `Math.max(1, Math.min(depth, 4))` clamp and class string. Both callers retain their original depth values.
- TableToolbar preserves its public Pick type and action factory. Passing `props` to that factory removes redundant callback destructuring/object reconstruction; all seven callback mappings, SVG paths, action ordering, tooltip state, hover/focus/blur handlers and native buttons remain unchanged.

These are readable deduplication/dead-code changes. They introduce no cache, second source index, dynamic action protocol, parser change or owner migration.

## Fresh inspected verification

| Gate | Outcome and evidence |
| --- | --- |
| Build / typecheck / lint | PASS; `.artifacts/markers-budget-final-{build,typecheck,lint}.log` |
| Focused suites | 275/275 PASS in `marker-focused-shared-quote-toolbar-1.log`. Earlier first-round focused suite was 261/261; controller suite was 317/319 with the same two bare-marker failures. Overlapping counts are not added. |
| Official full regression | FAIL: 3276 passed, 10 exact known failures, one unexpected symlink skip; errors 0, unresolved baseline 0. Raw full JSON/gate/log use `markers-budget-final-full`. |
| Official formal protocol | PASS: 121/121 cases, 2541 targets; 79 verified-existing, 2363 verified-runner, 99 known-defect observations, unexpected 0, not-run 0. New run ID `2f6988a5-6bc6-4b3f-9dbc-417e2377b4d1`. |
| Original bundle contract | FAIL: 1,430,087 / 1,430,000 total JS gzip, excess 87 bytes; initial total 101,852 / 260,000. All other original conditions PASS. |
| Fresh actual-window Marker protocol | 176/176 PASS; `.artifacts/progressive-markers/budget-final/result.json` and `markers-budget-final-native.log`. |
| Fresh actual-window Search protocol | 38/38 PASS; `.artifacts/search/budget-final/result.json` and `search-budget-final-native.log`. Cold runtime request held: true, requests: 1. |

The unexpected full-suite item remains `src/main/file-identity-resolver.test.ts`, `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks`, occurrence 0, state skipped. It is not an approved skip and remains a blocker. Known failures and native-probe MaxListenersExceededWarning remain recorded.

Official budget measurements were 1,430,195 at e522, 1,430,153 after the first two cleanups, and 1,430,087 after the last batch: total reduction 108 bytes. Both failed rounds' emitted evidence is preserved in `.artifacts/markers-budget-bundle-{1,2}-evidence/`; the final official log is `.artifacts/markers-budget-bundle-2.log`. No additional optimization or scope expansion is accepted here.

The fresh Marker result includes 14 English/Chinese BODY midpoint selections and subsequent Right movement, four wide-checkbox gap checks, and label-only continuation alignment at 900/1200px. BODY anchors are collapsed inside labels and no raw marker is revealed in those paths. The probe waits for open/closing sidebars to disappear and measures label substrings excluding preceding spaces. Independently inspected this run's `body-midpoint-orderedchecklong.png` and `body-midpoint-quotecontinuationlabel.png`: checkbox/body association and continuation alignment remain correct. Independently inspected fresh Search `far-table.png` and `last-page.png`: far-cell highlight/current result and result 1000 remain visible. The old integrated-final native results are not counted as fresh evidence.

## Replay and limits

The retained native replay entries are `.artifacts/markers-integrated-product.cjs` and `.artifacts/search-integrated-product.cjs`. Each accepts a fresh output-directory argument, requires the built product, and uses isolated userData. For example, from the repository root, run Electron with the marker script and a new directory:

```powershell
.\node_modules\.bin\electron.cmd .artifacts\markers-integrated-product.cjs .artifacts\progressive-markers\budget-replay-NEW
```

The user's BODY-caret report remains **unreproduced in the 14 tested midpoint/Right paths**. Its exact Markdown and entry/navigation method are still awaited; no blanket fix is claimed. Typora comparison, actual OS IME, arbitrary fonts/themes, per-frame animation and packaged Explorer file association remain unmeasured.

Source/evidence review is complete. Preserve the candidate as an unaccepted local checkpoint only: gzip and full-regression gates still FAIL, with no waiver, push, release acceptance or M9-completion claim.
