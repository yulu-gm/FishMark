# RF-101 Workspace Domain Design

**Date:** 2026-07-16
**Task:** RF-101 — Extract workspace domain
**Status:** `DEV_DONE` — independent architecture acceptance and task acceptance pending
**Roadmap:** `docs/refactor/editor-foundation/roadmap.md`

## 1. Decision

RF-101 will replace `src/main/workspace-service.ts` with one runtime-neutral package, `@fishmark/workspace-domain`. The package will own canonical window, tab, session, revision, saved-checkpoint, ordering, move, detach, close, and projection rules. Main remains the only owner of the live `WorkspaceState`; renderer and preload continue to exchange the current shared IPC DTOs.

Physical file identity is distinct from the display path and contains two opaque keys: canonical location plus filesystem object. Main resolves location from `realpath` (or the deepest existing ancestor for a prospective Save As target), folds case only on Windows, and uses reliable `dev + ino` values for object identity with an explicit canonical-path fallback. The domain keeps both location-to-tab and object-to-tab registries, so a reused path and hard-link aliases each preserve one editable `DocumentSession` across all windows. Duplicate open activates and synchronizes the existing owner tab before focusing its window, without returning the foreign document projection.

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
- Shared workspace snapshot contracts retain their current shape and do not import domain internals. Save, Save As, and reload command inputs are hard-cut to `{ tabId }`; renderer/preload cannot select a file path. Reload uses one discriminated command result, `success(snapshot) | revision-stale`. Watch sync carries no tab/path payload. Native-window-close control uses one hard-cut request-bearing protocol: REQUEST, CONFIRM, and COMPLETE carry the same `requestId` without a parameterless compatibility route.
- Renderer does not import `DocumentSession`, `TextBuffer`, or mutable workspace state.
- Domain projections are structurally mapped to the existing shared snapshots at the main boundary; the close request identity is control-plane data and never becomes domain truth.

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

- Save, Save As, reload, and individual close acquire the same tab key for their entire canonical checkpoint, disk/dialog IO, and domain mutation transaction. Ordinary Save and reload derive their target only from the captured canonical `checkpoint.path`; Save As derives its dialog default from that same checkpoint. A missing path fails closed. For ordinary Save this includes watcher `beginInternalWrite`, write, commit, recent-file recording, `completeInternalWrite`, and watch resync; one captured path is used throughout and cleanup finishes before the lease is released.
- Watch synchronization does not use a long-I/O application queue or the tab IO coordinator. Main resolves the live sender-owned window, reads its canonical active path, and immediately forwards that intent through a stateless application boundary. The infrastructure service is the sole watcher state owner: each per-`webContents` controller records desired path/path epoch, exact latest sync admission, entry identity, monotonic observation identity, exact internal-write identity, and a destroy tombstone. Every stat starts outside state mutation; its completion performs only a short live-controller and exact-identity CAS. A newer same-path/different-path sync or normal callback can therefore finish before an older stat, while only the latest relevant intent may change the baseline or emit. `beginInternalWrite` follows superseding sync admissions until the latest one settles, then atomically invalidates older normal observations and installs a write token. Completion owns a distinct observation token, and callbacks that start anywhere inside that write remain silent even if their stat returns after completion. Watch creation, replacement, rollback, close, and destruction update authoritative state before safe close; close/report exceptions cannot retain or resurrect a controller. Missing windows and pathless documents synchronize `null`, and different windows remain independent.
- Different tab keys remain independent. High-frequency `updateDraft` never waits for this coordinator, but it is not owner-blind: main derives `expectedWindowId` from the invoking renderer and the domain performs an owner compare-and-set. A stale result is rejected at the IPC boundary and never returns the current owner's projection to the stale renderer.
- Reorder, cross-window move, and ready-time detach transfer acquire the same tab key as document IO. Reorder and transfer source ownership are revalidated inside the lease before the atomic domain mutation. Main derives reorder's `expectedWindowId` from the invoking renderer; a delayed request from a previous owner returns a total stale result that never exposes or mutates the target window. Detach waits for target readiness without holding the lease, then competes normally with Save/Save As/reload/reorder for the tab transaction. Every concurrent ready notification for one target reuses the same in-flight Promise. Timeout, target close, or main-frame load failure while queued records one authoritative cancellation, so detach and every ready caller reject, the target is destroyed once, and lease release cannot create a target domain window. Main resolves no sender-ID fallback and revalidates the live sender-owned `BrowserWindow` on both sides of the ready await before register/focus/bind.
- Save, Save As, and reload interpret the domain's total mutation result explicitly. `owner-changed` and `missing` fail the operation instead of reporting false success or recording a recent path. A reload revision race returns `revision-stale` without exposing a projection or recording a recent path; renderer retains its newer draft and external-conflict state, reports a retryable warning, and keeps autosave/manual-save conflict protection active. Only an applied domain reload records recent history and returns `success(snapshot)`.
- Multi-tab acquisition deduplicates and sorts keys before acquiring them; release is idempotent and operation errors always release.
- Native window close acquires the current window tab set before the renderer flush/confirm handshake. REQUEST supplies a `requestId`; renderer first flushes its draft and then sends that same ID in CONFIRM. The first exact `{ windowId, requestId }` confirmation begin is atomic, admits only one confirmation scope, and disarms the 15-second transport timer. That timer bounds only delivery, renderer draft flush, and arrival of the first valid CONFIRM; native prompts and Save As dialogs may remain open beyond it. When the active confirmation scope finishes, an independent post-confirm watchdog starts only if COMPLETE is still missing; expiry settles fail-closed, removes listeners/maps, resolves `drained`, and releases the outer lease. COMPLETE or abort cancels that watchdog exactly once, and late callbacks are no-ops. Confirmation returns a frozen ordered `{ tabId, expectedWindowId, expectedRevision }` checkpoint set rather than a bare boolean, and COMPLETE must match the same generation. Renderer abort, destruction, or window close settles `result` fail-closed and removes the pending generation immediately, while `drained` waits for the active confirmation scope to finish. Main awaits both before returning to the window-close application, so the outer multi-tab lease still covers an in-flight prompt or disk write. The coordinator checks scope activity at entry, between tabs, after prompts, before writes, after writes before commit, and before final confirmation. The application then revalidates exact order, owner, and revision after positive COMPLETE and retains the lease until `WorkspaceState.unregisterWindow()` completes on `closed`.
- Cancel, handshake error, and native `ownerWindow.close()` failure release the lease. A confirmed discard does not release early, so a queued autosave resumes only after unregister and fails before disk IO.

