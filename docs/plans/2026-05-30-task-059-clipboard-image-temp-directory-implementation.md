# TASK-059 Clipboard Image Temporary Directory Implementation Plan

## Context

FishMark already imports pasted clipboard images for saved Markdown documents by writing image files beside the document in `assets/` and inserting a relative Markdown image reference. That behavior must stay unchanged.

The missing behavior is for unsaved documents and external clipboard image sources whose DOM paste payload does not advertise an image. For unsaved documents, FishMark should save the clipboard image into a user-configurable temporary image directory and insert an absolute Markdown image path. This keeps the editor usable before the document has a file path, while preserving Markdown as the single source of truth.

Typora's documented model is compatible with this direction: clipboard image data is persisted as an image file in a configured location, then Markdown points at that persisted file. FishMark's exact policy will be:

- Saved document: write to sibling `assets/`, insert relative path.
- Unsaved document: write to configured temporary image directory, insert absolute path.
- Default temporary directory: `<app userData>/temp/clipboard-images`.
- Settings may override the temporary directory with an absolute local path.

## Acceptance Criteria

1. Pasting a screenshot into a saved document continues writing a valid image file under sibling `assets/`.
2. Pasting a screenshot into an unsaved document writes a valid image file under the effective temporary image directory.
3. The Markdown inserted for saved documents remains relative, such as `![note](assets/note-image-20260530-120000.png)`.
4. The Markdown inserted for unsaved documents uses an absolute path with forward slashes, such as `![image](D:/FishMark/temp/clipboard-image-20260530-120000.png)`.
5. Preferences store `images.temporaryDirectory` as `string | null`, with `null` meaning the app default directory.
6. Settings exposes a file/images section where the user can pick an absolute temporary image directory and restore the default.
7. Renderer paste handling still lets normal text/HTML paste behave normally, while allowing image import fallback when the DOM clipboard has no pasteable text but Electron's main clipboard can read an image.
8. Renderer continues to receive only constrained bridge APIs, not raw filesystem access.

## Implementation Steps

1. Preferences schema and tests
   - Add `ImagePreferences` to `src/shared/preferences.ts`.
   - Bump schema version to `3`.
   - Normalize `images.temporaryDirectory` with shared string-only absolute-path checks.
   - Extend `mergePreferences()` and `DEFAULT_PREFERENCES`.
   - Cover default, migration, normalization, and merge behavior in `src/shared/preferences.test.ts`.

2. Directory picker bridge
   - Add a shared IPC contract for selecting the temporary image directory.
   - Add `selectTemporaryImageDirectory()` to `ProductBridge`.
   - Expose it in preload through `ipcRenderer.invoke`.
   - Add a main helper using `dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] })`.
   - Wire the main IPC handler without updating preferences directly; renderer applies the selected path through `updatePreferences`.
   - Cover bridge wiring in preload contract tests and main wiring tests.

3. Clipboard image import
   - Widen `ImportClipboardImageInput.documentPath` to `string | null`.
   - Keep saved-document target resolution unchanged: sibling `assets/` and relative Markdown.
   - Add unsaved target resolution using the effective temporary image directory.
   - Keep the encoded image validation and `readImage().toPNG()` fallback from the screenshot hotfix.
   - Return enough metadata to distinguish `assets` vs `temporary` storage while preserving existing `markdown` consumers.
   - Cover saved path, unsaved default temp path, unsaved custom temp path, collision suffix, no-image, oversized image, and write failure.

4. Main IPC integration
   - In `main.ts`, resolve the effective temp directory as:
     `preferencesService.getPreferences().images.temporaryDirectory ?? path.join(app.getPath("userData"), "temp", "clipboard-images")`.
   - Pass that directory into `importClipboardImage`.
   - Keep all filesystem work in main.

5. Renderer paste and settings UI
   - In `code-editor.ts`, import image when DOM items contain `image/*`.
   - If there is no DOM image but there is pasteable text/HTML/URI data, let CodeMirror handle paste normally.
   - If there is no pasteable text, call the image import bridge as a fallback and insert returned Markdown in one transaction.
   - In `App.tsx`, pass `documentPath: input.documentPath` through without converting `null` to an empty string.
   - In `settings-view.tsx`, add File > 图片 with a temporary directory display, picker button, and restore default action.

6. Documentation and verification
   - Update decision/test records for TASK-059.
   - Run focused tests as features land, then full gates:
     `npm.cmd run test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`.

## Test-First Checklist

1. Add failing shared preferences tests.
2. Add failing clipboard import tests for unsaved temp-directory import.
3. Add failing bridge contract tests for directory picker.
4. Add failing renderer paste/settings tests.
5. Implement until the focused tests pass.
6. Run full verification before claiming completion.
