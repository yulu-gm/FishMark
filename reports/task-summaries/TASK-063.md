# TASK-063 Editor Semantic Context

## Summary

Added a read-only semantic context layer for nested Markdown editing. The command router now handles draft code fences and blockquote marker drafts through context instead of command-local blockquote special cases.

## Changed

- Added block path resolution for blockquote inner blocks.
- Added container-aware draft syntax detection.
- Added `EditorSemanticContext` beside `ActiveBlockState`.
- Routed draft code fence Enter through semantic context.
- Preserved quote-internal code fence editing probes.

## Validation

- `npm.cmd run test -- packages/editor-core/src/context/block-path.test.ts packages/editor-core/src/context/draft-syntax.test.ts packages/editor-core/src/context/editor-semantic-context.test.ts packages/editor-core/src/commands/markdown-commands.test.ts`: PASS
- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "fenced code block"`: PASS
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='blockquote-code-fence-input'; npm.cmd run test:editing-experience`: PASS
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience`: PASS
- `npm.cmd run test`: PASS
- `npm.cmd run typecheck`: PASS
- `npm.cmd run lint`: PASS
- `npm.cmd run build`: PASS, note: existing Vite chunk-size warning
- `git diff --check`: PASS in clean task verification worktree; the dirty primary workspace also contains a pre-existing unrelated `tmp/test.md` trailing-whitespace diff that this task intentionally did not edit.

## Follow-Up

- Migrate list item context from compatibility `ActiveBlockState` to `EditorSemanticContext`.
- Migrate table cursor context to `EditorSemanticContext`.
- Migrate decoration active-state decisions to leaf/container context.
- Deprecate direct command routing on single top-level `activeBlock`.
