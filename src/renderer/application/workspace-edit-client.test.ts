import { describe, expect, test, vi } from "vitest";

import type {
  ApplyDocumentEditsInput,
  ApplyDocumentEditsResult,
  FlushDocumentEditsInput,
  FlushDocumentEditsResult
} from "../../shared/document-edit";
import type { DocumentProjectionEvent } from "../../shared/document-projection";
import {
  WorkspaceEditClient,
  type WorkspaceEditAllBarrierResult,
  type WorkspaceEditClientPorts,
  type WorkspaceEditClientStateChange
} from "./workspace-edit-client";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function applied(input: ApplyDocumentEditsInput): ApplyDocumentEditsResult {
  return {
    kind: "applied",
    acknowledgedSequence: input.clientSequence,
    revision: input.baseRevision + 1,
    isDirty: true
  };
}

function createHarness(input?: {
  readonly apply?: (request: ApplyDocumentEditsInput) => Promise<ApplyDocumentEditsResult>;
  readonly flush?: (request: FlushDocumentEditsInput) => Promise<FlushDocumentEditsResult>;
  readonly maxTransportRetries?: number;
  readonly windowId?: string | null;
  readonly clientId?: string;
  readonly autoStart?: boolean;
  readonly notifyState?: (change: WorkspaceEditClientStateChange) => void;
  readonly detachProjection?: () => void;
}) {
  const changes: WorkspaceEditClientStateChange[] = [];
  let projectionListener: ((event: DocumentProjectionEvent) => void) | null = null;
  const detachProjection = vi.fn(input?.detachProjection ?? (() => {}));
  const createClientId = vi.fn(() => input?.clientId ?? "renderer-client-1");
  const applyDocumentEdits = vi.fn(
    input?.apply ?? (async (request: ApplyDocumentEditsInput) => applied(request))
  );
  const flushDocumentEdits = vi.fn(
    input?.flush ??
      (async (request: FlushDocumentEditsInput): Promise<FlushDocumentEditsResult> => ({
        kind: "flushed",
        acknowledgedSequence: request.throughSequence,
        revision: request.throughSequence,
        savedRevision: 0,
        isDirty: request.throughSequence > 0
      }))
  );
  const ports: WorkspaceEditClientPorts = {
    createClientId,
    applyDocumentEdits,
    flushDocumentEdits,
    subscribeDocumentProjection(listener) {
      projectionListener = listener;
      return detachProjection;
    },
    notifyState(change) {
      changes.push(change);
      input?.notifyState?.(change);
    }
  };
  const client = new WorkspaceEditClient({
    windowId: input?.windowId === undefined ? "window-1" : input.windowId,
    ports,
    maxTransportRetries: input?.maxTransportRetries
  });
  if (input?.autoStart ?? true) client.start();
  return {
    client,
    changes,
    createClientId,
    applyDocumentEdits,
    flushDocumentEdits,
    detachProjection,
    project(event: DocumentProjectionEvent) {
      if (projectionListener === null) throw new Error("Projection listener was not installed.");
      projectionListener(event);
    }
  };
}

function hydrate(client: WorkspaceEditClient, tabId = "tab-1", text = "alpha") {
  return client.hydrateTab({
    tabId,
    text,
    revision: 0,
    savedRevision: 0,
    isDirty: false
  });
}

test("retains an exact discarded adapter text as a typed recovery outcome", () => {
  const harness = createHarness();
  const binding = hydrate(harness.client, "tab-a", "alpha");

  expect(harness.client.retainAdapterDiscard(binding, "alpha local")).toMatchObject({
    kind: "recovery-required",
    reason: "adapter-discarded",
    recovery: { localText: "alpha local", canonicalRevision: 0 }
  });
  expect(harness.client.getTabState("tab-a")?.status).toBe("recovering");
  expect(harness.client.getTabState("tab-a")?.optimisticText).toBe("alpha local");
});

test("starts projection delivery only for a committed client lifecycle", () => {
  const harness = createHarness({ autoStart: false });

  expect(harness.detachProjection).not.toHaveBeenCalled();
  harness.client.start();
  harness.client.stop();
  harness.client.start();
  harness.client.dispose();

  expect(harness.detachProjection).toHaveBeenCalledTimes(2);
});

function append(client: WorkspaceEditClient, binding: ReturnType<typeof hydrate>, text: string) {
  const state = client.getTabState(binding.tabId);
  if (state === null) throw new Error("Expected hydrated tab.");
  const baseText = state.optimisticText;
  return client.admitFrame({
    binding,
    baseText,
    resultingText: baseText + text,
    changes: [{ from: baseText.length, to: baseText.length, insert: text }]
  });
}

