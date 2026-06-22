# Quoted List Exit Depth Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repeated Enter on an empty nested list inside a blockquote exit the list at its existing quote depth without creating an extra blockquote level.

**Architecture:** Keep the shared list Enter pipeline as the owner of list exit behavior. Change bare-list-marker recovery so it selects the trailing list scope whose indentation and marker kind match the current marker, instead of always selecting the deepest trailing item.

**Tech Stack:** TypeScript, CodeMirror 6, Vitest, FishMark editing-experience probe.

---

### Task 1: Lock the list-scope regression

**Files:**
- Modify: `packages/editor-core/src/commands/list-edits.test.ts`

- [x] Add a test for a depth-two blockquote whose nested empty list item has already been promoted to a bare top-level marker.
- [x] Assert Enter replaces the marker with a same-depth quote separator and quote body line.
- [x] Run `npm.cmd test -- packages/editor-core/src/commands/list-edits.test.ts` and confirm the new test fails because the edit is `null`.

### Task 2: Match the correct trailing list scope

**Files:**
- Modify: `packages/editor-core/src/commands/list-edits.ts`

- [x] Replace deepest-item lookup in `computeBareEmptyListItemEnter()` with a traversal that returns the latest trailing list-item context matching marker kind and indentation.
- [x] Preserve nested promotion, ordered delimiter matching, child subtree retention, and body-list behavior.
- [x] Run the focused list test and confirm it passes.

### Task 3: Cover the real editor command path

**Files:**
- Modify: `src/renderer/markdown-editing-experience-probe.ts`
- Create: `docs/plans/2026-06-23-task-061-quoted-list-exit-depth-fix-handoff.md`

- [x] Add a probe that presses Enter twice from an empty nested quoted list item.
- [x] Assert the final Markdown remains at quote depth two and contains no extra quote prefix.
- [x] Record changed files, verification commands, manual acceptance steps, and residual risk.

### Task 4: Verify and publish

**Files:**
- Verify the complete worktree.

- [x] Run focused unit tests and the blockquote probe.
- [x] Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
- [ ] Commit the focused fix and push `codex/editing-region-structural-model`.
