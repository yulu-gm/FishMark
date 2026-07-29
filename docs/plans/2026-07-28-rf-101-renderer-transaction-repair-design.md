# RF-101 Renderer Transaction Repair Design

Date: 2026-07-28
Status: approved for implementation

## Problem

The renderer currently spreads canonical workspace ownership, draft retry state, editor-buffer trust, mutation ordering, reload behavior, native-close flushing, and save sequencing across React hooks. That permits inactive-tab drafts to escape close/detach/window-close drains, lets same-tab canonical replacement race an old CodeMirror buffer, leaves activation transport ambiguity represented by a stale snapshot, and releases the workspace FIFO between save preparation and the tab-bound save operation.

## Boundary

`WorkspaceRendererApplication` becomes the sole owner of renderer workspace transaction policy. It depends only on typed bridge/read/view ports and returns discriminated outcomes. It does not import React, React setters, or notification types. `useWorkspaceController` binds current view state and bridge ports, applies presentation messages, and exposes stable callbacks. Save hooks retain timers and visible save state but execute each Save, Save As, or autosave through one application-owned workspace transaction.

The application owns:

- canonical state as `known(snapshot) | unknown`;
- strict per-window FIFO ordering;
- activation-only latest-intent generation;
- per-tab outbox entries with monotonic generations;
- editor-buffer ownership as an acknowledged `{ tabId, epoch, loadRevision }` lease;
- per-tab draft retry state;
- activation transport reconciliation and command admission.

## Invariants

1. Close and detach drain the target tab, not merely the active tab. Success removes the target outbox entry. Drain failure retains the entry and does not call main close/detach.
2. Native window close enumerates and drains every outbox entry before confirmation. Any failure is fail-closed and confirmation is not sent.
3. Applying a canonical snapshot that changes the active tab or reloads same-tab content invalidates the editor-buffer lease. No editor content may enter the outbox until CodeMirror reports that it consumed the exact new load revision.
4. Successful explicit reload applies the disk snapshot and discards only outbox generations at or before the reload dispatch cutoff. Edits created after dispatch remain in the outbox, overlay the disk canonical snapshot, and remain dirty. A stale pre-reload blur/save cannot recreate discarded text.
5. If activation transport completion is unknown and canonical reconciliation also fails, canonical state becomes `unknown`. Every subsequent workspace command must reconcile successfully before it may skip, flush, save, close, detach, confirm, or dispatch another structural mutation.
6. Save captures the invocation-time tab and keeps draft drain, main Save/Save As, post-save drain, and canonical refresh in one workspace FIFO transaction. Activation/open cannot change which tab is saved.
7. Every bridge response that carries a workspace snapshot records canonical state before presentation application. Draft acknowledgements clear only the exact outbox generation/content they sent.

## Editor load handshake

`CodeEditorView` reports `{ tabId, epoch, loadRevision }` only after `replaceDocument` consumes the requested content. `WorkspaceRendererApplication` accepts that acknowledgement only when all three fields match the current editor epoch. Editor change callbacks carry the consumed identity back to the application; callbacks during an invalidated epoch are ignored for workspace draft ownership.

Explicit reload enters a visible `reloading` editor transition and makes CodeMirror read-only before dispatch. Only a typed reload success discards entries through the dispatch-time generation cutoff. A transport throw followed by snapshot reconciliation is not proof that reload committed, so the cutoff draft remains in the outbox and overlays the reconciled snapshot.

## Typed outcomes

Application methods return operation-specific discriminated outcomes such as `committed`, `cancelled`, `failed`, `failed-reconciled`, `canonical-unavailable`, `superseded`, or `no-document`. Presentation hooks translate failures to existing messages. Reload preserves its typed stale/error meanings, while a committed result identifies whether a newer local draft survived the cutoff.

## Test strategy

- Pure application tests cover target-tab drain/removal, drain-all native close, same-tab epoch invalidation, reload cutoff, canonical-unknown admission, and tab-bound save interleavings.
- Outbox tests cover enumeration, generation cutoff discard, exact acknowledgement, and removal.
- CodeEditor tests prove load acknowledgement occurs after document replacement.
- Hook tests prove typed service outcomes map to existing view state and notifications without re-owning transaction rules.
- Existing focused and full suites remain required gates.

## Scope

This repair does not change shared IPC DTOs or replace the fixed Electron/React/CodeMirror stack. File dialogs remain inside the renderer FIFO transaction; a later RF-102 prepare/commit split may reduce head-of-line waiting only if it preserves these invariants.

## Sixth-round implementation closure

The implementation tightens the earlier visible reload transition into one application-owned barrier for every active destructive operation. A unique transition token moves through `sealing`, `sealed`, and `releasing`. Before the exact read-only acknowledgement, editor input remains accepted and destructive bridge calls are forbidden. The acknowledgement captures the last editor value, invalidates the binding, and permits drain/dispatch. A release acknowledgement creates the next epoch/load revision before normal editing resumes. Inactive targets do not freeze the active editor; empty-workspace, disposal, and unmount paths complete without waiting on an absent editor.

CodeMirror now combines `EditorState.readOnly`, `EditorView.editable`, and a transaction filter. Canonical document replacement bypasses mutation dispatch by installing a fresh `EditorState`; this creates an explicit undo/redo boundary even for an empty document. A recoverable transition rebinds a new editor epoch without recreating that state, so cancel/stale/error paths preserve the user's current undo history. Public imperative edits and every gesture/command path therefore obey the same structural guard.

The test boundary is also hard-cut: `WorkspaceRendererApplication` exposes a typed editor-test adapter with owned read/open/draft/save commands, while the driver supplies real CodeMirror gestures. Raw workspace snapshot application, direct raw bridge mutations, `replaceViewState`, hook `applyState`, and dead state accessors are removed. A unified active-lifecycle fence runs after every draft, destructive, and reconciliation await, so a disposed renderer cannot accept late state or start a subsequent mutation. Post-review focus passes 13 files / 677 tests. Fresh typecheck, lint, build, and escalated full Vitest pass; the full suite is 163 files / 2,052 passed plus 1 explicit skip out of 2,053 total. This is development evidence only; independent architecture and task acceptance remain pending.
