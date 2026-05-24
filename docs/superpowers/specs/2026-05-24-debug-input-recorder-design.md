# Dev-only Input Recorder Design

Date: 2026-05-24
Task: TASK-052

## Purpose

FishMark editing bugs are often hard to reproduce from a written report alone. This task adds a dev-only input recorder that lets a developer start a short recording from the editor UI, reproduce the problem, stop the recording, and receive one JSON artifact containing the actual input sequence plus the document start and end snapshots.

This is a diagnostic tool for development builds, not a product feature. It must never appear in packaged release builds.

## Goals

- Show a bottom-right debug icon in dev/debug mode.
- Start recording only after the user clicks the icon.
- Capture the document content and selection at recording start.
- Display the current keyboard input stream while recording.
- Store the input sequence in memory during the session.
- Stop recording when the user clicks the icon again.
- Write one JSON file to the OS temp directory with metadata, input steps, start snapshot, and end snapshot.
- Make packaged release builds exclude the recorder UI and backend writer logic.

## Non-goals

- No system-wide keylogging.
- No recording outside the active CodeMirror editor.
- No mouse click, drag selection, or layout geometry capture in the first slice.
- No IME-specific replay guarantees in the first slice.
- No automatic conversion to a test scenario yet.
- No long-term persistence outside the temp artifact generated at stop time.

## Debug Mode Availability

The recorder is available only when all of these are true:

- The app is running from the dev shell, not a packaged app.
- The main window passes a dev-only debug-recorder flag into preload.
- Preload exposes a dev-only `window.fishmarkDebug` bridge.
- The renderer is running with `import.meta.env.DEV`.

Packaged apps must have no recorder icon, no active debug bridge, and no packaged debug writer module. The substantial main/preload debug writer code should live in separate dev-only modules that are dynamically imported in dev and excluded by package rules.

## User Flow

1. In a dev build with a document open, the lower-right corner shows a small debug input recorder icon.
2. The idle icon has an accessible label equivalent to "Start input debug recording".
3. Clicking the icon starts a recording bound to the current active tab/document.
4. The button switches to an active "stop recording" state.
5. While active, a compact ticker near the icon shows recent input labels such as `a`, `中`, `Enter`, `Backspace`, or `Ctrl+B`.
6. Clicking the icon again stops the recording.
7. FishMark captures the ending document snapshot and asks the dev-only main process writer to create the JSON artifact under the OS temp directory.
8. The UI reports the artifact path using the existing notification surface or a small recorder status message.

If the active document changes during a recording, the first implementation should stop the recording and mark the artifact as interrupted by document change. A single recording is scoped to one active tab.

## Artifact

Artifacts are written under:

```text
<os-temp>/FishMark/input-recordings/
```

File names should be stable and sortable:

```text
fishmark-input-recording-YYYYMMDD-HHMMSS-sss.json
```

The JSON format starts at protocol version 1:

```ts
type DebugInputRecordingArtifact = {
  protocolVersion: 1;
  sessionId: string;
  createdAt: string;
  endedAt: string;
  endedBy: "user" | "document-changed" | "editor-destroyed" | "write-error";
  app: {
    version: string;
    platform: NodeJS.Platform;
    runtimeMode: "editor" | "test-workbench";
  };
  document: {
    tabId: string;
    name: string;
    path: string | null;
  };
  startSnapshot: DebugDocumentSnapshot;
  endSnapshot: DebugDocumentSnapshot;
  steps: DebugRecordedInputStep[];
};

type DebugDocumentSnapshot = {
  content: string;
  selection: { anchor: number; head: number };
  timestamp: string;
};

type DebugRecordedInputStep = {
  id: string;
  elapsedMs: number;
  label: string;
  event:
    | { kind: "keydown"; key: string; code: string; repeat: boolean }
    | { kind: "beforeinput"; inputType: string; data: string | null }
    | { kind: "input"; inputType: string; data: string | null };
  modifiers: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
  };
  before: DebugDocumentSnapshot;
  after: DebugDocumentSnapshot;
};
```

The artifact intentionally stores full start/end content. This is necessary for reliable reproduction and should be treated as local diagnostic data.

## Architecture

### Renderer Recorder

Add a focused recorder module in `src/renderer/editor/` or `src/renderer/debug/`. It owns recording state, recent labels, and start/end snapshots. It listens only to the active editor's CodeMirror DOM/input surface and reads content/selection through the existing `CodeEditorHandle`.

The recorder should not change editor behavior. Event listeners must be passive where possible and must not call `preventDefault()`.

### UI Surface

`WorkspaceShell` receives recorder state and callbacks from `EditorShell` and renders a small bottom-right floating control. The control is only mounted in dev mode when the debug bridge is available. It stays outside the document flow so it cannot shift editor layout.

### Dev-only Main Writer

The main process exposes a dev-only IPC handler that writes the final JSON artifact to the OS temp directory. The handler should:

- Reject calls when the app is packaged.
- Create the temp output directory if needed.
- Sanitize file names by using generated timestamps/session ids only.
- Return `{ status: "success", path }` or `{ status: "error", message }`.

### Preload Bridge

Preload exposes a narrow dev-only bridge, for example:

```ts
window.fishmarkDebug.writeInputRecordingArtifact(payload)
```

The bridge exists only when the main process passes a dev debug-recorder argument into the window. Product bridge APIs stay unchanged.

## Release Stripping

Release stripping is part of the acceptance criteria:

- Renderer UI is behind `import.meta.env.DEV` and should be omitted from the production renderer bundle.
- Main/preload debug writer logic lives in separate modules dynamically imported only in dev.
- `electron-builder.json` excludes compiled debug-recorder modules from packaged apps.
- Tests verify that packaged-app configuration does not include dev debug modules and that the bridge is not exposed without the dev flag.

This allows the dev shell to keep the tool while packaged release builds remain clean.

## Testing

Focused tests should cover:

- Dev bridge availability is gated by the dev flag.
- The recorder icon is absent when the debug bridge is unavailable.
- Starting a recording stores the start snapshot.
- Keyboard input appends readable labels and structured steps.
- Stopping a recording sends an artifact with start/end snapshots and steps.
- A tab/document change interrupts the recording and writes an interrupted artifact.
- The main writer writes to the temp directory and rejects packaged-mode calls.
- Package config excludes debug-recorder modules.

Manual verification should include a simple edit session:

1. Start dev app.
2. Open a Markdown document.
3. Click the lower-right debug icon.
4. Type a short sequence including normal text, `Enter`, and `Backspace`.
5. Confirm recent input labels are visible.
6. Click stop.
7. Confirm a temp JSON artifact exists and includes start/end content plus input steps.

## Acceptance

- In dev/debug mode, an open editor shows a lower-right input recording icon.
- Clicking start captures the current document content and selection.
- Typed keyboard input appears in the lower-right debug display while recording.
- Clicking stop creates a JSON artifact in the OS temp directory.
- The artifact includes metadata, start snapshot, end snapshot, and ordered input steps.
- Product/release builds do not show the recorder and do not package the debug writer logic.
- Existing editing behavior, autosave, undo/redo, and Markdown round-trip behavior are unchanged.
