# TASK-054 Physical Editing Line Model Intake

Date: 2026-05-24
Task: TASK-054
Next skill: fishmark-task-execution

## Goal

Introduce a source-derived physical editing line layer in `editor-core` so every Markdown source line is represented as an editable surface before semantic Markdown blocks are applied as optional overlays.

This task must make the model and derived-state contract available without changing Enter / Backspace routing or decoration behavior beyond necessary diagnostics and tests.

## In Scope

- Add an `EditingLine` model that covers empty, whitespace-only, and text lines.
- Add a `PhysicalEditingDocument` builder derived directly from source bytes.
- Add a `SemanticLineMap` that links physical lines to existing parsed Markdown blocks where possible.
- Expose `editingDocument` and `activeLine` from `createEditorDerivedState`.
- Keep `markdownDocument` semantic: do not fake Markdown parser blocks for editor-only whitespace editability.
- Replace the current worktree's `materializeEditableWhitespaceDocument` direction with the physical line model.
- Add focused unit tests for empty document, whitespace-only document, mixed blank/whitespace/text source, heading, list, code fence, and structural blank separators.

## Out Of Scope

- Do not implement TASK-055 decoration classes such as `cm-fm-line-*`.
- Do not refactor Enter / Backspace command routing; that belongs to TASK-056.
- Do not split selection normalization; that belongs to TASK-057.
- Do not claim full Typora-like alignment; TASK-058 owns the final gate.
- Do not modify main/preload or app shell code.

## Landing Area

- `packages/editor-core/src/physical-editing-document.ts`
- `packages/editor-core/src/physical-editing-document.test.ts`
- `packages/editor-core/src/derived-state/editor-derived-state.ts`
- `packages/editor-core/src/derived-state/editor-derived-state.test.ts`
- `packages/editor-core/src/active-block.ts`
- `packages/editor-core/src/active-block.test.ts`
- `packages/editor-core/src/index.ts` if exports are needed
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/plans/2026-05-24-task-054-physical-editing-line-model-handoff.md`

## Current Worktree Risk

Before TASK-054 starts, the worktree already contains unrelated or earlier agent/user dirty changes, including `packages/editor-core/**`, renderer tests, branding, packaging, tmp files, and TASK-038 docs.

The relevant existing editor-core change is a transitional parser-first helper:

- `materializeEditableWhitespaceDocument(source, markdownDocument)`
- derived state and markdown extension currently call it to make a whitespace-only whole document look like a paragraph block

TASK-054 should replace this direction with a physical editing line layer. Do not revert unrelated changes outside the task scope.

## Acceptance

- `createPhysicalEditingDocument(source)` returns at least one active-capable line for an empty document and one line per physical source line for non-empty source.
- `EditingLine` includes stable line number, source offsets, text, line-break boundary, kind (`empty`, `whitespace`, `text`), and document-start/document-end flags.
- `SemanticLineMap` associates lines with semantic block overlays without mutating or faking `markdownDocument.blocks`.
- `createEditorDerivedState` returns `editingDocument` and `activeLine`.
- For whitespace-only source, `markdownDocument.blocks` remains whatever the parser produces, while `activeLine` exists and has `kind: "whitespace"`.
- Existing active block, table cursor, outline, list, blockquote, code fence, and table behavior remains stable.

## Verification

- `npm.cmd run test -- packages/editor-core/src/physical-editing-document.test.ts packages/editor-core/src/derived-state/editor-derived-state.test.ts packages/editor-core/src/active-block.test.ts`
- Add targeted tests as needed for semantic mapping.
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check -- <TASK-054 files>`

## Risks

- Parser-owned Markdown semantics must remain separate from editor-owned line editability.
- Existing dirty editor-core command changes may affect broader regression results; preserve but do not lean on them for TASK-054 acceptance.
- Physical line offset handling must be correct for trailing newlines and CRLF-adjacent source positions.
- The model is foundational for TASK-055 through TASK-058, so the API should be explicit and small.
