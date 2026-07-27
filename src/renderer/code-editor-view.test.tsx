// @vitest-environment jsdom

import { act, createElement, createRef, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeEditorView, type CodeEditorHandle } from "./code-editor-view";

const replaceDocumentMock = vi.fn<(content: string) => void>();
const setDocumentPathMock = vi.fn<(documentPath: string | null) => void>();
const setViewModeMock = vi.fn<(viewMode: "wysiwym" | "source") => void>();
const setReadOnlyMock = vi.fn<(readOnly: boolean) => void>();
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

function createBindingProps() {
  return {
    documentTabId: "tab-1",
    editorEpoch: 1,
    readOnly: false,
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
    setDocumentPathMock.mockReset();
    setViewModeMock.mockReset();
    setReadOnlyMock.mockReset();
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
      replaceDocument: replaceDocumentMock,
      setDocumentPath: setDocumentPathMock,
      setViewMode: setViewModeMock,
      setReadOnly: setReadOnlyMock,
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

  it("acknowledges the exact editor identity only after replacing the document", async () => {
    const onLoadRevisionApplied = vi.fn();
    type ExtendedProps = ComponentProps<typeof CodeEditorView> & {
      documentTabId: string;
      editorEpoch: number;
      readOnly: boolean;
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
          onLoadRevisionApplied,
          onChange: vi.fn()
        } as ExtendedProps)
      );
    });
    replaceDocumentMock.mockClear();
    onLoadRevisionApplied.mockClear();

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
});
