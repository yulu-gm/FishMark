# TASK-052 Intake: Dev-only Input Recorder

Task: `TASK-052`

Goal: Add a dev-only editor input recorder that can start from a lower-right debug icon, capture the active document's starting snapshot, record keyboard input steps while showing recent input labels, stop on demand, and write a temp JSON artifact containing the input sequence plus start/end document snapshots for later reproduction.

In scope:

- Dev/debug-mode-only lower-right recorder icon in the editor shell.
- Manual start/stop recording flow.
- Start and end document snapshots with content and selection.
- Keyboard input event sequence for the active CodeMirror editor.
- Recent input label display while recording.
- Dev-only main/preload bridge for writing the final artifact under the OS temp directory.
- Release/package exclusion of debug recorder UI and writer logic.
- Focused unit tests for recorder state, bridge gating, writer behavior, UI visibility, and package exclusion.

Out of scope:

- System-wide keyboard logging.
- Recording input outside the active editor surface.
- Mouse click, drag selection, geometry, or screenshot capture.
- IME-specific replay guarantees.
- Automatic scenario/test generation from the artifact.
- Long-term persistence outside the generated temp artifact.

Landing area:

- `src/renderer/editor/App.tsx`
- `src/renderer/editor/WorkspaceShell.tsx`
- `src/renderer/code-editor-view.tsx`
- `src/renderer/code-editor.ts`
- New focused renderer recorder module under `src/renderer/editor/` or `src/renderer/debug/`
- New dev-only shared/main/preload debug recording bridge modules
- `src/main/main.ts` / window creation path for dev-only bridge flag and handler registration
- `src/preload/preload.ts` only for gated dev bridge wiring
- `electron-builder.json` for package exclusion
- Focused tests near touched modules

Acceptance:

- In dev/debug mode with a document open, the lower-right recorder icon is visible.
- In release/product mode, the recorder icon and debug bridge are absent.
- Start recording captures active tab id, document metadata, content, and selection.
- Keyboard input appends ordered steps and updates the visible recent-input ticker.
- Stop recording writes one JSON artifact to `<os-temp>/FishMark/input-recordings/`.
- Artifact includes `protocolVersion`, app metadata, document metadata, start snapshot, end snapshot, ordered steps, and an end reason.
- Active document changes interrupt the recording and mark the artifact as `endedBy: "document-changed"`.
- Existing editing, autosave, undo/redo, and Markdown source behavior do not change.

Verification:

- `npm run lint`
- `npm run typecheck`
- `npm run test -- src/renderer/code-editor-view.test.tsx src/renderer/editor/WorkspaceShell.test.tsx src/preload/preload.test.ts src/preload/preload.contract.test.ts src/main/main.test.ts src/main/package-scripts.test.ts`
- `npm run build`
- Manual dev run: start recording, type normal text / Enter / Backspace, stop, and inspect the temp JSON artifact.
- Package exclusion check through the focused package script/config test.

Risks:

- IME: first slice records key/input events but does not promise IME replay correctness.
- Cursor/selection: snapshots must be read after CodeMirror settles so steps reflect the real editor state.
- Undo/redo: recorder listeners must not dispatch editor transactions or interfere with history.
- Autosave: recorder artifact writes must be separate from Markdown file save/autosave.
- Round-trip: recorder must only observe editor state; it must not rewrite Markdown.
- Cross-platform: temp path creation and path reporting must work on Windows and macOS.
- Release safety: debug modules must be gated and excluded so packaged builds cannot expose the recorder.

Doc updates:

- `MVP_BACKLOG.md`: add `TASK-052`.
- `docs/progress.md`: add `TASK-052` as TODO.
- `docs/superpowers/specs/2026-05-24-debug-input-recorder-design.md`: canonical design.
- On implementation completion: update `docs/test-report.md`, `docs/decision-log.md` if release stripping architecture changes, and `reports/task-summaries/TASK-052.md`.

Next skill: `$fishmark-task-execution`
