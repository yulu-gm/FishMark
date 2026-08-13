import type {
  ApplyDocumentEditsResult,
  DocumentEditError,
  DocumentTextChange
} from "../../shared/document-edit";

export type PendingEditQueueStatus =
  | "ready"
  | "rebasing"
  | "blocked"
  | "recovering"
  | "retired";

export type PendingEditBatch = {
  readonly sequence: number;
  readonly baseRevision: number;
  readonly baseText: string;
  readonly changes: readonly DocumentTextChange[];
  readonly resultingText: string;
};

export type PendingEditQueueState = {
  readonly acknowledgedText: string;
  readonly acknowledgedTextRevision: number;
  readonly observedRevision: number;
  readonly observedSavedRevision: number;
  readonly observedIsDirty: boolean;
  readonly optimisticText: string;
  readonly nextSequence: number;
  readonly batches: readonly PendingEditBatch[];
  readonly inFlightSequence: number | null;
  readonly generation: number;
  readonly status: PendingEditQueueStatus;
};

export type PendingEditConflict = {
  readonly generation: number;
  readonly sequence: number;
  readonly canonicalRevision: number;
  readonly canonicalText: string;
  readonly isDirty: boolean;
};

export type PendingEditRecovery = {
  readonly localText: string;
  readonly canonicalRevision: number;
  readonly canonicalText?: string;
};

export type PendingEditAdmission =
  | { readonly kind: "stale"; readonly state: PendingEditQueueState }
  | { readonly kind: "accepted"; readonly state: PendingEditQueueState }
  | {
      readonly kind: "resend";
      readonly state: PendingEditQueueState;
      readonly batch: PendingEditBatch;
    }
  | {
      readonly kind: "conflict";
      readonly state: PendingEditQueueState;
      readonly conflict: PendingEditConflict;
    }
  | {
      readonly kind: "blocked";
      readonly state: PendingEditQueueState;
      readonly reason:
        | "queue-not-ready"
        | "unexpected-result"
        | "acknowledgement-mismatch"
        | "revision-mismatch"
        | "server-error";
      readonly error?: DocumentEditError;
    }
  | {
      readonly kind: "recovery-required";
      readonly state: PendingEditQueueState;
      readonly reason: "missing-sequence";
      readonly recovery: PendingEditRecovery;
    };

export type PendingEditReplacement = DocumentTextChange;

export type PendingEditRebaseResult =
  | { readonly kind: "stale"; readonly state: PendingEditQueueState }
  | {
      readonly kind: "blocked";
      readonly state: PendingEditQueueState;
      readonly reason: "invalid-conflict";
    }
  | {
      readonly kind: "rebased";
      readonly state: PendingEditQueueState;
      readonly localOnCanonical: PendingEditReplacement;
      readonly remoteOnOptimistic: PendingEditReplacement | null;
      readonly rebasedText: string;
    }
  | {
      readonly kind: "recovery-required";
      readonly state: PendingEditQueueState;
      readonly reason: "ambiguous-overlap" | "invalid-conflict";
      readonly recovery: PendingEditRecovery & { readonly canonicalText: string };
    };

export function hydratePendingEditQueue(_input: {
  readonly text: string;
  readonly revision: number;
  readonly savedRevision: number;
  readonly isDirty: boolean;
  readonly nextSequence?: number;
}): PendingEditQueueState {
  assertRevision(_input.revision, "revision");
  assertRevision(_input.savedRevision, "savedRevision");
  if (_input.savedRevision > _input.revision) {
    throw new RangeError("savedRevision cannot exceed revision.");
  }
  if (_input.isDirty !== (_input.revision !== _input.savedRevision)) {
    throw new Error("isDirty must equal the revision and savedRevision difference.");
  }
  const nextSequence = _input.nextSequence ?? 1;
  if (!isSequence(nextSequence)) {
    throw new RangeError("nextSequence must be a positive safe integer.");
  }
  return freezeState({
    acknowledgedText: _input.text,
    acknowledgedTextRevision: _input.revision,
    observedRevision: _input.revision,
    observedSavedRevision: _input.savedRevision,
    observedIsDirty: _input.isDirty,
    optimisticText: _input.text,
    nextSequence,
    batches: EMPTY_BATCHES,
    inFlightSequence: null,
    generation: 0,
    status: "ready"
  });
}

