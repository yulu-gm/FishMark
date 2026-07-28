// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { useWorkspaceController } from "./useWorkspaceController";

type Controller = ReturnType<typeof useWorkspaceController>;

function createSnapshot(content = "# Initial\n"): WorkspaceWindowSnapshot {
  return {
    windowId: "window-1",
    activeTabId: "tab-1",
    tabs: [{
      tabId: "tab-1",
      path: "C:/notes/note.md",
      name: "note.md",
      isDirty: false,
      saveState: "idle"
    }],
    activeDocument: {
      tabId: "tab-1",
      path: "C:/notes/note.md",
      name: "note.md",
      content,
      encoding: "utf-8",
      isDirty: false,
      saveState: "idle"
    }
  };
}

function renderController(input: Parameters<typeof useWorkspaceController>[0]): {
  latestRef: { current: Controller | null };
  root: Root;
} {
  const latestRef = createRef<Controller>();
  const root = createRoot(document.createElement("div"));
  function Probe(): null {
    const controller = useWorkspaceController(input);
    useEffect(() => {
      latestRef.current = controller;
    }, [controller]);
    return null;
  }
  act(() => root.render(createElement(Probe)));
  return { latestRef, root };
}

function createBridge(overrides: Partial<Window["fishmark"]> = {}): Window["fishmark"] {
  return {
    onWorkspaceOwnerTabActivationRequest: vi.fn(() => () => {}),
    ...overrides
  } as unknown as Window["fishmark"];
}

describe("useWorkspaceController", () => {
  it("subscribes React state to the application service and records only acknowledged edits", async () => {
    const snapshot = createSnapshot();
    const { latestRef, root } = renderController({
      fishmark: createBridge(),
      initialSnapshot: snapshot,
      getEditorContent: () => "# Draft\n",
      showNotification: vi.fn()
    });
    const identity = {
      tabId: "tab-1",
      epoch: latestRef.current!.editorEpoch,
      loadRevision: latestRef.current!.editorLoadRevision
    };

    expect(latestRef.current!.updateDraft({ identity, content: "# Rejected\n" })).toBe(false);
    expect(latestRef.current!.acknowledgeEditorLoad(identity)).toBe(true);
    await act(async () => {
      expect(latestRef.current!.updateDraft({ identity, content: "# Draft\n" })).toBe(true);
    });

    expect(latestRef.current!.activeDocument?.content).toBe("# Draft\n");
    expect(latestRef.current!.activeDocument?.isDirty).toBe(true);
    act(() => root.unmount());
  });

  it("maps a fail-closed structural outcome to one notification", async () => {
    const snapshot = createSnapshot();
    const showNotification = vi.fn();
    const { latestRef, root } = renderController({
      fishmark: createBridge({
        updateWorkspaceTabDraft: vi.fn(async () => {
          throw new Error("draft rejected");
        }),
        getWorkspaceSnapshot: vi.fn(async () => snapshot),
        closeWorkspaceTab: vi.fn()
      }),
      initialSnapshot: snapshot,
      getEditorContent: () => "# Draft\n",
      showNotification
    });
    const identity = {
      tabId: "tab-1",
      epoch: latestRef.current!.editorEpoch,
      loadRevision: latestRef.current!.editorLoadRevision
    };
    latestRef.current!.acknowledgeEditorLoad(identity);
    latestRef.current!.updateDraft({ identity, content: "# Draft\n" });

    let close!: Promise<void>;
    act(() => {
      close = latestRef.current!.closeWorkspaceTab("tab-1");
    });
    await vi.waitFor(() => {
      expect(latestRef.current!.state.editorTransition?.phase).toBe("sealing");
    });
    act(() => {
      const transition = latestRef.current!.state.editorTransition!;
      latestRef.current!.acknowledgeEditorTransition({
        token: transition.token,
        readOnly: true
      });
    });
    await vi.waitFor(() => {
      expect(latestRef.current!.state.editorTransition?.phase).toBe("releasing");
    });
    act(() => {
      const transition = latestRef.current!.state.editorTransition!;
      latestRef.current!.acknowledgeEditorTransition({
        token: transition.token,
        readOnly: false
      });
    });
    await act(async () => close);

    expect(showNotification).toHaveBeenCalledWith({ kind: "error", message: "draft rejected" });
    act(() => root.unmount());
  });

  it("routes native owner activation requests through the same serialized application", async () => {
    const source = createSnapshot();
    const target: WorkspaceWindowSnapshot = {
      ...source,
      activeTabId: "tab-2",
      tabs: [
        ...source.tabs,
        { tabId: "tab-2", path: null, name: "Untitled", isDirty: false, saveState: "idle" }
      ],
      activeDocument: {
        tabId: "tab-2",
        path: null,
        name: "Untitled",
        content: "",
        encoding: "utf-8",
        isDirty: false,
        saveState: "idle"
      }
    };
    let listener!: (request: { tabId: string }) => Promise<boolean>;
    const activateWorkspaceTab = vi.fn(async () => target);
    const { root } = renderController({
      fishmark: createBridge({
        onWorkspaceOwnerTabActivationRequest: vi.fn((nextListener) => {
          listener = nextListener;
          return () => {};
        }),
        activateWorkspaceTab
      }),
      initialSnapshot: source,
      getEditorContent: () => "# Initial\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await listener({ tabId: "tab-2" });
    });
    expect(activateWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-2" });
    act(() => root.unmount());
  });
});
