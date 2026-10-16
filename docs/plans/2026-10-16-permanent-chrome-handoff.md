# TASK-PERMANENT-CHROME-053 execution handoff

Baseline: official main d4d060422185929cbf83967b578c742976d5f32b, tree95a806742a5b6b11528561106fe4c9ffb07c4c39. Isolated checkout was clean before this task's intake. No performance candidate resumed.

Implementation: App/focus hook now own only progressive heading presentation; remove reading layout state, rail button and F11 handler. WorkspaceShell no longer publishes shell-mode attributes. Tab strip and status bar stay visible; empty workspace reserves its tab row and shows 字数0. Remove obsolete reading/collapse CSS. Theme memo and resize/runtime factory both supply isReadingMode:false while retaining ABI. Source/WYSIWYM and inline/block/heading core logic, focus guards, autosave and reading-position restoration unchanged.

Compatibility: inspected Preferences and parseWorkspaceSnapshot; neither has a persisted reading-layout field. No invented migration/schema bump/reset. Unknown legacy-like fields are seeded by the new product test as a compatibility canary; they are not claimed as previously supported fields. WorkspaceReadingPosition remains intact.

Tests: RED/GREEN permanent chrome regression; 205 targeted tests passed, full typecheck/build passed. Strict regression3987pass+8exactknown/0unexpected/errors. Bundle/foundation gate passed310. Source-identical clean mirror original lint passed; original ignored historical diagnostic artifacts remain untouched, no eslint/allowlist changes. Final targeted205, typecheck and strict3987+8known passed again after the resize assertion; final1470-file source mirror lint passed. Evidence root .artifacts/permanent-chrome-053.

Independent review: read-only6.1-sol review found obsolete initial-editing assumption in nested marker-navigation E2E. Fixed by real input plus undo before source-marker navigation; no product/test bridge. Removed remaining tab-merge helper. Final read-only code review PASS; runtime acceptance still pending.

Recommended acceptance: npm run typecheck/build/test:regression/perf:baseline; clean hash-verified mirror npm run lint; guarded Windows product61 tests including permanent-chrome, reading-rhythm, nested-editing, tab-viewport; editing79/safety7/formal121 with owned appData/userData/process cleanup audit. Foreground tests remain pending coordination because user is actively typing; no foreground operations have been started by053. Off-desktop helper windows still use show:true, so do not assume they cannot take focus. No push until gates and independent review pass.

Manual draft: open temporary md; confirm no reading button/F11 action, tabs/status/count visible at wide/narrow size; edit/undo, source roundtrip, switch tabs with scrolling, outline jump, new/close all documents; restart same isolated profile and verify preferences/document/bytes. Real Windows IME requires its separately agreed quiet foreground interval; not proven by synthetic/CDP input.

State: implementation complete, acceptance incomplete. M9 remains0/3; RF901 performance unaccepted/paused. Mac, OS associations and real IME are not newly accepted.
