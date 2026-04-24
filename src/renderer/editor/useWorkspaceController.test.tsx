// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { useEditorWorkflowController } from "./useEditorWorkflowController";
import { useWorkspaceController } from "./useWorkspaceController";

type WorkspaceControllerValue = ReturnType<typeof useWorkspaceController>;
type EditorWorkflowControllerValue = ReturnType<typeof useEditorWorkflowController>;

function createWorkspaceSnapshot(input: {
  activeTabId?: string | null;
  tabs: Array<{
    tabId: string;
    path: string | null;
    name: string;
    content: string;
    isDirty?: boolean;
  }>;
}): WorkspaceWindowSnapshot {
  const activeTabId = input.activeTabId ?? input.tabs[0]?.tabId ?? null;
  const activeDocument =
    activeTabId === null ? null : input.tabs.find((tab) => tab.tabId === activeTabId) ?? null;

  return {
    windowId: "window-1",
    activeTabId,
    tabs: input.tabs.map((tab) => ({
      tabId: tab.tabId,
      path: tab.path,
      name: tab.name,
      isDirty: tab.isDirty ?? false,
      saveState: "idle"
    })),
    activeDocument: activeDocument
      ? {
          tabId: activeDocument.tabId,
          path: activeDocument.path,
          name: activeDocument.name,
          content: activeDocument.content,
          encoding: "utf-8",
          isDirty: activeDocument.isDirty ?? false,
          saveState: "idle"
        }
      : null
  };
}

