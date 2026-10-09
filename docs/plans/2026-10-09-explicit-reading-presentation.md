# Explicit reading presentation — 2026-10-09

This user-approved interaction replaces the automatic entry/exit rules in the April 19 reading/editing design. It does not change the editor's text model.

- A new application session starts in reading presentation. Reading remains editable; it is not a read-only document state.
- Plain F11 or the persistent book button in the left rail toggles reading/editing presentation. Its label, pressed state and shortcut identify the action.
- Clicking or focusing a paragraph/table, losing focus, pressing Escape, opening/newing a document, reloading disk content and opening/closing settings do not change the selected presentation. Search retains its own Escape behavior.
- F11 repeats, modified/consumed events and composition events do not toggle. An active modal or settings transition takes precedence. The button shares the same guards.
- The choice is session-local. No preference or persistence is introduced.
- Existing editor/cell and Search focus is retained during explicit toggles. Opening a document retains its existing autosave-suppressed blur; new untitled documents retain focus. Settings owns restoration of its prior focus.

Removing implicit transitions prevents a table click from causing the known 53px shell movement. An intentional F11 transition still changes shell layout. The separate preview/editing font mismatch and column width algorithm are unchanged.

See [checkpoint and validation](../../reports/task-summaries/TASK-UX-MODE-001.md). This local candidate does not imply release acceptance or completion of M9.