export function enqueuePendingEdit(
  _state: PendingEditQueueState,
  _changes: readonly DocumentTextChange[]
): { readonly state: PendingEditQueueState; readonly batch: PendingEditBatch } {
  if (_state.status !== "ready" && _state.status !== "rebasing") {
    throw new Error(`Cannot enqueue edits while queue is ${_state.status}.`);
  }
  if (_changes.length === 0) {
    throw new Error("Pending edit batch must not be empty.");
  }
  const changes = freezeChanges(_changes, _state.optimisticText.length);
  const resultingText = applyChanges(_state.optimisticText, changes);
  if (!Number.isSafeInteger(_state.nextSequence) || _state.nextSequence < 1) {
    throw new RangeError("Pending edit sequence is invalid.");
  }
  const previousBatch = _state.batches.at(-1);
  const baseRevision = previousBatch === undefined
    ? _state.acknowledgedTextRevision
    : nextRevision(previousBatch.baseRevision);
  nextRevision(baseRevision);
  const batch = freezeBatch({
    sequence: _state.nextSequence,
    baseRevision,
    baseText: _state.optimisticText,
    changes,
    resultingText
  });
  const state = freezeState({
    ..._state,
    optimisticText: resultingText,
    nextSequence: nextSequence(_state.nextSequence),
    batches: Object.freeze([..._state.batches, batch])
  });
  return Object.freeze({ state, batch });
}

export function beginPendingEditSend(_state: PendingEditQueueState):
  | { readonly kind: "none"; readonly state: PendingEditQueueState }
  | { readonly kind: "send"; readonly state: PendingEditQueueState; readonly batch: PendingEditBatch } {
  if (
    _state.status !== "ready" ||
    _state.inFlightSequence !== null ||
    _state.batches.length === 0
  ) {
    return Object.freeze({ kind: "none", state: _state });
  }
  const batch = _state.batches[0];
  if (batch === undefined) {
    return Object.freeze({ kind: "none", state: _state });
  }
  const state = freezeState({ ..._state, inFlightSequence: batch.sequence });
  return Object.freeze({ kind: "send", state, batch });
}

export function admitPendingEditResult(
  _state: PendingEditQueueState,
  _input: { readonly generation: number; readonly result: ApplyDocumentEditsResult }
): PendingEditAdmission {
  if (
    _input.generation !== _state.generation ||
    _state.status === "retired"
  ) {
    return Object.freeze({ kind: "stale", state: _state });
  }
  if (_state.status !== "ready") {
    return Object.freeze({ kind: "blocked", state: _state, reason: "queue-not-ready" });
  }
  const head = _state.batches[0];
  if (head === undefined || _state.inFlightSequence !== head.sequence) {
    return blocked(_state, "unexpected-result");
  }

  const result = _input.result;
  switch (result.kind) {
    case "error":
      return blocked(_state, "server-error", result.error);
    case "applied":
    case "duplicate":
      return admitAcknowledgement(_state, head, result);
    case "revision-conflict": {
      if (
        !isRevision(result.canonicalRevision) ||
        result.canonicalRevision <= _state.acknowledgedTextRevision
      ) {
        return blocked(_state, "revision-mismatch");
      }
      const observed = observeResultMetadata(
        _state,
        result.canonicalRevision,
        result.isDirty
      );
      const state = freezeState({
        ..._state,
        ...observed,
        status: "rebasing"
      });
      const conflict = Object.freeze({
        generation: state.generation,
        sequence: head.sequence,
        canonicalRevision: result.canonicalRevision,
        canonicalText: result.canonicalText,
        isDirty: result.isDirty
      });
      return Object.freeze({ kind: "conflict", state, conflict });
    }
    case "sequence-gap": {
      if (!isRevision(result.canonicalRevision)) {
        return blocked(_state, "revision-mismatch");
      }
      if (result.canonicalRevision < _state.acknowledgedTextRevision) {
        return blocked(_state, "revision-mismatch");
      }
      if (!isSequence(result.expectedSequence)) {
        return missingSequenceRecovery(_state, result.canonicalRevision);
      }
      const retained = _state.batches.find(
        (batch) => batch.sequence === result.expectedSequence
      );
      if (retained === undefined || retained.sequence !== head.sequence) {
        return missingSequenceRecovery(_state, result.canonicalRevision);
      }
      const state = freezeState({
        ..._state,
        inFlightSequence: retained.sequence,
        observedRevision: Math.max(_state.observedRevision, result.canonicalRevision),
        observedIsDirty:
          Math.max(_state.observedRevision, result.canonicalRevision) !==
          _state.observedSavedRevision
      });
      return Object.freeze({ kind: "resend", state, batch: retained });
    }
  }
}

