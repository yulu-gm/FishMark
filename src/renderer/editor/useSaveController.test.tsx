// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceDocumentSnapshot } from "../../shared/workspace";
import { useSaveController } from "./useSaveController";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Controller = ReturnType<typeof useSaveController>;

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

function renderController(input: Parameters<typeof useSaveController>[0]) {
  const latestRef = createRef<Controller>();
  const root: Root = createRoot(document.createElement("div"));
  function Probe(): null {
    const controller = useSaveController(input);
    useEffect(() => {
      latestRef.current = controller;
    }, [controller]);
    return null;
  }
  act(() => flushSync(() => root.render(createElement(Probe))));
  return { latestRef, root };
}

afterEach(() => vi.useRealTimers());

describe("useSaveController", () => {
  it("forwards a manual save as one application transaction", async () => {
    const runSaveTransaction = vi.fn(async () => ({
      kind: "committed" as const,
      tabId: "tab-1",
      value: { status: "cancelled" as const }
    }));
    const { latestRef, root } = renderController({
      getActiveDocument: () => createDocument(),
      runSaveTransaction,
      hasExternalFileConflict: () => true,
      autosaveDelayMs: 10,
      showNotification: vi.fn()
    });

    await act(async () => latestRef.current!.runManualSave());
    expect(runSaveTransaction).toHaveBeenCalledWith({
      forceSaveAs: false,
      hasExternalConflict: true
    });
    act(() => root.unmount());
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
    const { latestRef, root } = renderController({
      getActiveDocument: () => createDocument(),
      runSaveTransaction,
      hasExternalFileConflict: () => false,
      autosaveDelayMs: 10,
      showNotification: vi.fn()
    });

    const save = latestRef.current!.runManualSave();
    await vi.waitFor(() => expect(latestRef.current!.isSaveInFlight()).toBe(true));
    act(() => latestRef.current!.resetAutosaveRuntime());
    expect(latestRef.current!.isSaveInFlight()).toBe(true);
    resolveSave({ kind: "committed", tabId: "tab-1", value: { status: "cancelled" } });
    await save;
    act(() => root.unmount());
  });

  it("schedules autosave through the transaction boundary", async () => {
    const runSaveTransaction = vi.fn(async () => ({
      kind: "committed" as const,
      tabId: "tab-1",
      value: { status: "cancelled" as const }
    }));
    const { latestRef, root } = renderController({
      getActiveDocument: () => createDocument(),
      runSaveTransaction,
      hasExternalFileConflict: () => false,
      autosaveDelayMs: 1,
      showNotification: vi.fn()
    });
    act(() => latestRef.current!.scheduleAutosave());
    await vi.waitFor(() => expect(runSaveTransaction).toHaveBeenCalledTimes(1));
    expect(runSaveTransaction).toHaveBeenCalledWith({
      forceSaveAs: false,
      hasExternalConflict: false
    });
    act(() => root.unmount());
  });
});
