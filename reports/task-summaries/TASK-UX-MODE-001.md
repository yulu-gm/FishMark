# TASK-UX-MODE-001 — Explicit F11 reading presentation

Historical checkpoint: the later user-approved input entry is documented in TASK-UX-MODE-002. Its accepted user document edits can enter editing automatically; clicks and focus still do not. The remaining historical evidence below describes this original checkpoint.

Status: **LOCAL CHECKPOINT; NOT RELEASE-ACCEPTED.** Independent F11 source review PASS. Windows full gate remains FAIL and real external reload is blocked. No push. Branch: `codex/table-geometry-diagnosis-20261008`; parent `f5159821d6f0befaa25c29d0a25253e327ce8371`. Local main remains `53d86ac377e6a8610c45be8d8f8c6cde3c611b4b`.

## Behavior

The user approved explicit F11 presentation on 2026-10-09. Initial presentation remains reading and remains editable. F11 and a persistent rail book button toggle presentation. Editor/table clicks, focus/blur, Escape, new/open/reload and settings no longer select a presentation implicitly. No preference/persistence, layout algorithm or font change. Input/save ownership and open-document autosave suppression remain intact. Search and settings retain focus ownership. Repeats, modified/consumed events, composition and modals guard the toggle.

This removes the observed 53px movement caused by entering a table automatically. An intentional F11 transition still moves the table from y=120.5 to y=173.5 on the short fixture. The unresolved table glyph-font change is not fixed by this task; the rejected font candidate remains reverted.

## Evidence on yuluStation

All raw files below are preserved locally under `.artifacts/explicit-mode/`; they are not Git deliverables. Existing machine baseline is in TASK-UX-TABLE-001. Only isolated synthetic fixtures/userData were used.

| Check | Result | Raw evidence |
| --- | --- | --- |
| Build | PASS | `build-v3.log` |
| Typecheck | PASS | `typecheck-final.log` |
| Lint | PASS, final exit 0 | `lint-final-v2.log` |
| Focused App/search/focus suites | 189/189 PASS | `focused-v3.log` |
| Formal behavior protocol | 121/121 cases, 2541 targets; 79 existing + 2363 runner + 99 known defects; unexpected 0, not-run 0 | `formal.json`, `formal.log` |
| Original bundle contract | PASS, 1429358 / 1430000 gzip bytes (+159 vs frozen launch build) | `bundle.log` |
| Final unchanged full-regression gate | **FAIL**: 3177 passed, 10 exact known failures, one unexpected symlink skip, zero collection/hook/unhandled errors | `regression-final.json`, `regression-final.log` |
| First full run | **FAIL**: 3176 passed, same 10 known, HTML export unexpected failure plus symlink skip | `regression-first.json`, `regression.log` |
| Export isolated retry | 5/5 PASS; final full run also passes export | `export-isolated.log` |

No allowlist or OS security/developer setting was changed. The initial export failure is retained; passing isolation and a later full run do not establish its root cause or erase it.

Actual built Electron probe: `scripts/electron-explicit-mode-main.cjs`. Set `FISHMARK_MODE_OUTPUT` to a fresh absolute directory; run it with the local Electron binary after building. Optional `FISHMARK_MODE_WIDTH` requests a window width; the product still enforces minWidth=900. `FISHMARK_MODE_NORMALIZED_OPEN=1` exercises the existing product open bridge as a diagnostic control.

- `real-1200-v3/result.json`: first **21 checks PASS** using actual mouse/key input, including reading/editing table-click geometry, F11 repeat handling, four successive toggles, Escape, application menu/fullscreen events, Search focus both ways, F11 blocked by settings, settings-entry focus after the closing animation, visible entry, native undo/redo across toggles and saved cell text.
- `real-normalized-850/result.json`: the same first **21 checks PASS**. Width 850 was requested but clamped by the product's 900 minimum; screenshot content width is 884. This is a narrow-window control, not evidence of an actual 850-wide product window. Normalized bridge opening retained the existing canonical session path.
- Both runs then **FAIL readiness at external reload**. A backslash workspace path and forward-slash file-watch notification are recorded. Unchanged `src/main/main.ts` matches them using `s.path === path`; no conflict/reload UI appears. Reload and the subsequent real new-document assertion were not reached. New/open mode preservation is covered by App tests; real disk-reload mode preservation is not certified.
- `reading.png`, `editing.png`, `failed.png` inspected for visible rail entry and table layout. Earlier runs are retained without treating them as additional independent coverage.
- Native Windows IME, native file-dialog key routing and macOS/Linux UI are **unmeasured**. Synthetic composition flags/lifecycle pass but do not certify OS IME.

## Review and next boundary

[Independent review](../reviews/2026-10-09-explicit-reading-mode.md) found two issues during implementation (stale settings dependency, competing settings-close focus frame); both were corrected before final tests. Current source review PASS is limited to this F11 change.

The Windows watcher/session path mismatch needs a separate focused fix and real reload verification. The existing symlink gate still needs an authorized environment/gate decision; no exception is assumed. This checkpoint does not accept M9 or launch release. Frozen cp13/cp16 and RF902/903 are untouched. [Current interaction specification](../../docs/plans/2026-10-09-explicit-reading-presentation.md).

Follow-up: [TASK-UX-RELOAD-001](TASK-UX-RELOAD-001.md) fixes the separately recorded external reload integration blocker. The historical failures above remain valid evidence for this checkpoint.
