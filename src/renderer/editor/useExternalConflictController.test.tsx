// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExternalMarkdownFileChangedEvent } from "../../shared/external-file-change";
import type { WorkspaceDocumentSnapshot } from "../../shared/workspace";
import { useExternalConflictController } from "./useExternalConflictController";

type ExternalConflictControllerValue = ReturnType<typeof useExternalConflictController>;

function createActiveDocument(
  input: Partial<WorkspaceDocumentSnapshot> & { path?: string | null } = {}
): WorkspaceDocumentSnapshot {
  return {
    tabId: input.tabId ?? "tab-1",
    path: input.path ?? "C:/notes/note.md",
    name: input.name ?? "note.md",
    content: input.content ?? "# Note\n",
    encoding: "utf-8",
    revision: input.revision ?? (input.isDirty ? 1 : 0),
    savedRevision: input.savedRevision ?? 0,
    isDirty: input.isDirty ?? false,
    saveState: input.saveState ?? "idle"
  };
}

function renderController(input: Parameters<typeof useExternalConflictController>[0]): {
  latestRef: { current: ExternalConflictControllerValue | null };
  root: Root;
} {
  const latestRef = createRef<ExternalConflictControllerValue>();
  const root = createRoot(document.createElement("div"));

  function Probe(): null {
    const controller = useExternalConflictController(input);

    useEffect(() => {
      latestRef.current = controller;
    }, [controller]);

    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return { latestRef, root };
}

function createExternalChange(
  input: Partial<ExternalMarkdownFileChangedEvent> = {}
): ExternalMarkdownFileChangedEvent {
  return {
    path: input.path ?? "C:/notes/note.md",
    kind: input.kind ?? "modified"
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useExternalConflictController", () => {
  it("enters a pending state only for the active document path and pauses autosave runtime", async () => {
    const resetAutosaveRuntime = vi.fn();
    const { latestRef, root } = renderController({
      fishmark: {
        onExternalMarkdownFileChanged: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getActiveDocument: () => createActiveDocument(),
      reloadActiveDocument: vi.fn(async () => true),
      resetAutosaveRuntime,
      showNotification: vi.fn()
    });

    await act(async () => {
      latestRef.current?.handleExternalMarkdownFileChanged(createExternalChange());
    });

    expect(resetAutosaveRuntime).toHaveBeenCalledTimes(1);
    expect(latestRef.current?.externalFileState).toEqual({
      status: "pending",
      path: "C:/notes/note.md",
      kind: "modified"
    });

    await act(async () => {
      latestRef.current?.handleExternalMarkdownFileChanged(
        createExternalChange({ path: "C:/notes/other.md" })
      );
    });

    expect(latestRef.current?.externalFileState).toEqual({
      status: "pending",
      path: "C:/notes/note.md",
      kind: "modified"
    });

    act(() => {
      root.unmount();
    });
  });

  it("keeps the in-memory version and clears the conflict after a successful reload", async () => {
    const reloadActiveDocument = vi.fn(async () => true);
    const { latestRef, root } = renderController({
      fishmark: {
        onExternalMarkdownFileChanged: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getActiveDocument: () => createActiveDocument(),
      reloadActiveDocument,
      resetAutosaveRuntime: vi.fn(),
      showNotification: vi.fn()
    });

    await act(async () => {
      latestRef.current?.handleExternalMarkdownFileChanged(createExternalChange({ kind: "deleted" }));
    });

    act(() => {
      latestRef.current?.keepMemoryVersion();
    });

    expect(latestRef.current?.externalFileState).toEqual({
      status: "keeping-memory",
      path: "C:/notes/note.md",
      kind: "deleted"
    });

    await act(async () => {
      await latestRef.current?.reloadFromDisk();
    });

    expect(reloadActiveDocument).toHaveBeenCalledTimes(1);
    expect(latestRef.current?.externalFileState).toEqual({ status: "idle" });

    act(() => {
      root.unmount();
    });
  });
});
