# TASK-READING-RHYTHM-046

Goal: improve the minimal document's heading/body separation and coherent vertical rhythm, retaining responsive width.
In scope: measured CSS typography and block spacing, active/inactive parity, representative owned long-document evidence and focused product regressions.
Out of scope: decorations/extra chrome, width caps, source blank-line semantics, syntax visibility, parsing/editing/history algorithms, table column sizing, M9/cp13/cp16/Library download candidates.
Landing area: editor-source.css/markdown-render.css and canonical rendering standard if measured targets change; product typography regression and project records.
Acceptance: readable balanced heading hierarchy and body/list/table/code transitions in wide/minimum-width windows, light/dark and F11 shell modes; no reveal displacement or new tab-reading/outline/table-click scrolling regressions; source/canonical/disk unchanged.
Verification: same-build before/after owned screenshots and DOM/native geometry, focused layout/editor/product tests, lint/typecheck/build/strict, full Windows E2E, foundation/editing/safety/formal/bundle, independent review, ordinary main push and exact-SHA four-job CI.
Risks: CodeMirror virtualization measures boxes, so no external vertical margins; preserve active/inactive heights and nested container geometry. Existing source separators remain collapsed/visible under their current rules.
Doc updates: backlog/progress/design/decision/test-cases/test-report/handoff/task summary.
Next skill: fishmark-task-execution then fishmark-task-acceptance. Baseline main df16c2f5dbfae40159bb99917a285c03eb3c1645, CI38785088778 all4 success.
