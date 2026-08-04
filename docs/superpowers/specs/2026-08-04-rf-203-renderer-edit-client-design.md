# RF-203 Renderer Edit Client and Pending Queue Design

## Context

RF-202 exposes sender-validated revisioned apply/flush IPC, but production renderer editing still
sends whole documents through `WorkspaceDraftOutbox`. RF-203 activates the incremental transport
without weakening FishMark's most sensitive contract: local typing, undo, IME, cursor movement and
semantic Markdown commands remain immediate CodeMirror behavior. Main remains the sole canonical
document owner.

## Chosen architecture

```text
CodeMirror transactions
  -> code-editor ChangeSet frame adapter
  -> repository DocumentTextChange[]
  -> WorkspaceEditClient (`workspace-edit-client.ts`)
  -> per-tab PendingEditQueue
  -> ProductBridge applyDocumentEdits / flushDocumentEdits
  -> main canonical DocumentSession

WorkspaceRendererApplication
  -> owns workflow barriers and recovery orchestration
  -> consumes client metadata/dirty state
  -> never becomes a second text authority
```

The edit client is injected into the existing non-React `WorkspaceRendererApplication`. React hooks
remain thin subscribers. A hook-owned client was rejected because it would create a second
coordinator and make close/save disposal races untestable. Folding all logic into
`WorkspaceRendererApplication` was rejected because CodeMirror transport, queue protocol and
workspace workflow lifecycles have different reasons to change.

RF-203 switches the production CodeMirror edit path to revisioned apply/flush. The old full-draft
symbols remain compiled for RF-204 deletion but do not receive the same edit and are not a fallback.

## CodeMirror adapter

`CreateCodeEditorControllerOptions` gains a repository-owned document-change callback. An
observation-only `EditorView.updateListener` consumes `ViewUpdate.changes`; it never dispatches a
transaction.

- Use the composed `ViewUpdate.changes`, not `update.transactions.flatMap`, because sequential
  transactions can use different document bases.
- Within one animation frame, compose CodeMirror `ChangeSet`s in order.
- At frame seal, convert `iterChanges` A-coordinates to `DocumentTextChange[]` and emit the exact
  frame-start and frame-end text plus editor identity/generation.
- No CodeMirror type crosses into `src/renderer/application`.
- Selection-only updates emit nothing.
- While IME is composing, collect changes but do not send. `sealForBarrier()` is asynchronous during
  composition: it freezes the destructive command, waits until CodeMirror observes the final
  post-`compositionend` document update/stable checkpoint, seals that final bucket, and only then
  sets read-only and acknowledges the transition. It never sends an intermediate composition state.
- Outside composition, identity replacement, read-only sealing and explicit barriers synchronously
  seal the old identity bucket. Destroy/unload that cannot await composition completion copies exact
  current view text into a recovery payload before discarding controller state.

The CodeMirror adapter is the only animation-frame bucket owner. Once sealed, it emits one repository
frame immediately to `WorkspaceEditClient`; neither the client nor `PendingEditQueue` owns a second
RAF scheduler or staged bucket. Adapter frame-pending state and client pending state are combined by
`WorkspaceRendererApplication` only for disposable view dirty projection.

Normal acknowledgements and projections cause no CodeMirror dispatch. Remote rebase, canonical load
and recovery transactions carry a repository-owned internal-origin annotation; the observer ignores
only that annotation, not generic programmatic transactions. A successful non-overlapping conflict
rebase maps the remote delta through local changes onto the optimistic view, then applies it with
`addToHistory: false`, allowing CodeMirror to map selection/history. A recovery/canonical reload is a
deliberate fresh-state history boundary.

## Pending queue model

One `PendingEditQueue` exists per tab. It is pure TypeScript and owns:

```ts
type PendingEditQueueState = {
  acknowledgedText: string;
  acknowledgedTextRevision: number;
  observedRevision: number;
  observedSavedRevision: number;
  observedIsDirty: boolean;
  optimisticText: string;
  nextSequence: number;
  batches: readonly PendingBatch[];
  inFlightSequence: number | null;
  generation: number;
  status: "ready" | "rebasing" | "blocked" | "recovering" | "retired";
};
```

Each batch stores its sequence, base revision, base text, changes and resulting text. The atomic
`acknowledgedText/acknowledgedTextRevision` pair is the only transport baseline. Projection and the
current revision carried by a duplicate update only `observed*` UI metadata and never rewrite that
pair. The client
sends at most one batch per tab. Different tabs may send concurrently. A batch is removed only by an
exact `applied` or `duplicate` acknowledgement for its head sequence.

The client owns one injected random client ID for its lifetime. The ID is not persisted. Sequence is
independent per tab and starts at 1. Client disposal increments its generation, retires all queues and
makes late promise/event completion inert. Controller/application disposal separately cancels the
adapter-owned RAF bucket.

## Pump and result rules

- `applied`: require the head sequence and exactly `baseRevision + 1`; advance the atomic
  acknowledged text/revision pair to the batch result and retire exactly that head.
- `duplicate`: idempotently retires the exact head, advancing the atomic pair only to the batch's
  known `baseRevision + 1` / resulting text. Its returned current revision updates `observed*` only;
  if later work is based on the historical pair, main returns a conflict with canonical text.
- `revision-conflict`: stop the pump and return a typed conflict result. The application first
  composition-aware seals any adapter-owned frame into the client, then asks the queue to preserve
  the head/every later batch and rebase complete local text onto `canonicalText`.
- `sequence-gap`: resend the retained `expectedSequence` if it is still present. Otherwise block and
  request recovery; never skip a sequence or clear commands.
- typed error/rejected promise: retain all batches. Protocol/programmer errors block immediately;
  transport retry, if used, is bounded and reuses the identical sequence and payload.
