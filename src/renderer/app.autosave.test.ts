// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { EditorTestCommandEnvelope } from "../shared/editor-test-command";
import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";
import type { RunnerEventEnvelope, ScenarioRunTerminal } from "../shared/test-run-session";
import App from "./App";
import * as codeEditorViewModule from "./code-editor-view";

type MenuCommandListener = (command: "open-markdown-file" | "save-markdown-file" | "save-markdown-file-as") => void;
type EditorTestCommandListener = (payload: EditorTestCommandEnvelope) => void;
type ScenarioRunEventListener = (payload: RunnerEventEnvelope) => void;
type ScenarioRunTerminalListener = (payload: ScenarioRunTerminal) => void;

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
        onActiveBlockChange?: (state: unknown) => void;
      }
    | undefined;
  let currentContent = "";

  const CodeEditorView = React.forwardRef(function MockCodeEditorView(
    props: {
      initialContent: string;
      loadRevision: number;
      onChange: (content: string) => void;
      onBlur?: () => void;
      onActiveBlockChange?: (state: unknown) => void;
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
  let editorTestCommandListener: EditorTestCommandListener | null;
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
    editorTestCommandListener = null;
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
      openMarkdownFileFromPath: vi.fn().mockResolvedValue({
        status: "cancelled"
      }),
      saveMarkdownFile,
      saveMarkdownFileAs,
      openEditorTestWindow: vi.fn().mockResolvedValue(undefined),
      startScenarioRun: vi.fn().mockResolvedValue({ runId: "unused-run" }),
      interruptScenarioRun: vi.fn().mockResolvedValue(undefined),
      onScenarioRunEvent(listener: ScenarioRunEventListener) {
        void listener;
        return () => {};
      },
      onScenarioRunTerminal(listener: ScenarioRunTerminalListener) {
        void listener;
        return () => {};
      },
      onEditorTestCommand(listener: EditorTestCommandListener) {
        editorTestCommandListener = listener;
        return () => {
          if (editorTestCommandListener === listener) {
            editorTestCommandListener = null;
          }
        };
      },
      completeEditorTestCommand: vi.fn().mockResolvedValue(undefined),
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

  it("executes editor test commands through the allowlist driver and completes the result", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      await editorTestCommandListener?.({
        sessionId: "editor-session-1",
        commandId: "command-1",
        command: {
          type: "assert-document-path",
          expectedPath: "C:/notes/today.md"
        }
      });
    });

    expect(window.yulora.completeEditorTestCommand).toHaveBeenCalledWith({
      sessionId: "editor-session-1",
      commandId: "command-1",
      result: {
        ok: true,
        message: "Document path matched.",
        details: {
          actualPath: "C:/notes/today.md"
        }
      }
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
