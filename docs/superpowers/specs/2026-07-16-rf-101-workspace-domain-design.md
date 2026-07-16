# RF-101 Workspace Domain Design

**Date:** 2026-07-16
**Task:** RF-101 — Extract workspace domain
**Status:** APPROVED FOR PLANNING
**Roadmap:** `docs/refactor/editor-foundation/roadmap.md`

## 1. Decision

RF-101 will replace `src/main/workspace-service.ts` with one runtime-neutral package, `@fishmark/workspace-domain`. The package will own canonical window, tab, session, revision, saved-checkpoint, ordering, move, detach, close, and projection rules. Main remains the only owner of the live `WorkspaceState`; renderer and preload continue to exchange the current shared IPC DTOs.

The cutover is hard: the old service, old service tests, old internal session type, and all old imports are deleted before RF-101 can reach `DEV_DONE`. No facade, re-export, compatibility alias, dual write, feature flag, or fallback to the old service is permitted.

## 2. Why this task exists

The current `src/main/workspace-service.ts` correctly keeps writable workspace truth in main, but combines domain state, business invariants, mutable storage, renderer-facing projections, and main-local types in one module. `main.ts`, `workspace-application.ts`, and `workspace-close-coordinator.ts` depend directly on that implementation. This prevents later revisioned edit transport and persistent buffers from being introduced without repeatedly rewriting application workflows.

RF-101 establishes the final domain seam without changing the renderer protocol. RF-102 will move application use cases and ports; RF-201 will replace the reference string buffer with the persistent CodeMirror `Text` infrastructure adapter; RF-202–RF-204 will replace full-draft synchronization with revisioned edits.

## 3. Considered approaches

### 3.1 Selected: final domain API plus a reference string buffer

`DocumentSession` uses the final `TextBuffer` interface immediately. RF-101 ships a runtime-neutral immutable string-backed implementation that is valid in production and remains useful as the domain reference/test implementation. RF-201 adds a CodeMirror `Text` adapter and changes the production factory without changing `DocumentSession`, `WorkspaceState`, or main consumers.

This is the only approach that completes RF-101 without either an unused scaffold or an early infrastructure dependency.

### 3.2 Rejected: keep strings until RF-201

Leaving `draftContent` and `lastSavedContent` as raw strings would make `text-buffer.ts` an unused placeholder and require another session API rewrite in RF-201. It creates staged structure with no stable responsibility.

### 3.3 Rejected: import CodeMirror `Text` in RF-101

This would pull infrastructure into a runtime-neutral domain extraction and take work assigned to RF-201. `workspace-domain` must not import CodeMirror.

### 3.4 Rejected: wrap the old service

A new package delegating to `workspace-service.ts`, or a main-local facade re-exporting the package, would leave two architectural identities and violate the RF-101 deletion contract.

## 4. Dependency and ownership model

```text
renderer -> shared IPC contracts -> preload bridge -> main composition
                                                   -> @fishmark/workspace-domain
workspace-application -----------------------------> @fishmark/workspace-domain
workspace-close-coordinator -----------------------> @fishmark/workspace-domain
```

Rules:

- `workspace-domain` depends only on TypeScript and runtime-neutral utilities.
- It cannot import React, Electron, DOM, CodeMirror, filesystem, dialog, watcher, IPC, `src/main`, `src/preload`, or `src/renderer`.
- Main owns the only live `WorkspaceState` instance and therefore the only writable workspace/session truth.
- Shared IPC contracts retain their current wire shape and do not import domain internals.
- Renderer does not import `DocumentSession`, `TextBuffer`, or mutable workspace state.
- Domain projections are structurally mapped to the existing shared snapshots at the main boundary; no new renderer contract is introduced.

## 5. Package and file responsibilities

