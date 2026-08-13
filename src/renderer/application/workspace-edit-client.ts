import type {
  ApplyDocumentEditsInput,
  ApplyDocumentEditsResult,
  DocumentEditError,
  DocumentTextChange,
  FlushDocumentEditsInput,
  FlushDocumentEditsResult
} from "../../shared/document-edit";
import type { DocumentProjectionEvent } from "../../shared/document-projection";
import {
  admitPendingEditResult,
  beginPendingEditSend,
  enqueuePendingEdit,
  hydratePendingEditQueue,
  isPendingEditQueueDirty,
  observePendingEditProjection,
  rebasePendingEditQueue,
  retryPendingEditTransport,
  requirePendingEditRecovery,
  retirePendingEditQueue,
  type PendingEditConflict,
  type PendingEditQueueState,
  type PendingEditRebaseResult,
  type PendingEditRecovery,
  type PendingEditReplacement
} from "./pending-edit-queue";

export type WorkspaceEditTabBinding = {
  readonly tabId: string;
  readonly generation: number;
};

export type WorkspaceEditRecoveryReason =
  | "missing-sequence"
  | "ambiguous-overlap"
  | "invalid-conflict"
  | "flush-sequence-gap"
  | "adapter-discarded";

export type WorkspaceEditBlockedReason =
  | "transport-failure"
  | "server-error"
  | "queue-not-ready"
  | "unexpected-result"
  | "acknowledgement-mismatch"
  | "revision-mismatch"
  | "repeated-sequence-gap"
  | "invalid-conflict";

export type WorkspaceEditBarrierBlockedReason =
  | WorkspaceEditBlockedReason
  | "unknown-tab"
  | "barrier-already-active"
  | "flush-error"
  | "flush-transport-failure"
  | "flush-acknowledgement-mismatch"
  | "invalid-flush-result";

export type WorkspaceEditClientOutcome =
  | {
      readonly kind: "conflict";
      readonly conflict: PendingEditConflict;
      readonly claim: WorkspaceEditConflictClaim;
    }
  | {
      readonly kind: "rebased";
      readonly resolution: WorkspaceEditConflictResolutionToken;
      readonly canonicalText: string;
      readonly canonicalRevision: number;
      readonly canonicalIsDirty: boolean;
      readonly localOnCanonical: PendingEditReplacement;
      readonly remoteOnOptimistic: PendingEditReplacement | null;
      readonly expectedOptimisticText: string;
      readonly rebasedText: string;
    }
  | {
      readonly kind: "recovery-required";
      readonly reason: WorkspaceEditRecoveryReason;
      readonly recovery: PendingEditRecovery;
      readonly resolution?: WorkspaceEditConflictResolutionToken;
    }
  | {
      readonly kind: "blocked";
      readonly reason: WorkspaceEditBlockedReason;
      readonly error?: DocumentEditError;
    };

export type WorkspaceEditClientStateChange = {
  readonly binding: WorkspaceEditTabBinding;
  readonly state: PendingEditQueueState;
  readonly isDirty: boolean;
  readonly outcome?: WorkspaceEditClientOutcome;
};

export interface WorkspaceEditClientPorts {
  readonly createClientId: () => string;
  readonly applyDocumentEdits: (
    input: ApplyDocumentEditsInput
  ) => Promise<ApplyDocumentEditsResult>;
  readonly flushDocumentEdits: (
    input: FlushDocumentEditsInput
  ) => Promise<FlushDocumentEditsResult>;
  readonly subscribeDocumentProjection: (
    listener: (event: DocumentProjectionEvent) => void
  ) => () => void;
  readonly notifyState: (change: WorkspaceEditClientStateChange) => void;
}

export type WorkspaceEditFrame = {
  readonly binding: WorkspaceEditTabBinding;
  readonly baseText: string;
  readonly resultingText: string;
  readonly changes: readonly DocumentTextChange[];
};

export type WorkspaceEditFrameAdmission =
  | { readonly kind: "admitted"; readonly sequence: number }
  | { readonly kind: "stale" }
  | {
      readonly kind: "invalid-frame";
      readonly reason:
        | "base-text-mismatch"
        | "resulting-text-mismatch"
        | "invalid-changes"
        | "queue-not-ready"
        | "resolution-pending";
    };

export type WorkspaceEditConflictResolutionToken = {
  readonly tabId: string;
  readonly generation: number;
  readonly id: number;
};

export type WorkspaceEditConflictClaim = {
  readonly tabId: string;
  readonly generation: number;
  readonly sequence: number;
  readonly canonicalRevision: number;
  readonly id: number;
};

