# TASK-UX-RELOAD-001 — Windows external change routing and conflict refresh

Status: local checkpoint after `45f27b21ec52f524a7781bb8eefd2f3e339dc869`; no push. Local main remains frozen at `53d86ac377e6a8610c45be8d8f8c6cde3c611b4b`.

## Cause and bounded change

The prior real Electron run received a forward-slash watcher event while its canonical workspace session stored backslashes. Main used raw string equality and never marked the conflict. Extracting that exact callback into a testable helper reproduced both separator directions as failures on this machine (`baseline-routing.log`, 2/2 failed).

A path-only repair was insufficient: the current renderer application had no subscription to the existing external-file-change bridge event. `real-patched` therefore still timed out before a conflict banner. The final repair addresses both links:

1. Share the existing file-identity resolver's Windows-only case policy with watch-to-session matching. Node's platform path normalization preserves UNC roots and POSIX backslashes; no global lowercase or physical-alias discovery is added. The watch registry retains Windows forward-slash notifications while leaving POSIX path semantics intact.
2. Subscribe the renderer application to the existing notification and use its existing serialized workspace snapshot refresh. Main remains the authority for conflict state. Repeated start does not duplicate the subscription; dispose unsubscribes. A returned snapshot checks that the application is still active before publishing.

No automatic disk reload, user-content replacement, conflict-resolution override or new watcher architecture. Only `externalChange` is marked; existing keep-memory/reload/save-as decisions remain intact. Windows case-sensitive directories retain the resolver's pre-existing Windows case policy; this change does not claim new support for them.

## Tests and actual-window evidence

All raw evidence remains under `.artifacts/reload-path/` in the isolated checkout. Old F11 failures remain under `.artifacts/explicit-mode/`.

- Unit/integration coverage includes both separator directions, Windows case equivalence, POSIX/macOS case distinction, POSIX literal backslashes, UNC versus single-root paths, Chinese/spaces, different directories, inactive dirty documents, unrelated documents and untitled tabs. Watcher normalization explicitly selects the tested platform rather than assuming the host.
- Existing file identity, reload and conflict-choice tests were included. Renderer tests cover pending adapter content/dirty state, editor binding, subscription lifecycle and an IPC snapshot that resolves after disposal.
- Earlier focused run: 117 passed + existing symlink skip. Adding the lifecycle guard initially failed four old expectations that accepted a refresh after disposal; these now expect failure while retaining all no-destructive-IPC assertions. The raw failure is preserved in `focused-final.log`.
- Actual Electron `real-final/result.json`: **31/31 PASS**, window 1200x850, DPR=1. This is the final build including the lifecycle guard. `real-complete` is the earlier complete successful run before that guard.
- Two real files are open: `中文 空格 Note.MD` and `Other 中文.md`. A native cell edit remains dirty when external disk modification raises the conflict banner. Clicking **保留当前编辑** keeps dirty text and does not write the disk. Another external change raises a new conflict. Only clicking **重载磁盘版本** adopts disk text, clears conflict and dirty state, and preserves editing presentation. Switching to the other tab preserves its content. New-document mode preservation is then verified.
- The same real run repeats the original F11/search/settings/undo/redo/save checks and verifies no fullscreen conflict. `dirty-conflict.png` and `reloaded.png` were visually inspected.
- Native IME, actual UNC/network storage, Windows case-sensitive directories and native POSIX/macOS filesystems are not measured. Their lexical cases are unit-tested where stated. No OS settings, file associations or allowlist changes.

## Review

[Independent review](../reviews/2026-10-09-external-reload-path.md) initially passed the path repair, then found a P2 lifecycle issue in the notification refresh: a late IPC result could update a disposed application. The final guard and delayed-result test resolve it; source re-review PASS. This is scoped acceptance of this repair, not a release or M9 acceptance.

## Final gates

- Build, typecheck and lint PASS (build-final.log, typecheck-final.log, lint-final.log; command completed with exit 0).
- Unchanged full regression: **3192 passed, 10 exact known failures, one unexpected symlink skip, zero collection/hook/unhandled errors; gate FAIL**. The 15 added tests pass in this full run. Raw regression.json and regression.log. No HTML export unexpected failure in this run.
- Formal editor behavior: **121/121 cases, 2541 targets** (79 existing + 2363 runner + 99 known defects); unexpected 0, not-run 0. Raw formal.json and formal.log.
- Original renderer bundle contract PASS: **1429418 / 1430000 gzip bytes**, +60 versus F11 checkpoint. Raw bundle.log.
- Real final build: **31/31 PASS**, described above. The previous real reload blocker is resolved for this measured scenario; OS IME and other platform limits are unchanged.

The symlink permission/skip remains a release gate blocker. No exception was requested or assumed. Frozen launch main, reverted font state and cp13/cp16 remain unchanged.
