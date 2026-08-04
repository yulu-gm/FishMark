# RF-203 Renderer Edit Client and Pending Queue Implementation Plan

> **Execution mode:** Use `$fishmark-task-execution` with
> `$superpowers:subagent-driven-development`. This is a long, UX-critical task, so each behavior
> slice uses observed RED/GREEN tests. Keep one active implementation slice at a time in the shared
> worktree. Do not start RF-204 before RF-203 formal acceptance.

**Goal:** Replace production renderer whole-document edit submission with an optimistic, ordered,
revisioned pending queue while preserving CodeMirror undo, IME, selection, semantic commands and all
save/ownership barriers.

**Architecture:** `code-editor.ts` is the sole RAF owner: it observes and frame-composes CodeMirror `ChangeSet`s, exporting only
repository-owned `DocumentTextChange[]`. A pure per-tab `PendingEditQueue` owns immutable protocol
state. A narrow `WorkspaceEditClient` owns bridge IO, projection metadata and lifecycle, but no
second scheduler or frame bucket.
The existing `WorkspaceRendererApplication` remains the single workflow/barrier owner and orchestrates
conservative conflict recovery. React stays thin. The legacy full-draft bridge remains dormant until
RF-204 and is never a fallback for the same edit.

**Stack:** TypeScript, React, CodeMirror 6, Electron ProductBridge, Vitest, existing editor behavior
harness.

---

## Task 1: Build the pure per-tab pending queue and conservative rebase

**Files:**

- Create: `src/renderer/application/pending-edit-queue.ts`
- Create: `src/renderer/application/pending-edit-queue.test.ts`

**Steps:**

1. Add failing tests for initial hydration, per-tab sequence allocation, queued/in-flight
   ownership, exact head acknowledgement, duplicate acknowledgement, tail edits during in-flight
   work, dirty derivation, retirement and late-result generation rejection.
2. Implement immutable queue transitions with one in-flight batch, retained base/result text and
   no bridge/React/DOM/CodeMirror imports.
3. Add failing tests for gap resend, missing-gap fail-closed, monotonic revision validation and typed
   blocked states that retain local text.
4. Implement pure result admission without dropping a batch on errors or protocol mismatch.
5. Add failing rebase tests for disjoint before/after remote changes, remote no-op/new revision,
   overlap, same-point insertion, repeated Markdown context, UTF-16/emoji and multi-local changes.
6. Implement the conservative prefix/suffix remote replacement and return either a deterministic
   rebased batch reusing the conflicting sequence or an exact `recovery-required` payload.
7. Run the focused queue tests and typecheck this module.

## Task 2: Build the narrow WorkspaceEditClient

**Files:**

- Create: `src/renderer/application/workspace-edit-client.ts`
- Create: `src/renderer/application/workspace-edit-client.test.ts`

**Steps:**

1. Define injected ports for client ID creation, apply, flush, projection subscription and state
   notification. Recovery is a typed result, never an awaited callback port.
2. Add failing tests for one random ID per client lifetime, independent tab sequences, immediate
   admission of adapter-sealed repository frames, single-flight apply, cross-tab concurrency, exact duplicate retirement and projection
   arriving before promise acknowledgement.
3. Implement per-tab queue ownership and ordered pump with no RAF scheduler. Never use projection
   delivery to retire a batch.
4. Add failing tests for bounded identical-payload transport retry, typed error retention, gap resend,
   missing-gap recovery, stale tab/client generation and disposal during frame/send.
5. Implement fail-closed result admission and lifecycle fencing.
6. Add failing client tests for `acquireFlushBarrier(tabId)` and all-tab barriers after an adapter
   frame has been emitted: exact cutoff, wait-through-cutoff, main checkpoint call, send ceiling,
   lease release, tail edit exclusion and failed-barrier retention.
7. Add a send-ceiling barrier lease so save holds back batches beyond its cutoff until the save IPC
   settles; implement flush semantics and expose separate transport-baseline and UI metadata/dirty
   subscriptions plus typed conflict/recovery results.