export type WorkspaceEditConflictPreparation =
  | Extract<WorkspaceEditClientOutcome, { kind: "rebased" | "recovery-required" }>
  | { readonly kind: "stale" }
  | {
      readonly kind: "blocked";
      readonly reason: "conflict-not-pending" | "invalid-conflict";
    };

export type WorkspaceEditConflictCommit =
  | { readonly kind: "committed"; readonly outcome: WorkspaceEditClientOutcome }
  | { readonly kind: "stale" };

export type WorkspaceEditTransportRetry =
  | { readonly kind: "resumed" }
  | { readonly kind: "stale" }
  | { readonly kind: "not-retryable" };

export type WorkspaceEditConflictAbort =
  | Extract<WorkspaceEditClientOutcome, { kind: "recovery-required" }>
  | { readonly kind: "stale" };

export interface WorkspaceEditBarrierLease {
  release(): void;
}

export type WorkspaceEditBarrierFailure =
  | { readonly kind: "stale" }
  | { readonly kind: "conflict"; readonly conflict: PendingEditConflict }
  | {
      readonly kind: "recovery-required";
      readonly reason: WorkspaceEditRecoveryReason;
      readonly recovery: PendingEditRecovery;
    }
  | {
      readonly kind: "blocked";
      readonly reason: WorkspaceEditBarrierBlockedReason;
      readonly error?: DocumentEditError;
    };

export type WorkspaceEditBarrierResult =
  | {
      readonly kind: "acquired";
      readonly cutoff: number;
      readonly lease: WorkspaceEditBarrierLease;
    }
  | WorkspaceEditBarrierFailure;

export type WorkspaceEditAllBarrierResult =
  | {
      readonly kind: "acquired";
      readonly cutoffs: readonly { readonly tabId: string; readonly cutoff: number }[];
      readonly lease: WorkspaceEditBarrierLease;
    }
  | (WorkspaceEditBarrierFailure & { readonly tabId?: string });

export type WorkspaceEditClientOptions = {
  readonly windowId?: string | null;
  readonly ports: WorkspaceEditClientPorts;
  readonly maxTransportRetries?: number;
};

type Entry = {
  readonly binding: WorkspaceEditTabBinding;
  state: PendingEditQueueState;
  activeSend: Promise<void> | null;
  sendCeiling: number | null;
  barrierToken: symbol | null;
  pendingConflict: PendingEditConflict | null;
  pendingConflictClaim: WorkspaceEditConflictClaim | null;
  pendingResolution: PreparedResolution | null;
  lastOutcome: WorkspaceEditClientOutcome | null;
  pendingOutcome: WorkspaceEditClientOutcome | null;
  readonly progressWaiters: Set<() => void>;
  readonly retirePromise: Promise<void>;
  readonly resolveRetired: () => void;
};

type PreparedResolution = {
  readonly token: WorkspaceEditConflictResolutionToken;
  readonly result: Extract<PendingEditRebaseResult, { kind: "rebased" | "recovery-required" }>;
  readonly outcome: Extract<WorkspaceEditClientOutcome, { kind: "rebased" | "recovery-required" }>;
};

type BarrierSlot = {
  readonly entry: Entry;
  readonly generation: number;
  readonly token: symbol;
  readonly cutoff: number;
  readonly cancelPromise: Promise<void>;
  readonly resolveCanceled: () => void;
};

type BarrierCheckpoint = { readonly kind: "checkpointed" } | WorkspaceEditBarrierFailure;

