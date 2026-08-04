# RF-201 Persistent Text Buffer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production main-process document sessions use a persistent CodeMirror `Text` buffer and add a typed, revisioned, idempotent edit-batch primitive in the runtime-neutral workspace domain.

**Architecture:** `workspace-domain` owns the `TextBuffer`/revision/edit-batch contracts and never imports CodeMirror. `workspace-infrastructure` privately wraps `@codemirror/state` `Text`, while main injects its public factory into the one canonical `WorkspaceState`. RF-201 does not change renderer/preload IPC and does not retain a selectable production fallback.

**Tech Stack:** TypeScript, CodeMirror 6 `@codemirror/state`, Vitest, Electron build/runtime package resolution.

---

## File map

- `packages/workspace-domain/src/text-buffer.ts`: runtime-neutral buffer/factory contract and canonical change validation.
- `packages/workspace-domain/src/document-session.ts`: immutable edit-batch state machine and client sequence high-watermarks.
- `packages/workspace-domain/src/workspace-state.ts`: owns the injected buffer factory used for every created/reloaded session.
- `packages/workspace-infrastructure/src/codemirror-text-buffer.ts`: the only CodeMirror-backed buffer implementation.
- `src/main/main.ts`: production composition selecting the infrastructure factory.
- `fixtures/architecture/editor-foundation-guard.json`: active package boundary.
- root scripts/config: build, watch, clean, typecheck, alias, emitted runtime verification.

### Task 1: Strengthen the domain TextBuffer contract

**Files:**
- Modify: `packages/workspace-domain/src/text-buffer.ts`
- Modify: `packages/workspace-domain/src/text-buffer.test.ts`
- Modify: `packages/workspace-domain/src/index.ts`

- [ ] **Step 1: Add failing conformance tests**

Extract a reusable suite that calls a `TextBufferFactory` and asserts empty identity, Unicode/emoji, literal CRLF, original-coordinate multi-edit behavior, large insertion, and all invalid range categories. Include safe-integer cases:

```ts
expect(() => factory("abcd").apply([{ from: Number.MAX_SAFE_INTEGER, to: 4, insert: "" }]))
  .toThrow("safe integers");
```

- [ ] **Step 2: Run the focused domain test and confirm RED**

```powershell
npm.cmd run test -- packages/workspace-domain/src/text-buffer.test.ts
```

Expected: the new safe-integer contract/export does not yet exist.

- [ ] **Step 3: Implement one validator and factory type**

Expose the runtime-neutral types without exposing implementations:

```ts
export type TextBufferFactory = (value: string) => TextBuffer;

export function validateTextChanges(
  changes: readonly TextChange[],
  bufferLength: number
): void;
```

The `TextBuffer` interface also gains `equals(other: TextBuffer): boolean`. The validator must require `Number.isSafeInteger` for buffer length/from/to, reject negative/reversed/out-of-bounds ranges, and reject `change.from < previousTo`. `StringTextBuffer.apply` must call this function and preserve identity for `[]`.

- [ ] **Step 4: Run the focused domain test and confirm GREEN**

```powershell
npm.cmd run test -- packages/workspace-domain/src/text-buffer.test.ts
```

Expected: all text-buffer and revision tests pass.

### Task 2: Add the immutable session edit-batch state machine

**Files:**
- Modify: `packages/workspace-domain/src/document-session.ts`
- Modify: `packages/workspace-domain/src/document-session.test.ts`
- Modify: `packages/workspace-domain/src/index.ts`

- [ ] **Step 1: Add failing batch-result tests**

Cover this result surface:

```ts
type ApplyDocumentEditBatchResult =
  | { kind: "applied"; session: DocumentSessionState; revision: DocumentRevision }
  | { kind: "duplicate"; session: DocumentSessionState; revision: DocumentRevision }
  | { kind: "revision-conflict"; session: DocumentSessionState; canonicalRevision: DocumentRevision }
  | { kind: "sequence-gap"; session: DocumentSessionState; expectedSequence: number }
  | { kind: "invalid"; session: DocumentSessionState; error: { code: string; message: string } };
```

Tests must prove first sequence `1`, per-client independence, exact once revision increment for multiple edits and same-text replacements, empty-batch rejection, duplicate short-circuit before stale revision, gap rejection, stale/newer base revision, invalid client/sequence/ranges, original session identity on every non-applied outcome, clean state when accepted text equals `savedText`, no `toString()` call on the incremental path, and defensive ownership of the sequence ledger.

- [ ] **Step 2: Run the session test and confirm RED**

```powershell
npm.cmd run test -- packages/workspace-domain/src/document-session.test.ts
```

Expected: `applyDocumentEditBatch` and its result types are missing.

- [ ] **Step 3: Inject construction and implement the state machine**

`CreateDocumentSessionInput` receives a `createTextBuffer: TextBufferFactory`. The session stores a private-domain immutable `ReadonlyMap<string, number>` high-watermark. Implement processing in this exact order:

```ts
validate client shape
if (clientSequence <= acknowledged) return duplicate
if (clientSequence !== acknowledged + 1) return sequence-gap
if (baseRevision !== session.revision) return revision-conflict
validate changes
reject an empty batch
apply changes atomically without toString()
record clientSequence
increment revision exactly once
```

Use typed `invalid` codes for invalid client ID, client sequence, and text changes. Never partially update text or the ledger.

- [ ] **Step 4: Preserve save/reload/full-draft semantics**

Every new/reloaded buffer must use the session's factory. `replaceDocumentText`, `commitSavedDocument`, and `replaceDocumentFromDisk` must keep existing saved-revision and identity behavior. Do not add an IPC or workspace-state batch method in this task.

