# Rail Tooltip Layering Hotfix Handoff

Date: 2026-05-30
Task: left rail table tooltip layering hotfix
Status: DEV_DONE

## What Changed

- Fixed the left rail table-tool tooltip being covered by the workspace column.
- Narrowed the generic app-layout stacking rule so it no longer applies to `.app-rail`.
- Kept the rail on `--fishmark-z-shell` while workspace chrome remains on the normal layout layer.
- Updated the existing rail tooltip style test so a future specificity regression is caught.

## Landing Files

- `src/renderer/styles/app-ui.css`
- `src/renderer/app.autosave.test.ts`
- `docs/plans/2026-05-30-rail-tooltip-layering-handoff.md`

## Verification

- `npm.cmd run test -- src/renderer/app.autosave.test.ts`
- Browser probe on `http://127.0.0.1:<ephemeral>/`
  - tooltip crossed the workspace boundary
  - computed rail z-index: `2`
  - computed workspace z-index: `1`
  - tooltip text rendered fully as `Row Above`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`

## Manual Verification Draft

1. Open a document that contains a Markdown table.
2. Put the cursor inside the table so the left rail switches to table editing tools.
3. Hover each rail table tool.
4. Confirm the tooltip renders fully to the right of the rail and is not hidden behind the workspace canvas.

## Known Risks

- The fix targets the app-owned rail/workspace stacking contract only; theme packages that independently override rail z-index or overflow would still need theme-specific fixes.

## Next Skill

`$fishmark-task-acceptance`
