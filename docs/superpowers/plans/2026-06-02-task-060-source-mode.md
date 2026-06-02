# TASK-060 Source Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a window-scoped whole-document source mode over the existing CodeMirror document.

**Architecture:** Keep Markdown text as the only truth. Store `EditorViewMode = "wysiwym" | "source"` in renderer window state, pass it into the existing CodeMirror controller, and gate editor-core decorations from a StateField/StateEffect without replacing the document state.

**Tech Stack:** Electron, React, TypeScript, CodeMirror 6, Vitest.

---

### Task 1: Add Source Mode Gate To Editor-Core

**Files:**
- Modify: `packages/editor-core/src/extensions/markdown.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.ts`
- Modify: `packages/editor-core/src/decorations/signature.ts`
- Test: `packages/editor-core/src/decorations/block-decorations.test.ts`

- [ ] Add exported type `EditorViewMode = "wysiwym" | "source"` and an option to `createFishMarkMarkdownExtensions`.
- [ ] Store mode in extension runtime through a CodeMirror state field/effect so callers can update it without rebuilding `EditorState`.
- [ ] When mode is `"source"`, make `createBlockDecorations` return only physical line / active line editing classes needed for plain text layout and omit preview replacements/widgets/hidden markers/code highlighting.
- [ ] Include view mode in decoration signatures so toggling forces a refresh.
- [ ] Add tests proving headings, links, images, tables, blockquotes, code fences, task markers, thematic breaks, and inline markers are not decorated as previews in source mode.

Run focused test:

```powershell
npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts
```

### Task 2: Expose Runtime Mode Control From CodeEditorController

**Files:**
- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/code-editor-view.tsx`
- Test: `src/renderer/code-editor.test.ts`

- [ ] Add `EditorViewMode` to controller/view props and handle.
- [ ] Add `setViewMode(nextMode)` to update the existing editor extension state.
- [ ] Ensure `setViewMode` does not call `replaceDocument`, does not call `onChange`, and preserves selection.
- [ ] Add tests proving source mode shows raw Markdown for common syntax and toggling does not change content or selection.

Run focused test:

```powershell
npm.cmd run test -- src/renderer/code-editor.test.ts
```

### Task 3: Add Window-Level Toggle In Renderer Shell

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Modify: `src/renderer/editor/WorkspaceShell.tsx`
- Modify: `src/renderer/editor/WorkspaceShell.test.tsx`
- Modify: `src/renderer/styles/editor-source.css`
- Modify: `src/renderer/styles/app-ui.css`

- [ ] Add renderer state `editorViewMode` initialized to `"wysiwym"`.
- [ ] Pass mode to `WorkspaceShell` and `CodeEditorView`.
- [ ] Add a status-bar icon button labelled by `aria-label`, rendered as `</>`, with `aria-pressed`.
- [ ] Toggle mode without moving focus away from the editor when possible.
- [ ] Keep mode window-scoped across tab switches, new tabs, and open-file flows.
- [ ] Add shell tests for the toggle button, `aria-pressed`, and tab persistence.

Run focused tests:

```powershell
npm.cmd run test -- src/renderer/editor/WorkspaceShell.test.tsx src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts
```

### Task 4: Sync Docs And Handoff

**Files:**
- Modify: `MVP_BACKLOG.md`
- Modify: `docs/progress.md`
- Modify: `docs/decision-log.md`
- Modify: `docs/test-cases.md`
- Create: `docs/plans/2026-06-02-task-060-handoff.md`

- [ ] Mark TASK-060 execution slices complete in `MVP_BACKLOG.md` only after implementation and focused tests pass.
- [ ] Update `docs/progress.md` to DEV_DONE only after the task is ready for acceptance.
- [ ] Add source-mode manual acceptance steps to `docs/test-cases.md`.
- [ ] Write execution handoff with changed files, verification commands, manual checks, and residual risk.

Run quality gates:

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```
