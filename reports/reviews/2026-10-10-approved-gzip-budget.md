# Independent review: approved total gzip budget

Review date: 2026-10-10. Reviewer: independent GPT-6.1-sol, high reasoning. Baseline: `ecf05b8a463fb27dd89906fd4b8a743d6812dad1`. No introduced P0/P1/P2 found in this batch. The revised bundle contract passes. Normal main publication is authorized by the user; publication and remote CI are pending at report creation. The strict full-regression verdict remains **FAIL**, with the sole unexpected Windows symlink skip accepted as a batch-only release exception. M9 remains incomplete.

## Authorization and exact scope

The parent relayed the user's explicit instruction, “上限调整为1500000”, followed by “可以” in response to the proposal to accept this batch's single Windows symlink test not running and publish normally to main. These approvals permit the one total-gzip policy adjustment and this batch's release exception; they do not establish a future skip exception.

Reviewed three changed files against ecf: `fixtures/architecture/editor-foundation-guard.json`, `src/main/analyze-renderer-bundle.test.ts`, and `docs/refactor/editor-foundation/progress.md` (8 insertions, 4 deletions before review/report additions).

- The authoritative `bundle.max-total-gzip-bytes` limit alone changes from 1,430,000 to 1,500,000 bytes. Independently restoring that value in memory makes the complete parsed contract exactly equal to ecf's contract. All 23 checks remain present. The new contract SHA-256 is `aaf05ba39c39e8b5391830c80d690853ab1f4d5ac12bc86f3c172b54bbfc625e`.
- The existing test guarding against inline budgets adds `1500000` to its forbidden-number expression and retains `1430000` and the other limits. It continues to require the manifest contract and reject command-line budget overrides. No analyzer behavior changes.
- Current progress documentation records the approval and batch-only exception. Historical M5 measurements retain their original 1,430,000-byte meaning. The frozen RF-901 cp13/cp16 experiment protocol is unchanged.

All renderer, main, preload and package production sources remain identical to ecf. The only `src`/`packages` diff is the analyzer test above. Scripts, build/minifier configuration, package metadata, licenses, OS settings and failure/skip allowlists are unchanged. Independently checking the 30 entries in `.artifacts/markers-budget-final-source.json` found only the authorized contract mismatch; the other 29 hashes still match. This review ran no builds or tests and changed no production or emitted files; only this report was written.

## Fresh verification for this policy batch

| Gate | Inspected result |
| --- | --- |
| Official bundle | PASS: total JS gzip **1,430,087 / 1,500,000 bytes**, headroom 69,913 bytes. Initial gzip 101,852 / 260,000. All 23 checks PASS. `.artifacts/approved-gzip-1500000-bundle.log`; parent confirmed exit 0. |
| Contract/analyzer focused suites | 291/291 PASS, three files. `.artifacts/approved-gzip-1500000-focused.log`; exit 0. |
| Build / typecheck / lint | PASS; `.artifacts/approved-gzip-1500000-{build,typecheck,lint}.log`; parent confirmed each exit 0. |
| Official full regression | Strict **FAIL**, exit 1: 3276 passed, 10 exact known failures, one unexpected skipped symlink test. Errors, unresolved baseline and missing skips are all zero. `.artifacts/approved-gzip-1500000-full.{log,json,gate.json}`. |

The sole unexpected full-suite item is `src/main/file-identity-resolver.test.ts`, `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks`, occurrence 0, state `skipped`. It remains unexpected under the unchanged strict allowlist. The user's release exception accepts its nonexecution only for this batch; it does not turn the raw gate into PASS or demonstrate symlink behavior.

The emitted total remains exactly 1,430,087 bytes. The earlier 1,430,000-byte contract therefore still fails by 87 bytes as recorded in historical reports. This batch changes the explicitly approved policy, not the renderer size or prior evidence.

## Inherited product evidence and limits

No new native or formal product run was performed for this policy-only change. Because production is identical to ecf, the following previously reviewed evidence remains applicable and is explicitly inherited:

- `.artifacts/markers-budget-final-formal.json`: 121/121 cases, 2541 comparison targets; 79 verified-existing, 2363 verified-runner, 99 known-defect observations, unexpected 0 and not-run 0, PASS.
- `.artifacts/progressive-markers/budget-final/result.json`: 176/176 actual-window Marker checks PASS, including 14 English/Chinese BODY midpoint/Right paths, four wide-checkbox gap checks and label-only continuation alignment.
- `.artifacts/search/budget-final/result.json`: 38/38 actual-window Search checks PASS, including 1000-result paging and far-table navigation. These are the ecf candidate's runs, not fresh policy-batch runs.

The user's BODY-caret report remains unreproduced in the 14 tested paths; exact Markdown and entry/navigation method are still awaited. No blanket fix is claimed. Typora comparison, actual OS IME, arbitrary fonts/themes, per-frame animation and packaged Explorer file association remain unmeasured. Native replay entries remain `.artifacts/markers-integrated-product.cjs` and `.artifacts/search-integrated-product.cjs`.

Source and local evidence review are complete. The explicit budget approval and batch-only symlink release exception permit the authorized normal main publication, without force-push or a new remote branch. Remote publication/CI results must be recorded after they occur. This review does not claim strict-full PASS, future skip approval, global optimization minimum or M9 completion.
