# TASK-056 Line-First Enter / Backspace Routing Intake

Date: 2026-05-24
Task: TASK-056
Status: DEV_IN_PROGRESS

## Goal

Refactor plain `Enter` and `Backspace` routing so generic text editing starts from the physical editing line model, then delegates to semantic handlers for tables, code fences, lists, blockquotes, thematic breaks, and headings. Empty documents, whitespace-only lines, paragraphs, headings, and repeated actions must match the available TASK-053 oracle cases without regressing existing list, blockquote, code fence, or table behavior.

## Current Red Evidence

- `npm.cmd run test -- src/renderer/code-editor.test.ts -t "breaks ordered list rendering from the current item when Backspace is pressed at content start"` currently fails.
- Expected source: `1. 内容\n\n2.内容2\n3. 内容3`.
- Actual source: `1. 内容\n内容2\n3. 内容3`.
- The current Backspace order lets the list marker handler own a content-start Backspace before the structural blank / physical line join behavior can preserve the ordered marker.

## In Scope

- Introduce or adapt command routing so `Enter` and `Backspace` can reason from the active physical line first while preserving semantic handler priority where required.
- Backspace order should cover:
  - non-empty selection deletion / native fallback
  - whitespace-only line character deletion
  - list / blockquote / code fence / table marker-specific handling
  - physical line-start join or structural separator deletion
  - native fallback
- Enter order should keep table / code fence / list / blockquote / thematic break / heading handling ahead of generic physical paragraph behavior.
- Absorb the existing ad-hoc heading Enter / trailing empty Backspace work into numbered TASK-056 docs and tests if it still matches the official scope.
- Fix the known ordered-list content-start Backspace regression.
- Add command-level, renderer-level, and editing-experience probe coverage for empty document, whitespace-only line, paragraph, heading, repeated heading Enter, and ordered-list Backspace regression.

## Out Of Scope

- Do not change physical line decoration classes or CSS except if a test reveals a direct command interaction bug; TASK-055 owns decoration surfaces.
- Do not split hidden marker versus structural navigation normalization; TASK-057 owns that boundary cleanup.
- Do not claim full Typora alignment; TASK-058 owns the final gate.
- Do not change parser semantics or fake Markdown blocks for whitespace editability.
- Do not modify main, preload, packaging, themes, or tab/window shell behavior.

## Landing Area

- `packages/editor-core/src/commands/markdown-commands.ts`
- `packages/editor-core/src/commands/markdown-commands.test.ts`
- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/extensions/markdown.test.ts`
- `src/renderer/code-editor.test.ts`
- `src/renderer/markdown-editing-experience-probe.ts`
- `scripts/probe-markdown-editing-experience.mjs`
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-056.md`

## Acceptance

- Empty document typing `#`, one space, three spaces, and normal text does not jump the caret.
- Heading end `Enter` and repeated heading `Enter` remain stable and create visible editable lines according to the TASK-053 captured baseline.
- Whitespace-only line Backspace deletes one real whitespace character when the caret is inside the line.
- Line-start Backspace across a structural separator preserves ordered-list markers where the existing regression expects that behavior.
- Existing list, blockquote, code fence, table, image, inline rendering, and TASK-055 physical line surface tests do not regress.
- Undo granularity is one user action per command unless a case report documents a platform / CodeMirror exception.

## Verification

- `npm.cmd run test -- packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts`
- `npm.cmd run test -- src/renderer/code-editor.test.ts`
- `npm.cmd run test:editing-experience` for relevant named cases:
  - `empty-type-hash`
  - `empty-type-one-space`
  - `empty-type-three-spaces`
  - `paragraph-end-enter`
  - `paragraph-middle-enter`
  - `paragraph-start-enter`
  - `heading-end-enter`
  - `heading-end-repeated-enter`
  - `heading-empty-paragraph-backspace`
  - `heading-empty-paragraph-space`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check -- packages/editor-core/src/commands/markdown-commands.ts packages/editor-core/src/commands/markdown-commands.test.ts packages/editor-core/src/extensions/markdown.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts src/renderer/markdown-editing-experience-probe.ts scripts/probe-markdown-editing-experience.mjs MVP_BACKLOG.md docs/progress.md docs/plans/2026-05-24-task-056-line-first-enter-backspace-routing-intake.md docs/plans/2026-05-24-task-056-line-first-enter-backspace-routing-handoff.md docs/test-report.md reports/task-summaries/TASK-056.md`

## Risks

- There are existing dirty command changes from the earlier `heading-enter-backspace` handoff; keep useful regression coverage but fold it into TASK-056 instead of treating it as a separate untracked task.
- List marker handlers are delicate. The line-first Backspace fallback must not break empty list marker removal, nested list marker behavior, or ordered list renumbering.
- The TASK-053 oracle still has two known failing FishMark cases before TASK-056: `heading-end-repeated-enter` and `structural-blank-arrow-down`; this task should fix command-owned Enter/Backspace cases but not arrow navigation.
- Do not solve TASK-057 by broad transaction-filter rewrites unless a tiny guard is required to preserve command selection after a command dispatch.

## Doc Updates

- Update `MVP_BACKLOG.md` TASK-056 status and execution slices.
- Update `docs/progress.md` TASK-056 status.
- Write `docs/plans/2026-05-24-task-056-line-first-enter-backspace-routing-handoff.md` after implementation.
- Update `docs/test-report.md` and `reports/task-summaries/TASK-056.md` during acceptance.

## Next Skill

`$fishmark-task-execution`
