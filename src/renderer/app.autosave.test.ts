// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { EditorTestCommandEnvelope } from "../shared/editor-test-command";
import { DEFAULT_PREFERENCES, type Preferences } from "../shared/preferences";
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
type PreferencesChangedListener = (preferences: Preferences) => void;
type ThemeDescriptor = Awaited<ReturnType<Window["yulora"]["listThemes"]>>[number];

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

type MockCodeEditorModule = typeof codeEditorViewModule & {
  __mock: {
    changeContent: (content: string) => void;
    blur: () => void;
    focus: () => void;
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
  let latestHostElement: HTMLDivElement | null = null;

  const CodeEditorView = React.forwardRef(function MockCodeEditorView(
    props: {
      initialContent: string;
      loadRevision: number;
        onChange: (content: string) => void;
        onBlur?: () => void;
        onActiveBlockChange?: (state: unknown) => void;
      },
    ref: React.ForwardedRef<{ getContent: () => string; focus: () => void }>
  ) {
    const { initialContent, loadRevision } = props;

    React.useEffect(() => {
      latestProps = props;
    }, [props]);

    React.useEffect(() => {
      currentContent = initialContent;
    }, [initialContent, loadRevision]);

    React.useEffect(() => {
      const hostElement = document.querySelector('[data-testid="mock-code-editor"]');
      latestHostElement = hostElement instanceof HTMLDivElement ? hostElement : null;

      return () => {
        if (latestHostElement === hostElement) {
          latestHostElement = null;
        }
      };
    }, []);

    React.useImperativeHandle(ref, () => ({
      getContent: () => currentContent,
      focus: () => latestHostElement?.focus()
    }));

    return React.createElement("div", {
      "data-testid": "mock-code-editor",
      tabIndex: -1,
      onBlur: () => props.onBlur?.()
    });
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
      focus() {
        latestHostElement?.focus();
      },
      reset() {
        latestProps = undefined;
        currentContent = "";
        latestHostElement = null;
      }
    }
  };
});