export function observePendingEditProjection(
  _state: PendingEditQueueState,
  _projection: { readonly revision: number; readonly savedRevision: number; readonly isDirty: boolean }
): PendingEditQueueState {
  if (
    _state.status === "retired" ||
    !isRevision(_projection.revision) ||
    !isRevision(_projection.savedRevision) ||
    _projection.savedRevision > _projection.revision ||
    _projection.isDirty !== (_projection.revision !== _projection.savedRevision) ||
    _projection.revision < _state.observedRevision ||
    _projection.savedRevision < _state.observedSavedRevision
  ) {
    return _state;
  }
  return freezeState({
    ..._state,
    observedRevision: _projection.revision,
    observedSavedRevision: _projection.savedRevision,
    observedIsDirty: _projection.isDirty
  });
}

export function isPendingEditQueueDirty(_state: PendingEditQueueState): boolean {
  return _state.observedRevision !== _state.observedSavedRevision ||
    _state.batches.length > 0 ||
    _state.status === "recovering";
}

export function requirePendingEditRecovery(
  _state: PendingEditQueueState,
  _localText: string
): { readonly state: PendingEditQueueState; readonly recovery: PendingEditRecovery } | null {
  if (_state.status === "retired") return null;
  const recovery = Object.freeze({
    localText: _localText,
    canonicalRevision: _state.acknowledgedTextRevision,
    canonicalText: _state.acknowledgedText
  });
  return Object.freeze({
    state: freezeState({
      ..._state,
      optimisticText: _localText,
      inFlightSequence: null,
      status: "recovering"
    }),
    recovery
  });
}

export function retirePendingEditQueue(_state: PendingEditQueueState): PendingEditQueueState {
  return freezeState({
    ..._state,
    generation: nextGeneration(_state.generation),
    inFlightSequence: null,
    status: "retired"
  });
}

export function retryPendingEditTransport(_state: PendingEditQueueState): PendingEditQueueState | null {
  if (_state.status !== "blocked" || _state.batches.length === 0) return null;
  return freezeState({ ..._state, inFlightSequence: null, status: "ready" });
}

export function rebasePendingEditQueue(
  _state: PendingEditQueueState,
  _conflict: PendingEditConflict
): PendingEditRebaseResult {
  if (_conflict.generation !== _state.generation || _state.status === "retired") {
    return Object.freeze({ kind: "stale", state: _state });
  }
  const head = _state.batches[0];
  if (
    _state.status !== "rebasing" ||
    head === undefined ||
    _conflict.sequence !== head.sequence ||
    !isRevision(_conflict.canonicalRevision) ||
    _conflict.canonicalRevision <= _state.acknowledgedTextRevision
  ) {
    return rejectRebase(_state);
  }

  const baseText = _state.acknowledgedText;
  const localReplacement = deriveMinimalReplacement(baseText, _state.optimisticText);
  const remoteReplacement = deriveMinimalReplacement(baseText, _conflict.canonicalText);
  if (localReplacement === null) {
    return rebaseRecovery(_state, _conflict, "invalid-conflict");
  }

  let localOnCanonical = localReplacement;
  let remoteOnOptimistic: PendingEditReplacement | null = null;
  if (remoteReplacement !== null) {
    if (!areStrictlyDisjoint(localReplacement, remoteReplacement)) {
      return rebaseRecovery(_state, _conflict, "ambiguous-overlap");
    }
    if (remoteReplacement.to < localReplacement.from) {
      const remoteDelta = replacementDelta(remoteReplacement);
      localOnCanonical = freezeChange({
        from: localReplacement.from + remoteDelta,
        to: localReplacement.to + remoteDelta,
        insert: localReplacement.insert
      });
      remoteOnOptimistic = remoteReplacement;
    } else {
      const localDelta = replacementDelta(localReplacement);
      remoteOnOptimistic = freezeChange({
        from: remoteReplacement.from + localDelta,
        to: remoteReplacement.to + localDelta,
        insert: remoteReplacement.insert
      });
    }
  }

  const rebasedText = applyChanges(_conflict.canonicalText, [localOnCanonical]);
  if (
    (remoteOnOptimistic !== null &&
      applyChanges(_state.optimisticText, [remoteOnOptimistic]) !== rebasedText) ||
    (remoteOnOptimistic === null && _state.optimisticText !== rebasedText)
  ) {
    return rebaseRecovery(_state, _conflict, "invalid-conflict");
  }

  const batch = freezeBatch({
    sequence: head.sequence,
    baseRevision: _conflict.canonicalRevision,
    baseText: _conflict.canonicalText,
    changes: Object.freeze([localOnCanonical]),
    resultingText: rebasedText
  });
  const state = freezeState({
    ..._state,
    acknowledgedText: _conflict.canonicalText,
    acknowledgedTextRevision: _conflict.canonicalRevision,
    optimisticText: rebasedText,
    nextSequence: nextSequence(head.sequence),
    batches: Object.freeze([batch]),
    inFlightSequence: null,
    status: "ready"
  });
  return Object.freeze({
    kind: "rebased",
    state,
    localOnCanonical,
    remoteOnOptimistic,
    rebasedText
  });
}

