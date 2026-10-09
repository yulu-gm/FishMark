# Independent review — reading top space (2026-10-09)

Scope: CSS-only product change from clean 39b6e139, authorized user trial of retained top space. Independent read-only review; no production edits, tests, system changes or push by reviewer. Final evidence and verdict are recorded below; earlier pending sections describe the staged review history.

## Source assessment

No immediate correctness blocker found in the current CSS diff. The workspace retains its common `auto auto minmax(0,1fr)` row contract and bottom padding in both presentations; canvas remains row 3. Collapsed tabs keep intrinsic row height and border width, while `visibility:hidden`, opacity zero and pointer-events none hide their surface. Removing max-height/translation collapse avoids transient layout movement and avoids overlaying document content. Existing app-owned `!important` workspace row protection remains.

This implements the approved space tradeoff: reading no longer recovers the tab strip's space or the former reduced bottom padding. It is not a scrollTop compensation scheme and should apply to short documents without requiring scroll range. No new preference, mode state or toolbar architecture is introduced. Source audit alone does not prove final geometry or native focus safety.

## Required bounded real-window evidence

1. Short heading/table and long document at scroll end: compare canvas/scroller top and height, scrollTop, title/cell geometry through both directions and repeated transitions, including the transition frames. Keep source/selection/save/history checks from the existing product protocol.
2. Hidden tabs: start with focus on an actual tab or its close button, enter reading, then send Tab/Shift+Tab/Enter/Space and verify no hidden activation/close. Also traverse from normal editor focus. Test a dirty tab: its indicator has an explicit visibility:visible rule, but that span is nonfocusable and aria-hidden and remains under opacity-zero/pointer-disabled nav; parent button visibility should still exclude it from native focus. Confirm rather than infer.
3. Conflict/error row: conflict banner owns row 1, tabs row 2, canvas row 3. Compare the same banner-present state across modes and exercise its actions. A banner being added/removed naturally changes available space; that is separate from a mode-switch jump.
4. Empty/no-document state: the tab nav is not rendered for an empty tab list, so verify grid empty rows/gaps and mode-disabled entry do not create an inaccessible screen. Also check empty opened document, whose tab remains present.
5. Existing supported theme: load it after base CSS and verify the app-owned row contract, hidden controls and geometry remain effective. Arbitrary theme CSS can override descendants or visibility; do not claim all community CSS is constrained based on one default-theme run.

The current keyboard-safety mechanism is native CSS visibility, not explicit DOM `inert`; no request to add another mechanism is made absent a reproduced failure. Native keyboard tests must specifically cover controls already focused when hidden, not only computed styles or synthetic `.click()`.

## Pending acceptance

Final screenshots/JSON, build/lint/typecheck, focused/full/formal and bundle results are not yet reviewed. The previous 53px failure remains valid historical evidence until a new real-window run proves this candidate. Windows symlink gate and native IME limitations are separate and must not be erased by a CSS improvement. Do not mark release acceptance from this preliminary review.

## Final-candidate source refinement

Reviewed the latest CSS after the initial full-regression contract failures. The reading canvas selector is retained with its existing grid-column, width:100%, max-width:none and margin protection; only grid-row changes from 1 to 3. This preserves the selector's specificity and full-width theme contract while aligning the canvas with the shared workspace grid. No width algorithm changes or unrelated layout architecture were added. No new source-level blocker identified.

Earlier `wide-final` and `narrow-final` results belong to the previous CSS candidate that omitted this selector; they are historical evidence, not final-candidate acceptance. The requested 550px narrow window was clamped by existing BrowserWindow minWidth to an actual 900px window, so it must not be called a measured 550px viewport. Final `wide-confirmed`/`narrow-confirmed` rebuilt-product results and rerun gates are pending direct review.

The hidden-control assertion refinement is valid: Enter/Space may reach the editor after the existing focus owner deliberately restores editor focus. The relevant invariant is that each key leaves active tab and full tab identity/order unchanged, with focus outside hidden nav. If text changes, assert editor ownership before that key and native Undo restores exact source before proceeding. This does not authorize hidden-control activation. Earlier source-immutability assertion failures and the invalid concurrent-build/lazy-chunk run remain retained.

## Final independent verdict and verified evidence

**Bounded local review PASS for the final CSS candidate. The measured former 53px mode-switch displacement is resolved. Full Windows regression gate remains FAIL only for its retained symlink skip; no release/push approval is implied.** No remaining actionable correctness issue was found in the reviewed diff and covered scenarios.

Final product evidence (after restoring the reading canvas width-specific selector and rebuilding):

- `.artifacts/reading-top-space/wide-confirmed/result.json`: **88/88 PASS**, actual 1200px window, default dark theme, no error.
- `.artifacts/reading-top-space/narrow-confirmed/result.json`: **88/88 PASS**, actual 900px window, default light theme, no error. This is not a 550px result.
- Heading top is 109 -> 109; narrow table first-input top is 173.5 -> 173.5. Canvas top 69 and height 650 remain stable; conflict-banner state canvas top 198.3125 and height 520.6875 match across modes. Wide long-document end scrollTop 4532 and middle 1988 remain unchanged across repeated F11 checks. Search focus and saved/input/undo behavior remain passing.
- Confirmed hidden-tab and close-control safety uses actual native keyboard traversal from the visible controls, then per-key Enter/Space ownership plus full tab identity/order checks; editor input, where expected, is restored via exact native Undo. Native Tab/Shift+Tab traversal (12 each per region) and clicks at the hidden location also pass. The hidden nav retains its 37px box and does not activate or close a tab.
- Inspected the confirmed dark heading screenshot in this review. Saved reading/reveal/scroll screenshots accompany both results. No assertion of arbitrary third-party theme compatibility is made from default dark/light coverage.

Regression evidence directly inspected:

- `heading-markers/reading-top-space-final/result.json`: **194/194 PASS**, no error.
- `reading-top-space-formal.log`: **121/121 cases, 2541 targets, unexpected 0, not-run 0, PASS**.
- `reading-top-space-bundle-final.log`: **1429970 / 1430000 gzip bytes, PASS**; budget unchanged.
- `reading-top-space-full-final.log` and `.gate.json`: **3219 passed, ten exact known failures, one unexpected Windows symlink skip, zero collection/hook/unhandled errors; gate FAIL**. No allowlist edit.
- Final renderer build, lint-confirmed and typecheck-final logs were inspected; completion is consistent with the owner's reported exit 0. The owner also confirms the complete build before the final CSS-only renderer rebuild.

Continuous animation was not measured frame-by-frame, and no-active-document state was not separately exercised. The fixed row/padding source contract supports those cases structurally but is not a substitute for direct measurement. Native OS IME, all third-party themes and cross-platform behavior remain unmeasured. Earlier invalid-build, incorrect source-immutability assertion, and prior CSS-contract failures remain retained; their results are not relabeled as passes.

Only `app-ui.css` is a product change; other changes are tests/probes/reporting. No new mode/setting architecture, source/IME implementation, OS setting, allowlist, budget or push was changed by this reviewer. The user-authorized top-space tradeoff is now supported by final endpoint geometry and input evidence, with rollback intended as a separate checkpoint after 39b6e139.
