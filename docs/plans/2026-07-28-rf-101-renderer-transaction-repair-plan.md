# RF-101 Renderer Transaction Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make renderer workspace mutation, draft, reload, editor epoch, native close, and save behavior one lossless tab-bound transaction system.

**Architecture:** Add a non-React `WorkspaceRendererApplication` that owns canonical state, outbox lifecycle, editor leases, retries, transport reconciliation, and FIFO transactions through typed ports/outcomes. Reduce React hooks to state/view/notification binding and make CodeMirror explicitly acknowledge document-load consumption.

**Tech Stack:** TypeScript, React, CodeMirror 6, Vitest.

---

### Task 1: Complete draft outbox lifecycle

**Files:**
- Modify: `src/renderer/editor/workspace-draft-outbox.ts`
- Modify: `src/renderer/editor/workspace-draft-outbox.test.ts`

- [x] Add RED tests proving `entries()` enumerates every tab, `remove(tabId)` deletes one lifecycle, and `discardThrough(tabId, generation)` keeps edits created after a reload cutoff.
- [x] Run `npm.cmd test -- --run src/renderer/editor/workspace-draft-outbox.test.ts` and verify missing methods fail.
- [x] Implement generated entries:

```ts
type WorkspaceDraftEntry = Readonly<{ tabId: string; content: string; generation: number }>;
set(tabId: string, content: string): WorkspaceDraftEntry;
entries(): readonly WorkspaceDraftEntry[];
acknowledge(entry: WorkspaceDraftEntry): boolean;
discardThrough(tabId: string, generation: number): boolean;
remove(tabId: string): boolean;
```

- [x] Rerun the outbox tests and verify PASS.

### Task 2: Add the renderer application service

**Files:**
- Create: `src/renderer/editor/workspace-renderer-application.ts`
- Create: `src/renderer/editor/workspace-renderer-application.test.ts`
- Modify: `src/renderer/editor/editor-shell-state.ts`

- [x] Add RED port-level tests for target close/detach drain, drain-all close confirmation, same-tab canonical replacement invalidation, reload generation cutoff, canonical-unknown admission, and save/open/activation FIFO interleavings.
- [x] Run the new service test and verify the wished-for API is missing.
- [x] Define typed ports and outcomes:

```ts
type WorkspaceRendererBridge = Pick<Window["fishmark"], /* workspace methods */>;

type WorkspaceOperationOutcome<T> =
  | Readonly<{ kind: "success"; value: T }>
  | Readonly<{ kind: "cancelled" | "superseded" | "no-document" }>
  | Readonly<{ kind: "failed"; error: unknown }>;
```

- [x] Move canonical known/unknown, outbox, editor lease, retry, activation generation, bridge sequencing, snapshot application, and save transaction logic into the service.
- [x] Ensure all structural commands reconcile when state is unknown and never dispatch on reconciliation failure.
- [x] Run service tests until every finding passes.

### Task 3: Add the CodeMirror load-consumption handshake

**Files:**
- Modify: `src/renderer/code-editor-view.tsx`
- Modify: `src/renderer/code-editor-view.test.tsx`
- Modify: `src/renderer/editor/WorkspaceShell.tsx`
- Modify: `src/renderer/editor/WorkspaceShell.test.tsx`
- Modify: `src/renderer/editor/App.tsx`

- [x] Add a RED test expecting `onLoadRevisionApplied({ tabId, epoch, loadRevision })` only after `replaceDocument(content)`.
- [x] Add `documentTabId`, `editorEpoch`, transition read-only state, and the typed callback to `CodeEditorView`; invoke it after the exact replacement completes.
- [x] Thread the callback through `WorkspaceShell` to the workspace application acknowledgement method.
- [x] Verify stale callbacks before acknowledgement cannot create an outbox entry and the acknowledged revision can.

### Task 4: Bind React and save orchestration to the service

**Files:**
- Modify: `src/renderer/editor/useWorkspaceController.ts`
- Modify: `src/renderer/editor/useWorkspaceController.test.tsx`
- Modify: `src/renderer/editor/useEditorWorkflowController.ts`
- Modify: `src/renderer/editor/useSaveController.ts`
- Modify: `src/renderer/editor/useSaveController.test.tsx`
- Modify: `src/renderer/editor/useEditorApplicationController.ts`
- Modify: `src/renderer/editor/useEditorApplicationController.test.tsx`

- [x] Add RED service/binding tests that close/detach failure does not call the structural bridge, native close drains inactive drafts, reload cannot revive discarded text, and save captures the invocation-time tab across activation/open.
- [x] Replace hook-owned transaction refs with one service instance and presentation-only outcome mapping.
- [x] Change editor draft binding to include the acknowledged editor lease rather than deriving ownership from active tab alone.
- [x] Change Save/Save As/autosave to invoke `runSaveTransaction({ forceSaveAs, hasExternalConflict })`; do not separately flush, reread active tab, or refresh outside the lane.
- [x] Remove the unused `applySnapshots` option and old hook transaction helpers.
- [x] Run the focused service/controller/save/CodeEditor suite and verify PASS.

### Task 5: Evidence and final commit

**Files:**
- Modify: `docs/refactor/editor-foundation/roadmap.md`
- Modify: `docs/refactor/editor-foundation/progress.md`
- Modify: `docs/test-report.md`
- Modify: `docs/plans/2026-07-16-rf-101-handoff.md`

- [x] Update architecture wording, file/test counts, reload cutoff semantics, canonical-unknown behavior, and tab-bound save evidence.
- [x] Run focused tests, full Vitest, lint, typecheck, build, and `git diff --check`.
- [x] Review the diff for React/business-boundary residue and obsolete helpers.
- [x] Commit all fifth-round changes once with a focused message; do not push.