- [ ] **Step 5: Run domain tests and confirm GREEN**

```powershell
npm.cmd run test -- packages/workspace-domain
```

Expected: existing session/workspace behavior plus all edit-batch cases pass.

### Task 3: Implement workspace-infrastructure with CodeMirror Text

**Files:**
- Create: `packages/workspace-infrastructure/package.json`
- Create: `packages/workspace-infrastructure/tsconfig.json`
- Create: `packages/workspace-infrastructure/README.md`
- Create: `packages/workspace-infrastructure/src/index.ts`
- Create: `packages/workspace-infrastructure/src/codemirror-text-buffer.ts`
- Create: `packages/workspace-infrastructure/src/codemirror-text-buffer.test.ts`

- [ ] **Step 1: Add failing infrastructure conformance tests**

Run the domain conformance suite against `createCodeMirrorTextBuffer` and explicitly assert a 20,000-line buffer, a local replacement near the end, a multi-megabyte insertion, Unicode surrogate offsets, and CRLF byte-for-byte output.

- [ ] **Step 2: Run the package test and confirm RED**

```powershell
npm.cmd run test -- packages/workspace-infrastructure
```

Expected: package/factory is missing.

- [ ] **Step 3: Implement the private wrapper**

Use `Text.of(value.split("\n"))`. The exported factory signature is exactly:

```ts
export function createCodeMirrorTextBuffer(value: string): TextBuffer;
```

The concrete class is not exported. `apply` calls domain validation, preserves identity for `[]`, and applies original-coordinate changes from the end toward the start using `Text.replace`. Convert inserted strings with the same `split("\n")` rule. `slice` uses `sliceString`; `toString` uses `sliceString(0, length)`.

- [ ] **Step 4: Run infrastructure tests and confirm GREEN**

```powershell
npm.cmd run test -- packages/workspace-infrastructure
```

Expected: all conformance and large-document cases pass.

### Task 4: Cut production composition over to the persistent factory

**Files:**
- Modify: `packages/workspace-domain/src/workspace-state.ts`
- Modify: `packages/workspace-domain/src/workspace-state.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/main.test.ts`
- Modify: root `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`
- Create: `scripts/verify-workspace-infrastructure-runtime.mjs`

- [ ] **Step 1: Add failing injection/source/runtime tests**

Prove that a custom factory is used for untitled/open/reload creation and that main contains:

```ts
createWorkspaceState({ createTextBuffer: createCodeMirrorTextBuffer })
```

The runtime verifier must require `@fishmark/workspace-infrastructure`, create a buffer, apply a real edit, and compare exact output.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
npm.cmd run test -- packages/workspace-domain/src/workspace-state.test.ts src/main/main.test.ts
```

- [ ] **Step 3: Implement injection and build wiring**

`createWorkspaceState` requires `{ createTextBuffer }`. The canonical state stores the factory and passes it to every `createDocumentSession`. Tests explicitly pass `createStringTextBuffer`; main imports the infrastructure public entry and passes `createCodeMirrorTextBuffer`. No default/fallback overload remains.

Add the file package and move `@codemirror/state` to production dependencies. Add build/watch/clean/typecheck order and aliases so infrastructure builds after domain and before Electron. No source-path import may replace the public package entry.

- [ ] **Step 4: Run typecheck and runtime verifier**

```powershell
npm.cmd run typecheck
node scripts/verify-workspace-infrastructure-runtime.mjs
```

Expected: emitted public package resolution succeeds and all TypeScript projects pass.

### Task 5: Activate architecture guards and prepare handoff

**Files:**
- Modify: `fixtures/architecture/editor-foundation-guard.json`
- Modify: `src/main/editor-foundation-architecture.test.ts`
- Create: `docs/plans/2026-08-04-rf-201-handoff.md`
- Modify: `docs/refactor/editor-foundation/progress.md`
- Modify only if implementation clarifies contract: `docs/refactor/editor-foundation/roadmap.md`

- [ ] **Step 1: Add failing architecture tests**

Require exactly one active `workspace-infrastructure` package/rule. Permit only `@fishmark/workspace-domain` and `@codemirror/state`; reject Electron, React, Node APIs, shared/main/preload/renderer, editor-core, markdown-engine, and package-internal imports from consumers.

- [ ] **Step 2: Run architecture tests and confirm RED**

```powershell
npm.cmd run test -- src/main/editor-foundation-architecture.test.ts
```

- [ ] **Step 3: Activate the manifest rule and confirm GREEN**

```powershell
npm.cmd run test -- src/main/editor-foundation-architecture.test.ts
```

- [ ] **Step 4: Run the development gate**

```powershell
npm.cmd run test -- packages/workspace-domain packages/workspace-infrastructure src/main/main.test.ts src/main/editor-foundation-architecture.test.ts
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

- [ ] **Step 5: Write the execution handoff**

Record exact changed modules, RED/GREEN evidence, recommended full gates, manual checks, and deferred RF-202/RF-203/RF-204 responsibilities. Mark RF-201 `DEV_DONE`, not `COMPLETE`; formal architecture/task acceptance remains separate.

## Plan self-review

- Spec coverage: persistent buffer, injection, batch validation/revision/idempotence, runtime build, guards, tests, and handoff each have an owning task.
- Placeholder scan: no TBD/TODO or unspecified error behavior remains.
- Type consistency: `TextBufferFactory`, `ApplyDocumentEditBatchInput`, `ApplyDocumentEditBatchResult`, and `createCodeMirrorTextBuffer` names are consistent across tasks.
- Scope: renderer/preload transport and full-draft deletion remain RF-202 through RF-204.
