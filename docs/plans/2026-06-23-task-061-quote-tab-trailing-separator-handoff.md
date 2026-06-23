# TASK-061 Quote List Tab And Trailing Separator Handoff

Date: 2026-06-23

## Scope

- Verify Tab indentation for a padded empty list item inside a single-depth blockquote.
- Prevent quote-internal structural separator rows from remaining at the document tail after the user exits a quoted list or nested blockquote.
- Repair existing residual quote separators when the user presses Tab on the following list item.
- Make list commands recover from temporarily stale active-block state by resolving list structure from the live Markdown document.

## Root Cause

- The single-depth padded source `> - List1\n> - ` already follows the ordinary parsed-list Tab path on current `origin/main`. The reported no-op came from the local dirty `main` worktree, which was 19 commits behind `origin/main` and did not contain the earlier list fix.
- A quoted top-level list exits to `>\n> `. Pressing Enter again removed only the active `> ` line and left the structural separator `>` at the document tail. Repeating the workflow accumulated trailing quote-marker rows.
- Existing documents can therefore contain `> - List 1\n>\n> - 2`: the separator is hidden visually, but it splits the second item into a new one-item list, so normal Tab rules reject it as having no previous sibling.
- The list command adapter also rejected Tab before semantic computation when cached active-block state was temporarily stale, even though the current CodeMirror document was already a list.

## Implementation

- Add unit, controller, and Electron coverage for Tab on `> - List1\n> - `.
- When an empty quote line is immediately preceded by an empty structural quote line at the same depth, exit both as a pair.
- At depth one, replace the pair with one raw newline so the result is an external structural blank.
- At deeper levels, outdent both rows together one quote level at a time.
- Remove the cached active-block type gate and use the rich live Markdown document as the blockquote-list fallback.
- When the current first list item is preceded only by one or more same-depth empty quote markers and a compatible list item, remove those markers and reuse the normal list indentation algorithm.

## Changed Files

- `packages/editor-core/src/commands/blockquote-commands.ts`
- `packages/editor-core/src/commands/blockquote-commands.test.ts`
- `packages/editor-core/src/commands/list-commands.ts`
- `packages/editor-core/src/commands/list-commands.test.ts`
- `packages/editor-core/src/commands/list-edits.ts`
- `packages/editor-core/src/commands/list-edits.test.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `docs/test-cases.md`
- `docs/test-report.md`
- `docs/progress.md`
- `reports/task-summaries/TASK-061.md`

## Manual Acceptance

1. Enter `> - List1`, press Enter, and leave the second list item empty.
2. Press Tab and confirm the second line becomes a nested list item.
3. Undo, then press Enter twice from the empty top-level list item.
4. Confirm the source becomes `> - List1\n\n` and no trailing `>` line remains.
5. Repeat inside a depth-two quote and confirm empty separator/current rows outdent together before exiting the quote.
6. Open an existing source containing `> - List 1\n>\n> - 2`, place the caret after `2`, and press Tab.
7. Confirm the hidden separator is removed and the second item becomes `>   - 2`.

## Residual Risk

- The original dirty local `main` worktree cannot be fast-forwarded automatically without reconciling its unrelated uncommitted changes. Verification and launch should use this isolated worktree or a clean checkout of current `origin/main`.
