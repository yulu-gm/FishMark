# Mode switch chrome transition intake

## Goal

Make reading/editing mode switches animate the top workspace tab strip and bottom status bar with the same smoothness as the left rail.

## Scope

- Keep the existing reading/editing mode state model and data attributes.
- Preserve the current reading-mode layout that removes collapsed chrome from the workspace flow.
- Let the tab strip and status bar fade/slide during collapse and restore.
- Update the existing stylesheet regression test so display-based collapse cannot silently bypass the transition.

## Non-goals

- No new shell mode, preference, or theme token.
- No change to editor content rendering or Markdown behavior.
- No backlog/progress status update because this is a direct UI polish bugfix without a numbered task id.