function renderController(input: Parameters<typeof useWorkspaceController>[0]): {
  latestRef: { current: WorkspaceControllerValue | null };
  root: Root;
  container: HTMLDivElement;
} {
  const latestRef = createRef<WorkspaceControllerValue>();
  const container = document.createElement("div");
  const root = createRoot(container);

  function Probe(): null {
    const controller = useWorkspaceController(input);

    useEffect(() => {
      latestRef.current = controller;
    }, [controller]);

    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return { latestRef, root, container };
}

function renderEditorWorkflowController(
  input: Parameters<typeof useEditorWorkflowController>[0]
): {
  latestRef: { current: EditorWorkflowControllerValue | null };
  root: Root;
} {
  const latestRef = createRef<EditorWorkflowControllerValue>();
  const root = createRoot(document.createElement("div"));

  function Probe(): null {
    const controller = useEditorWorkflowController(input);

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
  document.body.innerHTML = "";
});

describe("useWorkspaceController", () => {
  it("updates the active editor by syncing the draft through the canonical workspace bridge", async () => {
    const updateWorkspaceTabDraft = vi.fn(async () =>
      createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/note.md",
            name: "note.md",
            content: "# Updated\n",
            isDirty: true
          }
        ]
      })
    );

    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/note.md",
            name: "note.md",
            content: "# Note\n"
          }
        ]
      }),
      getEditorContent: () => "# Updated\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await latestRef.current?.updateDraft("# Updated\n");
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Updated\n"
    });
    expect(latestRef.current?.workspaceSnapshot?.activeDocument?.content).toBe("# Updated\n");

    act(() => {
      root.unmount();
    });
  });

  it("flushes the active draft before switching tabs", async () => {
    const updateWorkspaceTabDraft = vi.fn(async () =>
      createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/first.md",
            name: "first.md",
            content: "# First updated\n",
            isDirty: true
          },
          {
            tabId: "tab-2",
            path: "C:/notes/second.md",
            name: "second.md",
            content: "# Second\n"
          }
        ]
      })
    );
    const activateWorkspaceTab = vi.fn(async () =>
      createWorkspaceSnapshot({
        activeTabId: "tab-2",
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/first.md",
            name: "first.md",
            content: "# First updated\n",
            isDirty: true
          },
          {
            tabId: "tab-2",
            path: "C:/notes/second.md",
            name: "second.md",
            content: "# Second\n"
          }
        ]
      })
    );

    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/first.md",
            name: "first.md",
            content: "# First\n"
          },
          {
            tabId: "tab-2",
            path: "C:/notes/second.md",
            name: "second.md",
            content: "# Second\n"
          }
        ]
      }),
      getEditorContent: () => "# First updated\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await latestRef.current?.activateWorkspaceTab("tab-2");
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# First updated\n"
    });
    expect(activateWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-2" });
    expect(updateWorkspaceTabDraft.mock.invocationCallOrder[0]).toBeLessThan(
      activateWorkspaceTab.mock.invocationCallOrder[0]!
    );
    expect(latestRef.current?.workspaceSnapshot?.activeTabId).toBe("tab-2");

    act(() => {
      root.unmount();
    });
  });

  it("flushes the active draft before opening a workspace file", async () => {
    const updateWorkspaceTabDraft = vi.fn(async () =>
      createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/current.md",
            name: "current.md",
            content: "# Unsynced current\n",
            isDirty: true
          }
        ]
      })
    );
    const openWorkspaceFile = vi.fn(async () => ({
      kind: "success" as const,
      snapshot: createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-2",
            path: "C:/notes/opened.md",
            name: "opened.md",
            content: "# Opened\n"
          }
        ]
      })
    }));

    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        openWorkspaceFile
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/current.md",
            name: "current.md",
            content: "# Current\n"
          }
        ]
      }),
      getEditorContent: () => "# Unsynced current\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await latestRef.current?.openMarkdown();
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Unsynced current\n"
    });
    expect(openWorkspaceFile).toHaveBeenCalledTimes(1);
    expect(updateWorkspaceTabDraft.mock.invocationCallOrder[0]).toBeLessThan(
      openWorkspaceFile.mock.invocationCallOrder[0]!
    );
    expect(latestRef.current?.workspaceSnapshot?.activeTabId).toBe("tab-2");

    act(() => {
      root.unmount();
    });
  });

  it("does not replace the workspace when the active draft cannot flush before opening", async () => {
    const showNotification = vi.fn();
    const updateWorkspaceTabDraft = vi.fn(async () => {
      throw new Error("Draft sync failed");
    });
    const openWorkspaceFileFromPath = vi.fn(async () => ({
      kind: "success" as const,
      snapshot: createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-2",
            path: "C:/notes/opened.md",
            name: "opened.md",
            content: "# Opened\n"
          }
        ]
      })
    }));

    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        openWorkspaceFileFromPath
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/current.md",
            name: "current.md",
            content: "# Current\n"
          }
        ]
      }),
      getEditorContent: () => "# Unsynced current\n",
      showNotification
    });

    await act(async () => {
      await latestRef.current?.openMarkdownFromPath("C:/notes/opened.md");
    });

    expect(openWorkspaceFileFromPath).not.toHaveBeenCalled();
    expect(latestRef.current?.workspaceSnapshot?.activeTabId).toBe("tab-1");
    expect(showNotification).toHaveBeenCalledWith({
      kind: "error",
      message: "Draft sync failed"
    });

    act(() => {
      root.unmount();
    });
  });

  it("flushes the active draft before creating an untitled workspace tab", async () => {
    const updateWorkspaceTabDraft = vi.fn(async () =>
      createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/current.md",
            name: "current.md",
            content: "# Current draft\n",
            isDirty: true
          }
        ]
      })
    );
    const createWorkspaceTab = vi.fn(async () =>
      createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/current.md",
            name: "current.md",
            content: "# Current draft\n"
          },
          {
            tabId: "tab-2",
            path: null,
            name: "Untitled.md",
            content: ""
          }
        ],
        activeTabId: "tab-2"
      })
    );

    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        createWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/current.md",
            name: "current.md",
            content: "# Current\n"
          }
        ]
      }),
      getEditorContent: () => "# Current draft\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await latestRef.current?.createUntitledMarkdown();
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Current draft\n"
    });
    expect(createWorkspaceTab).toHaveBeenCalledWith({ kind: "untitled" });
    expect(updateWorkspaceTabDraft.mock.invocationCallOrder[0]).toBeLessThan(
      createWorkspaceTab.mock.invocationCallOrder[0]!
    );
    expect(latestRef.current?.workspaceSnapshot?.activeTabId).toBe("tab-2");

    act(() => {
      root.unmount();
    });
  });

  it("does not reload the editor when a refresh returns an older snapshot while the editor has a newer draft", async () => {
    const savedSnapshot = createWorkspaceSnapshot({
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/saved-as.md",
          name: "saved-as.md",
          content: "# Saved draft\n",
          isDirty: false
        }
      ]
    });
    const newerDraftSnapshot = createWorkspaceSnapshot({
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/note.md",
          name: "note.md",
          content: "# Newer draft\n",
          isDirty: true
        }
      ]
    });
    const updateWorkspaceTabDraft = vi.fn(async () => newerDraftSnapshot);
    const getWorkspaceSnapshot = vi.fn(async () => savedSnapshot);

    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        getWorkspaceSnapshot
      } as unknown as Window["fishmark"],
      initialSnapshot: savedSnapshot,
      getEditorContent: () => "# Newer draft\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await latestRef.current?.updateDraft("# Newer draft\n");
    });

    const draftRevision = latestRef.current?.editorLoadRevision;

    await act(async () => {
      await latestRef.current?.refreshWorkspaceSnapshot();
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Newer draft\n"
    });
    expect(getWorkspaceSnapshot).toHaveBeenCalledTimes(1);
    expect(latestRef.current?.editorLoadRevision).toBe(draftRevision);
    expect(latestRef.current?.workspaceSnapshot?.activeDocument).toMatchObject({
      path: "C:/notes/saved-as.md",
      name: "saved-as.md",
      content: "# Newer draft\n",
      isDirty: true
    });
    expect(latestRef.current?.workspaceSnapshot?.tabs[0]).toMatchObject({
      path: "C:/notes/saved-as.md",
      name: "saved-as.md",
      isDirty: true
    });

    act(() => {
      root.unmount();
    });
  });
});

