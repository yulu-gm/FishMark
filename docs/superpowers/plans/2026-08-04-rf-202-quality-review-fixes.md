# RF-202 Quality Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close RF-202's staged-wire truthfulness, ProductBridge invariant, and wire-result isolation findings without changing the public renderer DTO or layer direction.

**Architecture:** The shared decoder returns a truthful candidate whose statefully ordered fields remain `unknown`; application and domain carry that candidate until domain type predicates admit revision and text changes. The preload invariant uses a TypeScript `Program` and `TypeChecker` rooted at the canonical `ProductBridge` declaration, while main reconstructs every wire result explicitly.

**Tech Stack:** TypeScript, Vitest, TypeScript compiler API, Electron main IPC adapters.

---

### Task 1: Truthful staged apply candidate

**Files:**
- Modify: `src/shared/document-edit.ts`
- Modify: `src/shared/document-edit.test.ts`
- Modify: `packages/workspace-domain/src/document-session.ts`
- Modify: `packages/workspace-domain/src/document-session.test.ts`
- Modify: `packages/workspace-domain/src/workspace-state.ts`
- Modify: `packages/workspace-application/src/apply-document-edits.ts`

- [x] Add type/runtime tests proving decoded `baseRevision` and `changes` remain `unknown`, flush is rebuilt, and malformed duplicate payloads remain duplicates.
- [x] Run shared/domain/application tests and observe the decoder candidate/type narrowing RED.
- [x] Add `DecodedApplyDocumentEditsCandidate` with narrowed identity/sequence fields and unknown stateful fields; reconstruct decoder results without casts.
- [x] Carry unknown fields into domain admission and use predicates that narrow to `number` and `readonly TextChange[]` only after duplicate/gap checks.
- [x] Re-run the focused tests and confirm GREEN.

### Task 2: Type-checker-backed ProductBridge invariant

**Files:**
- Modify: `src/main/editor-foundation-source-scan.ts`
- Modify: `src/main/editor-foundation-architecture.ts`
- Modify: `src/main/editor-foundation-architecture.test.ts`

- [x] Add synthetic fixtures for import aliases, local aliases, `Readonly`, qualified types, allowed nested spread, rejected returned spread, ignored spec/`__tests__`, and fail-closed resolution.
- [x] Run the architecture test and observe the missing/false-positive RED failures.
- [x] Build a TypeScript `Program`, resolve the canonical interface symbol through aliases and transparent wrappers, and classify only constructions assignable to that symbol.
- [x] Inspect spreads only on the canonical builder's top-level returned object literal and use one production-source exclusion predicate.
- [x] Re-run architecture tests and confirm GREEN.

### Task 3: Explicit IPC result reconstruction

**Files:**
- Modify: `src/main/ipc/register-workspace-handlers.ts`
- Modify: `src/main/ipc/register-workspace-handlers.test.ts`

- [x] Add runtime-cast test fixtures with extra/content fields for conflict, gaps, and flushed results; assert wire responses strip them.
- [x] Run the handler test and observe field-leak RED.
- [x] Reconstruct every result variant field-by-field with exhaustive switches and never return an application result object directly.
- [x] Re-run handler tests and confirm GREEN.

### Task 4: Verification and execution handoff

**Files:**
- Modify: `docs/plans/2026-08-04-rf-202-handoff.md`
- Modify: `docs/refactor/editor-foundation/progress.md`

- [x] Run related shared/domain/application/main/architecture tests and the RF-202 focused gate.
- [x] Run `npm.cmd run test:editor-foundation`, `npm.cmd run lint`, and `npm.cmd run typecheck`.
- [x] Run `git diff --check` and residue scans.
- [x] Record observed RED/GREEN counts, final commands, and the deliberate domain/shared error-message separation while retaining `DEV_DONE`.