8. Run both renderer application test files.

## Task 3: Serialize CodeMirror transactions without changing editing behavior

**Files:**

- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/code-editor.test.ts`
- Modify: `src/renderer/code-editor-view.tsx`
- Modify: `src/renderer/code-editor-view.test.tsx`

**Steps:**

1. Add failing adapter tests for insert/delete/replace/multi-range, emoji/UTF-16/CRLF and exact
   A-coordinate serialization from `ViewUpdate.changes`.
2. Add failing tests where a user transaction and editor-core follow-up transaction occur in one
   update; prove direct array concatenation would be wrong and composed output is correct.
3. Add an observation-only update listener and frame `ChangeSet.compose` bucket. Export only
   `DocumentTextChange[]`, frame-start/final text and the current editor identity.
4. Add failing tests for same-frame batching, selection-only updates, identity separation,
   synchronous `flushPendingDocumentChanges`, replace/discard and destroy cancellation.
5. Add a repository-owned internal transaction-origin annotation; remote/canonical/recovery patches
   are ignored by the observer while semantic command dispatch remains observable.
6. Add composition tests proving an asynchronous `sealForBarrier()` waits for the final
   post-`compositionend` document update before setting read-only, and destroy/unload preserves exact
   view text when it cannot wait.
7. Verify normal acknowledgement needs no controller method and produces no dispatch/state replace.
7. Run focused CodeMirror/controller/view tests plus existing Enter/Backspace/list/blockquote cases.

## Task 4: Integrate the edit client without a second renderer store

**Files:**

- Modify: `src/renderer/editor/workspace-renderer-application.ts`
- Modify: `src/renderer/editor/workspace-renderer-application.test.ts`
- Modify: `src/renderer/editor/useWorkspaceController.ts`
- Modify: `src/renderer/editor/useWorkspaceController.test.tsx`
- Modify: `src/renderer/editor/WorkspaceShell.tsx`
- Modify: `src/renderer/editor/WorkspaceShell.test.tsx`
- Modify: affected renderer test bridge fixtures

**Steps:**

1. Add failing integration tests proving one editor transaction reaches `applyDocumentEdits` and
   never `updateWorkspaceTabDraft`, while local state remains immediately optimistic.
2. Inject one `WorkspaceEditClient` into `WorkspaceRendererApplication`; hydrate queues from revision
   snapshots and route document-change records through it. Hooks expose thin transaction and frame
   flush callbacks only.
3. Combine adapter frame-pending dirty signal with client pending/recovery state; barrier order is
   always adapter `sealForBarrier()` followed by client `acquireFlushBarrier()`.
4. Replace local dirty assignment with client-derived observed/pending dirty state. Expose optimistic
   text as an explicit disposable view projection; never write it into canonical
   `WorkspaceWindowSnapshot` content.
5. Subscribe once to document projection metadata and fence wrong window/tab/stale lifecycle events.
6. Keep the old outbox/full-draft runtime compiled but unreachable from production CodeMirror edits;
   add an architecture/source assertion against dual invocation or fallback routing.
7. Run the renderer application/controller/shell focus.

## Task 5: Replace every real workflow drain with an exact edit barrier

**Files:**

- Modify: `src/renderer/editor/workspace-renderer-application.ts`
- Modify: `src/renderer/editor/workspace-renderer-application.test.ts`
- Modify: `src/renderer/editor/useSaveController.test.tsx`
- Modify: `src/renderer/app.autosave.test.ts`
- Modify: related editor application/controller tests

**Steps:**

1. Add delayed-ack failing tests for open/create/export and activation source-tab barriers.
2. Add failing save/save-as/autosave tests proving the captured cutoff is flushed before save while
   later input remains pending and dirty.
3. Add failing active/inactive detach, reload and tab-close tests: active target exact-token seals,
   frame flushes, checkpoint completes, then destructive IPC starts; barrier failure prevents it.
4. Add failing window-close tests proving active seal plus all-tab flush precedes confirmation and a
   failed tab barrier aborts close without losing local data.
5. Replace full-draft capture/drain calls on the production path with scoped client barrier leases;
   hold save leases through save IPC and retain RF-204 deletion debt without using it as fallback.
6. Preserve reorder as no-flush and document that existing ownership transfer is detach-to-new-window;
   do not add unrelated cross-window move UI.
7. Run workspace workflow, save and autosave focused tests.

## Task 6: Implement conflict view reconciliation and recovery tab

**Files:**

- Modify: `src/renderer/application/workspace-edit-client.ts`
- Modify: `src/renderer/application/workspace-edit-client.test.ts`
- Modify: `src/renderer/code-editor.ts`
- Modify: `src/renderer/code-editor-view.tsx`
- Modify: `src/renderer/editor/workspace-renderer-application.ts`
- Modify: focused tests for all above

**Steps:**

1. Add failing tests for non-overlapping conflicts in both orders: original client sequence is reused,
   local-on-canonical and remote-on-optimistic coordinates are mapped independently, target texts are
   reconstructed exactly, remote patch has internal origin, and no extra apply is emitted.
2. Implement the client-to-application rebase event and CodeMirror remote-delta application with
   `Transaction.addToHistory.of(false)`, delayed until composition ends.
3. Add failing ambiguous-conflict tests whose typed recovery result is handled inline by the current
   coordinator operation: capture exact text, freeze old queue, suppress-observer canonical restore,
   use recovery-only untitled creation without source flush, hydrate revision 0, write/ack exact text,
   then retire the old queue.
4. Add failure tests for recovery-tab creation/apply, disposal and owner change; retain an explicit
   in-memory recovery payload and block destructive workflows.
5. Test repeated Markdown markers, nested lists/quotes/code fences, Unicode and CRLF recovery text.
6. Run all renderer application, CodeMirror and workspace workflow focused tests.

## Task 7: Architecture cleanup and DEV_DONE handoff

**Files:**

- Modify: `src/main/editor-foundation-architecture.ts`
- Modify: `src/main/editor-foundation-architecture.test.ts`
- Modify: `fixtures/architecture/editor-foundation-guard.json`
- Modify: `docs/refactor/editor-foundation/progress.md`
- Create: `docs/plans/2026-08-04-rf-203-handoff.md`

**Steps:**

1. Add architecture guards for no CodeMirror imports in renderer application queue/client, one
   workspace edit client composition owner, and no production edit callback invoking both new and
   legacy transports.
2. Scan for content-diff batching, persisted/reused client IDs, unbounded retry, acknowledgement
   document replacement, projection-as-ack and compatibility fallback routing.
3. Run the focused renderer gate, editor-foundation, lint, typecheck, build and formal editor behavior
   suite; record exact fresh evidence.
4. Write the execution handoff with RED/GREEN evidence, protocol invariants, manual delayed-IPC /
   conflict probes and explicit RF-204 deletion debt.
5. Mark RF-203 `DEV_DONE`, not `COMPLETE`.

## Task 8: Independent review, formal acceptance and task commit

**Files:**

- Modify implementation/tests only for review findings
- Modify: `docs/refactor/editor-foundation/roadmap.md`
- Modify: `docs/refactor/editor-foundation/progress.md`
- Modify: `docs/decision-log.md`
- Modify: `docs/test-report.md`
- Create: `reports/task-summaries/RF-203.md`

**Steps:**

1. Run independent specification/architecture and quality reviews with fresh SubAgents.
2. Repair every Critical/Important finding from an observed failing regression test and repeat review
   until architecture `PASS` and quality `Ready: Yes`.
3. Run fresh formal focused, editor-foundation, lint, typecheck, full Vitest, build and exclusive
   editor behavior gates.
4. Update all status records only from fresh evidence; include mandatory manual acceptance steps.
5. Mark RF-203 `COMPLETE`, M2 `3/4 IN_PROGRESS`, program `7/38`, and RF-204 dependency-ready only
   after formal `PASS`.
6. Commit locally on `codex/editor-foundation-refactor`; do not push without explicit user request.
