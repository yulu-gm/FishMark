# TASK-059 Clipboard Image Temporary Directory Intake

Date: 2026-05-30
Task: TASK-059
Status: TODO, new backlog proposal

## Goal

Make external clipboard images paste directly into FishMark. Existing saved-document behavior is preserved: pasted images in saved Markdown documents still land in the document sibling `assets/` directory and insert relative-path Markdown. When no saved document path is available, FishMark writes the pasted image to a configurable temporary image directory and inserts Markdown image syntax with an absolute path.

Typora reference check: Typora stores pasted clipboard image data as a separate image file first, then inserts a Markdown image reference to that stored file or URL. FishMark will follow the same "image file plus Markdown reference" model, but this task intentionally uses FishMark's configurable temporary image directory as the initial landing location.

## In Scope

- Add an image-related preferences contract for the temporary image directory.
- Default the effective temporary directory to `<userData>/temp/clipboard-images`.
- Let users set the temporary image directory from Settings.
- Add a Settings file-section control for the temporary image directory, including current value display, directory picker, and restore default action.
- Keep renderer file access constrained: directory picking and path resolution stay in main/preload, not direct renderer Node access.
- Change clipboard image import so it can work without a saved Markdown document path.
- Preserve current saved-document behavior: images pasted into saved Markdown files continue to write into the sibling `assets/` directory and insert relative paths.
- Save pasted clipboard images into the effective temporary image directory only when the current tab does not have a saved document path.
- Insert Markdown image syntax with an absolute path for temporary-directory imports, normalized for Markdown readability:
  - Windows example: `![image](C:/Users/name/Pictures/fishmark-temp/image-20260530-120000.png)`
  - macOS example: `![image](/Users/name/Pictures/fishmark-temp/image-20260530-120000.png)`
- Preserve the existing image preview path resolution, which already supports absolute local paths.
- Add a main-process clipboard fallback for external app copies where DOM paste metadata does not expose an `image/*` item.
- Keep non-image clipboard paste behavior unchanged.
- Surface clear errors for unsupported clipboard data, oversized images, missing permissions, or unwritable target directories.

## Out Of Scope

- Do not implement image drag-and-drop import; keep it under TASK-016.
- Do not implement "move temporary images into document assets" in this task.
- Do not add cloud upload, image rename UI, image cleanup scheduling, or image size editing UI.
- Do not change saved-document `assets/` imports to absolute paths.
- Do not make temporary-directory imports relative; the user explicitly chose absolute paths for temporary images.
- Do not expose unrestricted file-system APIs to the renderer.

## Landing Area

- `src/shared/preferences.ts`
- `src/main/preferences-service.ts`
- `src/main/preferences-store.ts`
- `src/preload/preload.ts`
- `src/shared/product-bridge.ts`
- `src/shared/clipboard-image-import.ts`
- `src/main/clipboard-image-import.ts`
- `src/main/main.ts`
- `src/renderer/editor/settings-view.tsx`
- `src/renderer/editor/App.tsx`
- `src/renderer/code-editor.ts`
- Focused tests near each touched module.
- Documentation: `MVP_BACKLOG.md`, `docs/progress.md`, `docs/decision-log.md`, `docs/test-cases.md`, `docs/test-report.md`, and `reports/task-summaries/TASK-059.md` after implementation.

## Proposed Data Shape

```ts
type ImagePreferences = {
  temporaryDirectory: string | null;
};
```

- `null` means FishMark uses the default app directory under `userData`.
- A custom value must be an absolute local directory path.
- Preference normalization trims whitespace, rejects relative paths, and falls back to `null` for invalid values.
- Adding this field should bump the preferences schema version and preserve old preferences through normalization.

## Proposed UI

Add a new Settings section under the existing "文件" category:

- Section label: `图片`
- Row label: `临时图片目录`
- Shows custom absolute path when configured.
- Shows `FishMark 默认目录` when using the default.
- Provides a directory picker button to select a custom directory.
- Provides a restore default button that writes `images.temporaryDirectory = null`.

The directory picker should return either a selected absolute path or `null` when the user cancels. It should not write preferences by itself; renderer commits the returned path through the normal preferences update bridge.

## Import Flow

1. Renderer receives a paste event in CodeMirror.
2. If the DOM paste event advertises image data, prevent default and call `importClipboardImage`.
3. If the DOM paste event does not advertise plain text and the main-process clipboard has an image fallback, still import the image.
4. Main reads supported image bytes:
   - Prefer explicit clipboard formats such as `image/png`, `image/jpeg`, `image/webp`, or `image/gif`.
   - Fall back to Electron `clipboard.readImage().toPNG()` for external copied images.
5. Main resolves the effective temporary image directory from current preferences plus default app path.
6. If `documentPath` is present, main creates the sibling `assets/` directory if needed, writes the image there, and returns relative-path Markdown.
7. If `documentPath` is missing, main creates the effective temporary image directory if needed, writes the image there, and returns Markdown with an absolute local path.
8. Renderer inserts the returned Markdown at the current selection as one CodeMirror transaction.

## Acceptance

- A screenshot or browser-copied image can be pasted into a saved FishMark document.
- A saved document paste still writes into sibling `assets/` and inserts relative-path Markdown.
- A screenshot or browser-copied image can be pasted into an unsaved FishMark document.
- The unsaved-document pasted image file is written under the effective temporary image directory.
- The unsaved-document inserted Markdown uses an absolute path.
- A custom temporary image directory can be selected from Settings and persists across restart.
- Restoring default makes future pasted images land under `<userData>/temp/clipboard-images`.
- If the configured custom directory is unwritable, FishMark shows an error and does not insert broken Markdown.
- Plain text paste still behaves like a normal CodeMirror paste.
- Existing Markdown image preview rendering still works for pasted relative `assets/` paths and temporary absolute paths.
- Undo removes the inserted Markdown in the editor without deleting the image file.

## Verification

- `npm.cmd run test -- src/shared/preferences.test.ts src/main/preferences-store.test.ts`
- `npm.cmd run test -- src/main/clipboard-image-import.test.ts src/preload/preload.contract.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- Manual check on Windows: copy an image from an external app, paste into an unsaved document, confirm the temp file exists and Markdown contains an absolute `C:/...` path.
- Manual check: set a custom temporary image directory in Settings, paste again, and confirm the new image lands in that directory.

## Risks

- Absolute paths are less portable than relative `assets/` paths, but this is intentional for the temporary-first workflow.
- External app clipboard behavior differs across Windows and macOS; main-process `readImage()` fallback is required.
- Paste interception must not steal normal text or HTML paste.
- Settings directory picker must stay behind a constrained bridge.
- Writing into user-selected directories can fail because of permissions, deletion, or removable drives.
- Existing TASK-015 document-sibling `assets/` behavior is intentionally retained; tests should continue to protect it.

## Doc Updates

- Add TASK-059 to `MVP_BACKLOG.md`.
- Add TASK-059 to `docs/progress.md`.
- Record the temporary-directory decision in `docs/decision-log.md`.
- Update `docs/test-cases.md` TC-030 for configurable temporary directory and absolute path insertion.
- After implementation, update `docs/test-report.md` and write `reports/task-summaries/TASK-059.md`.

## Next Skill

`$fishmark-task-execution`
