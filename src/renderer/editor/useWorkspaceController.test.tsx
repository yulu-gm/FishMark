// @vitest-environment jsdom

import { act, createElement, createRef, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { useEditorWorkflowController } from "./useEditorWorkflowController";
import { useWorkspaceController } from "./useWorkspaceController";

type WorkspaceControllerValue = ReturnType<typeof useWorkspaceController>;
type EditorWorkflowControllerValue = ReturnType<typeof useEditorWorkflowController>;

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

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
  const controllerInput = {
    ...input,
    fishmark: Object.assign(
      { onWorkspaceOwnerTabActivationRequest: () => () => {} },
      input.fishmark
    )
  };

  function Probe(): null {
    const controller = useWorkspaceController(controllerInput);

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

const workspaceMutationInterleavingCases: ReadonlyArray<{
  readonly name: string;
  readonly bridgeKey: string;
  readonly bridgeResult: (snapshot: WorkspaceWindowSnapshot) => unknown;
  readonly invoke: (controller: WorkspaceControllerValue) => Promise<unknown>;
}> = [
  {
    name: "open",
    bridgeKey: "openWorkspaceFile",
    bridgeResult: (snapshot) => ({ kind: "success", snapshot }),
    invoke: (controller) => controller.openMarkdown()
  },
  {
    name: "create",
    bridgeKey: "createWorkspaceTab",
    bridgeResult: (snapshot) => snapshot,
    invoke: (controller) => controller.createUntitledMarkdown()
  },
  {
    name: "close",
    bridgeKey: "closeWorkspaceTab",
    bridgeResult: (snapshot) => snapshot,
    invoke: (controller) => controller.closeWorkspaceTab("tab-1")
  },
  {
    name: "reorder",
    bridgeKey: "reorderWorkspaceTab",
    bridgeResult: (snapshot) => snapshot,
    invoke: (controller) => controller.reorderWorkspaceTab("tab-1", 1)
  },
  {
    name: "detach",
    bridgeKey: "detachWorkspaceTabToNewWindow",
    bridgeResult: (snapshot) => snapshot,
    invoke: (controller) => controller.detachWorkspaceTab("tab-1")
  },
  {
    name: "save refresh",
    bridgeKey: "getWorkspaceSnapshot",
    bridgeResult: (snapshot) => snapshot,
    invoke: (controller) => controller.refreshWorkspaceSnapshot()
  }
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useWorkspaceController", () => {
  it("flushes the active local draft before confirming an owner-tab activation request", async () => {
    let activationListener:
      | ((request: { requestId: string; tabId: string }) => Promise<boolean>)
      | undefined;
    const detach = vi.fn();
    const onWorkspaceOwnerTabActivationRequest = vi.fn(
      (listener: (request: { requestId: string; tabId: string }) => Promise<boolean>) => {
        activationListener = listener;
        return detach;
      }
    );
    const initialSnapshot = createWorkspaceSnapshot({
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
    });
    const ownerSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-2",
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
    });
    const calls: string[] = [];
    const updateWorkspaceTabDraft = vi.fn(async () => {
      calls.push("flush");
      return initialSnapshot;
    });
    const activateWorkspaceTab = vi.fn(async () => {
      calls.push("activate");
      return ownerSnapshot;
    });
    const { latestRef, root } = renderController({
      fishmark: {
        onWorkspaceOwnerTabActivationRequest,
        updateWorkspaceTabDraft,
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot,
      getEditorContent: () => "# Local pending draft\n",
      showNotification: vi.fn()
    });

    expect(onWorkspaceOwnerTabActivationRequest).toHaveBeenCalledTimes(1);

    await act(async () => {
      await expect(activationListener?.({
        requestId: "request-1",
        tabId: "tab-2"
      })).resolves.toBe(true);
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Local pending draft\n"
    });
    expect(activateWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-2" });
    expect(calls).toEqual(["flush", "activate"]);
    expect(latestRef.current?.workspaceSnapshot).toEqual(ownerSnapshot);
    expect(latestRef.current?.activeTabId).toBe("tab-2");

    act(() => {
      root.unmount();
    });

    expect(detach).toHaveBeenCalledTimes(1);
  });

  it("rejects owner-tab activation when the active draft cannot flush", async () => {
    let activationListener:
      | ((request: { requestId: string; tabId: string }) => Promise<boolean>)
      | undefined;
    const activateWorkspaceTab = vi.fn();
    const initialSnapshot = createWorkspaceSnapshot({
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const { latestRef, root } = renderController({
      fishmark: {
        onWorkspaceOwnerTabActivationRequest: (
          listener: (request: { requestId: string; tabId: string }) => Promise<boolean>
        ) => {
          activationListener = listener;
          return () => {};
        },
        updateWorkspaceTabDraft: vi.fn(async () => {
          throw new Error("draft flush failed");
        }),
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot,
      getEditorContent: () => "# Local pending draft\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await expect(activationListener?.({
        requestId: "request-1",
        tabId: "tab-2"
      })).resolves.toBe(false);
    });

    expect(activateWorkspaceTab).not.toHaveBeenCalled();
    expect(latestRef.current?.activeTabId).toBe("tab-1");
    act(() => root.unmount());
  });

  it("drains source edits made while activation IPC is pending before applying the target snapshot", async () => {
    let editorContent = "# First\n";
    const activation = createDeferred<WorkspaceWindowSnapshot>();
    const initialSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-1",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const targetSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-2",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const updateWorkspaceTabDraft = vi.fn(async (input: { tabId: string; content: string }) =>
      createWorkspaceSnapshot({
        activeTabId: "tab-2",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: input.content,
          isDirty: true
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      })
    );
    const activateWorkspaceTab = vi.fn(() => activation.promise);
    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot,
      getEditorContent: () => editorContent,
      showNotification: vi.fn()
    });

    let activationResult!: Promise<boolean>;
    act(() => {
      activationResult = latestRef.current!.activateWorkspaceTab("tab-2");
    });
    await vi.waitFor(() => expect(activateWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-2" }));

    editorContent = "# Typed during activation\n";
    await act(async () => {
      await latestRef.current?.updateDraft({ tabId: "tab-1", content: editorContent });
    });
    activation.resolve(targetSnapshot);

    await act(async () => {
      await expect(activationResult).resolves.toBe(true);
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Typed during activation\n"
    });
    expect(activateWorkspaceTab.mock.invocationCallOrder[0]).toBeLessThan(
      updateWorkspaceTabDraft.mock.invocationCallOrder[0]!
    );
    expect(latestRef.current?.activeTabId).toBe("tab-2");
    act(() => root.unmount());
  });

  it("flushes a pending draft when activation targets the already-active tab without mutating main activation", async () => {
    const updateWorkspaceTabDraft = vi.fn(async (input: { tabId: string; content: string }) =>
      createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: input.content,
          isDirty: true
        }]
      })
    );
    const activateWorkspaceTab = vi.fn();
    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }]
      }),
      getEditorContent: () => "# Pending\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await latestRef.current?.updateDraft({ tabId: "tab-1", content: "# Pending\n" });
      await expect(latestRef.current?.activateWorkspaceTab("tab-1")).resolves.toBe(true);
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Pending\n"
    });
    expect(activateWorkspaceTab).not.toHaveBeenCalled();
    expect(latestRef.current?.workspaceSnapshot?.activeDocument?.content).toBe("# Pending\n");
    act(() => root.unmount());
  });

  it("rejects already-active activation when its pending draft cannot flush", async () => {
    const activateWorkspaceTab = vi.fn();
    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft: vi.fn(async () => {
          throw new Error("draft flush failed");
        }),
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }]
      }),
      getEditorContent: () => "# Pending\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await latestRef.current?.updateDraft({ tabId: "tab-1", content: "# Pending\n" });
      await expect(latestRef.current?.activateWorkspaceTab("tab-1")).resolves.toBe(false);
    });

    expect(activateWorkspaceTab).not.toHaveBeenCalled();
    expect(latestRef.current?.activeTabId).toBe("tab-1");
    act(() => root.unmount());
  });

  it("does not confirm or apply an owner activation that finishes after unmount", async () => {
    let activationListener:
      | ((request: { requestId: string; tabId: string }) => Promise<boolean>)
      | undefined;
    const activation = createDeferred<WorkspaceWindowSnapshot>();
    const targetSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-2",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const activateWorkspaceTab = vi.fn(() => activation.promise);
    const { root } = renderController({
      fishmark: {
        onWorkspaceOwnerTabActivationRequest: (
          listener: (request: { requestId: string; tabId: string }) => Promise<boolean>
        ) => {
          activationListener = listener;
          return () => {};
        },
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      }),
      getEditorContent: () => "# First\n",
      showNotification: vi.fn()
    });

    const result = activationListener!({ requestId: "request-1", tabId: "tab-2" });
    await vi.waitFor(() => expect(activateWorkspaceTab).toHaveBeenCalledOnce());
    act(() => root.unmount());
    activation.resolve(targetSnapshot);

    await expect(result).resolves.toBe(false);
  });

  it("keeps the committed target canonical when source draft draining cannot settle", async () => {
    let editorContent = "# First\n";
    let controller: WorkspaceControllerValue | null = null;
    const sourceSnapshot = () => createWorkspaceSnapshot({
      activeTabId: "tab-1",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: editorContent,
        isDirty: true
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const targetSnapshot = () => createWorkspaceSnapshot({
      activeTabId: "tab-2",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: editorContent,
        isDirty: true
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const activateWorkspaceTab = vi.fn(async ({ tabId }: { tabId: string }) => {
      if (tabId === "tab-2") {
        editorContent = "# Churn 0\n";
        await controller?.updateDraft({ tabId: "tab-1", content: editorContent });
        return targetSnapshot();
      }
      return sourceSnapshot();
    });
    let churn = 0;
    const updateWorkspaceTabDraft = vi.fn(async () => {
      churn += 1;
      editorContent = `# Churn ${churn}\n`;
      await controller?.updateDraft({ tabId: "tab-1", content: editorContent });
      return targetSnapshot();
    });
    const showNotification = vi.fn();
    const rendered = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      }),
      getEditorContent: () => editorContent,
      showNotification
    });
    controller = rendered.latestRef.current;

    await act(async () => {
      await expect(controller?.activateWorkspaceTab("tab-2")).resolves.toBe(false);
    });

    expect(updateWorkspaceTabDraft.mock.calls.length).toBeGreaterThan(1);
    expect(activateWorkspaceTab.mock.calls).toEqual([[{ tabId: "tab-2" }]]);
    expect(rendered.latestRef.current?.activeTabId).toBe("tab-2");
    expect(rendered.latestRef.current?.workspaceSnapshot?.activeDocument?.content).toBe(
      "# Second\n"
    );
    expect(showNotification).toHaveBeenCalledOnce();
    act(() => rendered.root.unmount());
  });

  it("fails before mutating main when the initial activation draft flush exceeds its budget", async () => {
    let editorContent = "# Pending 0\n";
    let controller: WorkspaceControllerValue | null = null;
    let churn = 0;
    const updateWorkspaceTabDraft = vi.fn(async () => {
      if (churn < 20) {
        churn += 1;
        editorContent = `# Pending ${churn}\n`;
        await controller?.updateDraft({ tabId: "tab-1", content: editorContent });
      }
      return createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: editorContent,
          isDirty: true
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      });
    });
    const activateWorkspaceTab = vi.fn();
    const showNotification = vi.fn();
    const rendered = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      }),
      getEditorContent: () => editorContent,
      showNotification
    });
    controller = rendered.latestRef.current;
    await act(async () => {
      await controller?.updateDraft({ tabId: "tab-1", content: editorContent });
      await expect(controller?.activateWorkspaceTab("tab-2")).resolves.toBe(false);
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledTimes(16);
    expect(activateWorkspaceTab).not.toHaveBeenCalled();
    expect(rendered.latestRef.current?.activeTabId).toBe("tab-1");
    expect(showNotification).toHaveBeenCalledOnce();
    act(() => rendered.root.unmount());
  });

  it("reconciles main back to the latest source intent when an older target activation was superseded", async () => {
    let editorContent = "# First\n";
    let controller: WorkspaceControllerValue | null = null;
    const firstActivation = createDeferred<WorkspaceWindowSnapshot>();
    const targetSnapshot = (sourceContent = "# First\n") => createWorkspaceSnapshot({
      activeTabId: "tab-2",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: sourceContent,
        isDirty: sourceContent !== "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const sourceSnapshot = () => createWorkspaceSnapshot({
      activeTabId: "tab-1",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: editorContent,
        isDirty: true
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const activateWorkspaceTab = vi
      .fn()
      .mockImplementationOnce(() => firstActivation.promise)
      .mockImplementationOnce(async () => sourceSnapshot());
    const updateWorkspaceTabDraft = vi.fn(async (input: { tabId: string; content: string }) =>
      targetSnapshot(input.content)
    );
    const rendered = renderController({
      fishmark: {
        activateWorkspaceTab,
        updateWorkspaceTabDraft
      } as unknown as Window["fishmark"],
      initialSnapshot: sourceSnapshot(),
      getEditorContent: () => editorContent,
      showNotification: vi.fn()
    });
    controller = rendered.latestRef.current;

    const oldIntent = controller!.activateWorkspaceTab("tab-2");
    await vi.waitFor(() => expect(activateWorkspaceTab).toHaveBeenCalledTimes(1));
    editorContent = "# Latest source draft\n";
    await act(async () => {
      await controller!.updateDraft({ tabId: "tab-1", content: editorContent });
    });
    const latestIntent = controller!.activateWorkspaceTab("tab-1");
    await act(async () => {
      firstActivation.resolve(targetSnapshot());
      await expect(oldIntent).resolves.toBe(false);
      await expect(latestIntent).resolves.toBe(true);
    });
    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Latest source draft\n"
    });
    expect(activateWorkspaceTab.mock.calls).toEqual([
      [{ tabId: "tab-2" }],
      [{ tabId: "tab-1" }]
    ]);
    expect(rendered.latestRef.current?.activeTabId).toBe("tab-1");
    expect(rendered.latestRef.current?.workspaceSnapshot?.activeDocument?.content).toBe(
      "# Latest source draft\n"
    );
    act(() => rendered.root.unmount());
  });

  it("keeps the committed target canonical when post-activation draft sync rejects", async () => {
    let editorContent = "# First\n";
    let controller: WorkspaceControllerValue | null = null;
    const sourceSnapshot = () => createWorkspaceSnapshot({
      activeTabId: "tab-1",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: editorContent,
        isDirty: true
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const targetSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-2",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const activateWorkspaceTab = vi.fn(async ({ tabId }: { tabId: string }) => {
      if (tabId === "tab-2") {
        editorContent = "# Late source draft\n";
        await controller?.updateDraft({ tabId: "tab-1", content: editorContent });
        return targetSnapshot;
      }
      return sourceSnapshot();
    });
    const rendered = renderController({
      fishmark: {
        activateWorkspaceTab,
        updateWorkspaceTabDraft: vi.fn(async () => {
          throw new Error("draft sync rejected");
        })
      } as unknown as Window["fishmark"],
      initialSnapshot: sourceSnapshot(),
      getEditorContent: () => editorContent,
      showNotification: vi.fn()
    });
    controller = rendered.latestRef.current;

    await act(async () => {
      await expect(controller!.activateWorkspaceTab("tab-2")).resolves.toBe(false);
    });

    expect(activateWorkspaceTab.mock.calls).toEqual([[{ tabId: "tab-2" }]]);
    expect(rendered.latestRef.current?.activeTabId).toBe("tab-2");
    expect(rendered.latestRef.current?.workspaceSnapshot?.activeDocument?.content).toBe(
      "# Second\n"
    );
    act(() => rendered.root.unmount());
  });

  it("reconciles canonical state when activation transport fails after commit is unknown", async () => {
    const targetSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-2",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const getWorkspaceSnapshot = vi.fn(async () => targetSnapshot);
    const rendered = renderController({
      fishmark: {
        activateWorkspaceTab: vi.fn(async () => {
          throw new Error("transport closed");
        }),
        getWorkspaceSnapshot
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      }),
      getEditorContent: () => "# First\n",
      showNotification: vi.fn()
    });

    await act(async () => {
      await expect(
        rendered.latestRef.current!.activateWorkspaceTab("tab-2")
      ).resolves.toBe(false);
    });

    expect(getWorkspaceSnapshot).toHaveBeenCalledOnce();
    expect(rendered.latestRef.current?.activeTabId).toBe("tab-2");
    act(() => rendered.root.unmount());
  });

  it("retains a rejected source draft until a later activation can sync it", async () => {
    let editorContent = "# First\n";
    let controller: WorkspaceControllerValue | null = null;
    const targetSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-2",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const sourceSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-1",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# Late source draft\n",
        isDirty: true
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const activateWorkspaceTab = vi
      .fn()
      .mockImplementationOnce(async () => {
        editorContent = "# Late source draft\n";
        await controller?.updateDraft({ tabId: "tab-1", content: editorContent });
        return targetSnapshot;
      })
      .mockResolvedValueOnce(sourceSnapshot);
    const updateWorkspaceTabDraft = vi
      .fn()
      .mockRejectedValueOnce(new Error("draft sync rejected"))
      .mockResolvedValueOnce(sourceSnapshot);
    const rendered = renderController({
      fishmark: {
        activateWorkspaceTab,
        updateWorkspaceTabDraft
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      }),
      getEditorContent: () => editorContent,
      showNotification: vi.fn()
    });
    controller = rendered.latestRef.current;

    await act(async () => {
      await expect(controller!.activateWorkspaceTab("tab-2")).resolves.toBe(false);
    });
    expect(rendered.latestRef.current?.activeTabId).toBe("tab-2");

    editorContent = "# Second\n";
    await act(async () => {
      await expect(controller!.activateWorkspaceTab("tab-1")).resolves.toBe(true);
    });

    expect(updateWorkspaceTabDraft).toHaveBeenLastCalledWith({
      tabId: "tab-1",
      content: "# Late source draft\n"
    });
    expect(activateWorkspaceTab.mock.calls).toEqual([
      [{ tabId: "tab-2" }],
      [{ tabId: "tab-1" }]
    ]);
    expect(rendered.latestRef.current?.activeTabId).toBe("tab-1");
    expect(rendered.latestRef.current?.workspaceSnapshot?.activeDocument?.content).toBe(
      "# Late source draft\n"
    );
    act(() => rendered.root.unmount());
  });

  for (const mutationCase of workspaceMutationInterleavingCases) {
    it(`serializes activation with newer ${mutationCase.name} snapshot ownership`, async () => {
      const activation = createDeferred<WorkspaceWindowSnapshot>();
      const newerMutation = createDeferred<unknown>();
      const initialSnapshot = createWorkspaceSnapshot({
        activeTabId: "tab-1",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      });
      const oldActivationSnapshot = createWorkspaceSnapshot({
        activeTabId: "tab-2",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }]
      });
      const newerSnapshot = createWorkspaceSnapshot({
        activeTabId: "tab-3",
        tabs: [{
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "# First\n"
        }, {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "# Second\n"
        }, {
          tabId: "tab-3",
          path: "C:/notes/newer.md",
          name: "newer.md",
          content: "# Newer\n"
        }]
      });
      const activateWorkspaceTab = vi.fn(() => activation.promise);
      const mutationBridge = vi.fn(() => newerMutation.promise);
      const rendered = renderController({
        fishmark: {
          activateWorkspaceTab,
          [mutationCase.bridgeKey]: mutationBridge
        } as unknown as Window["fishmark"],
        initialSnapshot,
        getEditorContent: () => "# First\n",
        showNotification: vi.fn()
      });

      const oldIntent = rendered.latestRef.current!.activateWorkspaceTab("tab-2");
      await vi.waitFor(() => expect(activateWorkspaceTab).toHaveBeenCalledOnce());
      const newerIntent = mutationCase.invoke(rendered.latestRef.current!);
      await Promise.resolve();
      await Promise.resolve();
      const newerStartedBeforeOldSettled = mutationBridge.mock.calls.length > 0;

      if (newerStartedBeforeOldSettled) {
        newerMutation.resolve(mutationCase.bridgeResult(newerSnapshot));
        await newerIntent;
        activation.resolve(oldActivationSnapshot);
        await oldIntent;
      } else {
        await act(async () => {
          activation.resolve(oldActivationSnapshot);
          await oldIntent;
        });
        await vi.waitFor(() => expect(mutationBridge).toHaveBeenCalledOnce());
        await act(async () => {
          newerMutation.resolve(mutationCase.bridgeResult(newerSnapshot));
          await newerIntent;
        });
      }

      expect(newerStartedBeforeOldSettled).toBe(false);
      expect(rendered.latestRef.current?.activeTabId).toBe("tab-3");
      act(() => rendered.root.unmount());
    });
  }

  it("serializes a late draft response before a queued activation", async () => {
    const draftResponse = createDeferred<WorkspaceWindowSnapshot>();
    const initialSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-1",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const flushedSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-1",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# Pending\n",
        isDirty: true
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const targetSnapshot = createWorkspaceSnapshot({
      activeTabId: "tab-2",
      tabs: [{
        tabId: "tab-1",
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# Pending\n",
        isDirty: true
      }, {
        tabId: "tab-2",
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }]
    });
    const updateWorkspaceTabDraft = vi.fn(() => draftResponse.promise);
    const activateWorkspaceTab = vi.fn(async () => targetSnapshot);
    const rendered = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        activateWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot,
      getEditorContent: () => "# Pending\n",
      showNotification: vi.fn()
    });

    const flush = rendered.latestRef.current!.flushActiveWorkspaceDraft();
    await vi.waitFor(() => expect(updateWorkspaceTabDraft).toHaveBeenCalledOnce());
    const activation = rendered.latestRef.current!.activateWorkspaceTab("tab-2");
    await Promise.resolve();
    expect(activateWorkspaceTab).not.toHaveBeenCalled();

    await act(async () => {
      draftResponse.resolve(flushedSnapshot);
      await flush;
      await activation;
    });

    expect(activateWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-2" });
    expect(rendered.latestRef.current?.activeTabId).toBe("tab-2");
    act(() => rendered.root.unmount());
  });

  it("keeps active draft changes renderer-local until an explicit flush syncs the latest content", async () => {
    const updateWorkspaceTabDraft = vi.fn(async (input: { tabId: string; content: string }) =>
      createWorkspaceSnapshot({
        tabs: [
          {
            tabId: input.tabId,
            path: "C:/notes/note.md",
            name: "note.md",
            content: input.content,
            isDirty: true
          }
        ]
      })
    );

    let editorContent = "# Note\n";
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
      getEditorContent: () => editorContent,
      showNotification: vi.fn()
    });

    await act(async () => {
      for (let index = 1; index <= 100; index += 1) {
        editorContent = `# Updated ${index}\n`;
        await latestRef.current?.updateDraft({ tabId: "tab-1", content: editorContent });
      }
    });

    expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
    expect(latestRef.current?.workspaceSnapshot?.activeDocument).toMatchObject({
      content: "# Updated 100\n",
      isDirty: true
    });
    expect(latestRef.current?.workspaceSnapshot?.tabs[0]).toMatchObject({
      isDirty: true
    });

    await act(async () => {
      await latestRef.current?.flushActiveWorkspaceDraft();
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Updated 100\n"
    });
    expect(latestRef.current?.workspaceSnapshot?.activeDocument?.content).toBe("# Updated 100\n");

    act(() => {
      root.unmount();
    });
  });

  it("does not apply another window snapshot when a late draft is rejected after ownership transfer", async () => {
    const updateWorkspaceTabDraft = vi.fn(async () => {
      throw new Error("Workspace draft owner changed.");
    });
    const sourceSnapshot = createWorkspaceSnapshot({
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/source.md",
          name: "source.md",
          content: "source draft"
        }
      ]
    });
    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft
      } as unknown as Window["fishmark"],
      initialSnapshot: sourceSnapshot,
      getEditorContent: () => "late source draft",
      showNotification: vi.fn()
    });

    await expect(
      act(async () => {
        await latestRef.current?.flushActiveWorkspaceDraft();
      })
    ).rejects.toThrow("Workspace draft owner changed.");

    expect(latestRef.current?.workspaceSnapshot).toEqual(sourceSnapshot);
    expect(latestRef.current?.workspaceSnapshot?.windowId).toBe("window-1");
    act(() => {
      root.unmount();
    });
  });

  it("keeps the source snapshot when an old-owner reorder is rejected", async () => {
    const reorderWorkspaceTab = vi.fn(async () => {
      throw new Error("Workspace tab reorder rejected: tab owner changed.");
    });
    const showNotification = vi.fn();
    const sourceSnapshot = createWorkspaceSnapshot({
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/first.md",
          name: "first.md",
          content: "first"
        },
        {
          tabId: "tab-2",
          path: "C:/notes/second.md",
          name: "second.md",
          content: "second"
        }
      ]
    });
    const { latestRef, root } = renderController({
      fishmark: {
        reorderWorkspaceTab
      } as unknown as Window["fishmark"],
      initialSnapshot: sourceSnapshot,
      getEditorContent: () => "first",
      showNotification
    });

    await act(async () => {
      await latestRef.current?.reorderWorkspaceTab("tab-1", 1);
    });

    expect(reorderWorkspaceTab).toHaveBeenCalledWith({
      tabId: "tab-1",
      toIndex: 1
    });
    expect(latestRef.current?.workspaceSnapshot).toEqual(sourceSnapshot);
    expect(showNotification).toHaveBeenCalledWith({
      kind: "error",
      message: "Workspace tab reorder rejected: tab owner changed."
    });
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

  it("does not flush stale editor content into a newly opened tab during back-to-back path opens", async () => {
    const updateWorkspaceTabDraft = vi.fn(
      async (input: { tabId: string; content: string }) => {
        if (input.tabId === "tab-1") {
          return createWorkspaceSnapshot({
            activeTabId: "tab-1",
            tabs: [
              {
                tabId: "tab-1",
                path: "C:/notes/current.md",
                name: "current.md",
                content: "# Current draft\n",
                isDirty: true
              }
            ]
          });
        }

        return createWorkspaceSnapshot({
          activeTabId: input.tabId,
          tabs: [
            {
              tabId: "tab-1",
              path: "C:/notes/current.md",
              name: "current.md",
              content: "# Current draft\n",
              isDirty: true
            },
            {
              tabId: "tab-2",
              path: "C:/notes/alpha.md",
              name: "alpha.md",
              content: input.content,
              isDirty: true
            }
          ]
        });
      }
    );
    const openWorkspaceFileFromPath = vi
      .fn<(targetPath: string) => Promise<{ kind: "success"; snapshot: WorkspaceWindowSnapshot }>>()
      .mockResolvedValueOnce({
        kind: "success",
        snapshot: createWorkspaceSnapshot({
          activeTabId: "tab-2",
          tabs: [
            {
              tabId: "tab-1",
              path: "C:/notes/current.md",
              name: "current.md",
              content: "# Current draft\n",
              isDirty: true
            },
            {
              tabId: "tab-2",
              path: "C:/notes/alpha.md",
              name: "alpha.md",
              content: "# Alpha\n"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        kind: "success",
        snapshot: createWorkspaceSnapshot({
          activeTabId: "tab-3",
          tabs: [
            {
              tabId: "tab-1",
              path: "C:/notes/current.md",
              name: "current.md",
              content: "# Current draft\n",
              isDirty: true
            },
            {
              tabId: "tab-2",
              path: "C:/notes/alpha.md",
              name: "alpha.md",
              content: "# Alpha\n"
            },
            {
              tabId: "tab-3",
              path: "C:/notes/beta.md",
              name: "beta.md",
              content: "# Beta\n"
            }
          ]
        })
      });

    const { latestRef, root } = renderController({
      fishmark: {
        updateWorkspaceTabDraft,
        openWorkspaceFileFromPath
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        activeTabId: "tab-1",
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
      await latestRef.current?.openMarkdownFromPaths([
        "C:/notes/alpha.md",
        "C:/notes/beta.md"
      ]);
    });

    expect(updateWorkspaceTabDraft).toHaveBeenCalledTimes(1);
    expect(updateWorkspaceTabDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Current draft\n"
    });
    expect(openWorkspaceFileFromPath.mock.calls).toEqual([
      ["C:/notes/alpha.md"],
      ["C:/notes/beta.md"]
    ]);
    expect(latestRef.current?.workspaceSnapshot?.activeDocument).toMatchObject({
      tabId: "tab-3",
      path: "C:/notes/beta.md",
      content: "# Beta\n"
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
      await latestRef.current?.updateDraft({ tabId: "tab-1", content: "# Newer draft\n" });
    });

    const draftRevision = latestRef.current?.editorLoadRevision;

    await act(async () => {
      await latestRef.current?.refreshWorkspaceSnapshot();
    });

    expect(updateWorkspaceTabDraft).not.toHaveBeenCalled();
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

  it("keeps the current workspace and reports retryable revision staleness without applying a reload snapshot", async () => {
    const showNotification = vi.fn();
    const initialSnapshot = createWorkspaceSnapshot({
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/note.md",
          name: "note.md",
          content: "# Local draft\n",
          isDirty: true
        }
      ]
    });
    const reloadWorkspaceTabFromPath = vi.fn(async () => ({
      kind: "revision-stale" as const
    }));
    const { latestRef, root } = renderController({
      fishmark: {
        reloadWorkspaceTabFromPath
      } as unknown as Window["fishmark"],
      initialSnapshot,
      getEditorContent: () => "# Newer local draft\n",
      showNotification
    });

    let didReload: boolean | undefined;
    await act(async () => {
      didReload = await latestRef.current?.reloadWorkspaceTabFromPath({
        tabId: "tab-1"
      });
    });

    expect(didReload).toBe(false);
    expect(latestRef.current?.workspaceSnapshot).toEqual(initialSnapshot);
    expect(showNotification).toHaveBeenCalledWith({
      kind: "warning",
      message: "重新加载期间检测到新的编辑，已保留当前内容。请重试。"
    });

    act(() => {
    root.unmount();
    });
  });

  it("keeps the current workspace and reports a stable typed reload error", async () => {
    const showNotification = vi.fn();
    const initialSnapshot = createWorkspaceSnapshot({
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/note.md",
          name: "note.md",
          content: "# Local content\n"
        }
      ]
    });
    const reloadWorkspaceTabFromPath = vi.fn(async () => ({
      kind: "error" as const,
      error: {
        code: "file-identity-changed" as const,
        message: "internal text must not leak"
      }
    }));
    const { latestRef, root } = renderController({
      fishmark: {
        reloadWorkspaceTabFromPath
      } as unknown as Window["fishmark"],
      initialSnapshot,
      getEditorContent: () => "# Local content\n",
      showNotification
    });

    let didReload: boolean | undefined;
    await act(async () => {
      didReload = await latestRef.current?.reloadWorkspaceTabFromPath({
        tabId: "tab-1"
      });
    });

    expect(didReload).toBe(false);
    expect(latestRef.current?.workspaceSnapshot).toEqual(initialSnapshot);
    expect(showNotification).toHaveBeenCalledWith({
      kind: "error",
      message: "The Markdown file changed while reloading. Please try again."
    });

    act(() => {
      root.unmount();
    });
  });

  it("applies only an explicit successful reload result", async () => {
    const reloadedSnapshot = createWorkspaceSnapshot({
      tabs: [
        {
          tabId: "tab-1",
          path: "C:/notes/note.md",
          name: "note.md",
          content: "# Disk content\n"
        }
      ]
    });
    const reloadWorkspaceTabFromPath = vi.fn(async () => ({
      kind: "success" as const,
      snapshot: reloadedSnapshot
    }));
    const { latestRef, root } = renderController({
      fishmark: {
        reloadWorkspaceTabFromPath
      } as unknown as Window["fishmark"],
      initialSnapshot: createWorkspaceSnapshot({
        tabs: [
          {
            tabId: "tab-1",
            path: "C:/notes/note.md",
            name: "note.md",
            content: "# Before\n"
          }
        ]
      }),
      getEditorContent: () => "# Before\n",
      showNotification: vi.fn()
    });

    let didReload: boolean | undefined;
    await act(async () => {
      didReload = await latestRef.current?.reloadWorkspaceTabFromPath({
        tabId: "tab-1"
      });
    });

    expect(didReload).toBe(true);
    expect(latestRef.current?.workspaceSnapshot).toEqual(reloadedSnapshot);

    act(() => {
      root.unmount();
    });
  });
});

