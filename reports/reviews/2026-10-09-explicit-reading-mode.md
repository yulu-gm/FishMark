# Independent review — explicit F11 presentation mode (2026-10-09)

Scope: current uncommitted changes to `useEditorFocusPresentation.ts`, `App.tsx`, `useSettingsController.ts`, `WorkspaceShell.tsx` and related tests. Reviewer did not implement these changes. This is source-level review; the main agent owns actual Electron and quality-gate execution. No rebuild, full test run, production edit or push was performed by this reviewer.

## Findings and re-review

Two issues were reported during review and corrected by the implementation owner before this report:

1. **P1, resolved:** `useSettingsController` retained `activeDocument` in its callback dependency array after deleting the parameter, producing an undefined identifier / startup failure. Current source no longer references it.
2. **P2, resolved in source:** adding `isSettingsOpen` and `isSettingsClosing` to the generic editor-focus effect caused closing settings in editing mode to queue a frame that could override the settings controller's restored settings-entry focus. Current source removes these dependencies and checks the live modal DOM inside an already-scheduled frame instead. Settings-only changes no longer schedule that competing focus request. The owner is adding delayed actual-window focus assertions; those results are not yet independently available here.

## Current assessment

**No remaining actionable blocker found in the inspected source.** Acceptance still depends on the owner's pending actual-window and gate results; this is not a claim that native IME or every asynchronous interleaving was tested.

- `shellMode` initializes to reading and has one remaining setter call, inside the explicit toggle. Open/recent-open/path-open/drop/new/reload/settings callbacks no longer set presentation mode. Escape no longer changes it. No preference persistence or read-only flag was introduced.
- F11 is handled at window bubble phase, after descendant/capture handlers can consume it. Modifiers, consumed events, repeats, composition flags and keyCode 229 are rejected. A composition ref also covers the explicit button path; window blur clears an interrupted composition state. Native OS IME behavior remains unmeasured.
- The same toggle callback blocks absent documents, settings open/closing, composition and current aria-modal surfaces. The rail entry is disabled for no-document/settings cases and exposes an accessible label, pressed state and F11 shortcut. Mouse-down suppression keeps editor/cell focus while clicking the entry; keyboard activation preserves entry focus through the explicit frame guard.
- Existing active editor inputs/cells and Search input are protected against the transition autofocus. Settings modal DOM is checked at frame execution time, avoiding a stale captured settings-state race. Search still handles Ctrl/Cmd+F and Escape separately; no shell Escape fallback remains to compete with its asynchronous close.
- Open-document blur retains its autosave-suppression token, while ordinary blank-area blur retains the prior save path. Removing automatic shell transitions does not remove the input or save handlers. These conclusions are from code inspection, not newly executed save tests.
- The changed App tests cover explicit toggle, repeat/modifier/IME flags, consumed keys, button entry, new/open/settings mode preservation and unchanged mode on clicks/Escape. Existing focused Search tests are retained. Actual short-document/table geometry, focus after settings animation, reload and file-save behavior need the owner's real-window evidence.

## Limits

No new independent Windows IME session, macOS run, native file-dialog key routing, process-level fullscreen behavior or rendering measurement was run by this reviewer. Frozen launch commit 53d86ac and the separately rejected font candidate are not approved by this review. Presentation jumping is prevented by removing automatic switching; the intentional F11 mode transition may still change layout geometry.

## Final source and evidence re-review

Re-reviewed the final still-uncommitted source and existing evidence. The two earlier findings remain resolved. **Code review PASS for the explicit presentation-mode changes; whole-task/release acceptance remains blocked/incomplete below.** This verdict does not approve unrelated font or launch changes.

Directly inspected `.artifacts/explicit-mode/real-1200-v3/result.json` and its probe assertions. Its first **21 real Electron checks pass**: initial reading; table activation preserves mode and table top in both presentations; F11 and repeated-toggle behavior; repeat suppression; Escape preservation; no fullscreen entry/exit; Search focus in both directions; settings blocking; settings-entry focus still restored 350 ms after closing; visible entry; native undo/redo across toggles; and saved Markdown containing the current cell text. The source and result agree on the delayed settings-focus assertion, resolving the earlier P2 with actual-window evidence rather than only a synchronous test. Table top is 120.5px before/after activation in reading; intentional editing presentation reports 173.5px. This validates removal of automatic activation jumping, not elimination of intentional F11 layout movement.

The same unmodified-path real-window run **ends in a readiness timeout at external reload**, so it is not a fully passing scenario. Its workspace snapshot stores a backslash Windows path; the recorded watcher event uses forward slashes; unchanged `src/main/main.ts:261` finds the session with strict `s.path === path`. The observed mismatch explains why the conflict/reload UI never appears. External reload and subsequent new-document assertions were not reached in that run. This is a concrete existing integration blocker, not evidence of an F11-mode regression. The normalized-open-bridge control also records 21/21 passing checks, then the same external-reload timeout; subsequent new-document assertions were not reached. It requested 850px, but the window minimum width is 900px and screenshot content is 884px: this is a narrow-window control, not a verified 850px viewport. It does not establish a repaired normal Windows path.

Inspected focused-v3 log: **189/189 passing** across three relevant suites. Build-v3, typecheck-final and lint-final logs contain successful completion/no diagnostics, consistent with the owner's reported successful exit status. The reviewer did not re-execute them.

Inspected first full-regression log: **3176 passed, 10 exact known failures, HTML export unexpected failure and symlink unexpected skip; gate FAIL**, with zero collection/hook/unhandled errors. The export-specific subsequent suite passed **5/5**, but isolation does not erase the original full-run failure. Verified the completed sequential rerun in regression-final.json / regression-final.log: 3177 passed, 10 exact known failures, only the symlink unexpected skip, and zero collection/hook/unhandled errors. HTML export passes in this full run. The first full-run export failure remains retained in regression-first.json; it is not erased or proven root-caused. The final gate remains FAIL solely for the symlink skip.

Remaining limits: native Windows IME, macOS/Linux, and every asynchronous interleaving are unmeasured. The actual Electron menu/fullscreen checks above supersede the earlier source-only fullscreen limitation for this measured Windows build. No reviewer production edits, rebuilds, installations, system changes, commits or pushes.

Verified final formal.json / formal.log: PASS, 121/121 cases, 2541 targets, unexpected 0 and not-run 0. Verified bundle.log: totalJsGzipBytes 1429358 / 1430000 PASS. Final independent assessment remains code-review PASS for the explicit-mode change, with normal-path external reload blocked and the Windows symlink gate still failing; this is not unrestricted release acceptance.

