import { describe, expect, it, vi } from "vitest";

import {
  createRecovery,
  type RecoveryEditBatch,
  type RecoveryStoreLoadResult,
  type RecoveryStorePort
} from "./recovery";

const snapshot = {
  windows: [{ windowId: "window-1", tabIds: ["tab-1"], activeTabId: "tab-1" }],
  sessions: [],
  lastFocusedWindowId: "window-1",
  nextTabId: 2
};

const editBatch: RecoveryEditBatch = {
  kind: "edit-batch",
  tabId: "tab-1",
  clientId: "client-1",
  clientSequence: 1,
  baseRevision: 0,
  changes: [{ from: 0, to: 0, insert: "hello" }]
};

function createStore(load: RecoveryStoreLoadResult) {
  const store: RecoveryStorePort = {
    load: vi.fn(async () => load),
    appendEditBatch: vi.fn(async () => undefined),
    writeSnapshot: vi.fn(async () => undefined),
    truncateJournal: vi.fn(async () => undefined)
  };
  return store;
}

const parseSnapshot = (value: unknown) => (value === snapshot ? snapshot : null);
const parseEditBatch = (value: unknown) => (value === editBatch ? editBatch : null);

describe("createRecovery", () => {
  it("reports no recovery needed for an empty store", async () => {
    const recovery = createRecovery(createStore({ kind: "empty" }));
    await expect(recovery.loadRecovery(parseSnapshot, parseEditBatch)).resolves.toEqual({
      kind: "no-recovery-needed"
    });
  });

  it("reports corrupt for a corrupt store", async () => {
    const recovery = createRecovery(createStore({ kind: "corrupt", path: "/x" }));
    await expect(recovery.loadRecovery(parseSnapshot, parseEditBatch)).resolves.toEqual({
      kind: "corrupt",
      path: "/x"
    });
  });

  it("reports recovery-available with a snapshot and edit batches", async () => {
    const recovery = createRecovery(createStore({
      kind: "loaded",
      snapshot,
      entries: [editBatch]
    }));
    await expect(recovery.loadRecovery(parseSnapshot, parseEditBatch)).resolves.toEqual({
      kind: "recovery-available",
      snapshot,
      editBatches: [editBatch]
    });
  });

  it("compacts by writing a snapshot then truncating the journal", async () => {
    const store = createStore({ kind: "empty" });
    const recovery = createRecovery(store);
    await recovery.compact(snapshot);
    expect(store.writeSnapshot).toHaveBeenCalledWith(snapshot);
    expect(store.truncateJournal).toHaveBeenCalledOnce();
  });

  it("marks clean shutdown by truncating the journal", async () => {
    const store = createStore({ kind: "empty" });
    const recovery = createRecovery(store);
    await recovery.markCleanShutdown();
    expect(store.truncateJournal).toHaveBeenCalledOnce();
  });

  it("records an edit batch", async () => {
    const store = createStore({ kind: "empty" });
    const recovery = createRecovery(store);
    await recovery.recordEditBatch(editBatch);
    expect(store.appendEditBatch).toHaveBeenCalledWith(editBatch);
  });
});
