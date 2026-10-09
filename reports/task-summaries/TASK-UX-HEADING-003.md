# TASK-UX-HEADING-003 — Reading keeps tab space

Local trial authorized by the user in the parent chat on 2026-10-09 11:29 UTC: “可以试试让顶部保留空白”. Stacked on 39b6e139848319fcd6b4c5b0900d03977718f832; no push. Final fetch still identifies official main as 4575f048ca40c17b3ae6ad962f558b6053d4c096. This is a reversible local trial, not M9/release completion or an extension of any previous symlink publishing exception.

## Result and tradeoff

Reading now retains the tab row's space. Both modes use the same protected three-row workspace grid and bottom padding; the reading canvas stays on row3 with its existing full-width selector protection. The tab strip has opacity0/visibility:hidden/pointer-events:none, keeps its height, and cannot take native keyboard focus. No React/editor state, font, document, cache, setting or architecture change was needed. The shared bottom edge also preserves the viewport height and scroll position at document end.

The old product heading measurement was top56→109 (+53px). In both final actual windows it is **109→109 (0px)**, with unchanged x, width and height. Narrow first table input keeps tableTop173.5→173.5. Default no-banner canvas top69/height650 remains unchanged through first input, blank-document insertion and undo, repeated F11, search-focus transitions and scrolling. Conflict-banner-present canvas top198.3125/height520.6875 is unchanged across modes. Wide end scroll4532 and middle scroll1988 remain unchanged through four transitions each. Showing/removing a real banner naturally changes available space; that is not a mode-switch jump.

The user-visible tradeoff is intentional blank space where tabs appear in editing, plus the same bottom margin while the status bar is hidden. The left rail mode button remains visible, titled and usable; F11 and repeated-key guards keep their existing behavior.

## Final evidence on YULUSTATION

| Gate | Result | Evidence |
| --- | --- | --- |
| Full build, then renderer build for final CSS | PASS | .artifacts/reading-top-space-build.log; reading-top-space-renderer-final.log |
| Typecheck / lint | PASS | .artifacts/reading-top-space-typecheck-final.log; reading-top-space-lint-confirmed.log |
| Full Windows regression | FAIL3219 pass +10 exact known failures +1 unexpected symlink skip;0 collection/hook/unhandled errors | .artifacts/reading-top-space-full-final.log; reading-top-space-full-final.gate.json |
| Actual product1200×850, default dark | PASS88/88 | .artifacts/reading-top-space/wide-confirmed/result.json and PNGs |
| Actual product900×850, default light | PASS88/88 | .artifacts/reading-top-space/narrow-confirmed/result.json and PNGs |
| Existing actual Electron heading matrix | PASS194/194 | .artifacts/heading-markers/reading-top-space-final/result.json |
| Formal Electron protocol | PASS121/121 cases,2541 targets,unexpected0/not-run0 | .artifacts/reading-top-space-formal.json; reading-top-space-formal.log |
| Final gzip and bundle contracts | PASS1,429,970/1,430,000; unchanged30-byte margin | .artifacts/reading-top-space-bundle-final.log |
| Independent review | Bounded local PASS; whole release gate remains FAIL | reports/reviews/2026-10-09-reading-top-space.md |

The actual-product protocol retains all42 previous conditions and adds46 checks. It uses native key/mouse input with isolated fixtures/preferences/userData, actual menu opening with a test file-picker response, native Ctrl+Z/Y, dirty and clean tabs, visible settings/mode entries, conflict reload, empty opened document, first input, heading reveal/delete, search focus and repeated F11. For hidden tab/close controls, native Tab first reaches the visible control, F11 hides it, each Enter/Space separately verifies focus outside the hidden nav plus unchanged full tab identity/order and activeTabId. If the existing focus owner returns to the editor and it legitimately accepts input, the probe checks that owner and native undo restores exact source. Mouse input at hidden-control coordinates cannot activate/close them. Twelve Tab and twelve ShiftTab steps per control skip the hidden nav.

Long-scroll end and middle positions are set through the actual Chromium scroller DOM API after native Ctrl+End; this is not a claim of native wheel automation. Geometry comparisons are settled endpoints (0.2px tolerance), not a frame-by-frame animation certification. Saved JSON records exact rectangles/scroll values and actual window bounds; reading/revealed and scroll screenshots were visually inspected.

## Earlier failures retained

- Initial selected CSS tests failed because removed reading-specific rules were still expected; updated contracts assert the shared grid/retained height and hidden input behavior.
- wide-v1 failed during settings lazy loading because a concurrent bundle build replaced dist assets while the product window was open. That invalid run remains saved; final builds and native windows were run sequentially.
- wide-v2's source-immutable assertion after hiding a focused tab failed: the existing mode focus owner returned to the editor and Enter legitimately edited its source. Full tab identity/order and activeTabId were unchanged. The final per-key test checks hidden-control safety separately and verifies editor ownership/exact native undo.
- wide-v3 stopped when native Ctrl+End revealed the last caret but left bottom padding unscrolled. The final probe positions the real scroller at its exact maximum and asserts that position before mode transitions.
- The first full regression had two additional old CSS contract failures after removing the reading canvas selector. The final candidate retains that full-width/specificity protection and changes only row1→row3; final full regression has only the original Windows symlink unexpected skip.
- An earlier requested550px product probe was clamped by the existing BrowserWindow minimum to actual900px. It is not presented as a550px product result; final narrow run explicitly requests900px. The separate heading controller matrix still covers its supported550px window.

## Try and rollback

Built product is ready for local trial. From this repo, run:

~~~powershell
.\node_modules\electron\dist\electron.exe .artifacts\reading-top-space-try.cjs
~~~

The prepared launcher uses only .artifacts/reading-top-space/interactive/userData and trial.md, preserving repeat-run trial edits instead of overwriting them. It does not edit the normal user profile or system file associations; it was prepared, not left running automatically. Raw evidence, its launcher and digest manifest remain local under .artifacts. Revert this separate trial commit to return to39b6e139 without reverting its gzip fix.

Native Windows IME, per-frame animation, no-active-document state and arbitrary third-party themes are UNMEASURED. The default supported light/dark theme was observed after loading. The existing MaxListenersExceededWarning also appeared in prior baseline probes and is not certified resolved. No OS/security/developer-mode change, allowlist/budget change, Typora installation, old table-font candidate, cp13/cp16, Library access retry, RF902/903 or M10 work is included.
