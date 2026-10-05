import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceDocumentSnapshot } from "../../shared/workspace";
import { WorkspaceSaveScheduler } from "./workspace-save-scheduler";

function createDocument(): WorkspaceDocumentSnapshot {
  return {
    tabId: "tab-1",
    path: "C:/notes/note.md",
    name: "note.md",
    content: "# Draft\n",
    encoding: "utf-8",
    revision: 1,
    savedRevision: 0,
    isDirty: true,
    saveState: "idle"
  };
}

afterEach(() => vi.useRealTimers());

describe("WorkspaceSaveScheduler", () => {
  it("forwards a manual save as one application transaction", async () => {
    const runSaveTransaction = vi.fn(async () => ({
      kind: "committed" as const,
      tabId: "tab-1",
      value: { status: "cancelled" as const }
    }));
    const scheduler = new WorkspaceSaveScheduler({
      getActiveDocument: () => createDocument(),
      runSaveTransaction,
      hasExternalFileConflict: () => true,
      autosaveDelayMs: 10,
      showNotification: vi.fn()
    });

    await scheduler.runManualSave();
    expect(runSaveTransaction).toHaveBeenCalledWith({
      forceSaveAs: false,
      hasExternalConflict: true
    });
    scheduler.dispose();
  });

  it("does not clear a real in-flight save when navigation resets autosave runtime", async () => {
    let resolveSave!: (value: {
      kind: "committed";
      tabId: string;
      value: { status: "cancelled" };
    }) => void;
    const transaction = new Promise<{
      kind: "committed";
      tabId: string;
      value: { status: "cancelled" };
    }>((resolve) => { resolveSave = resolve; });
    const runSaveTransaction = vi.fn(() => transaction);
    const scheduler = new WorkspaceSaveScheduler({
      getActiveDocument: () => createDocument(),
      runSaveTransaction,
      hasExternalFileConflict: () => false,
      autosaveDelayMs: 10,
      showNotification: vi.fn()
    });

    const save = scheduler.runManualSave();
    await vi.waitFor(() => expect(scheduler.isSaveInFlight()).toBe(true));
    scheduler.resetAutosaveRuntime();
    expect(scheduler.isSaveInFlight()).toBe(true);
    resolveSave({ kind: "committed", tabId: "tab-1", value: { status: "cancelled" } });
    await save;
    scheduler.dispose();
  });

  it("schedules autosave through the transaction boundary", async () => {
    const runSaveTransaction = vi.fn(async () => ({
      kind: "committed" as const,
      tabId: "tab-1",
      value: { status: "cancelled" as const }
    }));
    const scheduler = new WorkspaceSaveScheduler({
      getActiveDocument: () => createDocument(),
      runSaveTransaction,
      hasExternalFileConflict: () => false,
      autosaveDelayMs: 1,
      showNotification: vi.fn()
    });
    scheduler.scheduleAutosave();
    await vi.waitFor(() => expect(runSaveTransaction).toHaveBeenCalledTimes(1));
    expect(runSaveTransaction).toHaveBeenCalledWith({
      forceSaveAs: false,
      hasExternalConflict: false
    });
    scheduler.dispose();
  });
});

describe("save scheduler disposal", () => {
  it("cancels a queued autosave and suppresses late failure notification and replay", async () => {
    vi.useFakeTimers();
    let rejectSave!: (reason: Error) => void;
    const runSaveTransaction = vi.fn(() => new Promise<never>((_, reject) => { rejectSave = reject; }));
    const showNotification = vi.fn();
    const scheduler = new WorkspaceSaveScheduler({ getActiveDocument: createDocument, runSaveTransaction, hasExternalFileConflict: () => false, autosaveDelayMs: 10, showNotification });
    scheduler.scheduleAutosave();
    const saving = scheduler.runManualSave();
    scheduler.scheduleAutosave();
    scheduler.dispose();
    rejectSave(new Error("late transport failure"));
    await saving;
    await vi.runAllTimersAsync();
    expect(runSaveTransaction).toHaveBeenCalledTimes(1);
    expect(showNotification).not.toHaveBeenCalled();
    expect(scheduler.isSaveInFlight()).toBe(false);
  });
});