```text
packages/workspace-domain/
  package.json                 local runtime package metadata and public artifact
  tsconfig.json                isolated CommonJS/declaration build
  README.md                    ownership, dependencies, public entry, lifecycle
  src/document-revision.ts     revision value and monotonic increment rules
  src/disk-version.ts          runtime-neutral disk identity type; null until real IO evidence exists
  src/text-buffer.ts           TextChange, TextBuffer, validation, immutable string implementation
  src/text-buffer.test.ts      focused buffer contract and invalid-change coverage
  src/document-session.ts      canonical session values, saved checkpoint, projections, dirty derivation
  src/document-session.test.ts focused revision, saved-equivalence, reload, and save-race coverage
  src/workspace-state.ts       window/tab ownership and pure deterministic workspace operations
  src/workspace-state.test.ts  domain behavior and invariant coverage
  src/index.ts                 the only consumer entry
```

`workspace-state.ts` owns internal maps and counters. Returned arrays, objects, and session projections are newly allocated immutable views; mutating a returned value cannot mutate canonical state. Domain buffer values are immutable.

## 6. Canonical models

### 6.1 Text buffer

```ts
export type TextChange = {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
};

export interface TextBuffer {
  readonly length: number;
  apply(changes: readonly TextChange[]): TextBuffer;
  slice(from: number, to?: number): string;
  toString(): string;
}
```

Changes must be sorted, non-overlapping, and within the original buffer. Invalid input throws a domain error before any state changes. The reference implementation never mutates its source value.

The existing full-draft update is represented as one full-range replacement. This preserves the current IPC temporarily while ensuring the canonical session already uses the final buffer abstraction.

### 6.2 Revision

`DocumentRevision` is a non-negative integer. A new session begins at revision `0`. A text operation increments revision exactly once only when canonical text changes. Metadata-only changes and identical full-draft updates do not increment it.

### 6.3 Document session

The canonical session owns:

- tab and window identity;
- path, name, and UTF-8 encoding;
- current immutable `TextBuffer`;
- current `revision`;
- `savedRevision`;
- an immutable saved-text checkpoint used for exact durable-content equivalence;
- `DiskVersion | null`;
- save state.

`isDirty` is never stored. Every projection derives it as `revision !== savedRevision`.

The saved checkpoint is an internal domain invariant rather than a renderer DTO. It prevents hash collision from marking unrelated text clean and becomes cheap structural sharing once RF-201 supplies a persistent buffer.

### 6.4 Disk version

RF-101 defines the final runtime-neutral shape:

```ts
export type DiskVersion = {
  readonly normalizedPath: string;
  readonly mtimeMs: number;
  readonly size: number;
  readonly contentHash: string;
};
```

Existing open/save functions do not provide trustworthy stat/hash evidence, so sessions use `null`. RF-101 must not invent disk metadata. Watcher and safe-save tasks will populate it later.

## 7. Dirty and saved-equivalence rules

The following behavior is approved because editing experience takes precedence:

1. New/opened/reloaded content starts clean with `revision === savedRevision`.
2. An identical update is a no-op and stays at the same revision.
3. A changed update advances revision once.
4. If the changed text exactly equals the saved checkpoint, the new revision is also assigned to `savedRevision`; Undo or manual restoration therefore becomes clean immediately.
5. Otherwise `savedRevision` remains the latest revision known to be durable.
6. Callers cannot submit or mutate `isDirty`.

This preserves the current intuitive restore-to-clean behavior while making revision equality the only dirty calculation.

## 8. Document IO transaction semantics

Before an asynchronous write starts, the application captures the canonical `{ tabId, text, revision }`. A successful write commits the returned document metadata together with that captured revision.

- If current revision still equals the captured revision, the tab becomes clean.
- If newer edits exist, the current buffer and revision remain untouched; only the captured revision is recorded as durable, so the tab remains dirty.
- If newer edits happened but current text is exactly equal to the content that was written, current revision becomes saved-equivalent and the tab becomes clean.
- Save completion may update path, name, encoding, saved checkpoint, and `savedRevision`; it may never replace a newer current buffer.
- Reload/replace intentionally replaces canonical text, advances revision when content changes, and marks the resulting revision saved.

