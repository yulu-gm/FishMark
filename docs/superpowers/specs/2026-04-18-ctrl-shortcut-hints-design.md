# Ctrl Shortcut Hints Design

## Summary

Add a lightweight shortcut hint overlay for the document editor. When the editor has focus and the user holds the primary modifier key (`Ctrl` on Windows, `Cmd` on macOS), a text-only hint list appears in the empty space to the left of the editing content. The overlay fades in and out quickly, does not change document layout, and only lists text-editing shortcuts.

## Goals

- Make text-editing shortcuts easier to discover without opening a help panel.
- Keep the interaction local to the editor instead of acting like an app-wide shortcut cheat sheet.
- Reuse the same shortcut definitions for both key bindings and visible hints.
- Preserve the current document layout and Markdown editing behavior.

## Non-Goals

- Showing application-level shortcuts such as `New`, `Open`, or `Save`
- Context-aware availability highlighting
- Custom shortcut configuration
- Rendering the overlay inside CodeMirror internals

## User Experience

### Trigger

- The overlay only appears while the document editor is focused.
- Holding the primary modifier key shows the overlay.
- Releasing the primary modifier key hides the overlay.
- Losing editor focus or window focus hides the overlay immediately.

### Content

- Show all supported text-editing shortcuts in a fixed list.
- Initial list:
  - `Mod+B` -> Bold
  - `Mod+I` -> Italic
  - `Mod+1` -> Heading 1
  - `Mod+2` -> Heading 2
  - `Mod+3` -> Heading 3
  - `Mod+4` -> Heading 4
  - `Mod+Shift+7` -> Bullet List
  - `Mod+Shift+9` -> Blockquote
  - `Mod+Alt+Shift+C` -> Code Block
- Windows displays `Ctrl`.
- macOS displays `Cmd`.

### Visual Design

- The overlay is rendered in the left-side empty area of the editor canvas.
- It is text-only: no border, no card, no background fill, no shadow.
- Key labels use slightly stronger emphasis than action labels.
- The overlay should feel like an editorial annotation rather than a floating tool panel.
- Appearance uses a subtle fade-in with a small horizontal drift.
- Disappearance uses a quick fade-out.
- Motion should stay within roughly `120-160ms`.

## Architecture

### Shortcut Metadata

Create a shared text-editing shortcut catalog in `packages/editor-core` that becomes the single source of truth for:

- CodeMirror key bindings
- Renderer hint overlay content

Suggested module:

- `packages/editor-core/src/extensions/markdown-shortcuts.ts`

Suggested exports:

- a list of text-editing shortcut definitions
- a helper that formats `Mod` for the current platform

Each shortcut definition should include:

- `id`
- `key`
- `label`
- `description`

### Keymap Integration

`packages/editor-core/src/extensions/markdown.ts` should consume the shared shortcut catalog when wiring text-editing key bindings, so the hint overlay cannot drift from the real bindings.

### Renderer Overlay

Create a small renderer-only component for display, for example:

- `src/renderer/editor/shortcut-hint-overlay.tsx`

Responsibilities:

- render the text list
- format key labels for the current platform
- apply fade/position transitions

This component must not execute commands or own editor state.

### Editor Shell Integration

`src/renderer/editor/App.tsx` owns visibility state and event wiring.

State shape should stay minimal:

- `isEditorFocused`
- `isShortcutHintVisible`

The renderer should derive visibility from:

- editor focus
- primary modifier key press state

## Event Flow

1. The editor container receives focus.
2. Renderer marks the editor as focused.
3. User presses `Ctrl` or `Meta`.
4. Renderer shows the overlay if the editor is still focused.
5. User releases the primary modifier key, blurs the window, or moves focus away from the editor.
6. Renderer hides the overlay immediately.

Event handling should live in the renderer and use:

- editor container `focusin` / `focusout`
- window `keydown`
- window `keyup`
- window `blur`

The feature should not depend on document content or current selection.

## Layout Rules

- Render the overlay inside `document-canvas`, not inside CodeMirror's content DOM.
- Use absolute positioning so the overlay does not push or resize the editing content.
- Align the overlay near the top of the visible document area.
- Keep the overlay in the left whitespace lane and away from the main text column.
- On narrow screens, the overlay may shift inward slightly, but it must remain non-blocking.

## Error Handling and Edge Cases

- If `keydown` and `keyup` become unbalanced because of window focus changes, `window blur` and editor `focusout` must reset visibility.
- If the primary modifier is already held before the editor gains focus, the overlay should wait for the next keyboard event rather than trying to infer hidden OS state.
- IME and text input composition must remain unaffected because the feature only listens for modifier visibility state in the renderer.

## Testing

### Renderer Tests

Add tests that verify:

- the overlay stays hidden when the editor is not focused
- the overlay appears when the focused editor receives primary modifier press
- the overlay hides on modifier release
- the overlay hides on editor blur
- the overlay hides on window blur
- only text-editing shortcuts are rendered

### Shared Metadata Tests

Add tests that verify:

- the shortcut catalog contains the supported text-editing shortcuts
- the markdown keymap and overlay both consume the shared definitions
- platform formatting renders `Ctrl` and `Cmd` correctly

## Acceptance Criteria

- Holding `Ctrl` on Windows or `Cmd` on macOS while the editor is focused shows a text-only shortcut hint list on the left side of the editor.
- Releasing the modifier or blurring the editor hides the list immediately.
- The overlay does not shift or resize document content.
- The list only contains text-editing shortcuts.
- The visible shortcuts stay in sync with the actual editor key bindings.
- Existing editing, autosave, IME, and keyboard shortcut behavior remain unchanged.