describe("useEditorWorkflowController", () => {
  it("keeps editor change autosave and draft sync orchestration inside the controller boundary", async () => {
    const setEditorContentSnapshot = vi.fn();
    const scheduleDocumentDerivedDataUpdate = vi.fn();
    const scheduleAutosave = vi.fn();
    const updateDraft = vi.fn(async () => {});

    const { latestRef, root } = renderEditorWorkflowController({
      setEditorContentSnapshot,
      scheduleDocumentDerivedDataUpdate,
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
    expect(scheduleDocumentDerivedDataUpdate).toHaveBeenCalledWith("# Draft\n");
    expect(scheduleAutosave).toHaveBeenCalledTimes(1);
    expect(updateDraft).toHaveBeenCalledWith({
      tabId: "tab-1",
      content: "# Draft\n"
    });
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
      scheduleDocumentDerivedDataUpdate: vi.fn(),
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

  it("forwards an already-rendered tab intent so an in-flight workspace transaction can reconcile main", async () => {
    const activateWorkspaceTab = vi.fn(async () => {});
    const { latestRef, root } = renderEditorWorkflowController({
      setEditorContentSnapshot: vi.fn(),
      scheduleDocumentDerivedDataUpdate: vi.fn(),
      scheduleAutosave: vi.fn(),
      runAutosave: vi.fn(async () => {}),
      resetAutosaveRuntime: vi.fn(),
      getActiveTabId: () => "tab-1",
      updateDraft: vi.fn(async () => {}),
      activateWorkspaceTab,
      closeWorkspaceTab: vi.fn(async () => {}),
      detachWorkspaceTab: vi.fn(async () => {})
    });

    await act(async () => {
      await latestRef.current?.activateWorkspaceTab("tab-1");
    });

    expect(activateWorkspaceTab).toHaveBeenCalledWith("tab-1");
    act(() => root.unmount());
  });
});
