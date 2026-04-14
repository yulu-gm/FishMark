# Yulora Progress

Workflow states:

`TODO` -> `DEV_IN_PROGRESS` -> `DEV_DONE` -> `REVIEW_IN_PROGRESS` -> `CHANGES_REQUESTED` / `ACCEPTED` -> `CLOSED`

Best-known status notes:

- `BOOTSTRAP-DOCS` is now `CLOSED` after acceptance.
- `TASK-001` is now `CLOSED` after passing independent review.
- `TASK-002` through `TASK-024` are `TODO` unless evidence says otherwise.

## Task Status Table

| Task | Epic | Status | Notes |
| --- | --- | --- | --- |
| BOOTSTRAP-DOCS | Docs baseline | CLOSED | Accepted and closed after the docs fixes were verified. |
| TASK-001 | Project skeleton | CLOSED | Accepted and closed after independent review confirmed the Electron/Vite/React/TypeScript shell and dev-shell proof. |
| TASK-002 | Project structure | DEV_DONE | Baseline directories were created for `apps/desktop`, `packages/editor-core`, `packages/markdown-engine`, and `tests/e2e` while keeping the current root shell runnable. |
| TASK-003 | Open Markdown file | TODO | File open flow and error handling. |
| TASK-004 | Save and Save As | TODO | Save status and save-as flow. |
| TASK-005 | Autosave | TODO | Timed autosave and failure safety. |
| TASK-006 | Recent files | TODO | Recent document list and cleanup. |
| TASK-007 | CodeMirror 6 integration | TODO | Base editing surface and shortcuts. |
| TASK-008 | micromark block map | TODO | Markdown block parsing with tests. |
| TASK-009 | Active block state | TODO | Cursor-driven active block tracking. |
| TASK-010 | Heading rendering | TODO | Source-versus-render treatment for headings. |
| TASK-011 | Paragraph rendering | TODO | Stable paragraph display. |
| TASK-012 | List and task list rendering | TODO | List behavior and enter handling. |
| TASK-013 | Blockquote rendering | TODO | Blockquote display and edit behavior. |
| TASK-014 | Link display and editing | TODO | Link text rendering and browser opening. |
| TASK-015 | Image paste | TODO | Paste-to-disk image handling. |
| TASK-016 | Image drag-and-drop | TODO | Drag-drop image import. |
| TASK-017 | Outline sidebar | TODO | Heading-based outline navigation. |
| TASK-018 | Find and replace | TODO | Document search and replacement. |
| TASK-019 | HTML export | TODO | Export current document to HTML. |
| TASK-020 | PDF export | TODO | Export current document to PDF. |
| TASK-021 | Crash recovery | TODO | Restore unsaved state after abnormal exit. |
| TASK-022 | Chinese IME fixes | TODO | Composition and caret stability. |
| TASK-023 | Round-trip regression tests | TODO | Guard against Markdown style rewrites. |
| TASK-024 | Playwright smoke test | TODO | Automated open-edit-save-reopen flow. |
