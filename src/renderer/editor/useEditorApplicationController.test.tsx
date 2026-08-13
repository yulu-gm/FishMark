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
  it("routes a production editor frame through the save barrier without a full draft", async () => {
    const updateWorkspaceTabDraft = vi.fn(async () => savedSnapshot);
    const applyDocumentEdits = vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
      kind: "applied" as const,
      acknowledgedSequence: input.clientSequence,
      revision: input.baseRevision + 1,
      isDirty: true
    }));
    const flushDocumentEdits = vi.fn(async (input: { throughSequence: number }) => ({
      kind: "flushed" as const,
      acknowledgedSequence: input.throughSequence,
      revision: 1,
      savedRevision: 0,
      isDirty: true
    }));
    const saveMarkdownFile = vi.fn(async () => ({
      status: "success" as const,
      document: {
        path: "C:/notes/note.md",
        name: "note.md",
        content: "# Saved\n",
        encoding: "utf-8" as const
      }
    }));
    const savedAfterFrame: WorkspaceWindowSnapshot = {
      ...savedSnapshot,
      activeDocument: {
        ...savedSnapshot.activeDocument!,
        content: "# Draft\n",
        revision: 1,
        savedRevision: 1,
        isDirty: false
      }
    };
    const getWorkspaceSnapshot = vi.fn(async () => savedAfterFrame);

    const { latestRef, root } = renderController({
      autosaveDelayMs: 25,
      fishmark: {
        updateWorkspaceTabDraft,
        applyDocumentEdits,
        flushDocumentEdits,
        onDocumentProjection: vi.fn(() => () => {}),
        saveMarkdownFile,
        getWorkspaceSnapshot,
        onExternalMarkdownFileChanged: vi.fn(() => () => {}),
        onWorkspaceOwnerTabActivationRequest: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getEditorContent: () => "# Draft\n",
      setEditorContentSnapshot: vi.fn(),
      showNotification: vi.fn(),
      scheduleDocumentDerivedDataUpdate: vi.fn(),
      initialSnapshot: savedSnapshot
    });

    acknowledgeEditorLoad(latestRef.current!);
    const identity = {
      tabId: "tab-1",
      epoch: latestRef.current!.workspace.editorEpoch,
      loadRevision: latestRef.current!.workspace.editorLoadRevision
    };
    expect(latestRef.current!.workspace.recordDocumentChangeFrame({
      identity,
      baseText: "# Saved\n",
      resultingText: "# Draft\n",
      changes: [{ from: 2, to: 7, insert: "Draft" }]
    })).toBe(true);

    await act(async () => {
      await latestRef.current?.commands.saveMarkdown();
    });

    expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
    expect(applyDocumentEdits).toHaveBeenCalledTimes(1);
    expect(flushDocumentEdits).toHaveBeenCalledTimes(1);
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
        revision: 1,
        savedRevision: 0,
        isDirty: true
      }
    };
    const updateWorkspaceTabDraft = vi.fn(async () => exportedSnapshot);
    const applyDocumentEdits = vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
      kind: "applied" as const,
      acknowledgedSequence: input.clientSequence,
      revision: input.baseRevision + 1,
      isDirty: true
    }));
    const flushDocumentEdits = vi.fn(async (input: { throughSequence: number }) => ({
      kind: "flushed" as const,
      acknowledgedSequence: input.throughSequence,
      revision: 1,
      savedRevision: 0,
      isDirty: true
    }));
    const saveMarkdownFile = vi.fn();
    let resolveExport!: (result: { status: "success"; path: string; name: string }) => void;
    const exportHtmlFile = vi.fn<(input: { html: string }) => Promise<{ status: "success"; path: string; name: string }>>(
      () => new Promise<{ status: "success"; path: string; name: string }>((resolve) => {
      resolveExport = resolve;
      })
    );
    const showNotification = vi.fn();

    const { latestRef, root } = renderController({
      autosaveDelayMs: 25,
      fishmark: {
        updateWorkspaceTabDraft,
        applyDocumentEdits,
        flushDocumentEdits,
        onDocumentProjection: vi.fn(() => () => {}),
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
      initialSnapshot: savedSnapshot
    });

    acknowledgeEditorLoad(latestRef.current!);
    const identity = {
      tabId: "tab-1",
      epoch: latestRef.current!.workspace.editorEpoch,
      loadRevision: latestRef.current!.workspace.editorLoadRevision
    };
    expect(latestRef.current!.workspace.recordDocumentChangeFrame({
      identity,
      baseText: "# Saved\n",
      resultingText: "# Exported\n",
      changes: [{ from: 2, to: 7, insert: "Exported" }]
    })).toBe(true);

    let exporting: Promise<void> | undefined;
    act(() => {
      exporting = latestRef.current?.commands.exportHtml();
    });
    await vi.waitFor(() => expect(exportHtmlFile).toHaveBeenCalledTimes(1));
    expect(latestRef.current!.workspace.recordDocumentChangeFrame({
      identity,
      baseText: "# Exported\n",
      resultingText: "# Exported tail\n",
      changes: [{ from: 10, to: 10, insert: " tail" }]
    })).toBe(true);
    resolveExport({ status: "success", path: "C:/notes/note.html", name: "note.html" });
    await act(async () => { await exporting; });

    expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
    expect(applyDocumentEdits).toHaveBeenCalledTimes(2);
    expect(flushDocumentEdits).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).not.toHaveBeenCalled();
    expect(exportHtmlFile).toHaveBeenCalledWith({
      tabId: "tab-1",
      currentPath: "C:/notes/note.md",
      html: expect.stringContaining("cm-line cm-inactive-heading cm-inactive-heading-depth-1")
    });
    expect(exportHtmlFile.mock.calls[0]?.[0].html).not.toContain("Exported tail");
    expect(showNotification).toHaveBeenCalledWith({
      kind: "info",
      message: "HTML exported."
    });

    act(() => {
      root.unmount();
    });
  });

  it("reports an export callback failure without reconciling or replacing the workspace snapshot", async () => {
    const getWorkspaceSnapshot = vi.fn(async () => savedSnapshot);
    const exportHtmlFile = vi.fn(async () => {
      throw new Error("export destination unavailable");
    });
    const showNotification = vi.fn();
    const { latestRef, root } = renderController({
      autosaveDelayMs: 25,
      fishmark: {
        applyDocumentEdits: vi.fn(async (input: { clientSequence: number; baseRevision: number }) => ({
          kind: "applied" as const,
          acknowledgedSequence: input.clientSequence,
          revision: input.baseRevision + 1,
          isDirty: true
        })),
        flushDocumentEdits: vi.fn(async (input: { throughSequence: number }) => ({
          kind: "flushed" as const,
          acknowledgedSequence: input.throughSequence,
          revision: 1,
          savedRevision: 0,
          isDirty: true
        })),
        onDocumentProjection: vi.fn(() => () => {}),
        exportHtmlFile,
        getWorkspaceSnapshot,
        onExternalMarkdownFileChanged: vi.fn(() => () => {}),
        onWorkspaceOwnerTabActivationRequest: vi.fn(() => () => {})
      } as unknown as Window["fishmark"],
      getEditorContent: () => "# Exported\n",
      setEditorContentSnapshot: vi.fn(),
      showNotification,
      scheduleDocumentDerivedDataUpdate: vi.fn(),
      initialSnapshot: savedSnapshot
    });
    acknowledgeEditorLoad(latestRef.current!);
    const identity = {
      tabId: "tab-1",
      epoch: latestRef.current!.workspace.editorEpoch,
      loadRevision: latestRef.current!.workspace.editorLoadRevision
    };
    expect(latestRef.current!.workspace.recordDocumentChangeFrame({
      identity,
      baseText: "# Saved\n",
      resultingText: "# Exported\n",
      changes: [{ from: 2, to: 7, insert: "Exported" }]
    })).toBe(true);

    await act(async () => {
      await latestRef.current?.commands.exportHtml();
    });

    expect(exportHtmlFile).toHaveBeenCalledTimes(1);
    expect(getWorkspaceSnapshot).not.toHaveBeenCalled();
    expect(showNotification).toHaveBeenCalledWith({
      kind: "error",
      message: "export destination unavailable"
    });
    act(() => root.unmount());
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