Captured revision guards do not order two distinct IO operations when a successful save itself does not advance text revision. Therefore main owns one permanent per-document FIFO operation coordinator:

- Save, Save As, reload, and individual close acquire the same tab key for their entire canonical checkpoint, disk/dialog IO, and domain mutation transaction.
- Different tab keys remain independent, and high-frequency `updateDraft` never waits for this coordinator.
- Multi-tab acquisition deduplicates and sorts keys before acquiring them; release is idempotent and operation errors always release.
- Native window close acquires the current window tab set before the renderer flush/confirm handshake, revalidates the ordered set after acquisition and again after positive confirmation, and retains the lease until `WorkspaceState.unregisterWindow()` completes on the real `closed` event. Either validation mismatch cancels and releases.
- Cancel, handshake error, and native `ownerWindow.close()` failure release the lease. A confirmed discard does not release early, so a queued autosave resumes only after unregister and fails before disk IO.

`workspace-application.ts`, `workspace-reload-application.ts`, `workspace-file-operations.ts`, and `workspace-close-coordinator.ts` must pass captured revisions and share this one coordinator. `confirmWindowClose` does not reacquire because the native window-close application owns the outer multi-tab lease. This is a required correctness change inside RF-101, not the RF-102 application extraction.

## 9. Workspace operations

RF-101 ports these rules into `WorkspaceState`:

- register, unregister, and focus window;
- read last-focused window;
- create untitled and open document;
- activate tab;
- update full draft;
- commit saved document;
- replace/reload document;
- close active or inactive tab and choose the nearest remaining active tab;
- reorder with clamped index and no-op behavior;
- move within one window or across windows;
- detach into a registered target window as one domain operation;
- read window tab IDs, active path, document session, and immutable window projection.

Unknown windows, unknown tabs, invalid ownership, and invalid text changes fail before partial mutation. Cross-window move updates tab ownership, source active selection, target order, target active selection, and last-focused window atomically.

## 10. Shared DTO and renderer stability

The following shared shapes remain unchanged in RF-101:

- `WorkspaceWindowSnapshot`;
- `WorkspaceDocumentSnapshot`;
- `WorkspaceTabStripItem`;
- command input/result DTOs;
- IPC channel names;
- `UpdateWorkspaceTabDraftInput` full-content payload.

Domain projection types may be structurally identical, but `src/shared/workspace.ts` remains the IPC contract owner. Main is the mapping/composition boundary. No renderer controller, autosave state machine, optimistic projection, or preload method is redesigned in this task.

## 11. Runtime package and Electron build

Vite/Vitest aliases alone are insufficient because Electron main executes emitted Node modules and TypeScript path aliases do not rewrite runtime specifiers. RF-101 therefore makes `workspace-domain` a real local production dependency:

- the package builds CommonJS JavaScript and declarations into its ignored `dist/` directory;
- root build/typecheck/dev scripts build or watch the package before Electron consumes it;
- root `package.json` and lockfile declare the local package as a production dependency;
- Electron main imports only `@fishmark/workspace-domain`;
- electron-builder includes the local production package artifact;
- Vite and Vitest resolve the public entry to source for renderer-neutral tests;
- the existing `dist-electron/main` and `dist-electron/preload` layouts do not change.

The implementation must include one runtime smoke assertion proving built Electron main can resolve the package entry. A build that only typechecks under an alias is not sufficient.

## 12. Architecture guard

The RF-002 manifest entry for `workspace-domain` changes from `planned` to `active`. The same change adds an active `boundary.workspace-domain` forbidden-import rule. The rule rejects React, React DOM, Electron, CodeMirror, and imports into `src/main`, `src/preload`, `src/renderer`, `packages/editor-core`, or other infrastructure paths.

Tests must prove:

- the active package has exactly one active owning rule;
- forbidden runtime/UI imports fail;
- cross-package consumers use `@fishmark/workspace-domain` rather than internal paths;
- renderer cannot import domain session internals;
- removal or broadening of the rule fails closed.

