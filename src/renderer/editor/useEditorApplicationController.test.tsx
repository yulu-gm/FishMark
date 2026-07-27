// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { useEditorApplicationController } from "./useEditorApplicationController";

type EditorApplicationControllerValue = ReturnType<typeof useEditorApplicationController>;

const emptySnapshot: WorkspaceWindowSnapshot = {
  windowId: "window-1",
  activeTabId: null,
  tabs: [],
  activeDocument: null
};

const savedSnapshot: WorkspaceWindowSnapshot = {
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
    content: "# Saved\n",
    encoding: "utf-8",
    isDirty: false,
    saveState: "idle"
  }
};

const secondTabActiveSnapshot: WorkspaceWindowSnapshot = {
  windowId: "window-1",
  activeTabId: "tab-2",
  tabs: [
    {
      tabId: "tab-1",
      path: "C:/notes/first.md",
      name: "first.md",
      isDirty: false,
      saveState: "idle"
    },
    {
      tabId: "tab-2",
      path: "C:/notes/second.md",
      name: "second.md",
      isDirty: false,
      saveState: "idle"
    }
  ],
  activeDocument: {
    tabId: "tab-2",
    path: "C:/notes/second.md",
    name: "second.md",
    content: "# Second\n",
    encoding: "utf-8",
    isDirty: false,
    saveState: "idle"
  }
};

