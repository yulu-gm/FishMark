# Structural Line Break Editing Intake

## Task

Ad-hoc editor semantics fix: structural line breaks and list boundary editing.

## Goal

Keep Markdown rendering compatible with CommonMark/micromark while making FishMark editing commands produce explicit structural boundaries:

- `Enter` creates structural breaks.
- `Shift+Enter` creates inline hard breaks via `<br>`.
- `Backspace` at a structural list/body boundary must not collapse into lazy continuation.
- Active editing must keep middle empty list items visible and editable.

## In scope

- CodeMirror key handling for `Enter`, `Shift+Enter`, and `Backspace`.
- Markdown command helpers under `packages/editor-core/src/commands`.
- List decoration handling for active middle empty list items.
- Renderer/package tests proving source edits, selection placement, and active row structure.
- Handoff documentation for this ad-hoc bugfix.

## Out of scope

- Changing micromark/CommonMark parser semantics.
- Disabling lazy continuation globally.
- Full Markdown dialect design beyond editor command output.
- Backlog/progress status updates; this is not tied to a numbered backlog task.

## Landing area

- `packages/editor-core/src/commands/*`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `src/renderer/code-editor.test.ts`
- `packages/editor-core/src/commands/*.test.ts`
- `packages/editor-core/src/decorations/block-decorations.test.ts`
- Existing list handoff doc for continuity.

## Acceptance

- `Enter` before list item content upgrades top-level items to body text with an explicit blank-line boundary when needed.
- `Shift+Enter` inserts `<br>` in paragraph/list/table editing contexts instead of creating structural blocks.
- `Backspace` from body text immediately after a list boundary joins the body text into the previous list item content, not into a lazy continuation line.
- Active middle empty list items remain visible as separate editable rows with marker and caret.
- Existing CommonMark parsing remains unchanged.

## Verification

- Focused tests for command and decoration behavior.
- Relevant renderer/editor-core/markdown-engine test set.
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## Risks

- High: selection placement, undo granularity, and list normalization.
- Medium: table cell key handling for `Shift+Enter`.
- Medium: active list decoration can affect cursor geometry and visual layout.
- Low: parser compatibility, because parser semantics stay unchanged.

## Next skill

`fishmark-task-execution`
