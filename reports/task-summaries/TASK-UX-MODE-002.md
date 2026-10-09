# TASK-UX-MODE-002 — Enter editing after a user document edit

Local checkpoint only, based on published main `4575f048ca40c17b3ae6ad962f558b6053d4c096`. Remote was freshly fetched and remains that exact revision. No push; the prior one-time Windows symlink exception does not apply to this checkpoint.

## Behavior

Reading remains editable. Accepted document transactions with existing `input.*` or `delete.*` user events now enter editing presentation. This covers text, paste, Enter, deletion and existing semantic/table edits. There is no global printable-key handler: first input reaches the existing editor, then the shell observes the accepted edit. Image paste receives the same existing input.paste annotation.

Selection, arrows, scrolling, copy, search/settings text, loading, unannotated projection and internal remote patches do not signal entry. Undo/redo are not classified as new typing. Once editing, blur/Escape do not revert it; F11 or the existing rail button returns to reading. An empty/blocked transaction does not switch mode.

The controller defers provisional composition until adapter finalization and ignores net cancellation; document replacement/canonical restoration clears pending composition intent. The shell changes only presentation and skips automatic refocusing for that transition. No editor recreation, selection replacement, DOM reconstruction or font alias was added.

## Evidence on YULUSTATION

- Build PASS, final typecheck PASS, lint PASS. Initial typecheck overlapped build cleanup and failed from missing generated workspace-domain declarations; the sequential final rerun `.artifacts/auto-entry-typecheck-v2.log` exits 0. This initial harness scheduling error is retained, not classified as a source defect.
- Related run: 448 passed, 2 exact pre-existing list-marker failures; new controller/shell cases pass.
- Full Windows regression `.artifacts/auto-entry-regression.json`: **FAIL**, 3202 passed, 10 exact known failures, 1 unexpected skip for `file identity resolver > gives symlink aliases one physical identity when the platform permits symlinks`; zero collection/hook/unhandled errors. Allowlist and OS security settings unchanged.
- Formal `.artifacts/auto-entry-formal.json`: PASS 121/121 cases, 2541 targets (79 existing, 2363 runner, 99 known defect), zero unexpected/not-run.
- Actual built-product Electron `.artifacts/auto-entry/real-product/result.json`: **43/43 checks PASS**, no error, Electron 41.2.0 / Chromium146 / DPR1 / window1200x850. Fresh isolated userData and Markdown fixtures. Native input APIs check table and paragraph first insertion without lost text, table/browser and paragraph/CodeMirror undo/redo after automatic entry, F11 return, arrow no-switch, Enter/Backspace entry, search input no-switch, existing multiple-document/external-conflict/reload/F11 behavior. Screenshots preserved in that folder.
- Paste and forward deletion are transaction-level unit tests, not an OS clipboard end-to-end claim. Native Windows IME is UNMEASURED; synthetic composition tests cover commit, cancellation and replacement only. The real probe's nonzero exit covers every recorded check. Existing MaxListenersExceededWarning was observed in its log; no new listener architecture was introduced.
- Official `npm run perf:bundle`: all contracts PASS; gzip **1429629 / 1430000** (+211 against main, 371 bytes remaining). Initial analyzer invocation without sourcemaps was incomplete evidence; `.artifacts/auto-entry-bundle-final.log` is the valid provenance-backed final gate.
- Independent source and evidence review: `reports/reviews/2026-10-09-user-input-presentation.md`.

## Deliberate stage boundary / remaining work

This is the input-entry stage only. The authorized heading change is **not implemented**: reading hides heading syntax, editing reveals only when caret/selection actually enters its marker interval, not anywhere in the line. Future work must update both root/nested heading decoration paths and selection-only invalidation, test real ArrowLeft/Home/Shift-arrow and Backspace at hidden markers, and preserve composition/source mode. No atomic-range workaround or broad inline-syntax rewrite has been added. No claim of heading UX completion.

Table fonts remain unresolved. The independent diagnostic checkpoint `aba0c73` on `codex/table-font-boundary-proof-20261009` contains 8/8 inspected owner-comparison results and the read-only RF901 resource audit; it is not stacked into this product branch. Paragraph has the expected dynamic CJK/Latin/code/bold faces; table native editable text still has the known font mismatch. No Typora installation/license change or font replacement was performed.

RF901/cp13/cp16 remain frozen, blocked Library transfer was not retried, RF902/903/M10 not started, and this checkpoint does not close M9. Return this bounded stage with the Windows gate limitation before extending the heading work.

## Later local heading checkpoint

The heading work described above as future work is now implemented locally in TASK-UX-HEADING-001 on this same branch. Its marker matrix passes, but whole-product acceptance remains blocked by the original gzip budget, Windows symlink skip and the measured 53px reading-to-editing shell movement. This later stage does not change the historical input-entry gate results above. No push.
