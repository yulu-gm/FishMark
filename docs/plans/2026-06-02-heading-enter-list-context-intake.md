# Heading Enter List Context Intake

Date: 2026-06-02
Task: heading-enter-list-context

## Goal

Fix the rendering/editing regression where a heading inserted above an existing ordered list can disappear visually after pressing `Enter`.

## In Scope

- Reproduce from `C:/Users/wuche/Desktop/todo.md` and the user-described list-edit path.
- Identify whether the owner layer is parser, decoration refresh, CSS, or command routing.
- Add focused regression coverage for the failing heading/list context.
- Apply a minimal production fix without changing Markdown source truth or list semantics.

## Out Of Scope

- No broad rewrite of heading, list, or structural blank line behavior.
- No changes to user files such as `C:/Users/wuche/Desktop/todo.md`.
- No unrelated backlog status changes.

## Landing Area

- Expected: `packages/editor-core/src/` decoration or extension state handling.
- Expected tests: `src/renderer/code-editor.test.ts` and, if needed, `packages/editor-core/src/decorations/block-decorations.test.ts`.

## Acceptance

- Pressing `Enter` after a heading inserted above the list in the provided document keeps the heading text visible.
- The new blank paragraph/caret row remains visible and editable.
- Existing heading Enter/Backspace and list rendering behavior does not regress.

## Verification

- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "<focused regression>"`
- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "creates a visible empty paragraph block on Enter at heading end"`
- `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## Risks

- Touches cursor, structural blank line, active/inactive decoration, and list-adjacent heading rendering.
- Electron probe may need a port cleanup if a previous run leaves dev server processes alive.

## Next Skill

$fishmark-task-execution