describe("useEditorWorkflowController", () => {
  it("keeps editor change autosave and draft sync orchestration inside the controller boundary", async () => {
    const setEditorContentSnapshot = vi.fn();
    const updateOutline = vi.fn();
    const scheduleAutosave = vi.fn();
    const updateDraft = vi.fn(async () => {});

    const { latestRef, root } = renderEditorWorkflowController({
      setEditorContentSnapshot,
      updateOutline,
      scheduleAutosave,
      runAutosave: vi.fn(async () => {}),
      resetAutosaveRuntime: vi.fn(),
      getActiveTabId: () => "tab-1",
      updateDraft,
      activateWorkspaceTab: vi.fn(async () => {}),
      closeWorkspaceTab: vi.fn(async () => {}),
      detachWorkspaceTab: vi.fn(async () => {})
    });

    await act(async () => {
      latestRef.current?.handleEditorContentChange("# Draft\n");
      await Promise.resolve();
    });

    expect(setEditorContentSnapshot).toHaveBeenCalledWith("# Draft\n");
    expect(updateOutline).toHaveBeenCalledWith("# Draft\n");
    expect(scheduleAutosave).toHaveBeenCalledTimes(1);
    expect(updateDraft).toHaveBeenCalledWith("# Draft\n");
    expect(scheduleAutosave.mock.invocationCallOrder[0]).toBeLessThan(
      updateDraft.mock.invocationCallOrder[0]!
    );

    act(() => {
      root.unmount();
    });
  });

  it("keeps active tab autosave reset and reschedule orchestration inside the controller boundary", async () => {
    const resetAutosaveRuntime = vi.fn();
    const scheduleAutosave = vi.fn();
    const activateWorkspaceTab = vi.fn(async () => {});

    const { latestRef, root } = renderEditorWorkflowController({
      setEditorContentSnapshot: vi.fn(),
      updateOutline: vi.fn(),
      scheduleAutosave,
      runAutosave: vi.fn(async () => {}),
      resetAutosaveRuntime,
      getActiveTabId: () => "tab-1",
      updateDraft: vi.fn(async () => {}),
      activateWorkspaceTab,
      closeWorkspaceTab: vi.fn(async () => {}),
      detachWorkspaceTab: vi.fn(async () => {})
    });

    await act(async () => {
      await latestRef.current?.activateWorkspaceTab("tab-2");
    });

    expect(resetAutosaveRuntime).toHaveBeenCalledTimes(1);
    expect(activateWorkspaceTab).toHaveBeenCalledWith("tab-2");
    expect(scheduleAutosave).toHaveBeenCalledTimes(1);
    expect(resetAutosaveRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      activateWorkspaceTab.mock.invocationCallOrder[0]!
    );
    expect(scheduleAutosave.mock.invocationCallOrder[0]).toBeGreaterThan(
      activateWorkspaceTab.mock.invocationCallOrder[0]!
    );

    act(() => {
      root.unmount();
    });
  });
});
