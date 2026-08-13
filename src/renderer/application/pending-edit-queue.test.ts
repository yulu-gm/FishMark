import { describe, expect, test } from "vitest";

import type { ApplyDocumentEditsResult, DocumentTextChange } from "../../shared/document-edit";
import {
  admitPendingEditResult,
  beginPendingEditSend,
  enqueuePendingEdit,
  hydratePendingEditQueue,
  isPendingEditQueueDirty,
  observePendingEditProjection,
  rebasePendingEditQueue,
  retirePendingEditQueue,
  type PendingEditQueueState
} from "./pending-edit-queue";

function hydrate(
  text = "alpha",
  revision = 4,
  savedRevision = revision
): PendingEditQueueState {
  return hydratePendingEditQueue({ text, revision, savedRevision, isDirty: revision !== savedRevision });
}

function enqueue(
  state: PendingEditQueueState,
  changes: readonly DocumentTextChange[]
): PendingEditQueueState {
  return enqueuePendingEdit(state, changes).state;
}

function sendHead(state: PendingEditQueueState) {
  const send = beginPendingEditSend(state);
  expect(send.kind).toBe("send");
  if (send.kind !== "send") {
    throw new Error("Expected a sendable head batch.");
  }
  return send;
}

function admit(
  state: PendingEditQueueState,
  generation: number,
  result: ApplyDocumentEditsResult
) {
  return admitPendingEditResult(state, { generation, result });
}

