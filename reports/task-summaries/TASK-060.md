# TASK-060 Summary

Status: DEV_DONE
Result: PASS
Date: 2026-06-02

## Scope

Provide a window-scoped full-document source mode on the existing CodeMirror editor, with Markdown text remaining the only document truth.

## Changes

- Added explicit `wysiwym` / `source` editor view mode state in editor-core and renderer.
- Added a status bar `</>` toggle with `aria-pressed` and mouse-down focus preservation.
- Switched view mode through a CodeMirror `StateEffect` / `StateField`, without rebuilding `EditorState`.
- Gated Markdown preview decorations in source mode so only the physical text editing surface remains.
- Disabled hidden-marker selection normalization and block pointer interactions while source mode is active.
- Preserved source mode across document replacement in the same window while keeping new editor instances defaulted to WYSIWYM.
- Added editor-core, controller, React shell, and autosave-sensitive focused tests.
- Added `TC-060-SOURCE` manual acceptance coverage.

## Evidence

- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/editor/WorkspaceShell.test.tsx src/renderer/app.autosave.test.ts`: passed, 4 files / 423 tests.
- `npm.cmd run test -- src/renderer/code-editor-view.test.tsx`: passed, 1 file / 5 tests.
- `npm.cmd run test`: passed, 107 files / 1181 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `git diff --check`: passed with only LF/CRLF warnings.

## Manual Acceptance

1. Open a Markdown file containing a heading, link, image, table, task list, blockquote, code fence, thematic break, and inline formatting.
2. Confirm the default view still shows the existing WYSIWYM reading / editing presentation.
3. Click `</>` in the status bar and confirm the button changes to `aria-pressed="true"`.
4. Confirm every Markdown structure is visible as raw source text and no preview widget, hidden marker, task checkbox widget, table widget, quote rail, code highlight, or thematic-break preview remains.
5. Move the cursor, type in source mode, undo, and confirm content, selection, dirty state, and autosave behavior stay stable.
6. Switch to another tab in the same window and confirm source mode remains active.
7. Click `</>` again and confirm the default WYSIWYM presentation returns.
8. Save or export HTML and confirm source mode does not change the Markdown input.

## Residual Risk

- The status bar follows the existing reading-mode chrome collapse, so the toggle is visible from editing chrome. Source mode itself is still window-scoped once toggled.
- Visual scroll preservation is covered by avoiding `EditorState` rebuild, but this task did not add a separate browser scroll-position probe.
- Mermaid preview now also uses the same source mode gate as TASK-045 footnotes and TASK-046 math.
