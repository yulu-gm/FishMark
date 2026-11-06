# Compact layout handoff

- Shell geometry removes the document workspace's inline gutter and root scrollbar reservation, keeps an edge-aligned overlay scrollbar and a 34px status strip, and narrows the rail without shrinking its 42/44px controls.
- Editor content margins and table cell padding are reduced. Safe-area inset and focus indicators remain in place.
- Changed renderer styles, existing layout contract assertions, and `tests/e2e/compact-layout.spec.mjs`; design notes are updated in `docs/design.md`.
- Verify with `npm run build`, `npm run lint`, `npm run typecheck`, targeted Vitest and `npm run test:e2e -- tests/e2e/compact-layout.spec.mjs tests/e2e/permanent-chrome.spec.mjs tests/e2e/reading-rhythm.spec.mjs`.
- Manually inspect light/dark at wide and minimum window sizes; drag and keyboard-scroll, open the outline, edit a table, and check save status and focus rings. Repeat with community themes and platform DPI configurations where available.
- Risk: fixed status strip can wrap under extreme localization or zoom; physical pointer capture and Windows per-monitor DPI require platform coverage.

## Verification on 2026-11-05

- `npm run build`, `npm run lint`, `npm run typecheck`: passed with Node 22.23.4. Targeted Vitest: 7 files, 556 tests passed.
- Electron 41.2.0 on macOS: 7 desktop tests passed, covering explicit Quit, light/dark layout at 900/1280px, scrollbar keyboard and synthetic pointer drag, table typing/undo, outline, permanent chrome and reading rhythm. Three Windows-only nested-editing cases were skipped. Screenshots were inspected.
- Explicit Quit now resumes after asynchronous window close even on macOS; ordinary last-window close still preserves macOS app behavior. The permanent-chrome test uses the platform's undo shortcut.
- Ordinary existing table-cell input now edits only that cell's source; document undo restores original spacing and delimiter spelling. Structural row/column operations retain the formatter.
- The implicit-cell limitation observed in the first pass is resolved by the follow-up below.
- Physical OS pointer capture, Windows DPI, community themes, screen-reader coverage and Windows-only nested-editing remain untested.

## Implicit-cell history resolution

- Initial failure evidence is retained in `.artifacts/e2e/implicit-repro-20261105/`. Native contenteditable history changed text without inverting the source structure transaction.
- All table history entry points now use CodeMirror history, including the application menu. Text and separator insertion share one transaction; history does not infer intent from empty text.
- Missing cells append only necessary delimiters. Existing spacing, alignment spelling, escaped pipes, and CRLF survive unchanged. A mapped, invertible selection effect retains the exact semantic cell when multiple missing cells share a source offset.
- Adjacent typing groups within one cell; deletion, paste, committed composition and cross-cell changes remain separate. Source mode and table mode share history, redo branches are invalidated by new edits, and external form fields retain browser history.
- The four original `fixme` cases are now active and expanded with escaped/padded rows, multiple missing body cells, clear/retype/cross-cell history, menu/source-mode history, Chromium composition and menu/shortcut Select All deletion. No required case is skipped.
- Final validation and artifact paths are recorded in `docs/test-report.md`. No commit or push was made; base remains `2063abc245586c5769baa2fe627855b5c21828ee`.

- Follow-up: Electron Select All previously focused the outer CodeMirror host and collapsed the cell selection. The cell and Edit menu now select the cell content while retaining focus; regression covers selection, deletion and two undo steps.