function renderController(input: Parameters<typeof useEditorApplicationController>[0]): {
  latestRef: { current: EditorApplicationControllerValue | null };
  root: Root;
} {
  const latestRef = createRef<EditorApplicationControllerValue>();
  const root = createRoot(document.createElement("div"));

  function Probe(): null {
    const controller = useEditorApplicationController(input);

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

describe("useEditorApplicationController", () => {
  it("keeps save command orchestration behind the renderer application boundary", async () => {
    const updateWorkspaceTabDraft = vi.fn(async () => savedSnapshot);
    const saveMarkdownFile = vi.fn(async () => ({
      status: "success" as const,
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Saved\n",
        encoding: "utf-8" as const
      }
    }));
    const getWorkspaceSnapshot = vi.fn(async () => savedSnapshot);

    const { latestRef, root } = renderController({
      autosaveDelayMs: 25,
      fishmark: {
        updateWorkspaceTabDraft,
        saveMarkdownFile,
        getWorkspaceSnapshot,
        onExternalMarkdownFileChanged: vi.fn(() => () => {}),
        onWorkspaceOwnerTabActivationRequest: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getEditorContent: () => "# Saved\n",
      setEditorContentSnapshot: vi.fn(),
      showNotification: vi.fn(),
      scheduleDocumentDerivedDataUpdate: vi.fn(),
      initialSnapshot: {
        ...savedSnapshot,
        activeDocument: {
          ...savedSnapshot.activeDocument!,
          content: "# Draft\n",
          isDirty: true
        }
      }
    });

    await act(async () => {
      await latestRef.current?.commands.saveMarkdown();
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Saved\n"
    });
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      tabId: "tab-1"
    });
    expect(getWorkspaceSnapshot).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("exports the active document as standalone FishMark HTML without saving Markdown", async () => {
    const exportedSnapshot: WorkspaceWindowSnapshot = {
      ...savedSnapshot,
      activeDocument: {
        ...savedSnapshot.activeDocument!,
        content: "# Exported\n",
        isDirty: true
      }
    };
    const updateWorkspaceTabDraft = vi.fn(async () => exportedSnapshot);
    const saveMarkdownFile = vi.fn();
    const exportHtmlFile = vi.fn(async () => ({
      status: "success" as const,
      path: "C:/notes/note.html",
      name: "note.html"
    }));
    const showNotification = vi.fn();

    const { latestRef, root } = renderController({
      autosaveDelayMs: 25,
      fishmark: {
        updateWorkspaceTabDraft,
        saveMarkdownFile,
        exportHtmlFile,
        getWorkspaceSnapshot: vi.fn(async () => savedSnapshot),
        onExternalMarkdownFileChanged: vi.fn(() => () => {}),
        onWorkspaceOwnerTabActivationRequest: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getEditorContent: () => "# Exported\n",
      setEditorContentSnapshot: vi.fn(),
      showNotification,
      scheduleDocumentDerivedDataUpdate: vi.fn(),
      initialSnapshot: {
        ...savedSnapshot,
        activeDocument: {
          ...savedSnapshot.activeDocument!,
          content: "# Draft\n",
          isDirty: true
        }
      }
    });

    await act(async () => {
      await latestRef.current?.commands.exportHtml();
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Exported\n"
    });
    expect(saveMarkdownFile).not.toHaveBeenCalled();
    expect(exportHtmlFile).toHaveBeenCalledWith({
      tabId: "tab-1",
      currentPath: "C:/notes/note.md",
      html: expect.stringContaining("cm-line cm-inactive-heading cm-inactive-heading-depth-1")
    });
    expect(showNotification).toHaveBeenCalledWith({
      kind: "info",
      message: "HTML exported."
    });

    act(() => {
      root.unmount();
    });
  });

  it("exposes menu-scale open commands without App wiring workspace and autosave controllers", async () => {
    const openWorkspaceFile = vi.fn(async () => ({
      kind: "opened" as const,
      snapshot: savedSnapshot
    }));

    const { latestRef, root } = renderController({
      autosaveDelayMs: 25,
      fishmark: {
        getWorkspaceSnapshot: vi.fn(async () => emptySnapshot),
        openWorkspaceFile,
        updateWorkspaceTabDraft: vi.fn(async () => emptySnapshot),
        onExternalMarkdownFileChanged: vi.fn(() => () => {}),
        onWorkspaceOwnerTabActivationRequest: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getEditorContent: () => "",
      setEditorContentSnapshot: vi.fn(),
      showNotification: vi.fn(),
      scheduleDocumentDerivedDataUpdate: vi.fn(),
      initialSnapshot: emptySnapshot
    });

    await expect(latestRef.current?.commands.openMarkdown()).resolves.toBe("opened");
    expect(openWorkspaceFile).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("does not flush stale editor content into a different active tab when a save completes after tab switch", async () => {
    const saveResult = createDeferred<{
      status: "success";
      document: {
        path: string;
        name: string;
        content: string;
        encoding: "utf-8";
      };
    }>();
    const firstDirtySnapshot: WorkspaceWindowSnapshot = {
      windowId: "window-1",
      activeTabId: "tab-1",
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          isDirty: true,
          saveState: "idle"
        }
      ],
      activeDocument: {
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First dirty\n",
        encoding: "utf-8",
        isDirty: true,
        saveState: "idle"
      }
    };
    const updateWorkspaceTabDraft = vi.fn(async (input: { tabId: string; content: string }) => {
      if (input.tabId === "tab-2") {
        throw new Error("stale editor content flushed into the new active tab");
      }

      return secondTabActiveSnapshot;
    });
    const saveMarkdownFile = vi.fn(() => saveResult.promise);
    const getWorkspaceSnapshot = vi.fn(async () => secondTabActiveSnapshot);

    const { latestRef, root } = renderController({
      autosaveDelayMs: 25,
      fishmark: {
        updateWorkspaceTabDraft,
        saveMarkdownFile,
        getWorkspaceSnapshot,
        onExternalMarkdownFileChanged: vi.fn(() => () => {}),
        onWorkspaceOwnerTabActivationRequest: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getEditorContent: () => "# First dirty\n",
      setEditorContentSnapshot: vi.fn(),
      showNotification: vi.fn(),
      scheduleDocumentDerivedDataUpdate: vi.fn(),
      initialSnapshot: firstDirtySnapshot
    });

    let savePromise: Promise<void> | undefined;

    await act(async () => {
      savePromise = latestRef.current?.commands.saveMarkdown();
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledWith({
      tabId: "tab-1"
    });

    act(() => {
      latestRef.current?.workspace.applyWorkspaceWindowSnapshot(secondTabActiveSnapshot);
    });

    await act(async () => {
      saveResult.resolve({
        status: "success",
        document: {
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First dirty\n",
          encoding: "utf-8"
        }
      });
      await savePromise;
    });

    expect(updateWorkspaceTabDraft).not.toHaveBeenCalledWith({
      tabId: "tab-2",
      content: "# First dirty\n"
    });

    act(() => {
      root.unmount();
    });
  });

  it("clears a recent file entry when reopening it from disk fails", async () => {
    const clearRecentFile = vi.fn(async () => ({ version: 1, entries: [] }));
    const openWorkspaceFileFromPath = vi.fn(async () => ({
      kind: "error" as const,
      error: {
        code: "file-not-found" as const,
        message: "Selected file could not be found."
      }
    }));

    const { latestRef, root } = renderController({
      autosaveDelayMs: 25,
      fishmark: {
        getWorkspaceSnapshot: vi.fn(async () => emptySnapshot),
        openWorkspaceFileFromPath,
        clearRecentFile,
        updateWorkspaceTabDraft: vi.fn(async () => emptySnapshot),
        onExternalMarkdownFileChanged: vi.fn(() => () => {}),
        onWorkspaceOwnerTabActivationRequest: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getEditorContent: () => "",
      setEditorContentSnapshot: vi.fn(),
      showNotification: vi.fn(),
      scheduleDocumentDerivedDataUpdate: vi.fn(),
      initialSnapshot: emptySnapshot
    });

    await expect(latestRef.current?.commands.openRecentMarkdown("C:/missing.md")).resolves.toBe(false);

    expect(openWorkspaceFileFromPath).toHaveBeenCalledWith("C:/missing.md");
    expect(clearRecentFile).toHaveBeenCalledWith({ path: "C:/missing.md" });

    act(() => {
      root.unmount();
    });
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