const DEFAULT_MAX_TRANSPORT_RETRIES = 1;
const MAX_CONFIGURED_TRANSPORT_RETRIES = 10;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class WorkspaceEditClient {
  readonly #ports: WorkspaceEditClientPorts;
  readonly #clientId: string;
  readonly #maxTransportRetries: number;
  readonly #entries = new Map<string, Entry>();
  readonly #tabNextSequence = new Map<string, number>();
  #detachProjection: (() => void) | null = null;
  #windowId: string | null;
  #nextBindingGeneration = 1;
  #nextResolutionId = 1;
  #nextConflictClaimId = 1;
  #started = false;
  #disposed = false;

  constructor(options: WorkspaceEditClientOptions) {
    this.#ports = options.ports;
    this.#clientId = options.ports.createClientId();
    if (typeof this.#clientId !== "string" || !CLIENT_ID_PATTERN.test(this.#clientId)) {
      throw new Error("Workspace edit client ID does not match the shared wire format.");
    }
    this.#windowId = options.windowId ?? null;
    const retries = options.maxTransportRetries ?? DEFAULT_MAX_TRANSPORT_RETRIES;
    if (
      !Number.isSafeInteger(retries) ||
      retries < 0 ||
      retries > MAX_CONFIGURED_TRANSPORT_RETRIES
    ) {
      throw new RangeError("maxTransportRetries must be an integer between 0 and 10.");
    }
    this.#maxTransportRetries = retries;
  }

  start(): void {
    if (this.#disposed || this.#started) return;
    this.#started = true;
    this.#detachProjection = this.#ports.subscribeDocumentProjection((event) => {
      this.#observeProjection(event);
    });
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    try {
      this.#detachProjection?.();
    } finally {
      this.#detachProjection = null;
    }
  }

  bindWindow(windowId: string): void {
    if (this.#disposed) return;
    if (windowId.length === 0) throw new Error("Workspace window ID must not be empty.");
    if (this.#windowId === windowId) return;
    if (this.#windowId !== null && this.#entries.size > 0) {
      throw new Error("Cannot switch the workspace window while tabs are live.");
    }
    this.#windowId = windowId;
  }

  get clientId(): string {
    return this.#clientId;
  }

  hydrateTab(input: {
    readonly tabId: string;
    readonly text: string;
    readonly revision: number;
    readonly savedRevision: number;
    readonly isDirty: boolean;
  }): WorkspaceEditTabBinding {
    if (this.#disposed) throw new Error("Cannot hydrate a disposed workspace edit client.");
    const previous = this.#entries.get(input.tabId);

    const binding = Object.freeze({
      tabId: input.tabId,
      generation: this.#nextBindingGeneration++
    });
    let resolveRetired!: () => void;
    const retirePromise = new Promise<void>((resolve) => {
      resolveRetired = resolve;
    });
    const entry: Entry = {
      binding,
      state: hydratePendingEditQueue({
        ...input,
        nextSequence: this.#tabNextSequence.get(input.tabId) ?? 1
      }),
      activeSend: null,
      sendCeiling: null,
      barrierToken: null,
      pendingConflict: null,
      pendingConflictClaim: null,
      pendingResolution: null,
      lastOutcome: null,
      pendingOutcome: null,
      progressWaiters: new Set(),
      retirePromise,
      resolveRetired
    };
    this.#entries.set(input.tabId, entry);
    this.#tabNextSequence.set(input.tabId, entry.state.nextSequence);
    if (previous !== undefined) this.#retireEntry(previous);
    if (this.#isCurrent(entry)) this.#publish(entry);
    return binding;
  }

  getTabState(tabId: string): PendingEditQueueState | null {
    return this.#entries.get(tabId)?.state ?? null;
  }

  observeCanonicalMetadata(
    binding: WorkspaceEditTabBinding,
    metadata: { readonly revision: number; readonly savedRevision: number; readonly isDirty: boolean }
  ): boolean {
    const entry = this.#currentEntry(binding);
    if (entry === null) return false;
    const state = observePendingEditProjection(entry.state, metadata);
    if (state === entry.state) return true;
    entry.state = state;
    this.#publish(entry);
    return true;
  }

  retainAdapterDiscard(
    binding: WorkspaceEditTabBinding,
    localText: string
  ): Extract<WorkspaceEditClientOutcome, { kind: "recovery-required" }> | { readonly kind: "stale" } {
    const entry = this.#currentEntry(binding);
    if (entry === null) return Object.freeze({ kind: "stale" });
    const recovery = requirePendingEditRecovery(entry.state, localText);
    if (recovery === null) return Object.freeze({ kind: "stale" });
    entry.state = recovery.state;
    entry.pendingConflict = null;
    entry.pendingResolution = null;
    const outcome = Object.freeze({
      kind: "recovery-required" as const,
      reason: "adapter-discarded" as const,
      recovery: recovery.recovery
    });
    entry.lastOutcome = outcome;
    this.#publish(entry, outcome);
    this.#signalProgress(entry);
    return outcome;
  }

  admitFrame(frame: WorkspaceEditFrame): WorkspaceEditFrameAdmission {
    const entry = this.#currentEntry(frame.binding);
    if (entry === null) return Object.freeze({ kind: "stale" });
    if (entry.pendingResolution !== null) {
      return Object.freeze({ kind: "invalid-frame", reason: "resolution-pending" });
    }
    if (frame.baseText !== entry.state.optimisticText) {
      return Object.freeze({ kind: "invalid-frame", reason: "base-text-mismatch" });
    }

    let queued: ReturnType<typeof enqueuePendingEdit>;
    try {
      queued = enqueuePendingEdit(entry.state, frame.changes);
    } catch {
      const reason = entry.state.status === "ready" || entry.state.status === "rebasing"
        ? "invalid-changes"
        : "queue-not-ready";
      return Object.freeze({ kind: "invalid-frame", reason });
    }
    if (queued.batch.resultingText !== frame.resultingText) {
      return Object.freeze({ kind: "invalid-frame", reason: "resulting-text-mismatch" });
    }
    entry.state = queued.state;
    this.#tabNextSequence.set(frame.binding.tabId, queued.state.nextSequence);
    if (queued.state.status === "ready") entry.lastOutcome = null;
    this.#publish(entry);
    this.#pump(entry);
    return Object.freeze({ kind: "admitted", sequence: queued.batch.sequence });
  }

  prepareConflictResolution(
    binding: WorkspaceEditTabBinding,
    claim?: WorkspaceEditConflictClaim
  ): WorkspaceEditConflictPreparation {
    const entry = this.#currentEntry(binding);
    if (entry === null) return Object.freeze({ kind: "stale" });
    if (entry.pendingResolution !== null) return entry.pendingResolution.outcome;
    if (entry.pendingConflict === null) {
      return Object.freeze({ kind: "blocked", reason: "conflict-not-pending" });
    }
    if (claim !== undefined && entry.pendingConflictClaim !== claim) {
      return Object.freeze({ kind: "stale" });
    }

    const result = rebasePendingEditQueue(entry.state, entry.pendingConflict);
    if (result.kind === "stale") return Object.freeze({ kind: "stale" });
    if (result.kind === "blocked") {
      return Object.freeze({ kind: "blocked", reason: "invalid-conflict" });
    }
    const token = Object.freeze({
      tabId: binding.tabId,
      generation: binding.generation,
      id: this.#nextResolutionId++
    });
    const outcome = result.kind === "rebased"
      ? Object.freeze({
          kind: "rebased" as const,
          resolution: token,
          canonicalText: entry.pendingConflict.canonicalText,
          canonicalRevision: entry.pendingConflict.canonicalRevision,
          canonicalIsDirty: entry.pendingConflict.isDirty,
          localOnCanonical: result.localOnCanonical,
          remoteOnOptimistic: result.remoteOnOptimistic,
          expectedOptimisticText: entry.state.optimisticText,
          rebasedText: result.rebasedText
        })
      : Object.freeze({
          kind: "recovery-required" as const,
          reason: result.reason,
          recovery: result.recovery,
          resolution: token
        });
    entry.pendingResolution = { token, result, outcome };
    return outcome;
  }

  commitConflictResolution(
    binding: WorkspaceEditTabBinding,
    resolution: WorkspaceEditConflictResolutionToken
  ): WorkspaceEditConflictCommit {
    const entry = this.#currentEntry(binding);
    if (
      entry === null ||
      entry.pendingResolution === null ||
      entry.pendingResolution.token !== resolution
    ) {
      return Object.freeze({ kind: "stale" });
    }
    const prepared = entry.pendingResolution;
    entry.pendingResolution = null;
    entry.pendingConflict = null;
    entry.pendingConflictClaim = null;
    entry.pendingOutcome = null;
    entry.state = observePendingEditProjection(prepared.result.state, {
      revision: entry.state.observedRevision,
      savedRevision: entry.state.observedSavedRevision,
      isDirty: entry.state.observedIsDirty
    });
    if (prepared.result.kind === "rebased") {
      // The pure rebase folds every never-sent tail into the conflicting head. The live queue is
      // therefore the sequence truth again; only this committed value may cross incarnations.
      this.#tabNextSequence.set(binding.tabId, entry.state.nextSequence);
    }
    entry.lastOutcome = prepared.outcome;
    this.#publish(entry, prepared.outcome);
    if (prepared.result.kind === "rebased") this.#pump(entry);
    return Object.freeze({ kind: "committed", outcome: prepared.outcome });
  }

  abortConflictResolution(
    binding: WorkspaceEditTabBinding,
    resolution: WorkspaceEditConflictResolutionToken
  ): WorkspaceEditConflictAbort {
    const entry = this.#currentEntry(binding);
    if (
      entry === null ||
      entry.pendingResolution === null ||
      entry.pendingResolution.token !== resolution ||
      entry.pendingConflict === null
    ) return Object.freeze({ kind: "stale" });
    const prepared = entry.pendingResolution;
    const canonical = entry.pendingConflict;
    const recovery = requirePendingEditRecovery(entry.state, entry.state.optimisticText);
    if (recovery === null) return Object.freeze({ kind: "stale" });
    entry.state = recovery.state;
    entry.pendingConflict = null;
    entry.pendingConflictClaim = null;
    entry.pendingResolution = null;
    entry.pendingOutcome = null;
    const outcome = Object.freeze({
      kind: "recovery-required" as const,
      reason: "invalid-conflict" as const,
      recovery: Object.freeze({
        ...recovery.recovery,
        canonicalRevision: canonical.canonicalRevision,
        canonicalText: canonical.canonicalText
      }),
      resolution: prepared.token
    });
    entry.lastOutcome = outcome;
    this.#publish(entry, outcome);
    return outcome;
  }

  async acquireFlushBarrier(tabId: string): Promise<WorkspaceEditBarrierResult> {
    const installed = this.#installBarrier(tabId);
    if ("kind" in installed) return installed;
    const checkpoint = await this.#completeBarrier(installed);
    if (checkpoint.kind !== "checkpointed") {
      this.#releaseBarrier(installed);
      return checkpoint;
    }
    return Object.freeze({
      kind: "acquired",
      cutoff: installed.cutoff,
      lease: this.#createLease([installed])
    });
  }

  async acquireAllFlushBarriers(): Promise<WorkspaceEditAllBarrierResult> {
    if (this.#disposed) return Object.freeze({ kind: "stale" });
    const slots: BarrierSlot[] = [];
    for (const tabId of this.#entries.keys()) {
      const installed = this.#installBarrier(tabId);
      if ("kind" in installed) {
        for (const slot of slots) this.#releaseBarrier(slot);
        return Object.freeze({ ...installed, tabId });
      }
      slots.push(installed);
    }

    const failed = await firstBarrierFailure(slots.map((slot) => ({
      tabId: slot.entry.binding.tabId,
      task: this.#completeBarrier(slot)
    })));
    if (failed !== undefined) {
      for (const slot of slots) this.#releaseBarrier(slot);
      return Object.freeze({ ...failed.result, tabId: failed.tabId });
    }
    return Object.freeze({
      kind: "acquired",
      cutoffs: Object.freeze(slots.map((slot) => Object.freeze({
        tabId: slot.entry.binding.tabId,
        cutoff: slot.cutoff
      }))),
      lease: this.#createLease(slots)
    });
  }

  retireTab(binding: WorkspaceEditTabBinding): boolean {
    const entry = this.#currentEntry(binding);
    if (entry === null) return false;
    this.#entries.delete(binding.tabId);
    this.#retireEntry(entry);
    return true;
  }

  retryRetainedTransport(binding: WorkspaceEditTabBinding): WorkspaceEditTransportRetry {
    const entry = this.#currentEntry(binding);
    if (entry === null) return Object.freeze({ kind: "stale" });
    if (entry.lastOutcome?.kind !== "blocked" || entry.lastOutcome.reason !== "transport-failure") {
      return Object.freeze({ kind: "not-retryable" });
    }
    const state = retryPendingEditTransport(entry.state);
    if (state === null) return Object.freeze({ kind: "not-retryable" });
    entry.state = state;
    entry.lastOutcome = null;
    this.#publish(entry);
    this.#pump(entry);
    return Object.freeze({ kind: "resumed" });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    try {
      this.stop();
    } catch {
      // Disposal must continue even if an injected subscription teardown fails.
    }
    for (const entry of entries) this.#retireEntry(entry);
  }

  #observeProjection(event: DocumentProjectionEvent): void {
    if (this.#disposed || this.#windowId === null || event.windowId !== this.#windowId) return;
    const entry = this.#entries.get(event.projection.tabId);
    if (entry === undefined) return;
    const state = observePendingEditProjection(entry.state, event.projection);
    if (state === entry.state) return;
    entry.state = state;
    this.#publish(entry);
  }

  #pump(entry: Entry): void {
    if (!this.#isCurrent(entry) || entry.activeSend !== null) return;
    const head = entry.state.batches[0];
    if (head === undefined || (entry.sendCeiling !== null && head.sequence > entry.sendCeiling)) {
      return;
    }
    const send = beginPendingEditSend(entry.state);
    if (send.kind !== "send") return;
    entry.state = send.state;
    this.#publish(entry);
    const request = Object.freeze({
      tabId: entry.binding.tabId,
      clientId: this.#clientId,
      clientSequence: send.batch.sequence,
      baseRevision: send.batch.baseRevision,
      changes: send.batch.changes
    });
    const task = this.#runSend(entry, request);
    entry.activeSend = task;
    void task.then(
      () => this.#finishSend(entry, task),
      () => this.#finishUnexpectedSend(entry, task)
    ).catch(() => {
      // State notification is an injected observer; never leak its failure as an unhandled task.
    });
  }

  async #runSend(entry: Entry, request: ApplyDocumentEditsInput): Promise<void> {
    let gapResends = 0;
    while (this.#isCurrent(entry)) {
      let result: ApplyDocumentEditsResult | null = null;
      for (let attempt = 0; attempt <= this.#maxTransportRetries; attempt += 1) {
        const completion = await Promise.race([
          callApplyPort(this.#ports.applyDocumentEdits, request),
          entry.retirePromise.then(() => ({ kind: "retired" as const }))
        ]);
        if (completion.kind === "retired") return;
        if (completion.kind === "result") {
          result = completion.result;
          break;
        }
        // A rejected attempt is retried with the exact same immutable request.
      }
      if (!this.#isCurrent(entry)) return;
      if (result === null) {
        this.#blockFromClient(entry, "transport-failure");
        return;
      }

      const admission = admitPendingEditResult(entry.state, {
        generation: entry.state.generation,
        result
      });
      entry.state = admission.state;
      switch (admission.kind) {
        case "stale":
          return;
        case "accepted":
          entry.lastOutcome = null;
          this.#publish(entry);
          return;
        case "resend":
          this.#publish(entry);
          if (gapResends === 0) {
            gapResends += 1;
            continue;
          }
          this.#blockFromClient(entry, "repeated-sequence-gap");
          return;
        case "conflict": {
          entry.pendingConflict = admission.conflict;
          const claim = Object.freeze({
            tabId: entry.binding.tabId,
            generation: entry.binding.generation,
            sequence: admission.conflict.sequence,
            canonicalRevision: admission.conflict.canonicalRevision,
            id: this.#nextConflictClaimId++
          });
          entry.pendingConflictClaim = claim;
          const outcome = Object.freeze({
            kind: "conflict" as const,
            conflict: admission.conflict,
            claim
          });
          entry.lastOutcome = outcome;
          entry.pendingOutcome = outcome;
          return;
        }
        case "recovery-required": {
          const outcome = Object.freeze({
            kind: "recovery-required" as const,
            reason: admission.reason,
            recovery: admission.recovery
          });
          entry.lastOutcome = outcome;
          this.#publish(entry, outcome);
          return;
        }
        case "blocked": {
          const error = admission.error === undefined
            ? undefined
            : copyDocumentEditError(admission.error);
          const outcome = Object.freeze({
            kind: "blocked" as const,
            reason: admission.reason,
            ...(error === undefined ? {} : { error })
          });
          entry.lastOutcome = outcome;
          this.#publish(entry, outcome);
          return;
        }
      }
    }
  }

  #finishSend(entry: Entry, task: Promise<void>): void {
    if (entry.activeSend !== task) return;
    entry.activeSend = null;
    this.#publishPendingOutcome(entry);
    this.#signalProgress(entry);
    this.#pump(entry);
  }

  #finishUnexpectedSend(entry: Entry, task: Promise<void>): void {
    if (entry.activeSend !== task) return;
    entry.activeSend = null;
    if (this.#isCurrent(entry)) this.#blockFromClient(entry, "transport-failure");
    this.#signalProgress(entry);
  }

  #blockFromClient(
    entry: Entry,
    reason: "transport-failure" | "repeated-sequence-gap"
  ): void {
    if (!this.#isCurrent(entry)) return;
    const admission = admitPendingEditResult(entry.state, {
      generation: entry.state.generation,
      result: {
        kind: "error",
        error: { code: "internal-error", message: "Document edit transport failed." }
      }
    });
    entry.state = admission.state;
    const outcome = Object.freeze({ kind: "blocked" as const, reason });
    entry.lastOutcome = outcome;
    this.#publish(entry, outcome);
  }

  #installBarrier(tabId: string): BarrierSlot | WorkspaceEditBarrierFailure {
    if (this.#disposed) return Object.freeze({ kind: "stale" });
    const entry = this.#entries.get(tabId);
    if (entry === undefined) {
      return Object.freeze({ kind: "blocked", reason: "unknown-tab" });
    }
    if (entry.barrierToken !== null) {
      return Object.freeze({ kind: "blocked", reason: "barrier-already-active" });
    }
    const token = Symbol(`workspace-edit-barrier:${tabId}`);
    const cutoff = entry.state.nextSequence - 1;
    let resolveCanceled!: () => void;
    const cancelPromise = new Promise<void>((resolve) => {
      resolveCanceled = resolve;
    });
    entry.barrierToken = token;
    entry.sendCeiling = cutoff;
    return {
      entry,
      generation: entry.binding.generation,
      token,
      cutoff,
      cancelPromise,
      resolveCanceled
    };
  }

  async #completeBarrier(slot: BarrierSlot): Promise<BarrierCheckpoint> {
    while (this.#isBarrierCurrent(slot)) {
      const failure = this.#barrierStateFailure(slot.entry);
      if (failure !== null) return failure;
      const waitsForCutoff = slot.entry.state.batches.some(
        (batch) => batch.sequence <= slot.cutoff
      );
      if (!waitsForCutoff) break;
      this.#pump(slot.entry);
      await this.#waitForProgress(slot.entry);
    }
    if (!this.#isBarrierCurrent(slot)) return Object.freeze({ kind: "stale" });

    const request = Object.freeze({
      tabId: slot.entry.binding.tabId,
      clientId: this.#clientId,
      throughSequence: slot.cutoff
    });
    let rawFlushTask: Promise<FlushDocumentEditsResult>;
    try {
      rawFlushTask = this.#ports.flushDocumentEdits(request);
    } catch {
      return Object.freeze({ kind: "blocked", reason: "flush-transport-failure" });
    }
    const flushTask = rawFlushTask.then(
      (result) => ({ kind: "result" as const, result }),
      () => ({ kind: "rejected" as const })
    );
    const completion = await Promise.race([
      flushTask,
      slot.entry.retirePromise.then(() => ({ kind: "retired" as const })),
      slot.cancelPromise.then(() => ({ kind: "canceled" as const }))
    ]);
    if (
      completion.kind === "retired" ||
      completion.kind === "canceled" ||
      !this.#isBarrierCurrent(slot)
    ) {
      return Object.freeze({ kind: "stale" });
    }
    if (completion.kind === "rejected") {
      return Object.freeze({ kind: "blocked", reason: "flush-transport-failure" });
    }
    const result = completion.result;
    if (result.kind === "error") {
      return Object.freeze({
        kind: "blocked",
        reason: "flush-error",
        error: copyDocumentEditError(result.error)
      });
    }
    if (result.kind === "sequence-gap") {
      if (!isValidSequenceGap(result, slot)) {
        return Object.freeze({ kind: "blocked", reason: "invalid-flush-result" });
      }
      return Object.freeze({
        kind: "recovery-required",
        reason: "flush-sequence-gap",
        recovery: Object.freeze({
          localText: slot.entry.state.optimisticText,
          canonicalRevision: result.canonicalRevision
        })
      });
    }
    if (!isValidFlushResult(result, slot.entry.state)) {
      return Object.freeze({ kind: "blocked", reason: "invalid-flush-result" });
    }
    if (result.acknowledgedSequence < slot.cutoff) {
      return Object.freeze({
        kind: "blocked",
        reason: "flush-acknowledgement-mismatch"
      });
    }
    const state = observePendingEditProjection(slot.entry.state, result);
    if (state !== slot.entry.state) {
      slot.entry.state = state;
      this.#publish(slot.entry);
    }
    return Object.freeze({ kind: "checkpointed" });
  }

  #barrierStateFailure(entry: Entry): WorkspaceEditBarrierFailure | null {
    const outcome = entry.lastOutcome;
    if (outcome?.kind === "recovery-required") {
      return Object.freeze({
        kind: "recovery-required",
        reason: outcome.reason,
        recovery: outcome.recovery
      });
    }
    if (outcome?.kind === "blocked") {
      return Object.freeze({
        kind: "blocked",
        reason: outcome.reason,
        ...(outcome.error === undefined ? {} : { error: outcome.error })
      });
    }
    if (outcome?.kind === "conflict") {
      return Object.freeze({ kind: "conflict", conflict: outcome.conflict });
    }
    if (entry.state.status === "rebasing") {
      return Object.freeze({ kind: "blocked", reason: "queue-not-ready" });
    }
    if (entry.state.status !== "ready") {
      return Object.freeze({ kind: "blocked", reason: "queue-not-ready" });
    }
    return null;
  }

  #createLease(slots: readonly BarrierSlot[]): WorkspaceEditBarrierLease {
    let released = false;
    return Object.freeze({
      release: () => {
        if (released) return;
        released = true;
        for (const slot of slots) this.#releaseBarrier(slot);
      }
    });
  }

  #releaseBarrier(slot: BarrierSlot): void {
    if (
      slot.entry.binding.generation !== slot.generation ||
      slot.entry.barrierToken !== slot.token
    ) {
      return;
    }
    slot.entry.barrierToken = null;
    slot.entry.sendCeiling = null;
    slot.resolveCanceled();
    this.#signalProgress(slot.entry);
    this.#pump(slot.entry);
  }

  #retireEntry(entry: Entry): void {
    entry.state = retirePendingEditQueue(entry.state);
    entry.pendingConflict = null;
    entry.pendingResolution = null;
    entry.pendingOutcome = null;
    entry.barrierToken = null;
    entry.sendCeiling = null;
    entry.resolveRetired();
    this.#signalProgress(entry);
    this.#publish(entry);
  }

  #publish(entry: Entry, outcome?: WorkspaceEditClientOutcome): void {
    this.#signalProgress(entry);
    const change = Object.freeze({
      binding: entry.binding,
      state: entry.state,
      isDirty: isPendingEditQueueDirty(entry.state),
      ...(outcome === undefined ? {} : { outcome })
    });
    try {
      this.#ports.notifyState(change);
    } catch {
      // External observers cannot participate in the edit protocol state machine.
    }
  }

  #publishPendingOutcome(entry: Entry): void {
    const outcome = entry.pendingOutcome;
    if (outcome === null) return;
    // Take before invoking the observer. Re-entrant publication, later sends and resolution
    // transitions must not deliver the same protocol event twice.
    entry.pendingOutcome = null;
    this.#publish(entry, outcome);
  }

  #waitForProgress(entry: Entry): Promise<void> {
    return new Promise((resolve) => {
      entry.progressWaiters.add(resolve);
    });
  }

  #signalProgress(entry: Entry): void {
    const waiters = [...entry.progressWaiters];
    entry.progressWaiters.clear();
    for (const resolve of waiters) resolve();
  }

  #currentEntry(binding: WorkspaceEditTabBinding): Entry | null {
    if (this.#disposed) return null;
    const entry = this.#entries.get(binding.tabId);
    return entry?.binding.generation === binding.generation ? entry : null;
  }

  #isCurrent(entry: Entry): boolean {
    return !this.#disposed && this.#entries.get(entry.binding.tabId) === entry;
  }

  #isBarrierCurrent(slot: BarrierSlot): boolean {
    return this.#isCurrent(slot.entry) &&
      slot.entry.binding.generation === slot.generation &&
      slot.entry.barrierToken === slot.token;
  }
}

