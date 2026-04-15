# TASK-007 CodeMirror 6 Design

## Scope

Task: `TASK-007`
Goal: Replace the temporary `<textarea>` editor with a minimal CodeMirror 6 surface whose document state lives inside the editor layer while remaining compatible with the existing open/save bridge.

In scope:
- Introduce the minimum CodeMirror 6 dependencies needed for plain-text Markdown editing
- Add a renderer editor component that creates, updates, and disposes a CodeMirror view
- Move current-document text ownership from React-only state into editor state
- Keep Save / Save As compatible with the current file bridge
- Add editor keybindings for undo / redo plus `Mod-s` and `Shift-Mod-s`

Out of scope:
- micromark integration
- block map / active block behavior
- rendered Markdown blocks
- autosave
- IME-specific fixes beyond preserving CodeMirror defaults
- main / preload architecture changes

## Current Constraints

- All file system access must stay in `src/main/`
- `preload` may only expose the minimum bridge surface
- Renderer must continue to treat Markdown text as the single source for persisted content
- This task should not widen into block rendering or parsing work that belongs to later tasks

## Approaches Considered

### Option 1: React owns text, CodeMirror mirrors it

Keep the current `AppState.currentDocument.content` as the primary source and push every change into CodeMirror through controlled props.

Pros:
- Minimal conceptual change from the current textarea implementation

Cons:
- Higher risk of cursor jumps and transaction churn
- React re-renders become tightly coupled to editing behavior
- Long-term maintenance gets worse once block rendering and IME-sensitive behavior arrive

### Option 2: CodeMirror owns text, React owns document metadata

Let CodeMirror `EditorState` own the current text. React keeps file metadata, dirty/save/open state, and receives content-change notifications from the editor wrapper when persistence or status updates are needed.

Pros:
- Better match for CodeMirror architecture and future editor growth
- Easier to preserve selection, history, and transaction semantics
- Cleaner long-term boundary between editing engine and shell UI

Cons:
- Requires a slightly broader renderer refactor now

Recommendation: choose this option.

## Recommended Architecture

Introduce a small editor controller module in `src/renderer/` or `packages/editor-core/` that owns:
- Creating an `EditorState`
- Creating and destroying an `EditorView`
- Applying external document loads as explicit state replacement when a different file is opened or saved-as under a new path
- Emitting content changes upward through a narrow callback

React state should stop storing the editable text as the primary authority. Instead:
- `AppState.currentDocument` keeps path, name, encoding, and the last persisted content
- `AppState.isDirty` is derived by comparing the latest editor content against the last persisted content snapshot
- Save / Save As requests read the current editor content from the editor controller rather than from a textarea value

This keeps the shell responsible for document lifecycle and persistence status, while CodeMirror is responsible for editing semantics.

## Data Flow

### Open

1. User clicks `Open Markdown`
2. Renderer invokes `window.yulora.openMarkdownFile()`
3. On success, React stores document metadata and last persisted content
4. Editor wrapper replaces its current document with the opened Markdown text
5. Dirty state resets to clean

### Edit

1. User edits inside CodeMirror
2. Update listener reads the new document text
3. Renderer stores the latest editor snapshot needed for save/status
4. Dirty state updates by comparing snapshot with last persisted content

### Save / Save As

1. User clicks `Save` or `Save As`, or presses the corresponding shortcut
2. Renderer reads current content from the editor wrapper
3. Existing preload bridge sends content to `main`
4. On success, renderer updates current path/name if needed and records the saved content snapshot
5. Dirty state resets to clean without recreating the editor if content is unchanged

## Testing Strategy

Start with failing tests.

Renderer state tests:
- Opening a document records last persisted content and resets dirty state
- Editor change notifications toggle dirty state based on current editor text
- Successful save snapshots the current editor content as persisted content
- Save As success updates document metadata without losing the current editor text

Editor integration tests:
- Creating the editor with initial content exposes that content through a getter
- Replacing the document swaps editor text and clears history-sensitive shell state expectations
- Keybinding wiring invokes Save / Save As callbacks

Project verification:
- `npm run test -- src/renderer/document-state.test.ts src/renderer/code-editor.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Risks

- If React still tries to push content on every keystroke, the architecture regresses to a controlled editor and loses the maintenance benefit
- Replacing the whole editor state on normal edits would break undo/redo semantics
- Save shortcuts must stay scoped to the editor and not bypass the existing bridge result handling

## Docs Expected To Update

- `docs/decision-log.md`
- `docs/test-report.md`
- `docs/progress.md`
- `reports/task-summaries/TASK-007.md`
