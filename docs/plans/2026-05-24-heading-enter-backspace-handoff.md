# Heading Enter / Backspace Handoff

Date: 2026-05-24
Task: heading-enter-backspace

## What Changed

- Added a heading-end Enter command before the paragraph/default fallback. When the active block is a heading and the caret is at the heading line end, `Enter` now creates the same independent empty paragraph boundary used by paragraph Enter.
- Added a trailing empty block Backspace command. When the caret is on the visible empty row after a single structural blank separator, one `Backspace` removes the whole trailing empty block boundary and returns the caret to the previous non-empty line end.
- Added command-level and renderer-level regression coverage for heading Enter followed by one-press Backspace.

## Landing Files

- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/commands/markdown-commands.test.ts`
- `src/renderer/code-editor.test.ts`

## Verification Run

- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts`
- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "creates a visible empty paragraph block on Enter at heading end"`
- `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts`
- `npm.cmd run test -- packages/editor-core/src/commands`
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check -- packages/editor-core/src/commands/markdown-commands.ts packages/editor-core/src/commands/markdown-commands.test.ts src/renderer/code-editor.test.ts`

## Known Risks Or Notes

- The full `src/renderer/code-editor.test.ts` run still has one existing failure unrelated to this slice: `breaks ordered list rendering from the current item when Backspace is pressed at content start`. It was already failing during the red phase before production code changed.
- Plain `git diff --check` still reports pre-existing trailing whitespace in `tmp/test.md`; scoped diff check over this slice's tracked files passes.
- This ad-hoc fix does not map to a numbered `MVP_BACKLOG.md` task, so no backlog checkbox was changed.

## Manual Acceptance Draft

1. Open a document containing only `# Title`.
2. Put the caret at the end of the title and press `Enter` once.
3. Confirm a visible empty editable line appears immediately.
4. Press `Backspace` once from that empty line.
5. Confirm the source returns to `# Title` and the caret is back at the heading end.
