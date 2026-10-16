# TASK-PERMANENT-CHROME-053 intake

Goal: remove reading shell layout and its button/F11 entry;document tabs,status bar and word count stay visible in single/multiple/no-document workspaces and wide/narrow windows.

Baseline: official main d4d060422185929cbf83967b578c742976d5f32b/tree95a806742a5b6b11528561106fe4c9ffb07c4c39,clean isolated existing checkout,remote freshly fetched and matched. Prior050/051/052 evidence frozen separately;performance candidates paused.

In scope: remove shell mode state/props/folding CSS/toggle handler;retain heading/inline/block source-marker presentation state separately with original initialreading/accepted-edit→editing behavior;retain source/WYSIWYM mode. Keep theme runtime readingMode compatibility signal at0. Verify legacy stored data cannot reintroduce hidden chrome without resetting other preferences/session data. Empty tab region remains,word count0.

Out of scope: parser/cache/column-width/font/typography changes,global marker visibility,editor history/session/ACK/reload changes,performance sampling,budget/allowlist changes,cp13/cp16/Library work,system settings or other programs.

Landing: renderer App/focus presentation/WorkspaceShell/tab/status components and CSS,theme environment wiring,associated unit/product tests. Inspect shared preferences and main menu before claiming migration or removal;do not invent a persisted field that never existed.

Acceptance: no reading-mode button or F11 shell action/inactive state;tabs/status/count visible even empty/narrow/restarted old settings;source toggle,selection/undo/dirty/save,marker behavior,Tab viewport/outline/count updates remain correct. Existing prefs/session data accepted without hidden chrome. Minimal layout retained.

Verification: focused RED/GREEN unit/layout/source-marker/focus/preferences tests;fresh lint/type/build/strict regression/bundle/foundation/editing/safety/formal;isolated production-window single/multiple/empty/wide/narrow/restart/viewport/outline/count flows. User online: background off-desktop/no OS input first;native front-desktop tests only after coordination. Always owned appData/userData,tracked processes and real input guard. Independent6.1-sol review before ordinary main fast-forward;exactSHA four official CI and raw Windows evidence audited after push.

Docs: backlog/design/decision/progress/test-cases/test-report/task-summary plus execution handoff. M9 and RF901 performance acceptance unchanged.

Next: fishmark-task-execution,then fishmark-task-acceptance.