`workspace-application.ts` now owns only synchronous draft updates. `workspace-tab-reorder-application.ts` owns sender-bound reorder orchestration. `workspace-file-operations.ts` owns canonical Save/Save As transactions, while the stateless `workspace-file-watch-application.ts` projects sender-window state into infrastructure watcher intents. Reorder, transfer, reload, file operations, and close coordination share the tab coordinator; watcher correctness belongs only to the infrastructure latest-intent state machine. `confirmWindowClose` does not reacquire because the native window-close application owns the outer multi-tab lease. This is a required correctness change inside RF-101, not the RF-102 application extraction.

## 9. Workspace operations

RF-101 ports these rules into `WorkspaceState`:

- register, unregister, and focus window;
- read last-focused window;
- create untitled and open document;
- activate tab;
- update full draft with expected-owner compare-and-set and a total applied/stale result;
- commit saved document;
- replace/reload document;
- close active or inactive tab and choose the nearest remaining active tab;
- reorder with clamped index, no-op behavior, expected-owner compare-and-set, and a total applied/stale result;
- move within one window or across windows as an atomic domain operation invoked inside the main per-tab transaction;
- detach into a registered target window as the same atomic transfer operation after ready-time lease acquisition;
- read window tab IDs, active path, document session, and immutable window projection.

Unknown windows, unknown tabs, invalid ownership, and invalid text changes fail before partial mutation. Cross-window move updates tab ownership, source active selection, target order, target active selection, and last-focused window atomically.

## 10. Shared DTO and renderer stability

The following shared snapshot and ordinary command shapes remain unchanged in RF-101:

- `WorkspaceWindowSnapshot`;
- `WorkspaceDocumentSnapshot`;
- `WorkspaceTabStripItem`;
- ordinary command input/result DTOs;
- IPC channel names;
- `UpdateWorkspaceTabDraftInput` full-content payload.

There are two intentional hard-cut control/result exceptions. Reload now returns `ReloadWorkspaceTabFromPathResult = success(snapshot) | revision-stale`; no legacy bare-snapshot route remains. Native-close REQUEST supplies its generation identity to the listener and CONFIRM must return the same `requestId`; the parameterless form is deleted rather than supported in parallel. Domain projection types may be structurally identical, but `src/shared/workspace.ts` remains the IPC contract owner. Main is the mapping/composition boundary. Autosave is not redesigned: the new stale branch deliberately keeps the existing external-conflict block active.

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

