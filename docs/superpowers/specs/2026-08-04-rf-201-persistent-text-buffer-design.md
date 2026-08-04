# RF-201 Persistent Text Buffer Design

## Context

RF-101 established one main-owned `DocumentSession` and a runtime-neutral `TextBuffer` interface. The current concrete buffer is string-backed and current renderer updates still replace a full draft. RF-201 changes the production storage representation and adds the domain batch primitive; transport migration remains deliberately staged in RF-202 through RF-204.

## Architecture

Dependency direction is:

```text
main composition
  -> @fishmark/workspace-infrastructure
       -> @fishmark/workspace-domain TextBuffer interface
       -> @codemirror/state Text implementation
  -> @fishmark/workspace-domain WorkspaceState
```

`workspace-domain` never imports CodeMirror. `workspace-infrastructure` exports only `createCodeMirrorTextBuffer(value): TextBuffer`; its concrete wrapper and CodeMirror `Text` never cross the public boundary. Main passes this factory when constructing the canonical workspace state.

The string implementation remains a domain reference implementation used by isolated tests. Workspace construction requires an explicit factory, so it is not an implicit production fallback, has no feature flag, and is not a second live document state.

## Persistent buffer behavior

The infrastructure buffer constructs CodeMirror `Text` from `value.split("\n")`. This retains a CR character immediately before each LF, so `\r\n` source round-trips exactly through `sliceString`/`toString`.

Changes use UTF-16 offsets, matching JavaScript strings and CodeMirror. The shared domain validator rejects non-safe-integer, negative, reversed, out-of-bounds, unsorted, or overlapping ranges before mutation. Multiple changes are interpreted against the original buffer. Low-level `buffer.apply([])` preserves identity, while a session edit batch rejects an empty change list.

`TextBuffer.equals(other)` is part of the runtime-neutral contract. The CodeMirror wrapper uses `Text.eq()` when both sides are CodeMirror-backed and falls back to exact content comparison only across implementations. Session edit application uses `apply()` plus `equals()` and never calls `toString()` on the normal incremental path. This preserves the existing “undo back to saved text becomes clean” behavior without materializing the full document on every edit.

## Session edit batches

The domain primitive accepts:

```ts
type ApplyDocumentEditBatchInput = {
  baseRevision: DocumentRevision;
  clientId: string;
  clientSequence: number;
  changes: readonly TextChange[];
};
```

Results distinguish:

- `applied`: batch acknowledged; includes the next session and canonical revision.
- `duplicate`: this client sequence was already acknowledged; no mutation.
- `revision-conflict`: `baseRevision` differs from canonical revision.
- `sequence-gap`: sequence skipped the next expected value.
- `invalid`: malformed client identity/sequence/change ranges.

Processing order is intentional:

1. Validate `clientId` and `clientSequence` shape.
2. If the sequence is at or below the client's high-watermark, return `duplicate` before revision validation.
3. Reject a gap above the next expected sequence.
4. Reject a stale/newer `baseRevision` as `revision-conflict`.
5. Validate all changes against the original buffer.
6. Reject an empty batch; otherwise apply atomically, record the new high-watermark, and increment revision exactly once.

A non-empty same-text replacement is still an accepted batch and advances revision once. If its result equals `savedText`, the new revision also becomes `savedRevision`, preserving clean-state behavior. Empty batches are invalid and do not advance either revision or the client high-watermark.

The ledger stores one high-watermark per client, so memory grows with editor client identities rather than keystrokes. Renderer client IDs are session identities and must never be reused; lifecycle retirement belongs to the renderer/client cutover tasks, not a hidden pruning heuristic in RF-201.

## Existing workflows

The existing full-draft `updateTabDraft` path stays available until RF-204, but its production `DocumentSession` uses the injected persistent buffer. RF-201 does not create a parallel edit owner and does not expose the new batch through IPC. Save, reload, close, move, and projection logic continue to read the same canonical session.

## Error and safety model

Expected remote-input failures are typed results, not thrown exceptions. Direct low-level `TextBuffer.apply` retains fail-fast range validation for incorrect internal callers. Session edit application validates first and converts validation failures to a typed `invalid` result without partial mutation.

All session and ledger values remain immutable from callers. A rejected or duplicate batch returns the original session identity. Accepted edits create one new frozen session.

## Testing

- Both string and CodeMirror buffers run the same conformance cases.
- Infrastructure tests cover Unicode, surrogate pairs, CRLF, multi-change original offsets, large documents/insertions, identity on empty changes, and every invalid range category.
- Session tests cover one revision per accepted batch, no-op acknowledgement, duplicate retry before revision conflict, per-client independence, sequence gaps, stale/newer base revision, safe-integer validation, atomic invalid rejection, saved-text cleanliness, and immutable ledger ownership.
- Main/source tests prove production factory injection.
- Architecture tests prove one public entry and reject Electron, React, Node, shared, main, preload, renderer, editor-core, and markdown-engine imports from workspace-infrastructure while allowing domain and `@codemirror/state`.
- Runtime verification requires the emitted package through its public export and applies a real persistent edit.

## Self-review

- No TBD/TODO placeholders.
- RF-202 through RF-204 responsibilities are explicitly excluded.
- No dual canonical state or compatibility routing is introduced.
- Error ordering, no-op revision semantics, CRLF behavior, and idempotence memory bounds are explicit.
