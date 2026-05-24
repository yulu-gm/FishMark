# TASK-057 Summary

Status: DEV_DONE
Date: 2026-05-24

## Scope

Split hidden Markdown marker selection normalization from structural navigation selection normalization. Printable and composition input should keep the insertion selection, while Arrow / pointer navigation can still intentionally normalize hidden markers and collapsed structural blank rows.

## Changes

- Added explicit Markdown extension predicates for hidden marker normalization and structural navigation normalization.
- Prevented structural blank normalization from running on document-changing printable `input*` transactions.
- Narrowed the ordinary typing predicate to `input.type*` so single-line paste/drop-style inputs still receive hidden marker selection repair.
- Kept hidden marker normalization for non-printable document/selection updates.
- Updated collapsed structural separator ArrowDown navigation to preserve visible column into the next text block.
- Added regression tests for ArrowDown paragraph-end navigation and printable / composition input transaction selection stability.

## Evidence

- RED `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts -t "moves ArrowDown from a paragraph end"` failed with `15` vs expected `28`.
- RED `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts -t "does not run structural blank normalization"` failed with `14` vs expected `15`.
- RED `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts -t "repairs hidden inline marker selection"` failed with `1` vs expected `2`.
- `npm.cmd run test -- packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/markdown-commands.test.ts`: passed, 101 tests.
- `npm.cmd run test -- src/renderer/code-editor.test.ts`: passed, 189 tests.
- Named probes passed: `structural-blank-arrow-down`, `empty-type-hash`, `empty-type-one-space`, `empty-type-three-spaces`, `heading-empty-paragraph-space`, `heading-empty-paragraph-backspace`.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.

## Residual Risk

TASK-058 still needs to run the full Typora-like alignment gate. This task only fixes the selection-normalization boundary and the known structural blank ArrowDown case.
