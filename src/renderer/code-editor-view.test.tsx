// @vitest-environment jsdom

import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeEditorView, type CodeEditorHandle } from "./code-editor-view";

const replaceDocumentMock = vi.fn<(content: string) => void>();
const setDocumentPathMock = vi.fn<(documentPath: string | null) => void>();
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
          initialContent: "# Updated by autosave\n",
          documentPath: "D:/notes/initial.md",
          loadRevision: 1,
          onChange: vi.fn()
        })
      );
    });

    expect(replaceDocumentMock).not.toHaveBeenCalled();
  });

  it("replaces the editor document when a new document load revision arrives", async () => {
    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
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

  it("exposes focus() on handle and forwards to editor host", async () => {
    const ref = createRef<CodeEditorHandle>();

    await act(async () => {
      root.render(
        createElement(CodeEditorView, {
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