Switch application, close coordinator, main composition, save/reload/close transactions, move, and detach to the package public API. Preserve workspace snapshot DTOs and hard-cut the native-close control wire to request identity end to end.

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
- reorder clamp/no-op plus old-owner/missing fail-closed behavior without a foreign projection;
- same-window and cross-window move;
- detach and dirty draft preservation;
- stale source renderer draft rejection after real move and detach, with target content/revision unchanged;
- immutable projections;
- buffer Unicode, LF/CRLF, slicing, multi-change application, and invalid ranges;
- no-op draft revision behavior;
- one increment per changed draft;
- exact restore-to-saved becoming clean;
- normal save, Save As, reload, and save-completion races, including Save As A→B followed by queued Save/reload that can target only B;
- no-input watch synchronization, live sender-window derivation, same-entry callback reversal, own-write callback/completion reversal, superseding A/B sync admission without head-of-line blocking, missing/pathless cleanup, safe watcher rollback/destruction, and independent-window concurrency;
- reload-first/save-first ordering on one real shared coordinator;
- save-first/move-first and reload-first/detach-first ordering on one real shared coordinator;
- owner/missing mutation failure and the explicit reload revision-stale policy;
- reload revision-stale propagation through shared/preload/main/renderer, including no recent-file update, no snapshot application, retained conflict UI, blocked autosave, protected manual save, and normal success conflict clearing;
- ready-time detach cancellation while waiting for the shared per-tab lease, covering timeout, target close, and main-frame load failure with rejected ready, destroyed target, unchanged source/last-focus, and no ghost domain/main binding;
- concurrent detach readiness through the real registration application, proving all callers share one unresolved success/failure boundary, transfer runs once, and no caller can register/bind/focus before it completes;
- reorder ordering against move, detach, and native window-close through the real shared per-tab coordinator, including renderer retention of its source snapshot after old-owner rejection;
- individual close before/after save, including discard followed by queued autosave;
- native confirmed/cancel window close with lease retention through unregister, transport timeout, unbounded active prompt, and post-confirm missing-COMPLETE watchdog;
- FIFO, independent-tab, stable multi-tab, idempotent-release, and error-release coordinator behavior.

Required verification:

```powershell
npm.cmd run test -- packages/workspace-domain src/main/keyed-operation-coordinator.test.ts src/main/workspace-tab-transfer-application.test.ts src/main/workspace-mutation-result.test.ts src/main/workspace-window-close-application.test.ts src/main/workspace-window-close-request-broker.test.ts src/main/workspace-document-io.integration.test.ts src/main/workspace-application.test.ts src/main/workspace-reload-application.test.ts src/main/workspace-detach-application.test.ts src/main/workspace-close-coordinator.test.ts src/main/main.test.ts
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
- otherwise redesign shared IPC wire shapes, preload bridge, or renderer controllers beyond the required canonical file-identity, watcher-intent, reload-result, and native-close request-identity hard cuts;
- change Enter, Backspace, Delete, Tab, navigation, selection, IME, undo, or nested Markdown semantics;
- claim long-document transport or structure-cache performance improvements.

## 16. Completion contract

RF-101 is complete only when:

1. `@fishmark/workspace-domain` is the sole workspace/domain implementation.
2. Main resolves the real package at runtime.
3. Dirty state is derived only from revisions and restore-to-saved is clean.
4. Save completion cannot overwrite or incorrectly clean newer text.
5. Same-tab document IO and cross-window ownership transfer share one FIFO transaction owner without a global mutex or `updateDraft` queue.
6. Draft updates are owner-aware, and a stale renderer can neither mutate nor observe the new owner's document projection.
7. Native window close retains all tab leases through unregister, so confirmed discard cannot be followed by a queued write; missing transport and missing post-confirm COMPLETE both fail closed without timing out active native UI.
8. Shared workspace snapshots remain stable; Save/Save As/reload inputs contain only `tabId`, watch sync contains no renderer-selected identity, reload has one discriminated success/stale result, and native-close control has one request-bearing form, with no compatibility layer for any hard cut.
9. `src/main/workspace-service.ts`, its old test, old type exports, and all imports are absent.
10. The architecture package/rule is active and passing.
11. Focused tests, lint, typecheck, full tests, build, and diff check pass.
12. Documentation records the new ownership and all deferred work honestly.
