# Pre-M8 stabilization and readiness — 2026-09-23

Scope: finish the M5/M7 review follow-up and protect existing workspace workflows before RF-801. No M8 implementation or M9 acceptance is claimed. Production fixes are in `63eb7974c24180c4b35d4df361153a3894fe302c`; final CI wiring is in `625259b9b71ee439a96c3595b8867a2c9c7a0e9c`.

## Changes

- Startup script tests now compare complete trimmed command lines, not the shared `dev`/`dev:prepare` prefix. Negative tests reject missing, duplicate and reversed commands, including LF/CRLF input.
- Derived presentation reuses the existing `{tabId, epoch, loadRevision}` identity. A new load hides stale outline offsets, cancels the previous timer and applies the first snapshot immediately. Same-document edits keep the 120 ms debounce. Late callbacks, selection-only notifications, unmount and epoch-only rebinding are covered without a second parser or state owner.
- The App integration fixture now acknowledges and retains actual canonical content/revisions when testing tab round-trips. Its new test switches A -> B with a pending update, checks B's metrics and navigation offset, then returns to A. Lazy theme/titlebar tests wait for dynamic imports inside React `act` instead of assuming two microtasks are sufficient.
- Save test readback reflects the existing post-atomic-write verification contract. Shortcut tests distinguish pure metadata from separately bound executable commands instead of requiring object identity between them.
- A real Electron smoke test discovered another production regression: canceling native close rebound the editor from stale shell text/revision plus projected dirty state, throwing `isDirty must equal the revision and savedRevision difference`. Epoch-only rebinding now retains the acknowledged queue; fallback hydration reads canonical projection data rather than the presentation overlay. A regression first reproduced the exception, then verified that subsequent edits retain sequence/revision continuity.

## Full regression policy

`npm run test:regression` runs the entire Vitest suite. It does not filter files or skip known failures. Raw test results and an independent public-reporter result are retained under `.artifacts/ci/`.

The gate compares exact file, full test name, occurrence and assertion fingerprints against `fixtures/architecture/vitest-known-failures.json`. New failures, changed assertion payloads, missing known cases, newly passing known cases requiring reconciliation, unexpected skips, collection/hook/unhandled errors and interrupted/empty runs fail the gate. Tests of the gate cover these cases; there is no failure-count-only allowance or `continue-on-error` job.

Ten previously recorded defects remain: eight `parse-block-map` cases and two `code-editor` bare-marker cases. They are still real failing tests and remain M9 work, not newly accepted behavior. The four other failures exposed by the first full CI run were repaired rather than added to this baseline.

## Fresh isolated validation

Environment: Linux, Node 22.16.0, npm 10.9.2, Electron 41.2.0. Source and installed dependencies were recovered from the exact GitHub Actions checkout; no developer working tree or user documents were used.

| Check | Result |
| --- | --- |
| `npm run dev:prepare` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; 0 errors, 8 existing warnings |
| Full build, then real product smoke (repeated after the close fix) | PASS |
| Entire Vitest regression gate | PASS; 215 files, 2,855 passed, 10 exact known failures, 0 unexpected, 0 skips, 0 unhandled/collection errors |
| Regression gate self-tests | 24/24 PASS |
| Derived data hook tests | 11/11 PASS |
| App integration suite | 158/158 PASS |
| Workspace renderer application suite | 58/58 PASS |
| Real Electron workspace smoke | PASS |
| Original renderer bundle contract | PASS, unchanged limits |
| `git diff --check` | PASS |

Final measured bundle: maximum initial chunk 179,699 / 300,000 B; maximum initial gzip 56,955 / 90,000 B; total initial gzip 94,097 / 260,000 B; total JS gzip 1,425,636 / 1,430,000 B. All forbidden-initial groups and required lazy boundaries pass. Total JS gzip headroom is only 4,364 B; do not solve future regressions by silently raising the limit.

## Remote verification and watchdog follow-up

GitHub Actions run `35813622602`, on `625259b9`, independently passed Quality (including typecheck, lint, focused regressions, full build, real Electron safety and tracked-file cleanliness) and Bundle budget. Its downloaded bundle artifact exactly matched all four measured numbers above. The full regression job correctly failed: 10 exact known failures plus one unexpected default 5-second timeout in `candidate-performance.test.ts`, `advances the cache revision for every candidate edit, including fallbacks`.

That test uses a 5k rich document and three successive edits/fallbacks, not a 20k fixture. Commit `885978f2c913bf3ec3eb1c26a08787dbef1df4bf` gives this multi-edit test the same 60-second test-runner watchdog already used by the two 20k probes. The fixture size, edits, parse/reuse/revision assertions, recorded measurements and bundle limits are unchanged. This is not a claim that 60-second editing latency is acceptable, and the timeout was not added to the known-failure baseline. The targeted suite passed 11/11 locally after this follow-up (8.78 seconds total; the three-edit test took 1.973 seconds).

The CI run associated with the latest revision is the final remote gate; this report distinguishes the isolated PASS from the first remote run's intercepted timeout rather than labeling that failed run successful.

## Real-process coverage and limits

`npm run test:workspace-safety` launches the built product main, preload and production renderer in an isolated temporary user-data directory. It checks the absence of the product test bridge, two consecutive atomic saves, canceling a dirty native window close, editing after cancellation, saving pending edits on the next native close and exact final disk content. Only native dialog choices are automated; production workspace commands and persistence are not mocked.

Observed choices: Cancel, then Save. Exact disk content: `Smoke first-save second-save pending-close after-cancel`.

This is Linux/Xvfb data-safety evidence, not native Windows/macOS/IME acceptance. The headless Linux CI/root smoke uses Electron's no-sandbox launch option; normal product launch settings are unchanged, and this run does not establish M9 sandbox/security acceptance. Broader performance, editing-experience, recovery and cross-platform security gates remain M9 responsibilities.

## CI and M8 entry

CI now has three blocking jobs: Quality (including startup/persistence regressions and the real Electron smoke), Full regression (the exact known-defect gate), and the original Bundle budget. Each checks that tracked files remain clean; JSON/log artifacts are retained for 14 days. Temporary source/dependency transfer artifacts and the one-shot apply workflow are not retained as permanent CI steps.

M5, M6/M6.5 and M7 remain COMPLETE. RF-801 remains PLANNED and is the next implementation task once the corresponding CI is green. Start it by auditing and consolidating existing M1/M2 clients, queues and commands; do not add a second workspace store or command pipeline merely to satisfy a proposed filename list.