- projection event: accept only the current window/tab and monotonic UI metadata. It never changes
  acknowledged text/revision, retires a batch or supplies text truth. A late/unrelated projection is
  therefore incapable of corrupting future edit offsets.

## Conservative conflict rebase

RF-202 returns canonical text only for a revision conflict. RF-203 uses a deterministic conservative
three-way rebase:

1. Derive one deterministic minimal local replacement from `baseText -> localText` using longest
   common prefix/suffix. This deliberately collapses complex cross-batch algebra; if it spans a remote
   region, recovery is preferred.
2. Derive one minimal remote replacement from `baseText -> canonicalText` by the same rule.
3. Auto-rebase only when the two replacements are strictly disjoint. Adjacent/same-point insertions,
   overlap or invalid reconstruction are recovery-required.
4. Map the local replacement onto canonical coordinates and independently map the remote replacement
   through the local delta onto optimistic-view coordinates. Validate both reconstructed target texts
   exactly before proceeding.
5. Rebuild one pending batch with the conflicting sequence and `canonicalRevision`; fold the retained
   final local text into that safe replacement.
6. Apply the mapped remote-on-local delta to the visible view with internal-origin annotation and no
   history. If IME is active, defer until the composition-aware stable checkpoint.

This deliberately prefers more recovery tabs over a guessed Markdown merge. Exact nested structure
and local input preservation are more important than automatic merge rate.

When recovery is required, the client returns a typed payload; it never awaits an application
callback from inside `flushEdits`. The current `WorkspaceRendererApplication` coordinator operation
handles it inline, while a background conflict schedules one new coordinator operation. The recovery
state machine freezes the old queue, captures exact local text, restores the original tab to
canonical text with observer suppression, calls a recovery-only untitled-create path that deliberately
bypasses the blocked source-tab flush, hydrates the new tab at revision 0, sends/acknowledges the exact
payload through the new client, and only then retires the old queue. Any failure retains the payload
and blocks destructive workflows; it never recursively enqueues and waits on the same coordinator.

## Flush barriers

Barrier acquisition is explicitly two-layered and owned by `WorkspaceRendererApplication`:

1. call adapter `sealForBarrier()` synchronously when not composing, or await the composition-aware final
   document checkpoint when IME is active;
2. the adapter immediately emits its sealed repository frame to the client;
3. call client `acquireFlushBarrier(tabId)`, which captures the highest assigned sequence;
4. the client installs a send ceiling at the cutoff so later batches cannot reach main;
5. it pumps and awaits exact acknowledgement through that cutoff;
6. it calls `flushDocumentEdits({ tabId, clientId, throughSequence: cutoff })`;
7. it returns a lease only if main acknowledges at least the cutoff. Releasing the lease removes the
   ceiling and pumps later work.

The cutoff does not wait for edits created after it, and the send ceiling prevents those edits from
overtaking the subsequent save read. Save/autosave holds the lease through the save IPC, then releases
it so later typing resumes and remains dirty. Destructive ownership/content operations seal the editor
first so no later edit can cross their cutoff.

Barrier ownership remains in `WorkspaceRendererApplication`:

- open/create/export and tab activation: seal current frame and flush the source tab;
- save/save-as/autosave: flush captured tab cutoff before save, without sealing future typing;
- detach-to-new-window, reload and tab close: seal active target, flush target, then invoke IPC;
- window close: seal active editor and flush all tab queues before confirmation;
- reorder: no flush because content and ownership do not change.

There is currently no renderer command for moving a tab to an already existing window. RF-203
covers all real ownership-transfer callers (detach-to-new-window) and does not add unrelated UI.

## Dirty state

Renderer dirty state is derived, never assigned independently. Optimistic text lives in the pending
queue/CodeMirror and is exposed as a disposable view projection; it is never written back into the
canonical `WorkspaceWindowSnapshot` content field:

```text
observedRevision != observedSavedRevision
OR frame bucket non-empty
OR queued/in-flight edits non-empty
OR recovery payload retained
```

An acknowledgement cannot show clean while a later frame/batch remains pending. Projection metadata
may update saved revision monotonically but cannot erase pending-local dirty state.

## RF-204 boundary

RF-203 does not delete the old channel, bridge method, main handler, `WorkspaceDraftOutbox`, snapshot
preservation helpers or old mocks. It makes the production CodeMirror path and workflow barriers use
the new client exactly once. RF-204 then deletes dormant full-draft symbols and tests, with an
architecture guard proving no dual path remains.

## Testing

- Pure queue tests: exact sequence, one in-flight, same-sequence retry, tail edits during ack,
  multi-tab concurrency, gap recovery, late results, disposal and dirty derivation.
- CodeMirror adapter tests: insert/delete/replace/multi-range, emoji/UTF-16/CRLF, sequential command
  transactions, same-frame compose, identity isolation, synchronous seal, undo/redo and IME.
- Client tests: projection-before-ack, duplicate, conflict, safe rebase, typed ambiguous recovery result,
  transport/error retention and exact flush cutoff.
- Workspace integration tests: delayed acknowledgements across save, switch, detach, reload, tab
  close and window close; failure prevents the destructive command; recovery tab exact text.
- Full formal editor behavior baseline must stay 121/121 with 0 unexpected and 0 not-run.

## Self-review

- Markdown text remains the only document truth.
- Main remains canonical; renderer text is optimistic and disposable.
- Normal acknowledgement performs zero editor transactions.
- Projection metadata cannot advance the transport text baseline.
- CodeMirror types stop at the adapter.
- No edit is sent through both transports.
- Ambiguity produces recovery, never guessed Markdown.
- RF-204 deletion debt is explicit and not expanded.