## 13. Execution slices

RF-101 remains one roadmap task with three sequential, reviewable slices:

### Slice A — Domain contract and build boundary

Create the real package, buffer, revision, session, workspace state, architecture rule, and domain tests. Nothing in the package may delegate to the old service.

### Slice B — Main hard cutover

Switch application, close coordinator, main composition, save/reload/close transactions, move, and detach to the package public API. Preserve IPC wire behavior.

### Slice C — Deletion and closure

Move/replace old service coverage, delete the service and old test, remove all old imports/types/exports, update docs, and run focused plus full gates.

A slice may have its own commit, but RF-101 remains `IN_PROGRESS` until all slices and deletion checks pass. A dual implementation is never an acceptable checkpoint for `DEV_DONE`.

## 14. Tests and acceptance

Domain tests cover:

- empty and duplicate window registration;
- window unregister/focus behavior;
- create/open/activate and deterministic tab IDs;
- invalid window/tab/ownership failures without partial mutation;
- active and inactive close, including nearest-tab selection;
- reorder clamp and no-op;
- same-window and cross-window move;
- detach and dirty draft preservation;
- immutable projections;
- buffer Unicode, LF/CRLF, slicing, multi-change application, and invalid ranges;
- no-op draft revision behavior;
- one increment per changed draft;
- exact restore-to-saved becoming clean;
- normal save, Save As, reload, and save-completion races;
- reload-first/save-first ordering on one real shared coordinator;
- individual close before/after save, including discard followed by queued autosave;
- native confirmed/cancel window close with lease retention through unregister;
- FIFO, independent-tab, stable multi-tab, idempotent-release, and error-release coordinator behavior.

Required verification:

```powershell
npm.cmd run test -- packages/workspace-domain src/main/workspace-document-operation-coordinator.test.ts src/main/workspace-window-close-application.test.ts src/main/workspace-document-io.integration.test.ts src/main/workspace-application.test.ts src/main/workspace-close-coordinator.test.ts src/main/main.test.ts
npm.cmd run test -- src/renderer/editor/useWorkspaceController.test.tsx src/renderer/app.autosave.test.ts
npm.cmd run test:editor-foundation
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
git diff --check
```

Formal acceptance decides whether the full Electron editing-behavior matrix must be rerun. Any observable workspace, autosave, close, or editing regression makes that gate mandatory rather than waivable.

## 15. Out of scope

RF-101 does not:

- extract filesystem, dialog, watcher, recovery, hash, clock, or repository ports;
- move open/save/close orchestration into `workspace-application` package;
- split main IPC composition;
- implement revisioned edit IPC, client sequencing, conflict results, or pending queues;
- remove full-draft synchronization;
- use CodeMirror `Text` in production;
- redesign autosave, recent files, external conflict, or watch registry;
- modify shared IPC wire shapes, preload bridge, or renderer controllers;
- change Enter, Backspace, Delete, Tab, navigation, selection, IME, undo, or nested Markdown semantics;
- claim long-document transport or structure-cache performance improvements.

## 16. Completion contract

RF-101 is complete only when:

1. `@fishmark/workspace-domain` is the sole workspace/domain implementation.
2. Main resolves the real package at runtime.
3. Dirty state is derived only from revisions and restore-to-saved is clean.
4. Save completion cannot overwrite or incorrectly clean newer text.
5. Same-tab document IO is FIFO-serialized without a global mutex or `updateDraft` queue.
6. Native window close retains all tab leases through unregister, so confirmed discard cannot be followed by a queued write.
7. Shared IPC behavior remains compatible without a compatibility layer.
8. `src/main/workspace-service.ts`, its old test, old type exports, and all imports are absent.
9. The architecture package/rule is active and passing.
10. Focused tests, lint, typecheck, full tests, build, and diff check pass.
11. Documentation records the new ownership and all deferred work honestly.
