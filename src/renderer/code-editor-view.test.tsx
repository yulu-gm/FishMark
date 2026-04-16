// @vitest-environment jsdom

import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeEditorView, type CodeEditorHandle } from "./code-editor-view";

const replaceDocumentMock = vi.fn<(content: string) => void>();
const focusMock = vi.fn<() => void>();
const destroyMock = vi.fn<() => void>();
const getContentMock = vi.fn<() => string>(() => "# Initial\n");
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
    destroyMock.mockReset();
    focusMock.mockReset();
    getContentMock.mockReset();
    getContentMock.mockReturnValue("# Initial\n");
    createCodeEditorControllerMock.mockReset();
    createCodeEditorControllerMock.mockReturnValue({
      getContent: getContentMock,
      replaceDocument: replaceDocumentMock,
      focus: focusMock,
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
});
