// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";
import App from "./App";
import * as codeEditorViewModule from "./code-editor-view";

type MenuCommandListener = (command: "open-markdown-file" | "save-markdown-file" | "save-markdown-file-as") => void;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

type MockCodeEditorModule = typeof codeEditorViewModule & {
  __mock: {
    changeContent: (content: string) => void;
    blur: () => void;
    reset: () => void;
  };
};

const codeEditorMock = (codeEditorViewModule as MockCodeEditorModule).__mock;

vi.mock("./code-editor-view", async () => {
  const React = await import("react");

  let latestProps:
    | {
        initialContent: string;
        loadRevision: number;
        onChange: (content: string) => void;
        onBlur?: () => void;
      }
    | undefined;
  let currentContent = "";

  const CodeEditorView = React.forwardRef(function MockCodeEditorView(
    props: {
      initialContent: string;
      loadRevision: number;
      onChange: (content: string) => void;
      onBlur?: () => void;
    },
    ref: React.ForwardedRef<{ getContent: () => string }>
  ) {
    const { initialContent, loadRevision } = props;

    React.useEffect(() => {
      latestProps = props;
    }, [props]);

    React.useEffect(() => {
      currentContent = initialContent;
    }, [initialContent, loadRevision]);

    React.useImperativeHandle(ref, () => ({
      getContent: () => currentContent
    }));

    return React.createElement("div", { "data-testid": "mock-code-editor" });
  });

  return {
    CodeEditorView,
    __mock: {
      changeContent(content: string) {
        currentContent = content;
        latestProps?.onChange(content);
      },
      blur() {
        latestProps?.onBlur?.();
      },
      reset() {
        latestProps = undefined;
        currentContent = "";
      }
    }
  };
});

describe("App autosave", () => {
  let container: HTMLDivElement;
  let root: Root;
  let menuCommandListener: MenuCommandListener | null;
  let openMarkdownFile: ReturnType<typeof vi.fn<() => Promise<OpenMarkdownFileResult>>>;
  let saveMarkdownFile: ReturnType<
    typeof vi.fn<(input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>>
  >;
  let saveMarkdownFileAs: ReturnType<
    typeof vi.fn<(input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>>
  >;

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    codeEditorMock.reset();
    menuCommandListener = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    openMarkdownFile = vi.fn<() => Promise<OpenMarkdownFileResult>>().mockResolvedValue({
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      }
    });

    saveMarkdownFile = vi
      .fn<(input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>>()
      .mockImplementation(async (input) => ({
        status: "success",
        document: {
          path: input.path,
          name: "today.md",
          content: input.content,
          encoding: "utf-8"
        }
      }));

    saveMarkdownFileAs = vi.fn<(input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>>();

    window.yulora = {
      platform: "win32",
      runtimeMode: "editor",
      openMarkdownFile,
      saveMarkdownFile,
      saveMarkdownFileAs,
      openEditorTestWindow: vi.fn().mockResolvedValue(undefined),
      onMenuCommand(listener: MenuCommandListener) {
        menuCommandListener = listener;
        return () => {
          if (menuCommandListener === listener) {
            menuCommandListener = null;
          }
        };
      }
    } as Window["yulora"];
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    vi.useRealTimers();
  });

  it("does not autosave a clean document immediately after opening", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();
  });

  it("autosaves after typing stops for the idle debounce window", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.changeContent("# Updated once\n");
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      path: "C:/notes/today.md",
      content: "# Updated once\n"
    });
  });

  it("resets the autosave timer on consecutive edits and saves the latest content once", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.changeContent("# First update\n");
      vi.advanceTimersByTime(500);
      codeEditorMock.changeContent("# Second update\n");
      vi.advanceTimersByTime(999);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      path: "C:/notes/today.md",
      content: "# Second update\n"
    });
  });

  it("autosaves immediately when the editor blurs while dirty", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.changeContent("# Blur update\n");
      codeEditorMock.blur();
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      path: "C:/notes/today.md",
      content: "# Blur update\n"
    });
  });

  it("does not run an extra autosave after a pending manual save", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.changeContent("# Manual save wins\n");
      menuCommandListener?.("save-markdown-file");
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      path: "C:/notes/today.md",
      content: "# Manual save wins\n"
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
  });

  it("replays autosave once with the latest content when edits happen during an in-flight autosave", async () => {
    await renderAndOpenDocument();

    const firstSaveDeferred = createDeferred<{
      status: "success";
      document: {
        path: string;
        name: string;
        content: string;
        encoding: "utf-8";
      };
    }>();

    saveMarkdownFile.mockImplementationOnce(() => firstSaveDeferred.promise);

    await act(async () => {
      codeEditorMock.changeContent("# First autosave\n");
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).toHaveBeenNthCalledWith(1, {
      path: "C:/notes/today.md",
      content: "# First autosave\n"
    });

    await act(async () => {
      codeEditorMock.changeContent("# Second autosave\n");
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSaveDeferred.resolve({
        status: "success",
        document: {
          path: "C:/notes/today.md",
          name: "today.md",
          content: "# First autosave\n",
          encoding: "utf-8"
        }
      });
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(2);
    expect(saveMarkdownFile).toHaveBeenNthCalledWith(2, {
      path: "C:/notes/today.md",
      content: "# Second autosave\n"
    });
  });

  async function renderAndOpenDocument(): Promise<void> {
    await act(async () => {
      root.render(createElement(App));
    });

    expect(menuCommandListener).not.toBeNull();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    expect(openMarkdownFile).toHaveBeenCalledTimes(1);
  }
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