describe("WorkspaceEditClient queue ownership and transport", () => {
  test("creates one client ID for its lifetime and starts each tab sequence at one", async () => {
    const harness = createHarness();
    const first = hydrate(harness.client, "tab-a");
    const second = hydrate(harness.client, "tab-b");

    append(harness.client, first, "!");
    append(harness.client, second, "?");
    await settle();

    expect(harness.createClientId).toHaveBeenCalledTimes(1);
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(2);
    expect(harness.applyDocumentEdits.mock.calls.map(([request]) => request)).toEqual([
      expect.objectContaining({ tabId: "tab-a", clientId: "renderer-client-1", clientSequence: 1 }),
      expect.objectContaining({ tabId: "tab-b", clientId: "renderer-client-1", clientSequence: 1 })
    ]);
  });

  test("preserves the assigned sequence high-water across same-tab retirement and rehydration", async () => {
    const harness = createHarness();
    const first = hydrate(harness.client, "tab-a");
    append(harness.client, first, "1");
    await settle();
    expect(harness.applyDocumentEdits.mock.calls[0]?.[0].clientSequence).toBe(1);

    expect(harness.client.retireTab(first)).toBe(true);
    const rebound = hydrate(harness.client, "tab-a", "alpha1");
    append(harness.client, rebound, "2");
    const freshTab = hydrate(harness.client, "tab-b");
    append(harness.client, freshTab, "x");
    await settle();

    expect(harness.applyDocumentEdits.mock.calls.map(([request]) => ({
      tabId: request.tabId,
      sequence: request.clientSequence
    }))).toEqual([
      { tabId: "tab-a", sequence: 1 },
      { tabId: "tab-a", sequence: 2 },
      { tabId: "tab-b", sequence: 1 }
    ]);
    expect(harness.client.getTabState("tab-a")?.acknowledgedText).toBe("alpha12");
  });

  test.each(["", " invalid", "invalid/id", "a".repeat(129)])(
    "rejects a client ID outside the shared wire format",
    (clientId) => {
      expect(() => createHarness({ clientId })).toThrow("wire format");
    }
  );

  test("admits an already sealed frame immediately and validates its exact text boundary", async () => {
    const pending = deferred<ApplyDocumentEditsResult>();
    const harness = createHarness({ apply: () => pending.promise });
    const binding = hydrate(harness.client);

    expect(append(harness.client, binding, "!")).toMatchObject({ kind: "admitted", sequence: 1 });
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(1);
    expect(harness.applyDocumentEdits).toHaveBeenCalledWith({
      tabId: "tab-1",
      clientId: "renderer-client-1",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 5, to: 5, insert: "!" }]
    });

    expect(harness.client.admitFrame({
      binding,
      baseText: "stale",
      resultingText: "stale?",
      changes: [{ from: 5, to: 5, insert: "?" }]
    })).toMatchObject({ kind: "invalid-frame", reason: "base-text-mismatch" });
    expect(harness.client.getTabState("tab-1")?.optimisticText).toBe("alpha!");
  });

  test("distinguishes malformed changes from a non-ready queue", () => {
    const harness = createHarness();
    const binding = hydrate(harness.client);

    expect(harness.client.admitFrame({
      binding,
      baseText: "alpha",
      resultingText: "invalid",
      changes: [{ from: 99, to: 99, insert: "!" }]
    })).toMatchObject({ kind: "invalid-frame", reason: "invalid-changes" });
  });

  test("keeps one request in flight per tab while allowing different tabs concurrently", async () => {
    const pending = new Map<string, Deferred<ApplyDocumentEditsResult>>();
    const harness = createHarness({
      apply: (request) => {
        const key = `${request.tabId}:${request.clientSequence}`;
        const task = deferred<ApplyDocumentEditsResult>();
        pending.set(key, task);
        return task.promise;
      }
    });
    const first = hydrate(harness.client, "tab-a");
    const second = hydrate(harness.client, "tab-b");

    append(harness.client, first, "1");
    append(harness.client, first, "2");
    append(harness.client, second, "x");
    expect(harness.applyDocumentEdits.mock.calls.map(([request]) =>
      `${request.tabId}:${request.clientSequence}`)).toEqual(["tab-a:1", "tab-b:1"]);

    pending.get("tab-a:1")?.resolve(applied(harness.applyDocumentEdits.mock.calls[0]![0]));
    await settle();
    expect(harness.applyDocumentEdits.mock.calls.map(([request]) =>
      `${request.tabId}:${request.clientSequence}`)).toEqual(["tab-a:1", "tab-b:1", "tab-a:2"]);
  });

  test("retires an exact duplicate but projection before acknowledgement changes metadata only", async () => {
    const pending = deferred<ApplyDocumentEditsResult>();
    const harness = createHarness({ apply: () => pending.promise });
    const binding = hydrate(harness.client);
    append(harness.client, binding, "!");

    harness.project({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 7, savedRevision: 7, isDirty: false }
    });
    expect(harness.client.getTabState("tab-1")).toMatchObject({
      acknowledgedText: "alpha",
      acknowledgedTextRevision: 0,
      observedRevision: 7,
      optimisticText: "alpha!",
      batches: [expect.objectContaining({ sequence: 1 })]
    });

    pending.resolve({
      kind: "duplicate",
      acknowledgedSequence: 1,
      revision: 7,
      isDirty: false
    });
    await settle();
    expect(harness.client.getTabState("tab-1")).toMatchObject({
      acknowledgedText: "alpha!",
      acknowledgedTextRevision: 1,
      observedRevision: 7,
      batches: []
    });
  });

  test("ignores projections from another window or unknown tab", () => {
    const harness = createHarness();
    hydrate(harness.client);
    const before = harness.client.getTabState("tab-1");

    harness.project({
      windowId: "window-2",
      projection: { tabId: "tab-1", revision: 4, savedRevision: 4, isDirty: false }
    });
    harness.project({
      windowId: "window-1",
      projection: { tabId: "unknown", revision: 4, savedRevision: 4, isDirty: false }
    });

    expect(harness.client.getTabState("tab-1")).toBe(before);
  });

  test("ignores projections until the owning window is bound and rejects non-monotonic metadata", () => {
    const harness = createHarness({ windowId: null });
    hydrate(harness.client);
    harness.project({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 4, savedRevision: 4, isDirty: false }
    });
    expect(harness.client.getTabState("tab-1")?.observedRevision).toBe(0);

    harness.client.bindWindow("window-1");
    harness.project({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 4, savedRevision: 4, isDirty: false }
    });
    harness.project({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 3, savedRevision: 3, isDirty: false }
    });
    expect(harness.client.getTabState("tab-1")).toMatchObject({
      acknowledgedTextRevision: 0,
      observedRevision: 4,
      observedSavedRevision: 4
    });
  });

  test("keeps an established live window binding immutable while allowing idempotent rebinding", () => {
    const harness = createHarness({ windowId: null });
    harness.client.bindWindow("window-1");
    hydrate(harness.client);

    expect(() => harness.client.bindWindow("window-1")).not.toThrow();
    expect(() => harness.client.bindWindow("window-2")).toThrow(
      "Cannot switch the workspace window while tabs are live"
    );
    harness.project({
      windowId: "window-2",
      projection: { tabId: "tab-1", revision: 4, savedRevision: 4, isDirty: false }
    });
    expect(harness.client.getTabState("tab-1")?.observedRevision).toBe(0);
  });

  test("retries rejected transport with the identical frozen request and a bounded count", async () => {
    const requests: ApplyDocumentEditsInput[] = [];
    const harness = createHarness({
      maxTransportRetries: 2,
      apply: async (request) => {
        requests.push(request);
        if (requests.length < 3) throw new Error("offline");
        return applied(request);
      }
    });
    append(harness.client, hydrate(harness.client), "!");
    await settle();

    expect(requests).toHaveLength(3);
    expect(requests[1]).toBe(requests[0]);
    expect(requests[2]).toBe(requests[0]);
    expect(Object.isFrozen(requests[0])).toBe(true);
    expect(harness.client.getTabState("tab-1")?.batches).toHaveLength(0);
  });

  test("retains pending data and publishes a typed blocked outcome after retry exhaustion", async () => {
    const harness = createHarness({
      maxTransportRetries: 1,
      apply: async () => { throw new Error("offline"); }
    });
    append(harness.client, hydrate(harness.client), "!");
    await settle();

    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(2);
    expect(harness.client.getTabState("tab-1")).toMatchObject({
      status: "blocked",
      optimisticText: "alpha!",
      batches: [expect.objectContaining({ sequence: 1 })]
    });
    expect(harness.changes.at(-1)?.outcome).toMatchObject({
      kind: "blocked",
      reason: "transport-failure"
    });
  });

  test("retains typed protocol errors and republishes their exact error", async () => {
    const error = { code: "tab-owner-changed" as const, message: "owner changed" };
    const harness = createHarness({
      apply: async () => ({
        kind: "error",
        error
      })
    });
    append(harness.client, hydrate(harness.client), "!");
    await settle();

    expect(harness.client.getTabState("tab-1")?.batches).toHaveLength(1);
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(1);
    expect(harness.changes.at(-1)?.outcome).toMatchObject({
      kind: "blocked",
      reason: "server-error",
      error: { code: "tab-owner-changed", message: "owner changed" }
    });
    const publishedOutcome = harness.changes.at(-1)?.outcome;
    const publishedError = publishedOutcome?.kind === "blocked"
      ? publishedOutcome.error
      : undefined;
    error.message = "mutated after delivery";
    expect(publishedError).toEqual({ code: "tab-owner-changed", message: "owner changed" });
    expect(Object.isFrozen(publishedError)).toBe(true);
  });

  test("resends a retained gap head with its exact payload", async () => {
    const requests: ApplyDocumentEditsInput[] = [];
    const harness = createHarness({
      apply: async (request) => {
        requests.push(request);
        return requests.length === 1
          ? { kind: "sequence-gap", expectedSequence: 1, canonicalRevision: 0 }
          : applied(request);
      }
    });
    append(harness.client, hydrate(harness.client), "!");
    await settle();

    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(requests[0]);
    expect(harness.client.getTabState("tab-1")?.batches).toHaveLength(0);
  });

  test("bounds repeated sequence-gap responses instead of creating a hot loop", async () => {
    const harness = createHarness({
      apply: async () => ({ kind: "sequence-gap", expectedSequence: 1, canonicalRevision: 0 })
    });
    append(harness.client, hydrate(harness.client), "!");
    await settle();

    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(2);
    expect(harness.client.getTabState("tab-1")).toMatchObject({
      status: "blocked",
      batches: [expect.objectContaining({ sequence: 1 })]
    });
    expect(harness.changes.at(-1)?.outcome).toMatchObject({
      kind: "blocked",
      reason: "repeated-sequence-gap"
    });
  });

  test("publishes exact recovery data when a sequence gap cannot be satisfied", async () => {
    const harness = createHarness({
      apply: async () => ({ kind: "sequence-gap", expectedSequence: 2, canonicalRevision: 0 })
    });
    append(harness.client, hydrate(harness.client), "!");
    await settle();

    expect(harness.client.getTabState("tab-1")?.status).toBe("recovering");
    expect(harness.changes.at(-1)?.outcome).toMatchObject({
      kind: "recovery-required",
      reason: "missing-sequence",
      recovery: { localText: "alpha!", canonicalRevision: 0 }
    });
  });

  test("publishes conflict first, then returns a safe patch or exact recovery on explicit resolution", async () => {
    const safe = createHarness({
      apply: async () => ({
        kind: "revision-conflict",
        canonicalRevision: 1,
        canonicalText: "alpha REMOTE",
        isDirty: true
      })
    });
    const safeBinding = hydrate(safe.client, "tab-1", "alpha omega");
    safe.client.admitFrame({
      binding: safeBinding,
      baseText: "alpha omega",
      resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await settle();
    expect(safe.changes.at(-1)?.outcome).toMatchObject({ kind: "conflict" });
    const safeResolution = safe.client.prepareConflictResolution(safeBinding);
    expect(safeResolution).toMatchObject({
      kind: "rebased",
      canonicalText: "alpha REMOTE",
      canonicalRevision: 1,
      canonicalIsDirty: true,
      remoteOnOptimistic: { from: 6, to: 11, insert: "REMOTE" },
      rebasedText: "LOCAL REMOTE"
    });
    expect(safe.applyDocumentEdits).toHaveBeenCalledTimes(1);
    if (safeResolution.kind !== "rebased") throw new Error("Expected safe rebase.");
    expect(safe.client.admitFrame({
      binding: safeBinding,
      baseText: "LOCAL omega",
      resultingText: "LOCAL omega!",
      changes: [{ from: 11, to: 11, insert: "!" }]
    })).toMatchObject({ kind: "invalid-frame", reason: "resolution-pending" });
    expect(safe.client.commitConflictResolution(safeBinding, safeResolution.resolution)).toMatchObject({
      kind: "committed",
      outcome: { kind: "rebased" }
    });
    expect(safe.applyDocumentEdits).toHaveBeenCalledTimes(2);

    const ambiguous = createHarness({
      apply: async () => ({
        kind: "revision-conflict",
        canonicalRevision: 1,
        canonicalText: "alpha REMOTE",
        isDirty: true
      })
    });
    const ambiguousBinding = hydrate(ambiguous.client, "tab-1", "alpha omega");
    ambiguous.client.admitFrame({
      binding: ambiguousBinding,
      baseText: "alpha omega",
      resultingText: "alpha LOCAL",
      changes: [{ from: 6, to: 11, insert: "LOCAL" }]
    });
    await settle();
    expect(ambiguous.changes.at(-1)?.outcome).toMatchObject({ kind: "conflict" });
    const ambiguousResolution = ambiguous.client.prepareConflictResolution(ambiguousBinding);
    expect(ambiguousResolution).toMatchObject({
      kind: "recovery-required",
      reason: "ambiguous-overlap",
      recovery: { localText: "alpha LOCAL", canonicalText: "alpha REMOTE" }
    });
    if (ambiguousResolution.kind !== "recovery-required") {
      throw new Error("Expected recovery resolution.");
    }
    expect(ambiguous.client.commitConflictResolution(
      ambiguousBinding,
      ambiguousResolution.resolution!
    )).toMatchObject({ kind: "committed" });
  });

  test("publishes each conflict outcome exactly once across resolution and later frames", async () => {
    let firstAttempts = 0;
    const harness = createHarness({
      apply: async (request) => {
        if (request.tabId === "tab-a" && firstAttempts++ === 0) {
          return { kind: "revision-conflict", canonicalRevision: 1, canonicalText: "alpha REMOTE", isDirty: true };
        }
        return applied(request);
      }
    });
    const first = hydrate(harness.client, "tab-a", "alpha omega");
    const second = hydrate(harness.client, "tab-b", "second");
    harness.client.admitFrame({
      binding: first, baseText: "alpha omega", resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    append(harness.client, second, "!");
    await settle();
    const resolution = harness.client.prepareConflictResolution(first);
    if (resolution.kind !== "rebased") throw new Error("Expected safe rebase.");
    harness.client.commitConflictResolution(first, resolution.resolution);
    await settle();
    append(harness.client, first, "?");
    append(harness.client, second, "?");
    await settle();

    expect(harness.changes.filter((change) => change.binding.tabId === "tab-a" &&
      change.outcome?.kind === "conflict")).toHaveLength(1);
    expect(harness.changes.filter((change) => change.binding.tabId === "tab-b" &&
      change.outcome?.kind === "conflict")).toHaveLength(0);
  });

  test("merges projection metadata observed between conflict preparation and commit", async () => {
    const harness = createHarness({
      apply: async () => ({
        kind: "revision-conflict",
        canonicalRevision: 1,
        canonicalText: "alpha REMOTE",
        isDirty: true
      })
    });
    const binding = hydrate(harness.client, "tab-1", "alpha omega");
    harness.client.admitFrame({
      binding,
      baseText: "alpha omega",
      resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await settle();
    const prepared = harness.client.prepareConflictResolution(binding);
    expect(prepared.kind).toBe("rebased");
    if (prepared.kind !== "rebased") throw new Error("Expected safe rebase.");

    harness.project({
      windowId: "window-1",
      projection: { tabId: "tab-1", revision: 7, savedRevision: 7, isDirty: false }
    });
    harness.client.commitConflictResolution(binding, prepared.resolution);

    expect(harness.client.getTabState("tab-1")).toMatchObject({
      acknowledgedTextRevision: 1,
      observedRevision: 7,
      observedSavedRevision: 7,
      observedIsDirty: false
    });
  });

  test("retains a late sealed frame while rebasing and does not send before patch commit", async () => {
    const harness = createHarness({
      apply: async () => ({
        kind: "revision-conflict",
        canonicalRevision: 1,
        canonicalText: "alpha REMOTE",
        isDirty: true
      })
    });
    const binding = hydrate(harness.client, "tab-1", "alpha omega");
    harness.client.admitFrame({
      binding,
      baseText: "alpha omega",
      resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await settle();

    expect(harness.client.admitFrame({
      binding,
      baseText: "LOCAL omega",
      resultingText: "LOCAL! omega",
      changes: [{ from: 5, to: 5, insert: "!" }]
    })).toMatchObject({ kind: "admitted", sequence: 2 });
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(1);
    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "conflict",
      conflict: { sequence: 1 }
    });
    const prepared = harness.client.prepareConflictResolution(binding);
    expect(prepared).toMatchObject({ kind: "rebased", rebasedText: "LOCAL! REMOTE" });
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(1);
    if (prepared.kind !== "rebased") throw new Error("Expected safe rebase.");
    harness.client.commitConflictResolution(binding, prepared.resolution);
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(2);
  });

  test("uses the folded live-queue sequence as the cross-incarnation tombstone after rebase", async () => {
    let applyCount = 0;
    const harness = createHarness({
      apply: async (request) => {
        applyCount += 1;
        if (applyCount === 1) {
          return {
            kind: "revision-conflict",
            canonicalRevision: 1,
            canonicalText: "alpha REMOTE",
            isDirty: true
          };
        }
        return applied(request);
      }
    });
    let binding = hydrate(harness.client, "tab-1", "alpha omega");
    harness.client.admitFrame({
      binding,
      baseText: "alpha omega",
      resultingText: "LOCAL omega",
      changes: [{ from: 0, to: 5, insert: "LOCAL" }]
    });
    await settle();
    harness.client.admitFrame({
      binding,
      baseText: "LOCAL omega",
      resultingText: "LOCAL! omega",
      changes: [{ from: 5, to: 5, insert: "!" }]
    });
    const prepared = harness.client.prepareConflictResolution(binding);
    expect(prepared.kind).toBe("rebased");
    if (prepared.kind !== "rebased") throw new Error("Expected safe rebase.");
    harness.client.commitConflictResolution(binding, prepared.resolution);
    await settle();

    let state = harness.client.getTabState("tab-1");
    expect(state).toMatchObject({
      acknowledgedText: "LOCAL! REMOTE",
      acknowledgedTextRevision: 2,
      nextSequence: 2,
      batches: []
    });
    if (state === null) throw new Error("Expected acknowledged rebased state.");
    harness.client.retireTab(binding);
    binding = harness.client.hydrateTab({
      tabId: "tab-1",
      text: state.acknowledgedText,
      revision: state.acknowledgedTextRevision,
      savedRevision: 0,
      isDirty: true
    });
    append(harness.client, binding, "?");
    await settle();

    state = harness.client.getTabState("tab-1");
    expect(state?.nextSequence).toBe(3);
    if (state === null) throw new Error("Expected sequence-two acknowledged state.");
    harness.client.retireTab(binding);
    binding = harness.client.hydrateTab({
      tabId: "tab-1",
      text: state.acknowledgedText,
      revision: state.acknowledgedTextRevision,
      savedRevision: 0,
      isDirty: true
    });
    append(harness.client, binding, "#");
    await settle();

    expect(harness.applyDocumentEdits.mock.calls.map(
      ([request]) => request.clientSequence
    )).toEqual([1, 1, 2, 3]);
    expect(harness.client.getTabState("tab-1")?.batches).toHaveLength(0);
  });

  test("fences frames and apply results from retired bindings and disposal", async () => {
    const pending = deferred<ApplyDocumentEditsResult>();
    const harness = createHarness({ apply: () => pending.promise });
    const oldBinding = hydrate(harness.client);
    append(harness.client, oldBinding, "!");
    const newBinding = hydrate(harness.client, "tab-1", "new");

    expect(append(harness.client, oldBinding, " stale")).toMatchObject({ kind: "stale" });
    pending.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
    await settle();
    expect(harness.client.getTabState("tab-1")?.optimisticText).toBe("new");

    harness.client.dispose();
    expect(harness.client.admitFrame({
      binding: newBinding,
      baseText: "new",
      resultingText: "new ignored",
      changes: [{ from: 3, to: 3, insert: " ignored" }]
    })).toMatchObject({ kind: "stale" });
    harness.client.dispose();
    expect(harness.detachProjection).toHaveBeenCalledTimes(1);
  });

  test("cancels a never-settling apply attempt on retirement without starting another retry", async () => {
    const pending = deferred<ApplyDocumentEditsResult>();
    const harness = createHarness({
      maxTransportRetries: 2,
      apply: () => pending.promise
    });
    const binding = hydrate(harness.client);
    append(harness.client, binding, "!");
    const barrier = harness.client.acquireFlushBarrier("tab-1");

    expect(harness.client.retireTab(binding)).toBe(true);
    await expect(barrier).resolves.toEqual({ kind: "stale" });
    pending.reject(new Error("late transport rejection"));
    await settle();
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(1);
  });

  test("isolates throwing state observers so protocol state and barriers still progress", async () => {
    const harness = createHarness({
      notifyState: () => { throw new Error("observer failed"); }
    });

    let binding: ReturnType<typeof hydrate> | null = null;
    expect(() => { binding = hydrate(harness.client); }).not.toThrow();
    if (binding === null) throw new Error("Expected binding.");
    expect(() => append(harness.client, binding!, "!")).not.toThrow();
    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "acquired"
    });
  });

  test("does not delete a newer tab created reentrantly from retirement notification", () => {
    const holder: { client: WorkspaceEditClient | null } = { client: null };
    let rebound: ReturnType<typeof hydrate> | null = null;
    let didReenter = false;
    const harness = createHarness({
      notifyState(change) {
        if (change.state.status !== "retired" || didReenter) return;
        didReenter = true;
        if (holder.client === null) throw new Error("Client was not installed.");
        rebound = hydrate(holder.client, change.binding.tabId, "reentrant");
      }
    });
    const client = harness.client;
    holder.client = client;
    const original = hydrate(client);

    expect(client.retireTab(original)).toBe(true);
    expect(rebound).not.toBeNull();
    expect(client.getTabState("tab-1")?.optimisticText).toBe("reentrant");
  });

  test("does not overwrite a newer reentrant hydration during replacement notification", () => {
    const holder: { client: WorkspaceEditClient | null } = { client: null };
    let didReenter = false;
    let replacementStarted = false;
    let newest: ReturnType<typeof hydrate> | null = null;
    const harness = createHarness({
      notifyState(change) {
        if (!replacementStarted || change.state.status !== "retired" || didReenter) return;
        didReenter = true;
        if (holder.client === null) throw new Error("Client was not installed.");
        newest = hydrate(holder.client, change.binding.tabId, "newest");
      }
    });
    const client = harness.client;
    holder.client = client;
    hydrate(client, "tab-1", "old");
    replacementStarted = true;

    const outer = hydrate(client, "tab-1", "outer");
    expect(newest).not.toBeNull();
    expect(client.getTabState("tab-1")?.optimisticText).toBe("newest");
    expect(client.admitFrame({
      binding: outer,
      baseText: "outer",
      resultingText: "outer!",
      changes: [{ from: 5, to: 5, insert: "!" }]
    })).toEqual({ kind: "stale" });
  });

  test("continues disposal when detach and state observers throw, and detaches exactly once", () => {
    const harness = createHarness({
      detachProjection: () => { throw new Error("detach failed"); },
      notifyState: () => { throw new Error("observer failed"); }
    });
    const binding = hydrate(harness.client);

    expect(() => harness.client.dispose()).not.toThrow();
    expect(() => harness.client.dispose()).not.toThrow();
    expect(harness.detachProjection).toHaveBeenCalledTimes(1);
    expect(harness.client.admitFrame({
      binding,
      baseText: "alpha",
      resultingText: "alpha!",
      changes: [{ from: 5, to: 5, insert: "!" }]
    })).toEqual({ kind: "stale" });
  });
});

describe("WorkspaceEditClient flush barrier leases", () => {
  test("rejects a nested barrier synchronously and keeps the first lease authoritative", async () => {
    const flush = deferred<FlushDocumentEditsResult>();
    const harness = createHarness({ flush: () => flush.promise });
    hydrate(harness.client);

    const first = harness.client.acquireFlushBarrier("tab-1");
    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toEqual({
      kind: "blocked",
      reason: "barrier-already-active"
    });
    flush.resolve({
      kind: "flushed",
      acknowledgedSequence: 0,
      revision: 0,
      savedRevision: 0,
      isDirty: false
    });
    const acquired = await first;
    expect(acquired.kind).toBe("acquired");
    if (acquired.kind === "acquired") acquired.lease.release();
  });

  test("settles a barrier with the exact typed conflict before resolution", async () => {
    const harness = createHarness({
      apply: async () => ({
        kind: "revision-conflict",
        canonicalRevision: 1,
        canonicalText: "remote",
        isDirty: true
      })
    });
    append(harness.client, hydrate(harness.client), "!");

    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "conflict",
      conflict: { sequence: 1, canonicalText: "remote" }
    });
    expect(harness.flushDocumentEdits).not.toHaveBeenCalled();
  });

  test("captures an exact cutoff, waits through it, and holds tail sends until release", async () => {
    const applies = new Map<number, Deferred<ApplyDocumentEditsResult>>();
    const flush = deferred<FlushDocumentEditsResult>();
    const harness = createHarness({
      apply: (request) => {
        const task = deferred<ApplyDocumentEditsResult>();
        applies.set(request.clientSequence, task);
        return task.promise;
      },
      flush: () => flush.promise
    });
    const binding = hydrate(harness.client);
    append(harness.client, binding, "1");
    append(harness.client, binding, "2");

    const barrierPromise = harness.client.acquireFlushBarrier("tab-1");
    append(harness.client, binding, "3");
    applies.get(1)?.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
    await settle();
    applies.get(2)?.resolve({ kind: "applied", acknowledgedSequence: 2, revision: 2, isDirty: true });
    await settle();

    expect(harness.applyDocumentEdits.mock.calls.map(([request]) => request.clientSequence)).toEqual([1, 2]);
    expect(harness.flushDocumentEdits).toHaveBeenCalledWith({
      tabId: "tab-1",
      clientId: "renderer-client-1",
      throughSequence: 2
    });
    flush.resolve({
      kind: "flushed",
      acknowledgedSequence: 2,
      revision: 2,
      savedRevision: 0,
      isDirty: true
    });
    const barrier = await barrierPromise;
    expect(barrier).toMatchObject({ kind: "acquired", cutoff: 2 });
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(2);
    if (barrier.kind !== "acquired") throw new Error("Expected acquired barrier.");

    barrier.lease.release();
    await settle();
    expect(harness.applyDocumentEdits.mock.calls.map(([request]) => request.clientSequence)).toEqual([1, 2, 3]);
    barrier.lease.release();
  });

  test("does not let a failed apply or failed main checkpoint discard pending work", async () => {
    const applyFailure = createHarness({
      apply: async () => ({
        kind: "error",
        error: { code: "tab-owner-changed", message: "owner changed" }
      })
    });
    append(applyFailure.client, hydrate(applyFailure.client), "!");
    const applyBarrier = await applyFailure.client.acquireFlushBarrier("tab-1");
    expect(applyBarrier).toMatchObject({ kind: "blocked", reason: "server-error" });
    expect(applyFailure.client.getTabState("tab-1")?.batches).toHaveLength(1);
    expect(applyFailure.flushDocumentEdits).not.toHaveBeenCalled();

    const flushFailure = createHarness({
      flush: async () => ({
        kind: "error",
        error: { code: "runtime-context-unavailable", message: "not ready" }
      })
    });
    const flushBinding = hydrate(flushFailure.client);
    append(flushFailure.client, flushBinding, "!");
    const flushBarrier = await flushFailure.client.acquireFlushBarrier("tab-1");
    expect(flushBarrier).toMatchObject({
      kind: "blocked",
      reason: "flush-error",
      error: { code: "runtime-context-unavailable" }
    });
    append(flushFailure.client, flushBinding, "tail");
    await settle();
    expect(flushFailure.applyDocumentEdits).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: "tab-1", clientSequence: 2 })
    );
  });

  test("turns a synchronous flush port exception into a typed settled failure", async () => {
    const harness = createHarness({
      flush: () => { throw new Error("bridge unavailable"); }
    });
    append(harness.client, hydrate(harness.client), "!");

    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "blocked",
      reason: "flush-transport-failure"
    });
  });

  test.each([
    { kind: "sequence-gap" as const, expectedSequence: Number.NaN, canonicalRevision: 1 },
    { kind: "sequence-gap" as const, expectedSequence: 1, canonicalRevision: Number.NaN }
  ])("fails closed on malformed flush gap metadata", async (flushResult) => {
    const harness = createHarness({ flush: async () => flushResult });
    append(harness.client, hydrate(harness.client), "!");

    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "blocked",
      reason: "invalid-flush-result"
    });
  });

  test("fails closed when main acknowledges below the exact cutoff", async () => {
    const harness = createHarness({
      flush: async () => ({
        kind: "flushed",
        acknowledgedSequence: 0,
        revision: 1,
        savedRevision: 0,
        isDirty: true
      })
    });
    append(harness.client, hydrate(harness.client), "!");

    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "blocked",
      reason: "flush-acknowledgement-mismatch"
    });
  });

  test("fails closed when a flushed revision trails the acknowledged text baseline", async () => {
    const harness = createHarness({
      flush: async (request) => ({
        kind: "flushed",
        acknowledgedSequence: request.throughSequence,
        revision: 5,
        savedRevision: 5,
        isDirty: false
      })
    });
    const binding = harness.client.hydrateTab({
      tabId: "tab-1",
      text: "alpha",
      revision: 5,
      savedRevision: 5,
      isDirty: false
    });
    append(harness.client, binding, "!");

    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "blocked",
      reason: "invalid-flush-result"
    });
    expect(harness.client.getTabState("tab-1")?.acknowledgedTextRevision).toBe(6);
  });

  test.each([
    ["older canonical revision", 1, 5],
    ["expected sequence beyond cutoff", 2, 6]
  ])("fails closed on a flush sequence gap with %s", async (_label, expectedSequence, canonicalRevision) => {
    const harness = createHarness({
      flush: async () => ({ kind: "sequence-gap", expectedSequence, canonicalRevision })
    });
    const binding = harness.client.hydrateTab({
      tabId: "tab-1",
      text: "alpha",
      revision: 5,
      savedRevision: 5,
      isDirty: false
    });
    append(harness.client, binding, "!");

    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "blocked",
      reason: "invalid-flush-result"
    });
  });

  test("rejects a non-integer flush acknowledgement instead of treating it as at least the cutoff", async () => {
    const harness = createHarness({
      flush: async () => ({
        kind: "flushed",
        acknowledgedSequence: Number.NaN,
        revision: 1,
        savedRevision: 0,
        isDirty: true
      })
    });
    append(harness.client, hydrate(harness.client), "!");

    await expect(harness.client.acquireFlushBarrier("tab-1")).resolves.toMatchObject({
      kind: "blocked",
      reason: "invalid-flush-result"
    });
  });

  test("settles an in-progress barrier as stale when disposed during apply or flush", async () => {
    const apply = deferred<ApplyDocumentEditsResult>();
    const applyHarness = createHarness({ apply: () => apply.promise });
    append(applyHarness.client, hydrate(applyHarness.client), "!");
    const applyingBarrier = applyHarness.client.acquireFlushBarrier("tab-1");
    applyHarness.client.dispose();
    await expect(applyingBarrier).resolves.toMatchObject({ kind: "stale" });
    apply.resolve({ kind: "applied", acknowledgedSequence: 1, revision: 1, isDirty: true });
    await settle();
    expect(applyHarness.detachProjection).toHaveBeenCalledTimes(1);

    const flush = deferred<FlushDocumentEditsResult>();
    const flushHarness = createHarness({ flush: () => flush.promise });
    append(flushHarness.client, hydrate(flushHarness.client), "!");
    const flushingBarrier = flushHarness.client.acquireFlushBarrier("tab-1");
    await settle();
    expect(flushHarness.flushDocumentEdits).toHaveBeenCalledTimes(1);
    flushHarness.client.dispose();
    await expect(flushingBarrier).resolves.toMatchObject({ kind: "stale" });
    flush.resolve({
      kind: "flushed",
      acknowledgedSequence: 1,
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
    await settle();
  });

  test("keeps an old lease fenced from a new incarnation and its active ceiling", async () => {
    const harness = createHarness();
    const oldBinding = hydrate(harness.client);
    const oldBarrier = await harness.client.acquireFlushBarrier("tab-1");
    expect(oldBarrier.kind).toBe("acquired");
    if (oldBarrier.kind !== "acquired") throw new Error("Expected old barrier.");

    const newBinding = hydrate(harness.client, "tab-1", "new");
    const newBarrier = await harness.client.acquireFlushBarrier("tab-1");
    expect(newBarrier.kind).toBe("acquired");
    if (newBarrier.kind !== "acquired") throw new Error("Expected new barrier.");
    append(harness.client, newBinding, "!");
    oldBarrier.lease.release();
    await settle();
    expect(harness.applyDocumentEdits).not.toHaveBeenCalled();

    newBarrier.lease.release();
    await settle();
    expect(harness.applyDocumentEdits).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: "tab-1", clientSequence: 1 })
    );
    expect(harness.client.admitFrame({
      binding: oldBinding,
      baseText: "alpha",
      resultingText: "alpha?",
      changes: [{ from: 5, to: 5, insert: "?" }]
    })).toEqual({ kind: "stale" });
  });

  test("acquires all tab ceilings before waiting and returns one aggregate lease", async () => {
    const pending = new Map<string, Deferred<ApplyDocumentEditsResult>>();
    const harness = createHarness({
      apply: (request) => {
        const task = deferred<ApplyDocumentEditsResult>();
        pending.set(`${request.tabId}:${request.clientSequence}`, task);
        return task.promise;
      }
    });
    const first = hydrate(harness.client, "tab-a");
    const second = hydrate(harness.client, "tab-b");
    append(harness.client, first, "1");
    append(harness.client, second, "1");

    const allPromise = harness.client.acquireAllFlushBarriers();
    append(harness.client, first, "2");
    append(harness.client, second, "2");
    for (const [key, task] of pending) {
      const request = harness.applyDocumentEdits.mock.calls.find(
        ([candidate]) => `${candidate.tabId}:${candidate.clientSequence}` === key
      )?.[0];
      if (request !== undefined) task.resolve(applied(request));
    }
    await settle();

    const all = await allPromise;
    expect(all).toMatchObject({
      kind: "acquired",
      cutoffs: [{ tabId: "tab-a", cutoff: 1 }, { tabId: "tab-b", cutoff: 1 }]
    });
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(2);
    if (all.kind !== "acquired") throw new Error("Expected all-tab barrier.");
    all.lease.release();
    await settle();
    expect(harness.applyDocumentEdits).toHaveBeenCalledTimes(4);
  });

  test("returns stale instead of an empty acquired lease after disposal", async () => {
    const harness = createHarness();
    harness.client.dispose();

    await expect(harness.client.acquireAllFlushBarriers()).resolves.toEqual({ kind: "stale" });
  });

  test("releases every all-tab ceiling when one checkpoint fails", async () => {
    const harness = createHarness({
      flush: async (request) => request.tabId === "tab-a"
        ? {
            kind: "error",
            error: { code: "runtime-context-unavailable", message: "not ready" }
          }
        : {
            kind: "flushed",
            acknowledgedSequence: request.throughSequence,
            revision: request.throughSequence,
            savedRevision: 0,
            isDirty: true
          }
    });
    const first = hydrate(harness.client, "tab-a");
    const second = hydrate(harness.client, "tab-b");
    append(harness.client, first, "1");
    append(harness.client, second, "1");

    const result = await harness.client.acquireAllFlushBarriers();
    expect(result).toMatchObject({ kind: "blocked", tabId: "tab-a", reason: "flush-error" });
    append(harness.client, first, "2");
    append(harness.client, second, "2");
    await settle();
    expect(harness.applyDocumentEdits.mock.calls.filter(
      ([request]) => request.clientSequence === 2
    )).toHaveLength(2);
  });

  test("fails all-tab acquisition immediately when one checkpoint fails and another is pending", async () => {
    const pendingFlush = deferred<FlushDocumentEditsResult>();
    const harness = createHarness({
      flush: async (request) => request.tabId === "tab-a"
        ? {
            kind: "error",
            error: { code: "runtime-context-unavailable", message: "not ready" }
          }
        : pendingFlush.promise
    });
    const first = hydrate(harness.client, "tab-a");
    const second = hydrate(harness.client, "tab-b");
    append(harness.client, first, "1");
    append(harness.client, second, "1");

    let settled: WorkspaceEditAllBarrierResult | null = null;
    const acquisition = harness.client.acquireAllFlushBarriers().then((result) => {
      settled = result;
      return result;
    });
    for (let index = 0; index < 12 && settled === null; index += 1) {
      await Promise.resolve();
    }
    expect(settled).toMatchObject({ kind: "blocked", tabId: "tab-a", reason: "flush-error" });
    append(harness.client, second, "2");
    await settle();
    expect(harness.applyDocumentEdits.mock.calls.filter(
      ([request]) => request.tabId === "tab-b" && request.clientSequence === 2
    )).toHaveLength(1);

    const peerBarrier = harness.client.acquireFlushBarrier("tab-b");
    expect(harness.flushDocumentEdits).toHaveBeenCalledTimes(3);
    pendingFlush.resolve({
      kind: "flushed",
      acknowledgedSequence: 2,
      revision: 2,
      savedRevision: 0,
      isDirty: true
    });
    await acquisition;
    const peer = await peerBarrier;
    expect(peer.kind).toBe("acquired");
    if (peer.kind === "acquired") peer.lease.release();
  });

  test("retries a retained transport payload with its original sequence and rejects server failures", async () => {
    let calls = 0;
    const harness = createHarness({
      maxTransportRetries: 0,
      apply: async (request) => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
        return applied(request);
      }
    });
    const binding = hydrate(harness.client);
    append(harness.client, binding, "!");
    await settle();
    const first = harness.applyDocumentEdits.mock.calls[0]?.[0];
    expect(harness.client.retryRetainedTransport(binding)).toEqual({ kind: "resumed" });
    await settle();
    expect(harness.applyDocumentEdits.mock.calls[1]?.[0]).toEqual(first);

    const server = createHarness({
      apply: async () => ({ kind: "error", error: { code: "internal-error", message: "bad" } })
    });
    const serverBinding = hydrate(server.client);
    append(server.client, serverBinding, "!");
    await settle();
    expect(server.client.retryRetainedTransport(serverBinding)).toEqual({ kind: "not-retryable" });
  });
});
