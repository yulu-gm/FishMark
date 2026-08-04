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
    revision: 0,
    savedRevision: 0,
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

function acknowledgeEditorLoad(controller: EditorApplicationControllerValue): void {
  const activeDocument = controller.workspace.activeDocument;
  if (!activeDocument) {
    return;
  }
  controller.workspace.acknowledgeEditorLoad({
    tabId: activeDocument.tabId,
    epoch: controller.workspace.editorEpoch,
    loadRevision: controller.workspace.editorLoadRevision
  });
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

    acknowledgeEditorLoad(latestRef.current!);

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

    acknowledgeEditorLoad(latestRef.current!);

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
