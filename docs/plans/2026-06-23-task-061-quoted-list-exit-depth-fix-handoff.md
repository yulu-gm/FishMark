# TASK-061 Quoted List Exit Depth Fix Handoff

Date: 2026-06-23

## Scope

Fix repeated Enter from an empty nested list inside a blockquote. After the empty child item is promoted to a bare top-level list marker, the next Enter must exit the list into quote body text at the list container's existing quote depth. It must not fall through to blockquote continuation and create an extra quote level.

## Root Cause

`computeBareEmptyListItemEnter()` always resolved the previous context from the deepest trailing list item. A promoted top-level bare marker therefore compared its zero indentation against the nested child scope, failed to claim the command, and allowed `runBlockquoteEnter()` to treat the marker as quote content.

## Changed Files

- `packages/editor-core/src/commands/list-edits.ts`
- `packages/editor-core/src/commands/list-edits.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `docs/superpowers/plans/2026-06-23-quoted-list-exit-depth-fix.md`
- `docs/plans/2026-06-23-task-061-quoted-list-exit-depth-fix-handoff.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-061.md`

## Implementation

- Bare list marker recovery now follows only the last item's trailing ancestor chain and selects the scope matching both marker kind and indentation.
- Nested empty items continue to promote one level at a time.
- A promoted top-level marker in a depth-two quote exits to `> > \n> > `, keeping the quote depth unchanged.
- Earlier sibling branches with a different list kind or ordered delimiter cannot be selected as recovery context.
- Existing ordered numbering, child subtree retention, body-list exit, and quote-list Backspace behavior remain covered.

## Verification

- `npm.cmd test -- packages/editor-core/src/commands/list-edits.test.ts` - 59 passed.
- `npm.cmd test -- packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts src/renderer/code-editor.test.ts` - 334 passed.
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE='nested-quote-list-repeated-enter-exit'; npm.cmd run test:editing-experience` - passed.
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='blockquote'; npm.cmd run test:editing-experience` - passed.
- `$env:FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP='list'; npm.cmd run test:editing-experience` - passed.
- `npm.cmd test` - 112 files, 1288 tests passed.
- `npm.cmd run typecheck` - passed.
- `npm.cmd run lint` - passed.
- `npm.cmd run build` - passed with the existing Vite chunk-size warning.
- `git diff --check` - passed with Windows LF/CRLF warnings only.

## Manual Acceptance

1. Create a depth-two blockquote containing a top-level list and one nested child item.
2. Press Enter after the non-empty child item to create an empty child item.
3. Press Enter once and confirm the empty child item promotes to an empty top-level list item.
4. Press Enter again and confirm the list exits into an empty depth-two quote body line.
5. Confirm no third or fourth quote rail appears and the caret remains aligned with the depth-two quote content column.

## Residual Risk

- The fix intentionally changes only bare marker scope selection. Mixed list kinds whose current bare marker does not match the root list kind remain governed by the existing list-kind gate and are outside this follow-up.
- Three-or-more-level combinations of mixed unordered markers and ordered delimiters are not exhaustively enumerated, although recovery is now structurally limited to the trailing ancestor chain.