describe("PendingEditQueue hydration and ordering", () => {
  test("hydrates an exact atomic transport baseline and clean projection metadata", () => {
    const state = hydratePendingEditQueue({
      text: "# hello\r\n",
      revision: 7,
      savedRevision: 7,
      isDirty: false
    });

    expect(state).toMatchObject({
      acknowledgedText: "# hello\r\n",
      acknowledgedTextRevision: 7,
      observedRevision: 7,
      observedSavedRevision: 7,
      observedIsDirty: false,
      optimisticText: "# hello\r\n",
      nextSequence: 1,
      batches: [],
      inFlightSequence: null,
      generation: 0,
      status: "ready"
    });
    expect(isPendingEditQueueDirty(state)).toBe(false);
  });

  test("rejects contradictory hydration dirty metadata instead of creating two truths", () => {
    expect(() => hydratePendingEditQueue({
      text: "alpha",
      revision: 7,
      savedRevision: 7,
      isDirty: true
    })).toThrow("isDirty must equal the revision and savedRevision difference.");

    expect(() => hydratePendingEditQueue({
      text: "alpha",
      revision: 7,
      savedRevision: 6,
      isDirty: false
    })).toThrow("isDirty must equal the revision and savedRevision difference.");
  });

  test("allocates independent sequence numbers for separately hydrated tab queues", () => {
    const firstA = enqueuePendingEdit(hydrate("A"), [{ from: 1, to: 1, insert: "1" }]);
    const firstB = enqueuePendingEdit(hydrate("B"), [{ from: 1, to: 1, insert: "1" }]);
    const secondA = enqueuePendingEdit(firstA.state, [{ from: 2, to: 2, insert: "2" }]);

    expect(firstA.batch.sequence).toBe(1);
    expect(firstB.batch.sequence).toBe(1);
    expect(secondA.batch.sequence).toBe(2);
    expect(secondA.state.optimisticText).toBe("A12");
  });

  test("hydrates an explicit next sequence for a reused client and tab identity", () => {
    const state = hydratePendingEditQueue({
      text: "restored",
      revision: 8,
      savedRevision: 8,
      isDirty: false,
      nextSequence: 42
    });
    const queued = enqueuePendingEdit(state, [{ from: 8, to: 8, insert: "!" }]);

    expect(state.nextSequence).toBe(42);
    expect(queued.batch.sequence).toBe(42);
    expect(queued.state.nextSequence).toBe(43);
  });

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid hydrated next sequence %s",
    (nextSequence) => {
      expect(() => hydratePendingEditQueue({
        text: "alpha",
        revision: 0,
        savedRevision: 0,
        isDirty: false,
        nextSequence
      })).toThrow("nextSequence must be a positive safe integer");
    }
  );

  test("queues a non-empty same-text replacement because the domain still advances revision", () => {
    const queued = enqueuePendingEdit(hydrate(), [
      { from: 0, to: 5, insert: "alpha" }
    ]);

    expect(queued.batch).toMatchObject({
      sequence: 1,
      changes: [{ from: 0, to: 5, insert: "alpha" }],
      resultingText: "alpha"
    });
    expect(queued.state.batches).toHaveLength(1);
    expect(isPendingEditQueueDirty(queued.state)).toBe(true);
  });

  test("freezes public state, batches and copied changes", () => {
    const queued = enqueuePendingEdit(hydrate(), [{ from: 5, to: 5, insert: "!" }]);

    expect(Object.isFrozen(queued.state)).toBe(true);
    expect(Object.isFrozen(queued.state.batches)).toBe(true);
    expect(Object.isFrozen(queued.batch)).toBe(true);
    expect(Object.isFrozen(queued.batch.changes)).toBe(true);
    expect(Object.isFrozen(queued.batch.changes[0])).toBe(true);
  });

  test("rejects invalid ranges and revision overflow before queueing", () => {
    expect(() => enqueuePendingEdit(hydrate(), [
      { from: 4, to: 6, insert: "!" }
    ])).toThrow("ordered, disjoint and within the source");
    expect(() => enqueuePendingEdit(
      hydrate("alpha", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      [{ from: 5, to: 5, insert: "!" }]
    )).toThrow("Document revision cannot advance.");
  });

  test("owns one exact in-flight head while retaining a tail admitted during the send", () => {
    const queued = enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }]);
    const sending = sendHead(queued);
    const withTail = enqueue(sending.state, [{ from: 6, to: 6, insert: "?" }]);

    expect(sending.batch).toMatchObject({
      sequence: 1,
      baseRevision: 4,
      baseText: "alpha",
      changes: [{ from: 5, to: 5, insert: "!" }],
      resultingText: "alpha!"
    });
    expect(beginPendingEditSend(sending.state)).toEqual({ kind: "none", state: sending.state });
    expect(withTail.inFlightSequence).toBe(1);
    expect(withTail.batches.map((batch) => batch.sequence)).toEqual([1, 2]);
    expect(withTail.optimisticText).toBe("alpha!?");
    expect(isPendingEditQueueDirty(withTail)).toBe(true);
  });

  test("retires only the exact acknowledged head and then exposes the retained tail", () => {
    let state = enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }]);
    state = sendHead(state).state;
    state = enqueue(state, [{ from: 6, to: 6, insert: "?" }]);

    const admitted = admit(state, state.generation, {
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 5,
      isDirty: true
    });

    expect(admitted.kind).toBe("accepted");
    expect(admitted.state).toMatchObject({
      acknowledgedText: "alpha!",
      acknowledgedTextRevision: 5,
      observedRevision: 5,
      observedIsDirty: true,
      inFlightSequence: null,
      status: "ready"
    });
    expect(admitted.state.batches.map((batch) => batch.sequence)).toEqual([2]);
    expect(sendHead(admitted.state).batch.sequence).toBe(2);
  });

  test("rejects an acknowledgement for anything except the in-flight head without dropping text", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "applied",
      acknowledgedSequence: 2,
      revision: 5,
      isDirty: true
    });

    expect(admitted.kind).toBe("blocked");
    expect(admitted.state.status).toBe("blocked");
    expect(admitted.state.batches).toEqual(sending.batches);
    expect(admitted.state.optimisticText).toBe("alpha!");
  });

  test("retires a historical duplicate at base plus one but observes its newer canonical revision", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "duplicate",
      acknowledgedSequence: 1,
      revision: 11,
      isDirty: true
    });

    expect(admitted.kind).toBe("accepted");
    expect(admitted.state).toMatchObject({
      acknowledgedText: "alpha!",
      acknowledgedTextRevision: 5,
      observedRevision: 11,
      observedIsDirty: true,
      batches: []
    });
  });

  test.each([
    ["applied", 5],
    ["duplicate", 8]
  ] as const)("derives clean observed metadata from a direct %s result", (kind, revision) => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind,
      acknowledgedSequence: 1,
      revision,
      isDirty: false
    });

    expect(admitted.kind).toBe("accepted");
    expect(admitted.state).toMatchObject({
      observedRevision: revision,
      observedSavedRevision: revision,
      observedIsDirty: false
    });
    expect(isPendingEditQueueDirty(admitted.state)).toBe(false);
  });

  test("fails closed when an applied acknowledgement does not advance exactly base plus one", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 6,
      isDirty: true
    });

    expect(admitted).toMatchObject({ kind: "blocked", reason: "revision-mismatch" });
    expect(admitted.state.batches).toEqual(sending.batches);
  });

  test("derives dirty from projection metadata or local work without mutating the transport baseline", () => {
    const clean = hydrate("alpha", 4, 4);
    const remotelyDirty = observePendingEditProjection(clean, {
      revision: 5,
      savedRevision: 4,
      isDirty: true
    });
    const staleProjection = observePendingEditProjection(remotelyDirty, {
      revision: 3,
      savedRevision: 3,
      isDirty: false
    });

    expect(isPendingEditQueueDirty(remotelyDirty)).toBe(true);
    expect(remotelyDirty.acknowledgedTextRevision).toBe(4);
    expect(staleProjection).toBe(remotelyDirty);
    expect(isPendingEditQueueDirty(enqueue(clean, [{ from: 5, to: 5, insert: "!" }]))).toBe(true);
  });

  test("rejects contradictory projection dirty metadata without changing observed state", () => {
    const clean = hydrate("alpha", 4, 4);

    expect(observePendingEditProjection(clean, {
      revision: 5,
      savedRevision: 5,
      isDirty: true
    })).toBe(clean);
    expect(observePendingEditProjection(clean, {
      revision: 5,
      savedRevision: 4,
      isDirty: false
    })).toBe(clean);
  });

  test("increments generation on retirement and ignores late results from the old generation", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const retired = retirePendingEditQueue(sending);
    const late = admit(retired, sending.generation, {
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 5,
      isDirty: true
    });

    expect(retired.status).toBe("retired");
    expect(retired.generation).toBe(sending.generation + 1);
    expect(late).toEqual({ kind: "stale", state: retired });
    expect(late.state.optimisticText).toBe("alpha!");
  });
});

