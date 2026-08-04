import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createApplyDocumentEdits,
  createFlushDocumentEdits,
  type ApplyDocumentEditsInput,
  type KeyedOperationCoordinator
} from "./index";

expectTypeOf<ApplyDocumentEditsInput["baseRevision"]>().toEqualTypeOf<unknown>();
expectTypeOf<ApplyDocumentEditsInput["changes"]>().toEqualTypeOf<unknown>();

const authorizeCurrent = () => undefined;

function createSerialCoordinator() {
  const tails = new Map<string, Promise<void>>();
  const coordinator: Pick<KeyedOperationCoordinator<string>, "runExclusive"> = {
    async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const next = new Promise<void>((resolve) => { release = resolve; });
      tails.set(key, previous.then(() => next));
      await previous;
      try {
        return await operation();
      } finally {
        release();
      }
    }
  };
  return coordinator;
}

function createFixture() {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("window-1");
  const firstTabId = workspace.createUntitledTab("window-1").activeTabId!;
  const secondTabId = workspace.createUntitledTab("window-1").activeTabId!;
  const documentOperations = createSerialCoordinator();
  return {
    workspace,
    firstTabId,
    secondTabId,
    apply: createApplyDocumentEdits({ workspace, documentOperations }),
    flush: createFlushDocumentEdits({ workspace, documentOperations })
  };
}

describe("serialized document edits", () => {
  it("applies and flushes through one per-tab FIFO barrier", async () => {
    const fixture = createFixture();
    const applyPromise = fixture.apply.apply({
      tabId: fixture.firstTabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "first" }]
    }, authorizeCurrent);
    const flushPromise = fixture.flush.flush({
      tabId: fixture.firstTabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      throughSequence: 1
    }, authorizeCurrent);

    await expect(applyPromise).resolves.toMatchObject({ kind: "applied" });
    await expect(flushPromise).resolves.toEqual({
      kind: "flushed",
      acknowledgedSequence: 1,
      revision: 1,
      savedRevision: 0,
      isDirty: true
    });
  });

  it("allows a zero barrier and reports an exact sequence gap", async () => {
    const fixture = createFixture();

    await expect(fixture.flush.flush({
      tabId: fixture.firstTabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      throughSequence: 0
    }, authorizeCurrent)).resolves.toEqual({
      kind: "flushed",
      acknowledgedSequence: 0,
      revision: 0,
      savedRevision: 0,
      isDirty: false
    });
    await expect(fixture.flush.flush({
      tabId: fixture.firstTabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      throughSequence: 2
    }, authorizeCurrent)).resolves.toEqual({
      kind: "sequence-gap",
      expectedSequence: 1,
      canonicalRevision: 0
    });
  });

  it("tracks barriers independently per client", async () => {
    const fixture = createFixture();
    await fixture.apply.apply({
      tabId: fixture.firstTabId,
      expectedWindowId: "window-1",
      clientId: "client-a",
      clientSequence: 1,
      baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "x" }]
    }, authorizeCurrent);

    await expect(fixture.flush.flush({
      tabId: fixture.firstTabId,
      expectedWindowId: "window-1",
      clientId: "client-b",
      throughSequence: 1
    }, authorizeCurrent)).resolves.toMatchObject({ kind: "sequence-gap", expectedSequence: 1 });
  });

  it("does not serialize unrelated tabs", async () => {
    const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
    workspace.registerWindow("window-1");
    const firstTabId = workspace.createUntitledTab("window-1").activeTabId!;
    const secondTabId = workspace.createUntitledTab("window-1").activeTabId!;
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const events: string[] = [];
    const documentOperations = createSerialCoordinator();
    const apply = createApplyDocumentEdits({
      workspace: {
        applyDocumentEdits: async (input) => {
          events.push(`start:${input.tabId}`);
          if (input.tabId === firstTabId) await firstBlocked;
          events.push(`finish:${input.tabId}`);
          return workspace.applyDocumentEdits(input);
        }
      },
      documentOperations
    });

    const first = apply.apply({
      tabId: firstTabId, expectedWindowId: "window-1", clientId: "a",
      clientSequence: 1, baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "a" }]
    }, authorizeCurrent);
    const second = apply.apply({
      tabId: secondTabId, expectedWindowId: "window-1", clientId: "b",
      clientSequence: 1, baseRevision: 0,
      changes: [{ from: 0, to: 0, insert: "b" }]
    }, authorizeCurrent);
    await second;
    expect(events).toEqual([
      `start:${firstTabId}`,
      `start:${secondTabId}`,
      `finish:${secondTabId}`
    ]);
    releaseFirst();
    await first;
  });
});