const EMPTY_BATCHES: readonly PendingEditBatch[] = Object.freeze([]);

function admitAcknowledgement(
  state: PendingEditQueueState,
  head: PendingEditBatch,
  result: Extract<ApplyDocumentEditsResult, { kind: "applied" | "duplicate" }>
): PendingEditAdmission {
  if (result.acknowledgedSequence !== head.sequence) {
    return blocked(state, "acknowledgement-mismatch");
  }
  const acknowledgedRevision = nextRevision(head.baseRevision);
  if (
    !isRevision(result.revision) ||
    (result.kind === "applied" && result.revision !== acknowledgedRevision) ||
    (result.kind === "duplicate" && result.revision < acknowledgedRevision)
  ) {
    return blocked(state, "revision-mismatch");
  }
  const shouldObserveResult = result.revision >= state.observedRevision;
  const observed = shouldObserveResult
    ? observeResultMetadata(state, result.revision, result.isDirty)
    : {
        observedRevision: state.observedRevision,
        observedSavedRevision: state.observedSavedRevision,
        observedIsDirty: state.observedIsDirty
      };
  const nextState = freezeState({
    ...state,
    acknowledgedText: head.resultingText,
    acknowledgedTextRevision: acknowledgedRevision,
    ...observed,
    batches: Object.freeze(state.batches.slice(1)),
    inFlightSequence: null,
    status: "ready"
  });
  return Object.freeze({ kind: "accepted", state: nextState });
}

function observeResultMetadata(
  state: PendingEditQueueState,
  revision: number,
  resultIsDirty: boolean
): Pick<PendingEditQueueState, "observedRevision" | "observedSavedRevision" | "observedIsDirty"> {
  if (revision < state.observedRevision) {
    return {
      observedRevision: state.observedRevision,
      observedSavedRevision: state.observedSavedRevision,
      observedIsDirty: state.observedRevision !== state.observedSavedRevision
    };
  }
  const observedSavedRevision = resultIsDirty ? state.observedSavedRevision : revision;
  return {
    observedRevision: revision,
    observedSavedRevision,
    observedIsDirty: revision !== observedSavedRevision
  };
}

function blocked(
  state: PendingEditQueueState,
  reason: Extract<PendingEditAdmission, { kind: "blocked" }>["reason"],
  error?: DocumentEditError
): PendingEditAdmission {
  const blockedState = freezeState({ ...state, status: "blocked" });
  return error === undefined
    ? Object.freeze({ kind: "blocked", state: blockedState, reason })
    : Object.freeze({ kind: "blocked", state: blockedState, reason, error });
}

