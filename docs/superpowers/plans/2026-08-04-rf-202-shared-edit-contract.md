# RF-202 Shared Edit Contract and Main Handler Implementation Plan

> **Execution mode:** Use `$fishmark-task-execution` with
> `$superpowers:subagent-driven-development`. Implement one task at a time in the shared RF
> worktree, use RED/GREEN tests for behavior changes, and do not start RF-203 until RF-202 formal
> acceptance passes.

**Goal:** Carry revisioned document edit batches through a structured-clone-safe ProductBridge into
the main-owned canonical workspace, with sender ownership, idempotence, conflict recovery, and a
real per-tab flush barrier.

**Architecture:** Shared modules own wire DTOs only. Preload adapts Electron ports into one complete
ProductBridge. A focused main registration module validates sender/envelope and delegates to
runtime-neutral workspace-application use cases. Workspace-application serializes apply and flush
through the existing per-tab coordinator; workspace-domain remains the sole stateful authority for
ownership, sequence, revision, bounds, and canonical text.

**Stack:** TypeScript, Electron IPC, `@fishmark/workspace-domain`,
`@fishmark/workspace-application`, Vitest.

---

## Task 1: Close the domain protocol boundary

**Files:**

- Modify: `packages/workspace-domain/src/document-session.ts`
- Modify: `packages/workspace-domain/src/workspace-state.ts`
- Modify: `packages/workspace-domain/src/index.ts`
- Test: `packages/workspace-domain/src/document-session.test.ts`
- Test: `packages/workspace-domain/src/workspace-state.test.ts`

**Steps:**

1. Add failing tests for invalid `baseRevision`, stale duplicate ordering, owner-aware apply,
   metadata projection, acknowledged high-watermark lookup, missing tab, and changed owner.
2. Extend edit-batch invalid codes with `invalid-base-revision`; keep ordering as duplicate, gap,
   base revision validation, conflict, changes, empty batch, overflow, apply.
3. Add a workspace-owned `applyDocumentEditBatch` entry that compares `expectedWindowId`, replaces
   state only for `applied`, and never materializes full text except a conflict projection request.
4. Add metadata-only document projection and acknowledged-sequence query APIs for application
   apply/flush mapping.
5. Export only the new public domain contracts and run the two focused domain test files.

## Task 2: Separate legacy draft mutation and add serialized application use cases

**Files:**

- Rename: `packages/workspace-application/src/apply-document-edits.ts` to
  `packages/workspace-application/src/update-document-draft.ts`
- Rename test: `packages/workspace-application/src/apply-document-edits.test.ts` to
  `packages/workspace-application/src/update-document-draft.test.ts`
- Create: `packages/workspace-application/src/apply-document-edits.ts`
- Create: `packages/workspace-application/src/apply-document-edits.test.ts`
- Create: `packages/workspace-application/src/flush-document-edits.ts`
- Create: `packages/workspace-application/src/flush-document-edits.test.ts`
- Modify: `packages/workspace-application/src/workspace-application.ts`
- Modify: `packages/workspace-application/src/workspace-application.test.ts`
- Modify: `packages/workspace-application/src/index.ts`
- Modify: `packages/workspace-application/README.md`

**Steps:**

1. Rename the existing full-text use case and public facade member to `updateDocumentDraft`; update
   existing callers without changing the deferred full-draft IPC/ProductBridge name.
2. Add failing application tests for apply result mapping, per-tab FIFO, unrelated-tab concurrency,
   duplicate/conflict/error behavior, and no normal-path canonical text.
3. Implement revisioned `applyDocumentEdits` using `documentOperations.runExclusive(tabId, ...)`.
4. Add failing flush tests for apply-before-flush ordering, through-sequence `0`, acknowledged
   completion, missing sequence gap, saved revision metadata, and cross-tab independence.
5. Implement `flushDocumentEdits` on the same coordinator and expose both use cases through the
   complete application facade.
6. Run all workspace-application tests plus affected main integration tests for the renamed legacy
   method.

## Task 3: Define and validate the shared wire contract

**Files:**

- Create: `src/shared/document-edit.ts`
- Create: `src/shared/document-edit.test.ts`
- Create: `src/shared/document-projection.ts`
- Modify: `src/shared/product-bridge.ts`
- Modify: `src/shared/workspace.ts`
- Modify: `src/shared/workspace.test.ts`

**Steps:**

1. Add failing decoder tests for exact top-level keys, plain objects, bounded IDs, safe integer
   sequences/revisions, and unknown nested payloads while deliberately deferring semantic change
   validation until after duplicate/gap checks.
2. Define apply/flush channels, structured-clone-safe DTOs, result unions, and closed error codes.
3. Implement envelope decoders that retain `baseRevision` and `changes` as unknown stateful input
   after validating identity fields; do not preempt duplicate/gap ordering.
4. Define metadata-only projection event DTO/channel and add ProductBridge methods/listener.
5. Add `revision` and `savedRevision` to `WorkspaceDocumentSnapshot` and every snapshot mapper/test
   fixture that constructs it.
