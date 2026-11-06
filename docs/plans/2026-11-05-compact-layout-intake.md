# Compact layout intake

- Goal: give document content more of the window while retaining readable text and usable controls.
- Scope: workspace edges, editor scrollbars, status bar, rail and document table density. Preserve existing editing, scrolling and theme behavior.
- Landing area: renderer shell and editor styles; focused desktop geometry and interaction coverage.
- Acceptance: scrollbar reaches the window edge and remains keyboard/pointer operable; status and rail controls remain visible; tables remain editable; light/dark and wide/narrow windows retain readable, unclipped content.
- Verification: build, lint, typecheck, targeted unit and desktop end-to-end tests; inspect screenshots in both themes and sizes.
- Risks: scrollbar geometry, focus rings at window edges, wrapping status content, table editing and custom theme overrides.
- Next: fishmark-task-execution, then fishmark-task-acceptance.
