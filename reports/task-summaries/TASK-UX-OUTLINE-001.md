# TASK-UX-OUTLINE-001 — Outline follows document loads

User-authorized local repair on YULUSTATION, based on published main **5c866ed1137623cfa703026c3be037ad661ec179**. This checkpoint is independent of pending syntax-marker, Search and adaptive-width work. No push and no extension of the earlier Windows symlink publishing exception.

## Problem and repair

The actual product initially displayed its Outline correctly. Reloading an externally changed file or opening another document replaced the editor text with the correct canonical document, but Outline became `No headings yet.` Switching back and second-process file routing had the same failure.

The retained controller callback continued invoking the first load's scheduler. The diagnostic production window recorded new `Renamed` / `New child` / `New bottom` canonical headings with callback identity epoch2/load1 while the current identity was epoch3/load2 and later loads. The identity guard correctly rejected that stale callback. Additionally, the application's barrier release rebinds an unchanged document to a new epoch, and that rebind did not publish its snapshot.

`CodeEditorView` now updates the active-block callback ref in a layout effect on every committed render, before load passive effects. `setDocumentIdentity` publishes the current active-block snapshot after the existing session binding and composition reset. The Outline guard, debounce, canonical parser, source/dependency cache, conflict workflow, selection and native history remain intact. There is no manual panel refresh or reparsing workaround. The recent decoration signature optimization is unchanged and was not the cause indicated by the recorded evidence.

## Evidence

| Check | Result | Local raw evidence |
| --- | --- | --- |
| Actual published baseline | FAIL: reload/new-file text correct, Outline empty | `.artifacts/outline-load/baseline/result.json` and PNGs |
| Diagnostic identity trace | Reproduces stale first-load callback despite current canonical headings | `.artifacts/outline-load/diagnostic-v3/result.json` |
| Final actual product,1200×850,DPR1,Electron41.2.0/Chromium146 | **12/12 PASS** | `.artifacts/outline-load/final/result.json` and PNGs; runner `.artifacts/outline-load-product.cjs` |
| Independent read-only review | No P0/P1/P2 blocker | `reports/reviews/2026-10-09-outline-load.md` |
| Full build/typecheck/lint | PASS | `.artifacts/outline-load-{build,typecheck,lint}-final.log` |
| Focused subscription/load/outline tests | **101/101 PASS** | `.artifacts/outline-load-focused-final.log` |
| Controller + related tests | **398 pass +2 exact known failures** before the extra view contract test; new epoch/history test passes | `.artifacts/outline-load-targeted-v4.log`; exact identities in existing allowlist |
| Full Windows regression | **FAIL:3221 pass +10 exact known failures +1 unexpected symlink skip;0 errors** | `.artifacts/outline-load-full.log`, `.json`, `.gate.json` |
| Formal editor behavior | **121/121 cases,2541 targets,0 unexpected,0 not-run** | `.artifacts/outline-load-formal.{log,json}` |
| Workspace safety | PASS (existing MaxListenersExceededWarning emitted) | `.artifacts/outline-load-workspace-safety.log`; `.artifacts/ci/workspace-safety.json` |
| Formal source-provenance bundle contract | **PASS:1429998/1430000 total JS gzip;2 bytes margin** | `.artifacts/outline-load-bundle-final.log` |

The real window covers unsaved-memory preservation at external conflict, explicit reload clearing dirty/conflict state, rename/delete/add/change heading depth, bottom-heading scroll navigation, application Ctrl+O after launch, switch back, a real secondary Electron process routed to the same isolated userData, repeated reloads and F11 mode preservation. Levels after reload are20/30/10px indentation; bottom heading navigation moves the current indicator and renders the target within the viewport. The two added unit contracts check callback ownership during/after replacement, current snapshot publication on an epoch-only bind, unchanged selection/history and exact native Undo/Redo.

The original baseline probe did not successfully insert its intended dirty edit and timed out on a probe path-normalization mismatch after the second file had opened; its raw report accurately preserves those failures. Later isolated candidate/diagnostic/final runs corrected input focus and path comparison. The first navigation probe also selected the first button because `:last-child` applied inside every list item; corrected final selector targets the final list item. These probe corrections are recorded, not counted as product fixes. Initial second-process probe invocations did not share isolated userData; final runs do. Recorded early child PIDs were checked and had already exited.

The Windows full-gate blocker is still `src/main/file-identity-resolver.test.ts` / `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks` unexpectedly skipped. No OS security/developer-mode or allowlist changes were made. Native Windows IME, physical Explorer file association/double-click, additional widths/themes and per-frame animation are **unmeasured**. No M9/release completion claim.

## Pending authorized work

- Unified progressive list/task/link/strong/emphasis/strike/inline-code markers; preserve approved fixed heading whitespace and long-prefix source fallback, native history, composition and nested formats. No implementation mixed into this checkpoint.
- Search compact controls and full results index, using existing matches including table results, accurate navigation/highlighting, replacement refresh, focus/accessibility and large/no-result handling. Reference attachment `libfile_07cb1a1592d48191a21bb99c14ee32db` has not yet been materialized/viewed here; use the supported Library flow, do not guess a URL or reuse cloud paths.
- Adaptive body width replacing the current720px measure; retain necessary marker/side-panel padding and test width/mode/panel and long-table/code scrolling. No width changes mixed here.

cp13/cp16, the withdrawn table-font implementation, RF902/903 and the earlier Library access blockage remain separate.
