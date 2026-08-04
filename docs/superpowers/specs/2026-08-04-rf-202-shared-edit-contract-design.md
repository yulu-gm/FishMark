# RF-202 Shared Edit Contract and Main Handler Design

## Context

RF-201 made the main-owned `DocumentSession` persistent and added an immutable revisioned edit
primitive. The production bridge still accepts whole renderer drafts. RF-202 exposes the new
primitive without moving editor ownership or pending queues into renderer; those remain RF-203 and
RF-204 work.

## Chosen architecture

The dependency flow is:

```text
renderer (future RF-203 client)
  -> ProductBridge plain DTOs
  -> preload product-api adapter
  -> sender-validated main IPC handler
  -> workspace-application serialized edit use case
  -> workspace-domain canonical DocumentSession
```

The rejected alternatives are direct main-to-domain mutation, which skips the application queue,
and an early renderer cutover, which would mix RF-203/204 lifecycle and data-loss recovery into this
task. The existing full-draft bridge remains an explicitly named, isolated path until RF-204 and is
not selected by a feature flag.

## Shared contracts

`src/shared/document-edit.ts` owns plain serializable types and constants. It imports no Electron,
CodeMirror, domain, or application type.

```ts
export type DocumentRevision = number;

export type DocumentTextChange = {
  from: number;
  to: number;
  insert: string;
};

export type ApplyDocumentEditsInput = {
  tabId: string;
  clientId: string;
  clientSequence: number;
  baseRevision: DocumentRevision;
  changes: readonly DocumentTextChange[];
};

export type ApplyDocumentEditsResult =
  | {
      kind: "applied";
      acknowledgedSequence: number;
      revision: DocumentRevision;
      isDirty: boolean;
    }
  | {
      kind: "duplicate";
      acknowledgedSequence: number;
      revision: DocumentRevision;
      isDirty: boolean;
    }
  | {
      kind: "revision-conflict";
      canonicalRevision: DocumentRevision;
      canonicalText: string;
      isDirty: boolean;
    }
  | {
      kind: "sequence-gap";
      expectedSequence: number;
      canonicalRevision: DocumentRevision;
    }
  | { kind: "error"; error: DocumentEditError };

export type FlushDocumentEditsInput = {
  tabId: string;
  clientId: string;
  throughSequence: number;
};

export type FlushDocumentEditsResult =
  | {
      kind: "flushed";
      acknowledgedSequence: number;
      revision: DocumentRevision;
      savedRevision: DocumentRevision;
      isDirty: boolean;
    }
  | {
      kind: "sequence-gap";
      expectedSequence: number;
      canonicalRevision: DocumentRevision;
    }
  | { kind: "error"; error: DocumentEditError };
```

`DocumentEditError.code` is a closed union covering `invalid-request`, `unknown-tab`,
`tab-owner-changed`, `invalid-client-id`, `invalid-client-sequence`, `invalid-base-revision`,
`invalid-text-changes`, `empty-change-batch`, `revision-overflow`, `runtime-context-unavailable`,
and `internal-error`. Error messages are stable display-safe strings and do not expose stack
traces. Sequence gaps remain a first-class protocol result rather than being collapsed into this
error union.

Duplicate domain results remain explicit `kind: "duplicate"` acknowledgements with current revision
and dirty state. This lets a renderer safely retire a retried pending batch while preserving
observable protocol semantics. Sequence gaps remain distinct typed results because acknowledging
them would silently lose input.

## Projection contract

`src/shared/document-projection.ts` owns:

```ts
export type DocumentProjection = {
  tabId: string;
  revision: DocumentRevision;
  savedRevision: DocumentRevision;
  isDirty: boolean;
};

export type DocumentProjectionEvent = {
  windowId: string;
  projection: DocumentProjection;
};
```

The existing `WorkspaceDocumentSnapshot` gains `revision` and `savedRevision` for initial
hydration. Normal apply
responses and projection events never contain `content`; only `revision-conflict` returns
`canonicalText`, because RF-203 needs it to preserve and rebase pending local input.

The preload bridge adds `applyDocumentEdits`, `flushDocumentEdits`, and
`onDocumentProjection`. The listener returns an exact detach function. Main publishes the event
only to the validated owner sender after an applied result. Duplicate requests return current
acknowledgement metadata without replaying an event. In RF-202 this event is specifically a
revisioned-edit acknowledgement projection, not a claim that every legacy workspace mutation
already uses a global push store; initial and legacy command results carry the same revision fields
in their workspace snapshots until the later renderer cutover.

## Runtime validation and ownership

The IPC handler receives `unknown`. Validation is deliberately staged so idempotence ordering is
preserved. Before state lookup, the boundary validates:

- exact plain-object shape and known keys;
- non-empty bounded `tabId`;
- `clientId` matching `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`;
- positive safe-integer client sequence;
- the exact top-level keys, while retaining `baseRevision` and `changes` for the later stateful
  validation stage.