function isValidProjection(input: {
  readonly revision: number;
  readonly savedRevision: number;
  readonly isDirty: boolean;
}): boolean {
  return Number.isSafeInteger(input.revision) &&
    input.revision >= 0 &&
    Number.isSafeInteger(input.savedRevision) &&
    input.savedRevision >= 0 &&
    input.savedRevision <= input.revision &&
    input.isDirty === (input.revision !== input.savedRevision);
}

function isValidFlushResult(
  input: Extract<FlushDocumentEditsResult, { kind: "flushed" }>,
  state: PendingEditQueueState
): boolean {
  return Number.isSafeInteger(input.acknowledgedSequence) &&
    input.acknowledgedSequence >= 0 &&
    input.revision >= state.acknowledgedTextRevision &&
    isValidProjection(input);
}

function isValidSequenceGap(
  input: Extract<FlushDocumentEditsResult, { kind: "sequence-gap" }>,
  slot: BarrierSlot
): boolean {
  return Number.isSafeInteger(input.expectedSequence) &&
    input.expectedSequence >= 1 &&
    input.expectedSequence <= slot.cutoff &&
    Number.isSafeInteger(input.canonicalRevision) &&
    input.canonicalRevision >= slot.entry.state.acknowledgedTextRevision;
}

function callApplyPort(
  apply: WorkspaceEditClientPorts["applyDocumentEdits"],
  request: ApplyDocumentEditsInput
): Promise<
  | { readonly kind: "result"; readonly result: ApplyDocumentEditsResult }
  | { readonly kind: "rejected" }
> {
  try {
    return apply(request).then(
      (result) => ({ kind: "result" as const, result }),
      () => ({ kind: "rejected" as const })
    );
  } catch {
    return Promise.resolve({ kind: "rejected" as const });
  }
}

function copyDocumentEditError(error: DocumentEditError): DocumentEditError {
  return Object.freeze({ code: error.code, message: error.message });
}

async function firstBarrierFailure(
  tasks: readonly {
    readonly tabId: string;
    readonly task: Promise<BarrierCheckpoint>;
  }[]
): Promise<{
  readonly tabId: string;
  readonly result: Exclude<BarrierCheckpoint, { kind: "checkpointed" }>;
} | undefined> {
  if (tasks.length === 0) return undefined;
  return new Promise((resolve) => {
    let remaining = tasks.length;
    for (const { tabId, task } of tasks) {
      void task.then(
        (result) => {
          if (result.kind !== "checkpointed") {
            resolve({ tabId, result });
            return;
          }
          remaining -= 1;
          if (remaining === 0) resolve(undefined);
        },
        () => resolve({
          tabId,
          result: { kind: "blocked", reason: "flush-transport-failure" }
        })
      );
    }
  });
}
