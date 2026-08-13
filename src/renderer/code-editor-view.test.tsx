// @vitest-environment jsdom

import { act, createElement, createRef, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeEditorView, type CodeEditorHandle } from "./code-editor-view";

const replaceDocumentMock = vi.fn<(content: string) => void>();
const setContentMock = vi.fn<(content: string) => void>();
const setDocumentPathMock = vi.fn<(documentPath: string | null) => void>();
const setViewModeMock = vi.fn<(viewMode: "wysiwym" | "source") => void>();
const setReadOnlyMock = vi.fn<(readOnly: boolean) => void>();
const setDocumentIdentityMock = vi.fn<(identity: { tabId: string; epoch: number; loadRevision: number } | null) => void>();
const sealForBarrierMock = vi.fn(() => Promise.resolve({ text: "# Initial\n", identity: null }));
const applyRemoteDocumentPatchMock = vi.fn(async () => ({ kind: "applied" as const }));
const focusMock = vi.fn<() => void>();
const navigateToOffsetMock = vi.fn<(offset: number) => void>();
const destroyMock = vi.fn<() => void>();
const getContentMock = vi.fn<() => string>(() => "# Initial\n");
const getSelectionMock = vi.fn<() => { anchor: number; head: number }>(() => ({ anchor: 0, head: 0 }));
const pressEnterMock = vi.fn<() => void>();
const pressBackspaceMock = vi.fn<() => void>();
const pressTabMock = vi.fn<(shiftKey?: boolean) => void>();
const pressArrowUpMock = vi.fn<() => void>();
const pressArrowDownMock = vi.fn<() => void>();
const createCodeEditorControllerMock = vi.fn();

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function asSealSnapshot(promise: Promise<void>) {
  return promise.then(() => ({ text: "# Initial\n", identity: null }));
}