6. Run shared contract and workspace snapshot tests.

## Task 4: Extract one complete preload ProductBridge builder

**Files:**

- Create: `src/preload/product-api.ts`
- Create: `src/preload/product-api.test.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/preload/preload.test.ts`
- Modify: `src/preload/preload.contract.test.ts`

**Steps:**

1. Add failing tests for apply/flush channel forwarding, projection listener payload forwarding,
   exact `off` callback identity, and the complete existing bridge surface.
2. Move the entire product API object into one `createProductApi` builder using minimal invoke,
   on/off, file-path, platform, argv, and completion ports.
3. Add the RF-202 methods through that builder; keep `preload.ts` responsible only for Electron
   port composition, context exposure, and optional test bridge wiring.
4. Strengthen the preload contract guard so partial/spread/compatibility ProductBridge objects
   cannot reappear.
5. Run all preload tests.

## Task 5: Register sender-validated main handlers

**Files:**

- Create: `src/main/ipc/register-workspace-handlers.ts`
- Create: `src/main/ipc/register-workspace-handlers.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/main.test.ts`
- Modify: `src/main/workspace-ipc-projection.ts`
- Modify: affected workspace main integration tests

**Steps:**

1. Add failing handler tests for malformed envelopes, destroyed/replaced sender rejection, missing
   and moved tabs, ownership changes while queued, duplicate/gap/conflict mappings, internal error
   sanitization, no canonical text in normal results, and one owner-only projection event on apply.
2. Implement a focused registration module with ports for IPC registration, live sender/window
   resolution, application commands, and owner event publication.
3. Reuse `workspaceWindowRegistrationApplication.ensureWindow(event.sender)` and never accept a
   renderer window ID. Revalidate ownership inside the queued domain operation.
4. Map domain/application outcomes exhaustively. Only revision conflict may call for or return
   canonical text; sender failures reject before application execution.
5. Compose the handler in `main.ts`, rename only the internal legacy application member to
   `updateDocumentDraft`, and leave its channel intact for RF-204.
6. Publish a metadata projection only after a newly applied batch; duplicate retries return current
   metadata without event replay.
7. Run focused main handler, projection, and workspace integration tests.

## Task 6: Enforce architecture and runtime build boundaries

**Files:**

- Modify: `src/main/editor-foundation-architecture.ts`
- Modify: `src/main/editor-foundation-architecture.test.ts`
- Modify: `src/main/editor-foundation-repository-evidence.ts` if required
- Modify: `package.json`
- Modify: workspace runtime verifier scripts/tests if required

**Steps:**

1. Add failing architecture assertions for the public shared DTOs, focused main/preload modules,
   one ProductBridge builder, and forbidden Electron/CodeMirror/domain leakage.
2. Extend emitted workspace package wait/runtime verification for every new runtime-imported shared
   constant or application entry.
3. Remove accidental aliases, temporary adapters, broad casts, and unused legacy names introduced
   during implementation.
4. Run `npm.cmd run test:editor-foundation`, `npm.cmd run typecheck`, and
   `npm.cmd run build`.

## Task 7: Focused verification and DEV_DONE handoff

**Files:**

- Create: `docs/plans/2026-08-04-rf-202-handoff.md`
- Modify: `docs/refactor/editor-foundation/progress.md`

**Steps:**

1. Run the focused domain/application/shared/preload/main test selection and record exact counts.
2. Run `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test:editor-foundation`, and
   `npm.cmd run build`.
3. Run `git diff --check` plus residue scans for partial ProductBridge builders, duplicated handler
   registration, renderer-supplied owner IDs, and unintended full-text acknowledgement fields.
4. Write the execution handoff with scope, changed interfaces, evidence, known RF-203/RF-204 debt,
   and manual acceptance probes.
5. Mark RF-202 `DEV_DONE`; do not claim `COMPLETE` and do not start RF-203.

## Task 8: Independent review, formal acceptance, and task commit

**Files:**

- Modify: implementation/tests as required by findings
- Modify: `docs/refactor/editor-foundation/roadmap.md`
- Modify: `docs/refactor/editor-foundation/progress.md`
- Modify: `docs/decision-log.md`
- Modify: `docs/test-report.md`
- Create: `reports/task-summaries/RF-202.md`

**Steps:**

1. Run independent specification/architecture and code-quality reviews with fresh SubAgents.
2. Fix every blocking or important finding with a failing regression test, then rerun focused
   verification and repeat reviews until clean.
3. Run formal task acceptance: full Vitest, lint, typecheck, build, editor-foundation gate, and
   exclusive formal editor behavior suite; record exact evidence.
4. Update roadmap, progress, decision log, test report, and task summary only from fresh evidence.
5. Mark RF-202 `COMPLETE`, M2 `2/4 IN_PROGRESS`, and program completion `6/38` only after PASS.
6. Commit the accepted RF-202 implementation and records on `codex/editor-foundation-refactor`;
   do not push without an explicit user request.
