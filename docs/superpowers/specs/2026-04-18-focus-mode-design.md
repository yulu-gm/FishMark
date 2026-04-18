Date: 2026-04-18
Scope: renderer shell, settings drawer, shared preferences, renderer tests, design docs

## Goal

Add a shell-level focus mode that helps the writing canvas feel quieter without changing editor semantics.

The feature must support:

- optional manual entry and exit from the shell UI
- optional automatic entry based on keyboard activity and idle time
- automatic exit for pointer-driven activity
- settings controls for choosing manual vs auto triggering and idle timing

The feature must not affect Markdown content, CodeMirror transaction semantics, autosave persistence, or round-trip guarantees.

## Problems To Solve

The current shell keeps all chrome visible all the time:

- the left rail is always visible
- the workspace header is always visible
- the bottom status bar is always visible

That is calm enough for normal editing, but it does not provide a stronger writing-focused state. The desired mode should collapse non-essential shell chrome while keeping the document canvas stable.

## Approved Interaction Model

### 1. Focus Surface

Focus mode only changes shell chrome:

- collapse the left rail
- collapse the workspace header
- collapse the bottom status bar

The following surfaces stay independent:

- the outline panel is not controlled by focus mode
- the settings drawer is not collapsed by focus mode, but it overrides focus runtime state

This keeps focus mode scoped to the app shell rather than document or panel state.

### 2. Manual Focus

Manual focus is preference-driven.

When `focus.triggerMode` is `manual`:

- a subtle icon appears in the editor region's top-left corner
- click once to enter focus mode
- click again to exit focus mode

Settings do not directly enter focus mode. They only choose whether focus is triggered manually or automatically.

### 3. Automatic Focus

Automatic focus mode is preference-driven.

When enabled:

- keyboard input enters focus mode
- editor idleness enters focus mode after a configured delay
- pointer movement, wheel input, and similar pointer-driven interactions exit focus mode

The initial requested delay is 3 seconds, but users may change it.

### 4. Settings Override

The settings drawer has higher priority than focus mode.

Rules:

- opening settings immediately exits focus mode
- while settings is open or closing, focus mode cannot be re-entered automatically
- outline state is preserved through this process because it is outside focus mode control

### 5. Focus Source Semantics

Focus mode needs a source so behavior stays predictable:

- `manual`: entered from the editor-corner toggle
- `auto`: entered from keyboard activity or idle timeout

Exit behavior differs by source:

- pointer activity exits only `auto`
- manual exits require explicit user action or the settings override

## Preferences Model

Add a new persisted `focus` section to shared preferences:

- `triggerMode: "manual" | "auto"`
- `idleDelayMs: number`

Default values:

- `triggerMode: "auto"`
- `idleDelayMs: 3000`

Rationale:

- the request explicitly asks for both manual and automatic switching
- the manual entry should only appear when the user chooses manual triggering
- 3000 ms matches the agreed baseline
- runtime focus state should reset on relaunch to avoid surprising startup chrome state

Validation rules:

- support values from 500 ms to 30000 ms
- clamp out-of-range values
- round to the nearest integer millisecond

## Settings UI

Add a new `Focus` settings group with:

1. `Focus trigger mode`
   - persisted enum with `Manual` and `Auto`
   - `Manual` renders the editor-corner focus icon
   - `Auto` hides the icon and enables keyboard and idle-based focus entry

2. `Focus after idle`
   - supports dropdown selection and direct numeric entry
   - display and input use seconds
   - persistence uses milliseconds

Preset list:

- `0.5s` to `5s` with `0.5s` steps
- `5s` to `10s` with `1s` steps
- `10s` to `30s` with `5s` steps

Manual entry rules:

- accept integer or decimal seconds
- commit on blur
- clamp to `0.5s - 30s`
- if parsing fails, restore the last valid persisted value

## Shell UI Changes

### Rail

The rail keeps brand and settings only. In focus mode it should animate fully off-screen to the left rather than merely hiding internal content.

### Manual Entry

Add a subtle focus-mode entry in the editor region. The entry:

- only renders when `focus.triggerMode` is `manual`
- remains available during focus mode so users can exit manually
- reflects active state visually without becoming a dominant control

### Header And Status Bar

The workspace header and status bar collapse with animation when focus mode activates. The document canvas keeps its mount state and sizing context so the editor does not remount.

### Layout Behavior

The shell should collapse chrome through class and data-attribute driven layout state, not by conditionally unmounting large structural containers that could destabilize focus or sizing.

## Runtime State Model

The renderer shell should track:

- `isFocusModeActive`
- `focusModeSource: "manual" | "auto" | null`
- shell visibility markers for rail, header, and status bar

The outline state remains separate:

- `isOutlineOpen`
- `isOutlineClosing`

The settings state remains separate:

- `isSettingsOpen`
- `isSettingsClosing`

Automatic focus should be implemented with a small shell-level input controller rather than embedding pointer or keyboard logic into the editor package.

## Testing Strategy

Add renderer tests for:

- preference normalization and merging for `focus`
- settings rendering and persistence for trigger mode and idle delay
- editor-corner manual toggle behavior
- automatic entry on keyboard input
- automatic entry on idle timeout
- automatic exit on pointer movement and wheel input
- settings opening forces non-focus
- outline state remains unchanged while focus mode toggles
- shell chrome visibility changes without unmounting the editor
- focus-mode animation rules for rail, header, and status bar

## Non-Goals

This task does not include:

- changing editor content behavior
- changing outline behavior
- hiding the settings drawer inside focus mode
- adding a command palette, shortcuts, or menu items for focus mode
- changing autosave semantics

## Documentation Impact

Because this is a user-visible shell behavior change, implementation should also update:

- `docs/design.md`
- relevant renderer tests
- task summary and report files at completion time