function missingSequenceRecovery(
  state: PendingEditQueueState,
  canonicalRevision: number
): PendingEditAdmission {
  const recoveryState = freezeState({ ...state, status: "recovering" });
  return Object.freeze({
    kind: "recovery-required",
    state: recoveryState,
    reason: "missing-sequence",
    recovery: Object.freeze({
      localText: state.optimisticText,
      canonicalRevision
    })
  });
}

function rebaseRecovery(
  state: PendingEditQueueState,
  conflict: PendingEditConflict,
  reason: "ambiguous-overlap" | "invalid-conflict"
): PendingEditRebaseResult {
  const recoveryState = freezeState({ ...state, status: "recovering" });
  return Object.freeze({
    kind: "recovery-required",
    state: recoveryState,
    reason,
    recovery: Object.freeze({
      localText: state.optimisticText,
      canonicalRevision: conflict.canonicalRevision,
      canonicalText: conflict.canonicalText
    })
  });
}

function rejectRebase(state: PendingEditQueueState): PendingEditRebaseResult {
  const blockedState = state.status === "blocked" || state.status === "recovering"
    ? state
    : freezeState({ ...state, status: "blocked" });
  return Object.freeze({
    kind: "blocked",
    state: blockedState,
    reason: "invalid-conflict"
  });
}

function deriveMinimalReplacement(source: string, target: string): PendingEditReplacement | null {
  if (source === target) return null;
  let prefix = 0;
  const sharedLength = Math.min(source.length, target.length);
  while (prefix < sharedLength && source.charCodeAt(prefix) === target.charCodeAt(prefix)) {
    prefix += 1;
  }
  let sourceSuffix = source.length;
  let targetSuffix = target.length;
  while (
    sourceSuffix > prefix &&
    targetSuffix > prefix &&
    source.charCodeAt(sourceSuffix - 1) === target.charCodeAt(targetSuffix - 1)
  ) {
    sourceSuffix -= 1;
    targetSuffix -= 1;
  }
  return freezeChange({
    from: prefix,
    to: sourceSuffix,
    insert: target.slice(prefix, targetSuffix)
  });
}

function areStrictlyDisjoint(
  left: PendingEditReplacement,
  right: PendingEditReplacement
): boolean {
  return left.to < right.from || right.to < left.from;
}

function replacementDelta(change: PendingEditReplacement): number {
  return change.insert.length - (change.to - change.from);
}

function applyChanges(source: string, changes: readonly DocumentTextChange[]): string {
  let cursor = 0;
  let result = "";
  for (const change of changes) {
    result += source.slice(cursor, change.from);
    result += change.insert;
    cursor = change.to;
  }
  return result + source.slice(cursor);
}

function freezeChanges(
  changes: readonly DocumentTextChange[],
  sourceLength: number
): readonly DocumentTextChange[] {
  let previousTo = 0;
  const copy = changes.map((change, index) => {
    if (
      !Number.isSafeInteger(change.from) ||
      !Number.isSafeInteger(change.to) ||
      change.from < 0 ||
      change.from > change.to ||
      change.to > sourceLength ||
      (index > 0 && change.from < previousTo) ||
      typeof change.insert !== "string"
    ) {
      throw new RangeError("Pending text changes must be ordered, disjoint and within the source.");
    }
    previousTo = change.to;
    return freezeChange(change);
  });
  return Object.freeze(copy);
}

function freezeChange(change: DocumentTextChange): DocumentTextChange {
  return Object.freeze({ from: change.from, to: change.to, insert: change.insert });
}

function freezeBatch(batch: PendingEditBatch): PendingEditBatch {
  return Object.freeze(batch);
}

function freezeState(state: PendingEditQueueState): PendingEditQueueState {
  return Object.freeze(state);
}

function assertRevision(value: number, name: string): void {
  if (!isRevision(value)) throw new RangeError(`${name} must be a non-negative safe integer.`);
}

function isRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSequence(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function nextRevision(revision: number): number {
  if (!isRevision(revision) || revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Document revision cannot advance.");
  }
  return revision + 1;
}

function nextSequence(sequence: number): number {
  if (!isSequence(sequence) || sequence === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Pending edit sequence cannot advance.");
  }
  return sequence + 1;
}

function nextGeneration(generation: number): number {
  if (!Number.isSafeInteger(generation) || generation < 0 || generation === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Pending edit generation cannot advance.");
  }
  return generation + 1;
}
