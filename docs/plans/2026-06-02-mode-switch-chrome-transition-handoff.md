# Mode switch chrome transition handoff

## Changed

- Updated the workspace tab strip and app status bar collapse rules so `display: none` is reached through a discrete CSS transition instead of cutting off opacity/transform immediately.
- Follow-up: kept the workspace tab strip mounted during reading mode and collapsed it with `opacity`, `transform`, and `max-height` only. This prevents a restore frame where `grid-row: 2` can land below the single reading-mode workspace row.
- Follow-up: anchored the workspace tab strip to `grid-row: 1` whenever the document workspace is in reading mode. This prevents the editing-to-reading fold-out from creating an implicit second grid row at the bottom of the window.
- Follow-up: locked both the reading-mode tab strip and reading-mode canvas to `grid-column: 1`. Without the canvas lock, CSS Grid auto-placement could split them into implicit columns and break reading mode into a left blank area plus right document column.
- Added a `@starting-style` entry state for the fixed status bar so returning from reading mode to editing mode restores it with fade/slide motion.
- Kept reading-mode layout behavior intact so collapsed chrome still leaves the document canvas pinned to the top.
- Strengthened the existing shell chrome stylesheet test to require the tab strip to avoid display-based collapse while the fixed status bar can still use discrete display transition.

## Files

- `src/renderer/styles/app-ui.css`
- `src/renderer/app.autosave.test.ts`
- `docs/plans/2026-06-02-mode-switch-chrome-transition-intake.md`
- `docs/plans/2026-06-02-mode-switch-chrome-transition-handoff.md`

## Verification

- `npm.cmd run test -- src/renderer/app.autosave.test.ts --reporter=verbose`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `git diff --check -- src/renderer/styles/app-ui.css src/renderer/app.autosave.test.ts docs/plans/2026-06-02-mode-switch-chrome-transition-intake.md`
- `npm.cmd run build`
- Chromium geometry probe through temporary Playwright install in `%TEMP%\fishmark-playwright-probe`: editing-to-reading now reports tab strip `gridRow: 1`, `top: -8` instead of `gridRow: 2`, `top: 748`; a reading-mode transient visible tab strip reports `gridRow: 1`, `top: 0`; the full reading fixture reports tab strip and canvas both on `gridColumn: 1`, with canvas width spanning the workspace.

## Manual Acceptance

1. Open an existing Markdown document so FishMark starts in reading mode.
2. Click into the editor body to enter editing mode.
3. Confirm the left rail, top tab strip, and bottom status bar fade/slide into view instead of appearing abruptly.
4. Press Escape or click blank workspace area to return to reading mode.
5. Confirm the left rail, top tab strip, and bottom status bar fade/slide out together, and the document canvas remains pinned to the top after the transition.

## Notes

- No backlog task id was associated with this direct UI polish bugfix, so `MVP_BACKLOG.md`, `docs/progress.md`, and task summary records were not changed.
- The focused app autosave test passed with existing React `act(...)` warnings in stderr; there were no failing tests.
- Browser plugin tools were not exposed in this thread after plugin installation, so visual debugging used Playwright fallback.