describe("PendingEditQueue fail-closed result admission", () => {
  test("retains and resends the expected retained sequence for a sequence gap", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "sequence-gap",
      expectedSequence: 1,
      canonicalRevision: 4
    });

    expect(admitted.kind).toBe("resend");
    if (admitted.kind !== "resend") throw new Error("Expected retained resend.");
    expect(admitted.batch).toBe(sending.batches[0]);
    expect(admitted.state.inFlightSequence).toBe(1);
    expect(admitted.state.batches).toEqual(sending.batches);
  });

  test("keeps observed dirty metadata derived when a gap reveals a newer revision", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "sequence-gap",
      expectedSequence: 1,
      canonicalRevision: 9
    });

    expect(admitted.kind).toBe("resend");
    expect(admitted.state).toMatchObject({
      observedRevision: 9,
      observedSavedRevision: 4,
      observedIsDirty: true
    });
  });

  test("blocks with exact recovery text when a sequence gap is no longer retained", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "sequence-gap",
      expectedSequence: 0,
      canonicalRevision: 4
    });

    expect(admitted).toMatchObject({
      kind: "recovery-required",
      reason: "missing-sequence",
      recovery: { localText: "alpha!", canonicalRevision: 4 }
    });
    expect(admitted.state.batches).toEqual(sending.batches);
  });

  test("typed errors block while retaining the exact local queue and text", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "error",
      error: { code: "tab-owner-changed", message: "owner changed" }
    });

    expect(admitted).toMatchObject({
      kind: "blocked",
      reason: "server-error",
      error: { code: "tab-owner-changed" }
    });
    expect(admitted.state.optimisticText).toBe("alpha!");
    expect(admitted.state.batches).toEqual(sending.batches);
  });

  test("keeps blocked, rebasing and recovering queues terminal for late acknowledgements", () => {
    const initial = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const blockedState = admit(initial, initial.generation, {
      kind: "error",
      error: { code: "tab-owner-changed", message: "owner changed" }
    }).state;
    const conflictState = admit(initial, initial.generation, {
      kind: "revision-conflict",
      canonicalRevision: 5,
      canonicalText: "remote",
      isDirty: true
    }).state;
    const recoveryState = admit(initial, initial.generation, {
      kind: "sequence-gap",
      expectedSequence: 2,
      canonicalRevision: 5
    }).state;

    for (const terminal of [blockedState, conflictState, recoveryState]) {
      const late = admit(terminal, terminal.generation, {
        kind: "applied",
        acknowledgedSequence: 1,
        revision: 5,
        isDirty: true
      });
      expect(late).toMatchObject({ kind: "blocked", reason: "queue-not-ready" });
      expect(late.state).toBe(terminal);
      expect(late.state.batches).toEqual(initial.batches);
    }
  });

  test("retains the queue when a result arrives without an in-flight batch", () => {
    const queued = enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }]);
    const admitted = admit(queued, queued.generation, {
      kind: "applied",
      acknowledgedSequence: 1,
      revision: 5,
      isDirty: true
    });

    expect(admitted).toMatchObject({ kind: "blocked", reason: "unexpected-result" });
    expect(admitted.state.batches).toEqual(queued.batches);
  });

  test("blocks a conflict revision older than the acknowledged transport baseline", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "revision-conflict",
      canonicalRevision: 3,
      canonicalText: "old",
      isDirty: true
    });

    expect(admitted).toMatchObject({ kind: "blocked", reason: "revision-mismatch" });
    expect(admitted.state.batches).toEqual(sending.batches);
  });

  test("blocks a conflict revision equal to the acknowledged transport baseline", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "revision-conflict",
      canonicalRevision: 4,
      canonicalText: "alpha",
      isDirty: false
    });

    expect(admitted).toMatchObject({ kind: "blocked", reason: "revision-mismatch" });
    expect(admitted.state.batches).toEqual(sending.batches);
  });

  test("blocks an older sequence-gap revision without resending or creating recovery data", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "sequence-gap",
      expectedSequence: 1,
      canonicalRevision: 3
    });

    expect(admitted).toMatchObject({ kind: "blocked", reason: "revision-mismatch" });
    expect(admitted.state.batches).toEqual(sending.batches);
    expect(admitted).not.toHaveProperty("batch");
    expect(admitted).not.toHaveProperty("recovery");
  });

  test.each([-1, Number.NaN])(
    "blocks an invalid sequence-gap canonical revision %s without creating recovery data",
    (canonicalRevision) => {
      const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
      const admitted = admit(sending, sending.generation, {
        kind: "sequence-gap",
        expectedSequence: 1,
        canonicalRevision
      });

      expect(admitted).toMatchObject({ kind: "blocked", reason: "revision-mismatch" });
      expect(admitted.state.optimisticText).toBe("alpha!");
      expect(admitted.state.batches).toEqual(sending.batches);
      expect(admitted).not.toHaveProperty("recovery");
    }
  );
});