function createBindingProps() {
  return {
    documentTabId: "tab-1",
    editorEpoch: 1,
    readOnly: false,
    editorTransitionToken: null,
    onEditorTransitionApplied: vi.fn(),
    onLoadRevisionApplied: vi.fn()
  };
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

vi.mock("./code-editor", () => ({
  createCodeEditorController: (...args: unknown[]) => createCodeEditorControllerMock(...args)
}));

describe("CodeEditorView", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    replaceDocumentMock.mockReset();
    setContentMock.mockReset();
    setDocumentPathMock.mockReset();
    setViewModeMock.mockReset();
    setReadOnlyMock.mockReset();
    setDocumentIdentityMock.mockReset();
    sealForBarrierMock.mockReset();
    sealForBarrierMock.mockResolvedValue({ text: "# Initial\n", identity: null });
    applyRemoteDocumentPatchMock.mockReset();
    applyRemoteDocumentPatchMock.mockResolvedValue({ kind: "applied" });
    destroyMock.mockReset();
    focusMock.mockReset();
    navigateToOffsetMock.mockReset();
    getContentMock.mockReset();
    getSelectionMock.mockReset();
    pressEnterMock.mockReset();
    pressBackspaceMock.mockReset();
    pressTabMock.mockReset();
    pressArrowUpMock.mockReset();
    pressArrowDownMock.mockReset();
    getContentMock.mockReturnValue("# Initial\n");
    getSelectionMock.mockReturnValue({ anchor: 0, head: 0 });
    createCodeEditorControllerMock.mockReset();
    createCodeEditorControllerMock.mockReturnValue({
      getContent: getContentMock,
      getSelection: getSelectionMock,
      setContent: setContentMock,
      replaceDocument: replaceDocumentMock,
      setDocumentPath: setDocumentPathMock,
      setViewMode: setViewModeMock,
      setReadOnly: setReadOnlyMock,
      setDocumentIdentity: setDocumentIdentityMock,
      sealForBarrier: sealForBarrierMock,
      applyRemoteDocumentPatch: applyRemoteDocumentPatchMock,
      focus: focusMock,
      navigateToOffset: navigateToOffsetMock,
      pressEnter: pressEnterMock,
      pressBackspace: pressBackspaceMock,
      pressTab: pressTabMock,
      pressArrowUp: pressArrowUpMock,
      pressArrowDown: pressArrowDownMock,
      destroy: destroyMock
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("does not replace the editor document when saved content syncs without a new load revision", async () => {
    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          onChange: vi.fn()
        })
      );
    });

    replaceDocumentMock.mockClear();

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Updated by autosave\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          onChange: vi.fn()
        })
      );
    });

    expect(replaceDocumentMock).not.toHaveBeenCalled();
  });

  it("updates view mode through the existing controller without replacing content", async () => {
    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          viewMode: "wysiwym",
          onChange: vi.fn()
        })
      );
    });

    replaceDocumentMock.mockClear();
    setViewModeMock.mockClear();

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          viewMode: "source",
          onChange: vi.fn()
        })
      );
    });

    expect(setViewModeMock).toHaveBeenCalledWith("source");
    expect(replaceDocumentMock).not.toHaveBeenCalled();
    expect(container.querySelector(".document-editor")?.getAttribute("data-fishmark-editor-view-mode")).toBe(
      "source"
    );
  });

  it("replaces the editor document when a new document load revision arrives", async () => {
    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          onChange: vi.fn()
        })
      );
    });

    replaceDocumentMock.mockClear();

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Opened from disk\n",
          documentPath: "D:/notes/opened.md",
          loadRevision: 2,
          onChange: vi.fn()
        })
      );
    });

    expect(replaceDocumentMock).toHaveBeenCalledTimes(1);
    expect(replaceDocumentMock).toHaveBeenCalledWith("# Opened from disk\n");
  });

  it("registers and unregisters the identity-fenced remote patch capability", async () => {
    const onEditorRemotePatchChange = vi.fn();
    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          onChange: vi.fn(),
          onEditorRemotePatchChange
        })
      );
    });

    const patch = onEditorRemotePatchChange.mock.calls[0]?.[0];
    expect(typeof patch).toBe("function");
    await expect(patch({
      identity: { tabId: "tab-1", epoch: 1, loadRevision: 1 },
      expectedBefore: "# Initial\n",
      expectedAfter: "# Remote\n",
      from: 0,
      to: 10,
      insert: "# Remote\n"
    })).resolves.toEqual({ kind: "applied" });
    expect(applyRemoteDocumentPatchMock).toHaveBeenCalledTimes(1);
  });

  it("acknowledges the exact editor identity only after replacing the document", async () => {
    const onLoadRevisionApplied = vi.fn();
    const onEditorTransitionApplied = vi.fn();
    type ExtendedProps = ComponentProps<typeof CodeEditorView> & {
      documentTabId: string;
      editorEpoch: number;
      readOnly: boolean;
      editorTransitionToken: number | null;
      onEditorTransitionApplied: (input: { token: number; readOnly: boolean }) => void;
      onLoadRevisionApplied: (identity: {
        tabId: string;
        epoch: number;
        loadRevision: number;
      }) => void;
    };

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          documentTabId: "tab-1",
          editorEpoch: 1,
          loadRevision: 1,
          readOnly: false,
          editorTransitionToken: null,
          onEditorTransitionApplied,
          onLoadRevisionApplied,
          onChange: vi.fn()
        } as ExtendedProps)
      );
    });
    replaceDocumentMock.mockClear();
    onLoadRevisionApplied.mockClear();
    onEditorTransitionApplied.mockClear();

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Disk\n",
          documentPath: "D:/notes/initial.md",
          documentTabId: "tab-1",
          editorEpoch: 2,
          loadRevision: 2,
          readOnly: true,
          editorTransitionToken: 41,
          onEditorTransitionApplied,
          onLoadRevisionApplied,
          onChange: vi.fn()
        } as ExtendedProps)
      );
    });

    expect(replaceDocumentMock).toHaveBeenCalledWith("# Disk\n");
    expect(onLoadRevisionApplied).toHaveBeenCalledWith({
      tabId: "tab-1",
      epoch: 2,
      loadRevision: 2
    });
    expect(replaceDocumentMock.mock.invocationCallOrder[0]).toBeLessThan(
      onLoadRevisionApplied.mock.invocationCallOrder[0]!
    );
    expect(setReadOnlyMock).toHaveBeenLastCalledWith(true);
    expect(onEditorTransitionApplied).toHaveBeenCalledWith({ token: 41, readOnly: true });
    expect(setReadOnlyMock.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      onEditorTransitionApplied.mock.invocationCallOrder[0]!
    );
  });

  it("exposes focus() on handle and forwards to editor host", async () => {
    const ref = createRef<CodeEditorHandle>();

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          onChange: vi.fn(),
          ref
        })
      );
    });

    expect(typeof ref.current?.focus).toBe("function");
    ref.current?.focus();

    expect(focusMock).toHaveBeenCalledTimes(1);
  });

  it("exposes navigateToOffset() on handle and forwards to the controller", async () => {
    const ref = createRef<CodeEditorHandle>();

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          onChange: vi.fn(),
          ref
        })
      );
    });

    expect(typeof ref.current?.navigateToOffset).toBe("function");
    ref.current?.navigateToOffset(12);

    expect(navigateToOffsetMock).toHaveBeenCalledTimes(1);
    expect(navigateToOffsetMock).toHaveBeenCalledWith(12);
  });

  it("forwards the applied identity and document frame callback without owning a scheduler", async () => {
    const onDocumentChangeFrame = vi.fn();
    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          onChange: vi.fn(),
          onDocumentChangeFrame
        } as ComponentProps<typeof CodeEditorView>)
      );
    });

    expect(setDocumentIdentityMock).toHaveBeenCalledWith({
      tabId: "tab-1",
      epoch: 1,
      loadRevision: 1
    });
    const controllerOptions = createCodeEditorControllerMock.mock.calls[0]?.[0] as {
      onDocumentChangeFrame?: (frame: unknown) => void;
    };
    const frame = { baseText: "a", resultingText: "b", changes: [], identity: null };
    controllerOptions.onDocumentChangeFrame?.(frame);
    expect(onDocumentChangeFrame).toHaveBeenCalledWith(frame);
  });

  it("waits for the latest seal and fences prior tokens and unmounted controllers", async () => {
    const first = createDeferred();
    const second = createDeferred();
    const onEditorTransitionApplied = vi.fn();
    sealForBarrierMock.mockReturnValueOnce(asSealSnapshot(first.promise))
      .mockReturnValueOnce(asSealSnapshot(second.promise));

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          readOnly: true,
          editorTransitionToken: 1,
          onEditorTransitionApplied,
          onChange: vi.fn()
        })
      );
    });
    expect(setReadOnlyMock).not.toHaveBeenCalled();
    expect(onEditorTransitionApplied).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          readOnly: false,
          editorTransitionToken: 2,
          onEditorTransitionApplied,
          onChange: vi.fn()
        })
      );
    });
    await act(async () => {
      first.resolve();
      await Promise.resolve();
    });
    expect(setReadOnlyMock).not.toHaveBeenCalled();
    expect(onEditorTransitionApplied).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve();
      await Promise.resolve();
    });
    expect(setReadOnlyMock).toHaveBeenCalledWith(false);
    expect(onEditorTransitionApplied).toHaveBeenCalledWith({ token: 2, readOnly: false });

    const unmounted = createDeferred();
    sealForBarrierMock.mockReturnValueOnce(asSealSnapshot(unmounted.promise));
    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
          ...createBindingProps(),
          initialContent: "# Initial\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          readOnly: true,
          editorTransitionToken: 3,
          onEditorTransitionApplied,
          onChange: vi.fn()
        })
      );
    });
    await act(async () => {
      root.unmount();
      unmounted.resolve();
      await Promise.resolve();
    });
    expect(onEditorTransitionApplied).not.toHaveBeenCalledWith({ token: 3, readOnly: true });
  });
});
