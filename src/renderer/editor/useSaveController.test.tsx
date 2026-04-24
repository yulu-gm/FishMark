// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceDocumentSnapshot, WorkspaceWindowSnapshot } from "../../shared/workspace";
import { useSaveController } from "./useSaveController";

type SaveControllerValue = ReturnType<typeof useSaveController>;

function createActiveDocument(
  input: Partial<WorkspaceDocumentSnapshot> & {
    tabId?: string;
    path?: string | null;
    name?: string;
    content?: string;
    isDirty?: boolean;
  } = {}
): WorkspaceDocumentSnapshot {
  return {
    tabId: input.tabId ?? "tab-1",
    path: input.path ?? "C:/notes/note.md",
    name: input.name ?? "note.md",
    content: input.content ?? "# Note\n",
    encoding: "utf-8",
    isDirty: input.isDirty ?? true,
    saveState: input.saveState ?? "idle"
  };
}

function renderController(input: Parameters<typeof useSaveController>[0]): {
  latestRef: { current: SaveControllerValue | null };
  root: Root;
} {
  const latestRef = createRef<SaveControllerValue>();
  const root = createRoot(document.createElement("div"));

  function Probe(): null {
    const controller = useSaveController(input);

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

afterEach(() => {
  vi.useRealTimers();
});

describe("useSaveController", () => {
  it("runs manual saves from the canonical active document and refreshes the main-owned workspace snapshot after success", async () => {
    const flushActiveWorkspaceDraft = vi.fn(async () => {});
    const saveMarkdownFile = vi.fn(async () => ({
      status: "success" as const,
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Canonical\n",
        encoding: "utf-8" as const
      }
    }));
    const refreshWorkspaceSnapshot = vi.fn(async (): Promise<WorkspaceWindowSnapshot> => ({
      windowId: "window-1",
      activeTabId: "tab-1",
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/note.md",
          name: "note.md",
          isDirty: false,
          saveState: "idle"
        }
      ],
      activeDocument: {
        tabId: "tab-1",
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Canonical\n",
        encoding: "utf-8",
        isDirty: false,
        saveState: "idle"
      }
    }));
    const getActiveDocument = vi.fn(() => createActiveDocument({ content: "# Canonical\n" }));

    const { latestRef, root } = renderController({
      fishmark: {
        saveMarkdownFile
      } as unknown as Window["fishmark"],
      getActiveDocument,
      getEditorContent: () => "# Canonical\n",
      flushActiveWorkspaceDraft,
      refreshWorkspaceSnapshot,
      hasExternalFileConflict: () => false,
      autosaveDelayMs: 10,
      showNotification: vi.fn()
    });

    await act(async () => {
      await latestRef.current?.runManualSave();
    });

    expect(flushActiveWorkspaceDraft).toHaveBeenCalledTimes(2);
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      tabId: "tab-1",
      path: "C:/notes/note.md"
    });
    expect(refreshWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    expect(refreshWorkspaceSnapshot.mock.invocationCallOrder[0]).toBeGreaterThan(
      saveMarkdownFile.mock.invocationCallOrder[0]!
    );
    expect(refreshWorkspaceSnapshot.mock.invocationCallOrder[0]).toBeGreaterThan(
      flushActiveWorkspaceDraft.mock.invocationCallOrder[1]!
    );

    act(() => {
      root.unmount();
    });
  });

  it("flushes edits made during an in-flight save before refreshing the canonical snapshot", async () => {
    let resolveSave!: (value: {
      status: "success";
      document: {
        path: string;
        name: string;
        content: string;
        encoding: "utf-8";
      };
    }) => void;
    const saveResultPromise = new Promise<{
      status: "success";
      document: {
        path: string;
        name: string;
        content: string;
        encoding: "utf-8";
      };
    }>((resolve) => {
      resolveSave = resolve;
    });
    const flushActiveWorkspaceDraft = vi.fn(async () => {});
    const saveMarkdownFile = vi.fn(() => saveResultPromise);
    const refreshWorkspaceSnapshot = vi.fn(async () => null);
    let editorContent = "# Saved draft\n";

    const { latestRef, root } = renderController({
      fishmark: {
        saveMarkdownFile
      } as unknown as Window["fishmark"],
      getActiveDocument: () => createActiveDocument({ content: "# Saved draft\n" }),
      getEditorContent: () => editorContent,
      flushActiveWorkspaceDraft,
      refreshWorkspaceSnapshot,
      hasExternalFileConflict: () => false,
      autosaveDelayMs: 10,
      showNotification: vi.fn()
    });

    const savePromise = act(async () => {
      await latestRef.current?.runManualSave();
    });

    await vi.waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    });

    editorContent = "# Newer draft\n";
    resolveSave({
      status: "success",
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Saved draft\n",
        encoding: "utf-8"
      }
    });

    await savePromise;

    expect(flushActiveWorkspaceDraft).toHaveBeenCalledTimes(2);
    expect(refreshWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    expect(refreshWorkspaceSnapshot.mock.invocationCallOrder[0]).toBeGreaterThan(
      flushActiveWorkspaceDraft.mock.invocationCallOrder[1]!
    );

    act(() => {
      root.unmount();
    });
  });

  it("schedules autosave from the current canonical projection and skips it when conflicts are active", async () => {
    vi.useFakeTimers();

    const flushActiveWorkspaceDraft = vi.fn(async () => {});
    const saveMarkdownFile = vi.fn(async () => ({
      status: "success" as const,
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Saved\n",
        encoding: "utf-8" as const
      }
    }));
    const refreshWorkspaceSnapshot = vi.fn(async () => null);
    const getActiveDocument = vi.fn(() => createActiveDocument({ content: "# Draft\n" }));
    let hasConflict = false;

    const { latestRef, root } = renderController({
      fishmark: {
        saveMarkdownFile
      } as unknown as Window["fishmark"],
      getActiveDocument,
      getEditorContent: () => "# Draft\n",
      flushActiveWorkspaceDraft,
      refreshWorkspaceSnapshot,
      hasExternalFileConflict: () => hasConflict,
      autosaveDelayMs: 25,
      showNotification: vi.fn()
    });

    act(() => {
      latestRef.current?.scheduleAutosave();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);

    hasConflict = true;
    saveMarkdownFile.mockClear();

    act(() => {
      latestRef.current?.scheduleAutosave();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("treats editor buffer changes as pending autosave work even before the canonical snapshot turns dirty", async () => {
    vi.useFakeTimers();

    const flushActiveWorkspaceDraft = vi.fn(async () => {});
    const saveMarkdownFile = vi.fn(async () => ({
      status: "success" as const,
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Draft\n",
        encoding: "utf-8" as const
      }
    }));
    const refreshWorkspaceSnapshot = vi.fn(async () => null);
    const getActiveDocument = vi.fn(() =>
      createActiveDocument({ content: "# Canonical\n", isDirty: false })
    );

    const { latestRef, root } = renderController({
      fishmark: {
        saveMarkdownFile
      } as unknown as Window["fishmark"],
      getActiveDocument,
      getEditorContent: () => "# Draft\n",
      flushActiveWorkspaceDraft,
      refreshWorkspaceSnapshot,
      hasExternalFileConflict: () => false,
      autosaveDelayMs: 25,
      showNotification: vi.fn()
    });

    act(() => {
      latestRef.current?.scheduleAutosave();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });

    expect(flushActiveWorkspaceDraft).toHaveBeenCalledTimes(2);
    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      tabId: "tab-1",
      path: "C:/notes/note.md"
    });

    act(() => {
      root.unmount();
    });
  });
});