After sender and tab ownership checks, the domain validates in this order: client duplicate, client
sequence gap, non-negative safe-integer base revision, revision equality, change array/object/string
shape, original-buffer safe-integer/sorted/non-overlapping/bounds semantics, empty batch, and
revision overflow. A malformed retry whose sequence is already acknowledged therefore remains a
duplicate rather than changing result because of irrelevant payload bytes.

Domain validation remains the single authority for original-buffer sorting, overlap, and canonical
bounds. The main-process handler invokes that authority through the application/domain entry before
mutation, so semantic range validation is not duplicated in shared code.

For every apply or flush, main derives `expectedWindowId` through the existing live sender/window
registration application. The renderer never submits a window ID. The domain workspace entry then
checks that the tab still belongs to that exact window. Sender loss or window replacement rejects
the IPC request because no trusted response destination remains. A tab move or close returns a
typed ownership error without a foreign projection or canonical text.

## Domain and application flow

Workspace domain gains an owner-aware edit-batch method, a metadata-only document projection, and a
read-only acknowledged-sequence query used by flush.
It resolves the current session, checks `expectedWindowId`, calls the RF-201 primitive, stores only
an applied next session, and maps outcomes without calling `toString()` except for a revision
conflict. Rejected and duplicate results preserve canonical session identity and ledger invariants.

Application owns two explicit paths:

- `updateDocumentDraft`: the existing RF-204-deferred full-draft mutation.
- `applyDocumentEdits` and `flushDocumentEdits`: revisioned operations serialized through the same
  existing per-tab `KeyedOperationCoordinator`.

`flushDocumentEdits` queues a metadata-only checkpoint read behind earlier operations for that tab
and client. It succeeds only when the session high-watermark is at least `throughSequence`; otherwise
it returns the exact next expected sequence and canonical revision. It is therefore a real ordering
and completeness barrier even if an apply IPC request has not reached main before the flush request.
RF-203 will invoke it before save, switch, move, detach, reload, or close.

## Main and preload modules

`src/main/ipc/register-workspace-handlers.ts` registers only RF-202 apply/flush handlers. It accepts
small ports for handler registration, sender-to-window resolution, application commands, and event
publication, making sender races and result mapping independently testable. `main.ts` composes it;
the old full-draft handler stays visible until RF-204.

`src/preload/product-api.ts` becomes the single builder for the complete `ProductBridge`, using
minimal invoke/on/off/file-path/runtime ports. `preload.ts` owns Electron exposure and optional test
bridge wiring only. There is never a second partial or compatibility product API object.

## Error and concurrency behavior

- Malformed wire input returns `invalid-request` and never reaches application/domain.
- Missing/moved tab returns a typed ownership error without exposing another window snapshot;
  destroyed or replaced senders reject before application execution.
- Duplicate sequence returns the current explicit metadata acknowledgement.
- Apply or flush sequence gap returns the exact next expected sequence with no ledger/revision
  advance.
- Revision conflict returns exact canonical revision/text and no mutation.
- Valid non-empty input advances revision exactly once and publishes one metadata event; a
  duplicate retry is acknowledged without replaying that event.
- Apply and flush for a tab share FIFO serialization; unrelated tabs remain concurrent.
- Unexpected internal exceptions are mapped to a stable `internal-error` result and are not treated
  as successful acknowledgements.

## Testing

- Shared contract tests cover decoder exactness, safe integers, client IDs, malformed changes, and
  structured-clone-safe output.
- Domain tests cover owner-aware applied/duplicate/conflict/gap/invalid paths and prove normal paths
  do not materialize full content.
- Application tests prove apply/flush FIFO serialization and cross-tab independence.
- Main handler tests cover sender destruction/window replacement, tab move/close, decoder rejection,
  duplicate acknowledgement, conflict canonical text, event publication, and no foreign projection.
- Preload/product bridge tests prove exact channel use, result typing, listener forwarding, and exact
  detach.
- Architecture tests require public shared contracts and focused main/preload modules while keeping
  CodeMirror out of shared/application/preload.
- Full regression gates preserve current save/autosave/editor behavior because renderer still uses
  the deferred full-draft channel in RF-202.

## Documentation and task state

Execution marks RF-202 `DEV_DONE`, not `COMPLETE`. Formal architecture and task acceptance update
roadmap/progress, the decision log, test report, and `reports/task-summaries/RF-202.md`. RF-203 must
not start before that acceptance.

## Self-review

- No TBD/TODO placeholders.
- Normal edit acknowledgements never carry full Markdown text.
- Ownership and error ordering are explicit.
- Flush is a real shared coordinator barrier, not a renderer-only promise alias.
- RF-203 client queues/rebase and RF-204 deletion remain out of scope.