describe("PendingEditQueue conservative conflict rebase", () => {
  function conflictState(
    baseText: string,
    changes: readonly DocumentTextChange[],
    canonicalText: string,
    canonicalRevision = 9
  ) {
    const sending = sendHead(enqueue(hydrate(baseText, 4), changes)).state;
    const conflict = admit(sending, sending.generation, {
      kind: "revision-conflict",
      canonicalRevision,
      canonicalText,
      isDirty: true
    });
    expect(conflict.kind).toBe("conflict");
    if (conflict.kind !== "conflict") throw new Error("Expected conflict.");
    return { state: conflict.state, conflict: conflict.conflict };
  }

  test("maps a local replacement before a remote replacement in both coordinate spaces", () => {
    const { state, conflict } = conflictState(
      "aa middle zz",
      [{ from: 0, to: 2, insert: "LOCAL" }],
      "aa middle REMOTE"
    );
    const rebased = rebasePendingEditQueue(state, conflict);

    expect(rebased).toMatchObject({
      kind: "rebased",
      localOnCanonical: { from: 0, to: 2, insert: "LOCAL" },
      remoteOnOptimistic: { from: 13, to: 15, insert: "REMOTE" },
      rebasedText: "LOCAL middle REMOTE"
    });
    if (rebased.kind !== "rebased") throw new Error("Expected safe rebase.");
    expect(rebased.state.batches).toHaveLength(1);
    expect(rebased.state.batches[0]).toMatchObject({
      sequence: 1,
      baseRevision: 9,
      baseText: "aa middle REMOTE",
      changes: [{ from: 0, to: 2, insert: "LOCAL" }],
      resultingText: "LOCAL middle REMOTE"
    });
    expect(rebased.state.nextSequence).toBe(2);
  });

  test("accepts and folds a sealed frame that arrives while rebasing without pumping it", () => {
    const sending = sendHead(enqueue(hydrate("aa middle zz"), [
      { from: 0, to: 0, insert: "L" }
    ])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "revision-conflict",
      canonicalRevision: 5,
      canonicalText: "aa middle REMOTE",
      isDirty: true
    });
    expect(admitted.kind).toBe("conflict");
    if (admitted.kind !== "conflict") throw new Error("Expected conflict.");

    const late = enqueuePendingEdit(admitted.state, [
      { from: 1, to: 1, insert: "2" }
    ]);
    expect(late.batch).toMatchObject({
      sequence: 2,
      baseRevision: 5,
      baseText: "Laa middle zz",
      resultingText: "L2aa middle zz"
    });
    expect(late.state).toMatchObject({
      status: "rebasing",
      optimisticText: "L2aa middle zz",
      nextSequence: 3,
      inFlightSequence: 1
    });
    expect(Object.isFrozen(late.state)).toBe(true);
    expect(Object.isFrozen(late.state.batches)).toBe(true);
    expect(Object.isFrozen(late.batch)).toBe(true);
    expect(Object.isFrozen(late.batch.changes)).toBe(true);
    expect(beginPendingEditSend(late.state)).toEqual({ kind: "none", state: late.state });

    const rebased = rebasePendingEditQueue(late.state, admitted.conflict);
    expect(rebased).toMatchObject({
      kind: "rebased",
      rebasedText: "L2aa middle REMOTE"
    });
    if (rebased.kind !== "rebased") throw new Error("Expected safe rebase.");
    expect(rebased.state.batches).toHaveLength(1);
    expect(rebased.state.batches[0]).toMatchObject({
      sequence: 1,
      baseRevision: 5,
      baseText: "aa middle REMOTE",
      changes: [{ from: 0, to: 0, insert: "L2" }],
      resultingText: "L2aa middle REMOTE"
    });
    expect(rebased.state.nextSequence).toBe(2);
  });

  test("preserves a late rebasing frame in ambiguous recovery local text", () => {
    const sending = sendHead(enqueue(hydrate("abcdefgh"), [
      { from: 3, to: 3, insert: "LOCAL" }
    ])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "revision-conflict",
      canonicalRevision: 5,
      canonicalText: "abcREMOTEdefgh",
      isDirty: true
    });
    expect(admitted.kind).toBe("conflict");
    if (admitted.kind !== "conflict") throw new Error("Expected conflict.");
    const late = enqueuePendingEdit(admitted.state, [
      { from: 13, to: 13, insert: "!" }
    ]);

    const rebased = rebasePendingEditQueue(late.state, admitted.conflict);
    expect(rebased).toMatchObject({
      kind: "recovery-required",
      recovery: {
        localText: "abcLOCALdefgh!",
        canonicalText: "abcREMOTEdefgh"
      }
    });
    expect(rebased.state.batches).toEqual(late.state.batches);
  });

  test("rejects sealed frames for blocked, recovering and retired queues", () => {
    const sending = sendHead(enqueue(hydrate(), [{ from: 5, to: 5, insert: "!" }])).state;
    const blockedState = admit(sending, sending.generation, {
      kind: "error",
      error: { code: "tab-owner-changed", message: "owner changed" }
    }).state;
    const recoveringState = admit(sending, sending.generation, {
      kind: "sequence-gap",
      expectedSequence: 2,
      canonicalRevision: 5
    }).state;
    const retiredState = retirePendingEditQueue(sending);

    for (const terminal of [blockedState, recoveringState, retiredState]) {
      expect(() => enqueuePendingEdit(terminal, [
        { from: terminal.optimisticText.length, to: terminal.optimisticText.length, insert: "?" }
      ])).toThrow(`Cannot enqueue edits while queue is ${terminal.status}.`);
    }
  });

  test("maps a remote replacement before a local replacement in both coordinate spaces", () => {
    const { state, conflict } = conflictState(
      "aa middle zz",
      [{ from: 10, to: 12, insert: "LOCAL" }],
      "REMOTE middle zz"
    );
    const rebased = rebasePendingEditQueue(state, conflict);

    expect(rebased).toMatchObject({
      kind: "rebased",
      localOnCanonical: { from: 14, to: 16, insert: "LOCAL" },
      remoteOnOptimistic: { from: 0, to: 2, insert: "REMOTE" },
      rebasedText: "REMOTE middle LOCAL"
    });
  });

  test("rebases local text onto a newer revision when the remote text is unchanged", () => {
    const { state, conflict } = conflictState(
      "alpha omega",
      [{ from: 0, to: 5, insert: "LOCAL" }],
      "alpha omega",
      12
    );
    const rebased = rebasePendingEditQueue(state, conflict);

    expect(rebased).toMatchObject({
      kind: "rebased",
      remoteOnOptimistic: null,
      rebasedText: "LOCAL omega"
    });
    if (rebased.kind !== "rebased") throw new Error("Expected no-op remote rebase.");
    expect(rebased.state.batches[0]?.baseRevision).toBe(12);
  });

  test("does not let an older conflict overwrite projection metadata observed before rebase", () => {
    let sending = sendHead(enqueue(hydrate("alpha omega", 4), [
      { from: 0, to: 5, insert: "LOCAL" }
    ])).state;
    sending = observePendingEditProjection(sending, {
      revision: 20,
      savedRevision: 20,
      isDirty: false
    });
    const admitted = admit(sending, sending.generation, {
      kind: "revision-conflict",
      canonicalRevision: 9,
      canonicalText: "alpha omega",
      isDirty: true
    });
    expect(admitted.kind).toBe("conflict");
    if (admitted.kind !== "conflict") throw new Error("Expected conflict.");

    const rebased = rebasePendingEditQueue(admitted.state, admitted.conflict);
    expect(rebased.kind).toBe("rebased");
    expect(rebased.state).toMatchObject({
      observedRevision: 20,
      observedSavedRevision: 20,
      observedIsDirty: false
    });
  });

  test("treats a conflict from an old generation as stale without changing state", () => {
    const { state, conflict } = conflictState(
      "alpha omega",
      [{ from: 0, to: 5, insert: "LOCAL" }],
      "alpha REMOTE"
    );
    const stale = rebasePendingEditQueue(state, { ...conflict, generation: conflict.generation - 1 });

    expect(stale).toEqual({ kind: "stale", state });
  });

  test("keeps a retired queue inert when a previously admitted conflict is rebased late", () => {
    const { state, conflict } = conflictState(
      "alpha omega",
      [{ from: 0, to: 5, insert: "LOCAL" }],
      "alpha REMOTE"
    );
    const retired = retirePendingEditQueue(state);
    const stale = rebasePendingEditQueue(retired, conflict);

    expect(stale).toEqual({ kind: "stale", state: retired });
    expect(stale.state.status).toBe("retired");
  });

  test("blocks an invalid rebase invocation without converting it to recovery", () => {
    const ready = sendHead(enqueue(hydrate("alpha omega"), [
      { from: 0, to: 5, insert: "LOCAL" }
    ])).state;
    const invalid = rebasePendingEditQueue(ready, {
      generation: ready.generation,
      sequence: 1,
      canonicalRevision: 9,
      canonicalText: "alpha REMOTE",
      isDirty: true
    });

    expect(invalid).toMatchObject({ kind: "blocked", reason: "invalid-conflict" });
    expect(invalid.state).not.toBe(ready);
    expect(invalid.state.status).toBe("blocked");
    expect(invalid).not.toHaveProperty("recovery");
    expect(invalid.state.batches).toEqual(ready.batches);
  });

  test("keeps already blocked and recovering queues exact and inert on invalid rebase calls", () => {
    const sending = sendHead(enqueue(hydrate("alpha omega"), [
      { from: 0, to: 5, insert: "LOCAL" }
    ])).state;
    const blockedState = admit(sending, sending.generation, {
      kind: "error",
      error: { code: "tab-owner-changed", message: "owner changed" }
    }).state;
    const recoveringState = admit(sending, sending.generation, {
      kind: "sequence-gap",
      expectedSequence: 2,
      canonicalRevision: 5
    }).state;
    const conflictAdmission = admit(sending, sending.generation, {
      kind: "revision-conflict",
      canonicalRevision: 5,
      canonicalText: "alpha REMOTE",
      isDirty: true
    });
    expect(conflictAdmission.kind).toBe("conflict");
    if (conflictAdmission.kind !== "conflict") throw new Error("Expected conflict.");
    const terminalCalls = [
      {
        state: blockedState,
        conflict: { ...conflictAdmission.conflict, generation: blockedState.generation }
      },
      {
        state: recoveringState,
        conflict: { ...conflictAdmission.conflict, generation: recoveringState.generation }
      }
    ];
    for (const { state, conflict } of terminalCalls) {
      const invalid = rebasePendingEditQueue(state, conflict);
      expect(invalid).toMatchObject({ kind: "blocked", reason: "invalid-conflict" });
      expect(invalid.state).toBe(state);
    }
  });

  test("moves a same-generation mismatched rebasing call into a new blocked state", () => {
    const sending = sendHead(enqueue(hydrate("alpha omega"), [
      { from: 0, to: 5, insert: "LOCAL" }
    ])).state;
    const admitted = admit(sending, sending.generation, {
      kind: "revision-conflict",
      canonicalRevision: 5,
      canonicalText: "alpha REMOTE",
      isDirty: true
    });
    expect(admitted.kind).toBe("conflict");
    if (admitted.kind !== "conflict") throw new Error("Expected conflict.");

    const invalid = rebasePendingEditQueue(admitted.state, {
      ...admitted.conflict,
      sequence: 2
    });

    expect(invalid).toMatchObject({ kind: "blocked", reason: "invalid-conflict" });
    expect(invalid.state).not.toBe(admitted.state);
    expect(invalid.state.status).toBe("blocked");
    expect(invalid.state.batches).toBe(admitted.state.batches);
    expect(invalid).not.toHaveProperty("recovery");
  });

  test.each([
    ["overlap", "abcdefgh", { from: 2, to: 5, insert: "LOCAL" }, "abcREMOTEgh"],
    ["adjacent", "abcdefgh", { from: 1, to: 3, insert: "LOCAL" }, "abcREMOTEfgh"],
    ["same insertion point", "abcdefgh", { from: 3, to: 3, insert: "LOCAL" }, "abcREMOTEdefgh"]
  ])("requires recovery for %s edits", (_label, baseText, local, canonicalText) => {
    const { state, conflict } = conflictState(baseText, [local], canonicalText);
    const rebased = rebasePendingEditQueue(state, conflict);

    expect(rebased).toMatchObject({
      kind: "recovery-required",
      reason: "ambiguous-overlap",
      recovery: { localText: state.optimisticText, canonicalText }
    });
    expect(rebased.state.batches).toEqual(state.batches);
  });

  test("uses deterministic prefix and suffix context for repeated Markdown", () => {
    const base = "- item\n- item\n\n> quote\n";
    const { state, conflict } = conflictState(
      base,
      [{ from: 0, to: 6, insert: "- local" }],
      "- item\n- item\n\n> remote\n"
    );
    const rebased = rebasePendingEditQueue(state, conflict);

    expect(rebased).toMatchObject({ kind: "rebased", rebasedText: "- local\n- item\n\n> remote\n" });
  });

  test("preserves UTF-16 emoji and CRLF offsets during bidirectional mapping", () => {
    const base = "😀 A\r\nB end";
    const { state, conflict } = conflictState(
      base,
      [{ from: 3, to: 4, insert: "LOCAL" }],
      "😀 A\r\nB REMOTE"
    );
    const rebased = rebasePendingEditQueue(state, conflict);

    expect(rebased).toMatchObject({
      kind: "rebased",
      localOnCanonical: { from: 3, to: 4, insert: "LOCAL" },
      remoteOnOptimistic: { from: 12, to: 15, insert: "REMOTE" },
      rebasedText: "😀 LOCAL\r\nB REMOTE"
    });
  });

  test("collapses multiple local batches only when their aggregate replacement stays disjoint", () => {
    let state = enqueue(hydrate("one middle two end", 4), [{ from: 0, to: 3, insert: "ONE" }]);
    state = sendHead(state).state;
    state = enqueue(state, [{ from: 15, to: 18, insert: "END" }]);
    const conflict = admit(state, state.generation, {
      kind: "revision-conflict",
      canonicalRevision: 8,
      canonicalText: "one REMOTE two end",
      isDirty: true
    });
    expect(conflict.kind).toBe("conflict");
    if (conflict.kind !== "conflict") throw new Error("Expected conflict.");

    const rebased = rebasePendingEditQueue(conflict.state, conflict.conflict);
    expect(rebased).toMatchObject({
      kind: "recovery-required",
      reason: "ambiguous-overlap",
      recovery: { localText: "ONE middle two END" }
    });
  });
});