describe("App autosave", () => {
  let container: HTMLDivElement;
  let root: Root;
  let menuCommandListener: MenuCommandListener | null;
  let editorTestCommandListener: EditorTestCommandListener | null;
  let preferencesChangedListener: PreferencesChangedListener | null;
  let openMarkdownFile: ReturnType<typeof vi.fn<() => Promise<OpenMarkdownFileResult>>>;
  let saveMarkdownFile: ReturnType<
    typeof vi.fn<(input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>>
  >;
  let saveMarkdownFileAs: ReturnType<
    typeof vi.fn<(input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>>
  >;
  let listThemes: ReturnType<typeof vi.fn<() => Promise<ThemeDescriptor[]>>>;
  let refreshThemes: ReturnType<typeof vi.fn<() => Promise<ThemeDescriptor[]>>>;

  const communityThemes: ThemeDescriptor[] = [
    {
      id: "graphite-dark",
      source: "community",
      name: "Graphite Dark",
      directoryName: "graphite-dark",
      availableParts: {
        tokens: true,
        ui: true,
        editor: true,
        markdown: true
      },
      partUrls: {
        tokens: "file:///themes/graphite-dark/tokens.css",
        ui: "file:///themes/graphite-dark/ui.css",
        editor: "file:///themes/graphite-dark/editor.css",
        markdown: "file:///themes/graphite-dark/markdown.css"
      }
    }
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    codeEditorMock.reset();
    menuCommandListener = null;
    editorTestCommandListener = null;
    preferencesChangedListener = null;
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
    listThemes = vi.fn<() => Promise<ThemeDescriptor[]>>().mockResolvedValue(communityThemes);
    refreshThemes = vi.fn<() => Promise<ThemeDescriptor[]>>().mockResolvedValue(communityThemes);

    window.yulora = {
      platform: "win32",
      runtimeMode: "editor",
      startupOpenPath: null,
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
      },
      getPreferences: vi.fn().mockResolvedValue(DEFAULT_PREFERENCES),
      updatePreferences: vi.fn().mockResolvedValue({
        status: "success",
        preferences: DEFAULT_PREFERENCES
      }),
      listThemes,
      refreshThemes,
      onPreferencesChanged(listener: PreferencesChangedListener) {
        preferencesChangedListener = listener;
        return () => {
          if (preferencesChangedListener === listener) {
            preferencesChangedListener = null;
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

  it("opens the startup markdown file automatically when the bridge provides a launch path", async () => {
    const openMarkdownFileFromPath = vi.fn().mockResolvedValue({
      status: "success",
      document: {
        path: "C:/notes/startup.md",
        name: "startup.md",
        content: "# Startup\n",
        encoding: "utf-8"
      }
    });

    window.yulora = {
      ...window.yulora,
      openMarkdownFileFromPath,
      startupOpenPath: "C:/notes/startup.md"
    } as unknown as Window["yulora"];

    await act(async () => {
      root.render(createElement(App));
      await Promise.resolve();
    });

    expect(openMarkdownFileFromPath).toHaveBeenCalledTimes(1);
    expect(openMarkdownFileFromPath).toHaveBeenCalledWith("C:/notes/startup.md");
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

  it("re-schedules autosave using the latest preference idle delay", async () => {
    await renderAndOpenDocument();

    expect(preferencesChangedListener).not.toBeNull();

    await act(async () => {
      preferencesChangedListener?.({
        ...DEFAULT_PREFERENCES,
        autosave: { idleDelayMs: 2500 }
      });
      await Promise.resolve();
    });

    await act(async () => {
      codeEditorMock.changeContent("# Slow autosave\n");
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      path: "C:/notes/today.md",
      content: "# Slow autosave\n"
    });
  });

  it("re-schedules an already pending autosave when the idle delay preference changes", async () => {
    await renderAndOpenDocument();

    expect(preferencesChangedListener).not.toBeNull();

    await act(async () => {
      codeEditorMock.changeContent("# Pending autosave\n");
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    await act(async () => {
      preferencesChangedListener?.({
        ...DEFAULT_PREFERENCES,
        autosave: { idleDelayMs: 2500 }
      });
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1899);
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
      content: "# Pending autosave\n"
    });
  });

  it("applies initial theme and typography preferences to the document root", async () => {
    window.yulora = {
      ...window.yulora,
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: null },
        ui: {
          fontSize: 17
        },
        document: {
          fontFamily: "IBM Plex Serif",
          fontSize: 18
        }
      })
    } as Window["yulora"];

    await act(async () => {
      root.render(createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.documentElement.dataset.yuloraTheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--yulora-ui-font-size")).toBe("17px");
    expect(document.documentElement.style.getPropertyValue("--yulora-document-font-family")).toBe(
      "IBM Plex Serif"
    );
    expect(document.documentElement.style.getPropertyValue("--yulora-document-font-size")).toBe(
      "18px"
    );
    expect(
      document.head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toContain("default-dark/tokens.css");
  });

  it("updates theme variables and mounted stylesheets when preferences change", async () => {
    await act(async () => {
      root.render(createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(preferencesChangedListener).not.toBeNull();

    await act(async () => {
      preferencesChangedListener?.({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: "graphite-dark" },
        ui: {
          fontSize: 18
        },
        document: {
          fontFamily: "Source Serif 4",
          fontSize: 20
        }
      });
      await Promise.resolve();
    });

    expect(document.documentElement.dataset.yuloraTheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--yulora-ui-font-size")).toBe("18px");
    expect(document.documentElement.style.getPropertyValue("--yulora-document-font-family")).toBe(
      "Source Serif 4"
    );
    expect(document.documentElement.style.getPropertyValue("--yulora-document-font-size")).toBe(
      "20px"
    );
    expect(
      document.head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe("file:///themes/graphite-dark/tokens.css");
  });

  it("renders the theme package selector and refreshes the theme catalog from settings", async () => {
    await act(async () => {
      root.render(createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const themeSelect = container.querySelector<HTMLSelectElement>("#settings-theme-package");
    const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("刷新主题")
    );

    expect(themeSelect?.value).toBe("default");
    expect(
      Array.from(themeSelect?.options ?? []).map((option) => ({
        value: option.value,
        label: option.textContent
      }))
    ).toEqual([
      { value: "default", label: "Yulora 默认" },
      { value: "graphite-dark", label: "Graphite Dark" }
    ]);

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(refreshThemes).toHaveBeenCalledTimes(1);
  });

  it("marks recent-files capacity as pending TASK-006 in settings", async () => {
    await act(async () => {
      root.render(createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const recentFilesInput = container.querySelector<HTMLInputElement>("#settings-recent-max");

    expect(recentFilesInput?.disabled).toBe(true);
    expect(container.textContent).toContain("将在 TASK-006 接入后开放");
  });

  it("keeps the editor mounted when settings opens and closes the drawer on Escape", async () => {
    await renderAndOpenDocument();

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();
    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();
    expect(container.textContent).toContain("today.md");

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();
    expect(container.textContent).toContain("today.md");
    expect(container.querySelector('[data-yulora-dialog="settings-drawer"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-yulora-dialog="settings-drawer"]')).toBeNull();
    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();
    expect(container.textContent).toContain("today.md");
  });

  it("renders rail, workspace, document header, status strip, and word count for an open document", async () => {
    await renderAndOpenDocument();

    const rail = container.querySelector('[data-yulora-layout="rail"]');
    const workspace = container.querySelector('[data-yulora-layout="workspace"]');
    const documentHeader = container.querySelector('[data-yulora-region="document-header"]');
    const statusStrip = container.querySelector('[data-yulora-region="status-strip"]');

    expect(rail).not.toBeNull();
    expect(workspace).not.toBeNull();
    expect(documentHeader?.textContent).toContain("today.md");
    expect(documentHeader?.textContent).toContain("C:/notes/today.md");
    expect(statusStrip?.textContent).toContain("All changes saved");
    expect(statusStrip?.textContent).toContain("字数 6");
    expect(statusStrip?.textContent).toContain("Bridge: win32");
    expect(documentHeader?.textContent).not.toContain("Bridge: win32");
    expect(documentHeader?.textContent).not.toContain("All changes saved");
  });

  it("autosaves dirty content when opening settings and restores editor focus when the drawer closes", async () => {
    await renderAndOpenDocument();

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    expect(document.activeElement?.getAttribute("data-testid")).toBe("mock-code-editor");

    await act(async () => {
      codeEditorMock.changeContent("# Blur restore\n");
      settingsButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      settingsButton?.focus();
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFile).toHaveBeenCalledWith({
      path: "C:/notes/today.md",
      content: "# Blur restore\n"
    });
    expect(container.querySelector('[data-yulora-dialog="settings-drawer"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-yulora-dialog="settings-drawer"]')).toBeNull();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("mock-code-editor");
  });

  it("renders settings as a drawer panel with close affordance while keeping existing controls", async () => {
    await act(async () => {
      root.render(createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const drawerPanel = container.querySelector<HTMLElement>('[data-yulora-panel="settings-drawer"]');
    const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="关闭设置"]');
    const themeSelect = container.querySelector<HTMLSelectElement>("#settings-theme-package");
    const recentFilesInput = container.querySelector<HTMLInputElement>("#settings-recent-max");

    expect(drawerPanel?.getAttribute("role")).toBe("dialog");
    expect(drawerPanel?.getAttribute("aria-modal")).toBe("true");
    expect(drawerPanel?.textContent).toContain("偏好设置");
    expect(closeButton).not.toBeNull();
    expect(themeSelect).not.toBeNull();
    expect(recentFilesInput?.disabled).toBe(true);
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
