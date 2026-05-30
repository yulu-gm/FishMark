# Clipboard Image Import Hotfix Handoff

Date: 2026-05-30
Task: clipboard-image-import hotfix, related to TASK-015 and TASK-059
Status: DEV_DONE

## What Changed

- Preserved existing saved-document paste behavior:
  - Pasting into a saved Markdown document still writes into the document sibling `assets/` directory.
  - The inserted Markdown remains a relative path such as `![today](assets/today-image-20260530-102600.png)`.
- Fixed corrupt screenshot paste output:
  - Main process no longer blindly writes `clipboard.readBuffer("image/*")` bytes to disk.
  - The importer validates encoded image signatures before writing.
  - If the advertised image buffer is not a valid encoded PNG/JPEG/WebP/GIF, it falls back to Electron `clipboard.readImage().toPNG()`.
- Updated the TASK-059 intake so future temporary-directory work only applies when the current tab has no saved document path.

## Landing Files

- `src/main/clipboard-image-import.ts`
- `src/main/clipboard-image-import.test.ts`
- `docs/plans/2026-05-30-task-059-clipboard-image-temp-directory-intake.md`
- `docs/plans/2026-05-30-clipboard-image-import-hotfix-handoff.md`
- `docs/decision-log.md`
- `docs/test-report.md`

## Verification

- `npm.cmd run test -- src/main/clipboard-image-import.test.ts`
- `npm.cmd run test -- src/main/clipboard-image-import.test.ts src/preload/preload.contract.test.ts src/renderer/code-editor.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run test`

All commands passed after the fix. Full Vitest result: 105 files, 1151 tests passed.

## Manual Verification Draft

1. Open or create and save a Markdown document.
2. Take a screenshot or copy an image from an external app.
3. Paste into FishMark.
4. Confirm a new image file appears in the document sibling `assets/` directory.
5. Open the image file from disk and confirm it is a valid previewable image.
6. Confirm FishMark inserted relative-path Markdown and the editor preview renders.
7. Press undo and confirm only the inserted Markdown is removed; the asset file remains on disk.

## Known Risks

- This hotfix does not implement unsaved-document temporary image directories; that remains TASK-059.
- Renderer paste interception still depends on the DOM paste event reaching CodeMirror. TASK-059 should add broader external clipboard fallback behavior if needed.
- Animated GIFs are preserved only when a valid GIF buffer is available; native-image fallback produces a PNG still image.

## Next Skill

`$fishmark-task-acceptance`
