// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { AppNotification, AppUpdateState } from "../shared/app-update";
import type { EditorTestCommandEnvelope } from "../shared/editor-test-command";
import { DEFAULT_PREFERENCES, type Preferences } from "../shared/preferences";
import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";
import { createPreviewAssetUrl } from "../shared/preview-asset-url";
import {
  THEME_RUNTIME_ENV_CSS_VARS,
  THEME_RUNTIME_THEME_MODE_ATTRIBUTE
} from "../shared/theme-style-contract";
import type { RunnerEventEnvelope, ScenarioRunTerminal } from "../shared/test-run-session";
import App from "./App";
import * as codeEditorViewModule from "./code-editor-view";

type MenuCommandListener = (
  command:
    | "new-markdown-document"
    | "open-markdown-file"
    | "save-markdown-file"
    | "save-markdown-file-as"
    | "check-for-updates"
) => void;
type EditorTestCommandListener = (payload: EditorTestCommandEnvelope) => void;
type ScenarioRunEventListener = (payload: RunnerEventEnvelope) => void;
type ScenarioRunTerminalListener = (payload: ScenarioRunTerminal) => void;
type PreferencesChangedListener = (preferences: Preferences) => void;
type ThemePackageDescriptor = Awaited<ReturnType<Window["yulora"]["listThemePackages"]>>[number];
type UpdatePreferencesResult = Awaited<ReturnType<Window["yulora"]["updatePreferences"]>>;
type MockMediaQueryList = MediaQueryList & {
  __setMatches: (matches: boolean) => void;
};

type SettingsDriver = {
  openSettings: () => Promise<void>;
  selectSettingsOption: (labelOrId: string, value: string) => Promise<void>;
  getByLabelText: (text: string) => Element;
};

type RenderEditorAppOptions = {
  listThemePackagesResult?: ThemePackageDescriptor[];
  refreshThemePackagesResult?: ThemePackageDescriptor[];
  getPreferencesResult?: Preferences;
  updatePreferencesImplementation?: (patch: Partial<Preferences>) => Promise<UpdatePreferencesResult>;
};

function makeManifestThemePackage(
  overrides: Partial<{
    id: string;
    name: string;
    source: ThemePackageDescriptor["source"];
    supports: ThemePackageDescriptor["manifest"]["supports"];
    tokens: ThemePackageDescriptor["manifest"]["tokens"];
    styles: ThemePackageDescriptor["manifest"]["styles"];
    scene: ThemePackageDescriptor["manifest"]["scene"];
    surfaces: ThemePackageDescriptor["manifest"]["surfaces"];
    parameters: ThemePackageDescriptor["manifest"]["parameters"];
  }> = {}
): ThemePackageDescriptor {
  const id = overrides.id ?? "manifest-theme";

  return {
    id,
    kind: "manifest-package",
    source: overrides.source ?? "community",
    packageRoot: `/tmp/yulora/themes/${id}`,
    manifest: {
      id,
      contractVersion: 2,
      name: overrides.name ?? "Manifest Theme",
      version: "1.0.0",
      author: null,
      supports: overrides.supports ?? {
        light: true,
        dark: true
      },
      tokens: overrides.tokens ?? {
        dark: `/tmp/yulora/themes/${id}/tokens-dark.css`,
        light: `/tmp/yulora/themes/${id}/tokens-light.css`
      },
      styles: overrides.styles ?? {
        ui: `/tmp/yulora/themes/${id}/ui.css`,
        editor: `/tmp/yulora/themes/${id}/editor.css`,
        markdown: `/tmp/yulora/themes/${id}/markdown.css`
      },
      layout: {
        titlebar: null
      },
      scene: overrides.scene ?? null,
      surfaces: overrides.surfaces ?? {},
      parameters: overrides.parameters ?? []
    }
  };
}

function getCssRule(stylesheet: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));

  if (!match || match[0] === undefined) {
    throw new Error(`Missing stylesheet rule for selector: ${selector}`);
  }

  return match[0];
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

type MockCodeEditorModule = typeof codeEditorViewModule & {
  __mock: {
    changeContent: (content: string) => void;
    blur: () => void;
    focus: () => void;
    getRenderCount: () => number;
    getNavigateCalls: () => number[];
    setLayout: (layout: { hostLeft: number; hostWidth: number; contentLeft: number; contentWidth: number }) => void;
    triggerResize: () => void;
    reset: () => void;
  };
};

type ResizeObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;
type MockEditorLayout = {
  hostLeft: number;
  hostWidth: number;
  contentLeft: number;
  contentWidth: number;
};

function createDomRect(left: number, width: number): DOMRect {
  return {
    x: left,
    y: 0,
    width,
    height: 100,
    top: 0,
    right: left + width,
    bottom: 100,
    left,
    toJSON() {
      return {};
    }
  } as DOMRect;
}

class MockResizeObserver {
  static instances = new Set<MockResizeObserver>();

  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.add(this);
  }

  observe(target: Element): void {
    void target;
  }

  unobserve(target: Element): void {
    void target;
  }

  disconnect(): void {
    MockResizeObserver.instances.delete(this);
  }

  static reset(): void {
    MockResizeObserver.instances.clear();
  }

  static trigger(): void {
    for (const instance of MockResizeObserver.instances) {
      instance.callback([], instance as unknown as ResizeObserver);
    }
  }
}

const codeEditorMock = (codeEditorViewModule as MockCodeEditorModule).__mock;
const baseStylesheetPath = join(process.cwd(), "src/renderer/styles/base.css");
const appUiStylesheetPath = join(process.cwd(), "src/renderer/styles/app-ui.css");
const primitivesStylesheetPath = join(process.cwd(), "src/renderer/styles/primitives.css");
const markdownRenderStylesheetPath = join(process.cwd(), "src/renderer/styles/markdown-render.css");
const settingsStylesheetPath = join(process.cwd(), "src/renderer/styles/settings.css");
const rainGlassUiStylesheetPath = join(
  process.cwd(),
  "fixtures/themes/rain-glass/styles/ui.css"
);
const lightTokenStylesheetPath = join(
  process.cwd(),
  "src/renderer/theme-packages/default/tokens/light.css"
);
const lightMarkdownStylesheetPath = join(
  process.cwd(),
  "src/renderer/theme-packages/default/styles/markdown.css"
);

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
  let latestContentElement: HTMLDivElement | null = null;
  let navigateCalls: number[] = [];
  let renderCount = 0;
  let layout: MockEditorLayout = {
    hostLeft: 0,
    hostWidth: 880,
    contentLeft: 240,
    contentWidth: 520
  };

  const CodeEditorView = React.forwardRef(function MockCodeEditorView(
    props: {
      initialContent: string;
      loadRevision: number;
        onChange: (content: string) => void;
        onBlur?: () => void;
        onActiveBlockChange?: (state: unknown) => void;
      },
    ref: React.ForwardedRef<{
      getContent: () => string;
      focus: () => void;
      navigateToOffset: (offset: number) => void;
    }>
  ) {
    const { initialContent, loadRevision } = props;
    renderCount += 1;

    React.useEffect(() => {
      latestProps = props;
    }, [props]);

    React.useEffect(() => {
      currentContent = initialContent;
    }, [initialContent, loadRevision]);

    React.useEffect(() => {
      const hostElement = document.querySelector('[data-testid="mock-code-editor"]');
      latestHostElement = hostElement instanceof HTMLDivElement ? hostElement : null;
      latestContentElement = latestHostElement?.querySelector(".cm-content") ?? null;

      if (latestHostElement) {
        latestHostElement.getBoundingClientRect = () => createDomRect(layout.hostLeft, layout.hostWidth);
      }

      if (latestContentElement) {
        latestContentElement.getBoundingClientRect = () =>
          createDomRect(layout.contentLeft, layout.contentWidth);
      }

      return () => {
        latestHostElement = null;
        latestContentElement = null;
      };
    }, []);

    React.useImperativeHandle(ref, () => ({
      getContent: () => currentContent,
      focus: () => latestHostElement?.focus(),
      navigateToOffset: (offset: number) => {
        navigateCalls.push(offset);
      }
    }));

    return React.createElement(
      "div",
      {
        "data-testid": "mock-code-editor",
        tabIndex: -1,
        onBlur: () => props.onBlur?.()
      },
      React.createElement("div", {
        className: "cm-content"
      })
    );
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
      getRenderCount() {
        return renderCount;
      },
      getNavigateCalls() {
        return [...navigateCalls];
      },
      setLayout(nextLayout: MockEditorLayout) {
        layout = nextLayout;

        if (latestHostElement) {
          latestHostElement.getBoundingClientRect = () => createDomRect(layout.hostLeft, layout.hostWidth);
        }

        if (latestContentElement) {
          latestContentElement.getBoundingClientRect = () =>
            createDomRect(layout.contentLeft, layout.contentWidth);
        }
      },
      triggerResize() {
        MockResizeObserver.trigger();
      },
      reset() {
        latestProps = undefined;
        currentContent = "";
        latestHostElement = null;
        latestContentElement = null;
        navigateCalls = [];
        renderCount = 0;
        layout = {
          hostLeft: 0,
          hostWidth: 880,
          contentLeft: 240,
          contentWidth: 520
        };
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
  let appUpdateStateListener: ((state: AppUpdateState) => void) | null;
  let appNotificationListener: ((notification: AppNotification) => void) | null;
  let fetchMock: ReturnType<typeof vi.fn>;
  let canvasGetContextSpy: { mockRestore: () => void };
  let openMarkdownFile: ReturnType<typeof vi.fn<() => Promise<OpenMarkdownFileResult>>>;
  let openMarkdownFileFromPath: ReturnType<
    typeof vi.fn<(targetPath: string) => Promise<OpenMarkdownFileResult>>
  >;
  let handleDroppedMarkdownFile: ReturnType<
    typeof vi.fn<
      (input: { targetPath: string; hasOpenDocument: boolean }) => Promise<{
        disposition: "open-in-place" | "opened-in-new-window";
      }>
    >
  >;
  let getPathForDroppedFile: ReturnType<typeof vi.fn<(file: File) => string>>;
  let saveMarkdownFile: ReturnType<
    typeof vi.fn<(input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>>
  >;
  let saveMarkdownFileAs: ReturnType<
    typeof vi.fn<(input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>>
  >;
  let importClipboardImage: ReturnType<
    typeof vi.fn<
      (input: { documentPath: string }) => Promise<
        | { status: "success"; markdown: string; relativePath: string }
        | { status: "error"; error: { code: string; message: string } }
      >
    >
  >;
  let listFontFamilies: ReturnType<typeof vi.fn<() => Promise<string[]>>>;
  let listThemePackages: ReturnType<typeof vi.fn<() => Promise<ThemePackageDescriptor[]>>>;
  let refreshThemePackages: ReturnType<typeof vi.fn<() => Promise<ThemePackageDescriptor[]>>>;
  let openThemesDirectory: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let colorSchemeMediaQuery: MockMediaQueryList;

  const builtinDefaultThemePackage = makeManifestThemePackage({
    id: "default",
    name: "Yulora Default",
    source: "builtin"
  });
  const graphiteThemePackage = makeManifestThemePackage({
    id: "graphite",
    name: "Graphite"
  });
  const defaultThemeCatalog = [builtinDefaultThemePackage, graphiteThemePackage];

  function withBuiltinDefault(packages: ThemePackageDescriptor[]): ThemePackageDescriptor[] {
    if (packages.some((entry) => entry.id === "default")) {
      return packages;
    }

    return [builtinDefaultThemePackage, ...packages];
  }

  function createMockMediaQueryList(query: string, initialMatches = false): MockMediaQueryList {
    const mediaQueryList = {} as MockMediaQueryList;
    const listeners = new Map<unknown, (event: MediaQueryListEvent) => void>();
    let matches = initialMatches;

    Object.defineProperty(mediaQueryList, "matches", {
      configurable: true,
      get: () => matches
    });

    Object.defineProperty(mediaQueryList, "media", {
      configurable: true,
      get: () => query
    });
    mediaQueryList.onchange = null;
    mediaQueryList.addEventListener = vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) => {
        const normalizedListener =
          typeof listener === "function"
            ? (event: MediaQueryListEvent) => listener.call(mediaQueryList, event)
            : (event: MediaQueryListEvent) => listener.handleEvent(event);
        listeners.set(listener, normalizedListener);
      }
    ) as MediaQueryList["addEventListener"];
    mediaQueryList.removeEventListener = vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.delete(listener);
      }
    ) as MediaQueryList["removeEventListener"];
    mediaQueryList.addListener = vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.set(listener, listener);
    });
    mediaQueryList.removeListener = vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    });
    mediaQueryList.dispatchEvent = vi.fn(() => true);
    mediaQueryList.__setMatches = (nextMatches: boolean) => {
      matches = nextMatches;
      const event = { matches: nextMatches, media: query } as MediaQueryListEvent;
      mediaQueryList.onchange?.call(mediaQueryList, event);
      for (const listener of listeners.values()) {
        listener(event);
      }
    };

    return mediaQueryList;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    MockResizeObserver.reset();
    codeEditorMock.reset();
    menuCommandListener = null;
    editorTestCommandListener = null;
    preferencesChangedListener = null;
    appUpdateStateListener = null;
    appNotificationListener = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "void main() { gl_FragColor = vec4(1.0); }"
    }) as unknown as Response);
    canvasGetContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null as ReturnType<HTMLCanvasElement["getContext"]>);
    vi.stubGlobal("fetch", fetchMock);
    colorSchemeMediaQuery = createMockMediaQueryList("(prefers-color-scheme: dark)", false);
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => {
        if (query === "(prefers-color-scheme: dark)") {
          return colorSchemeMediaQuery;
        }

        return createMockMediaQueryList(query, false);
      })
    );

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

    openMarkdownFileFromPath = vi
      .fn<(targetPath: string) => Promise<OpenMarkdownFileResult>>()
      .mockResolvedValue({
        status: "cancelled"
      });
    handleDroppedMarkdownFile = vi.fn().mockResolvedValue({
      disposition: "open-in-place"
    });
    getPathForDroppedFile = vi.fn((file: File) => {
      const fileWithPath = file as File & { path?: string };
      return fileWithPath.path ?? "";
    });
    saveMarkdownFileAs = vi.fn<(input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>>();
    importClipboardImage = vi.fn().mockResolvedValue({
      status: "error",
      error: {
        code: "no-image",
        message: "Clipboard does not contain a supported image."
      }
    });
    listFontFamilies = vi
      .fn<() => Promise<string[]>>()
      .mockResolvedValue(["Segoe UI", "Source Han Sans SC", "霞鹜文楷"]);
    listThemePackages = vi
      .fn<() => Promise<ThemePackageDescriptor[]>>()
      .mockResolvedValue(defaultThemeCatalog);
    refreshThemePackages = vi
      .fn<() => Promise<ThemePackageDescriptor[]>>()
      .mockResolvedValue(defaultThemeCatalog);
    openThemesDirectory = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    window.yulora = {
      platform: "win32",
      runtimeMode: "editor",
      startupOpenPath: null,
      openMarkdownFile,
      openMarkdownFileFromPath,
      handleDroppedMarkdownFile,
      getPathForDroppedFile,
      saveMarkdownFile,
      saveMarkdownFileAs,
      importClipboardImage,
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
      listFontFamilies,
      listThemePackages,
      refreshThemePackages,
      openThemesDirectory,
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      onPreferencesChanged(listener: PreferencesChangedListener) {
        preferencesChangedListener = listener;
        return () => {
          if (preferencesChangedListener === listener) {
            preferencesChangedListener = null;
          }
        };
      },
      onAppUpdateState(listener: (state: AppUpdateState) => void) {
        appUpdateStateListener = listener;
        return () => {
          if (appUpdateStateListener === listener) {
            appUpdateStateListener = null;
          }
        };
      },
      onAppNotification(listener: (notification: AppNotification) => void) {
        appNotificationListener = listener;
        return () => {
          if (appNotificationListener === listener) {
            appNotificationListener = null;
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
    canvasGetContextSpy.mockRestore();
    vi.unstubAllGlobals();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    MockResizeObserver.reset();
    vi.useRealTimers();
  });

  async function renderApp(): Promise<void> {
    await act(async () => {
      root.render(createElement(App));
    });

    await vi.dynamicImportSettled();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function renderEditorApp(
    options: RenderEditorAppOptions = {}
  ): Promise<SettingsDriver> {
    const {
      listThemePackagesResult = defaultThemeCatalog,
      refreshThemePackagesResult = defaultThemeCatalog,
      getPreferencesResult = DEFAULT_PREFERENCES,
      updatePreferencesImplementation
    } = options;

    listThemePackages = vi.fn<() => Promise<ThemePackageDescriptor[]>>().mockResolvedValue(
      withBuiltinDefault(listThemePackagesResult)
    );
    refreshThemePackages = vi
      .fn<() => Promise<ThemePackageDescriptor[]>>()
      .mockResolvedValue(withBuiltinDefault(refreshThemePackagesResult));

    window.yulora = {
      ...window.yulora,
      getPreferences: vi.fn().mockResolvedValue(getPreferencesResult),
      updatePreferences:
        updatePreferencesImplementation !== undefined
          ? vi.fn(updatePreferencesImplementation)
          : window.yulora.updatePreferences,
      listThemePackages,
      refreshThemePackages,
      openThemesDirectory
    } as Window["yulora"];

    await renderApp();

    function getByLabelText(text: string): Element {
      const normalized = text.trim().replace(/\s+/gu, " ");
      const label = Array.from(container.querySelectorAll("label")).find((candidate) => {
        const candidateText = candidate.textContent?.trim().replace(/\s+/gu, " ") ?? "";
        return candidateText.includes(normalized);
      });

      if (!label) {
        const element = container.querySelector<HTMLElement>(`#${text}`);
        if (element) {
          return element;
        }

        throw new Error(`No label found matching: ${text}`);
      }

      const control = (label as HTMLLabelElement).control;

      if (control instanceof Element) {
        return control;
      }

      const forId = label.getAttribute("for");
      const fallback = forId ? container.querySelector<HTMLElement>(`#${forId}`) : null;
      if (fallback) {
        return fallback;
      }

      const nextControl = label.nextElementSibling;
      if (nextControl) {
        return nextControl;
      }

      throw new Error(`No control found for label matching: ${text}`);
    }

    async function openSettings(): Promise<void> {
      const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");

      if (!settingsButton) {
        throw new Error("settings button not found");
      }

      await act(async () => {
        settingsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await vi.dynamicImportSettled();
        await Promise.resolve();
      });
    }

    async function selectSettingsOption(labelOrId: string, value: string): Promise<void> {
      const target = getByLabelText(labelOrId);

      if (!(target instanceof HTMLSelectElement)) {
        throw new Error(`Unsupported control for settings selection: ${labelOrId}`);
      }

      await act(async () => {
        target.value = value;
        target.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
      });
    }

    return {
      openSettings,
      selectSettingsOption,
      getByLabelText
    };
  }

  it("does not autosave a clean document immediately after opening", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();
  });

  it("opens the startup markdown file automatically when the bridge provides a launch path", async () => {
    openMarkdownFileFromPath = vi.fn<(targetPath: string) => Promise<OpenMarkdownFileResult>>().mockResolvedValue({
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

    await renderApp();

    expect(openMarkdownFileFromPath).toHaveBeenCalledTimes(1);
    expect(openMarkdownFileFromPath).toHaveBeenCalledWith("C:/notes/startup.md");
  });

  it("opens a Markdown document when a .md file is dropped onto the workspace", async () => {
    openMarkdownFileFromPath = vi
      .fn<(targetPath: string) => Promise<OpenMarkdownFileResult>>()
      .mockResolvedValue({
        status: "success",
        document: {
          path: "C:/notes/dropped.md",
          name: "dropped.md",
          content: "# Dropped\n",
          encoding: "utf-8"
        }
      });

    window.yulora = {
      ...window.yulora,
      handleDroppedMarkdownFile,
      openMarkdownFileFromPath
    } as Window["yulora"];

    await renderApp();

    const workspaceCanvas = container.querySelector('[data-yulora-region="workspace-canvas"]');
    if (!workspaceCanvas) {
      throw new Error("workspace canvas not found");
    }

    const droppedFile = new File(["content"], "dropped.md", { type: "text/markdown" });
    Object.defineProperty(droppedFile, "path", {
      value: "C:/notes/dropped.md"
    });

    const dropEvent = new Event("drop", { bubbles: true }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [droppedFile] as unknown as FileList
      }
    });

    await act(async () => {
      workspaceCanvas.dispatchEvent(dropEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(handleDroppedMarkdownFile).toHaveBeenCalledTimes(1);
    expect(handleDroppedMarkdownFile).toHaveBeenCalledWith({
      targetPath: "C:/notes/dropped.md",
      hasOpenDocument: false
    });
    expect(openMarkdownFileFromPath).toHaveBeenCalledTimes(1);
    expect(openMarkdownFileFromPath).toHaveBeenCalledWith("C:/notes/dropped.md");
  });

  it("opens a Markdown document when the dropped File exposes its path only through the preload bridge", async () => {
    openMarkdownFileFromPath = vi
      .fn<(targetPath: string) => Promise<OpenMarkdownFileResult>>()
      .mockResolvedValue({
        status: "success",
        document: {
          path: "C:/notes/bridge-drop.md",
          name: "bridge-drop.md",
          content: "# Bridge Drop\n",
          encoding: "utf-8"
        }
      });
    getPathForDroppedFile = vi.fn().mockReturnValue("C:/notes/bridge-drop.md");

    window.yulora = {
      ...window.yulora,
      handleDroppedMarkdownFile,
      getPathForDroppedFile,
      openMarkdownFileFromPath
    } as Window["yulora"];

    await renderApp();

    const workspaceCanvas = container.querySelector('[data-yulora-region="workspace-canvas"]');
    if (!workspaceCanvas) {
      throw new Error("workspace canvas not found");
    }

    const droppedFile = new File(["content"], "bridge-drop.md", { type: "text/markdown" });
    const dropEvent = new Event("drop", { bubbles: true }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [droppedFile] as unknown as FileList
      }
    });

    await act(async () => {
      workspaceCanvas.dispatchEvent(dropEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getPathForDroppedFile).toHaveBeenCalledTimes(1);
    expect(handleDroppedMarkdownFile).toHaveBeenCalledWith({
      targetPath: "C:/notes/bridge-drop.md",
      hasOpenDocument: false
    });
    expect(openMarkdownFileFromPath).toHaveBeenCalledWith("C:/notes/bridge-drop.md");
  });

  it("opens a Markdown document in a new window when a .md file is dropped onto the editor surface", async () => {
    openMarkdownFileFromPath = vi
      .fn<(targetPath: string) => Promise<OpenMarkdownFileResult>>()
      .mockResolvedValue({
        status: "success",
        document: {
          path: "C:/notes/dropped.md",
          name: "dropped.md",
          content: "# Dropped\n",
          encoding: "utf-8"
        }
      });
    handleDroppedMarkdownFile = vi.fn().mockResolvedValue({
      disposition: "opened-in-new-window"
    });

    window.yulora = {
      ...window.yulora,
      startupOpenPath: "C:/notes/current.md",
      handleDroppedMarkdownFile,
      openMarkdownFileFromPath
    } as Window["yulora"];

    await renderApp();

    const editorSurface = container.querySelector('[data-testid="mock-code-editor"]');
    if (!(editorSurface instanceof HTMLDivElement)) {
      throw new Error("mock code editor not found");
    }

    openMarkdownFileFromPath.mockClear();

    editorSurface.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    const droppedFile = new File(["content"], "dropped.md", { type: "text/markdown" });
    Object.defineProperty(droppedFile, "path", {
      value: "C:/notes/dropped.md"
    });

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [droppedFile] as unknown as FileList
      }
    });

    await act(async () => {
      editorSurface.dispatchEvent(dropEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(handleDroppedMarkdownFile).toHaveBeenCalledTimes(1);
    expect(handleDroppedMarkdownFile).toHaveBeenCalledWith({
      targetPath: "C:/notes/dropped.md",
      hasOpenDocument: true
    });
    expect(openMarkdownFileFromPath).not.toHaveBeenCalled();
  });

  it("opens a new untitled document from the File menu", async () => {
    await renderApp();

    expect(menuCommandListener).not.toBeNull();

    await act(async () => {
      menuCommandListener?.("new-markdown-document");
      await Promise.resolve();
    });

    expect(openMarkdownFile).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Untitled.md");
    expect(container.querySelector('[data-yulora-region="empty-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();
  });

  it("routes the first save for a new untitled document through Save As", async () => {
    saveMarkdownFileAs.mockResolvedValue({
      status: "success",
      document: {
        path: "C:/notes/untitled.md",
        name: "untitled.md",
        content: "# Fresh draft\n",
        encoding: "utf-8"
      }
    });

    await renderApp();

    expect(menuCommandListener).not.toBeNull();

    await act(async () => {
      menuCommandListener?.("new-markdown-document");
      await Promise.resolve();
    });

    await act(async () => {
      codeEditorMock.changeContent("# Fresh draft\n");
      menuCommandListener?.("save-markdown-file");
      await Promise.resolve();
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();
    expect(saveMarkdownFileAs).toHaveBeenCalledTimes(1);
    expect(saveMarkdownFileAs).toHaveBeenCalledWith({
      currentPath: null,
      content: "# Fresh draft\n"
    });
    expect(container.textContent).toContain("untitled.md");
  });

  it("ignores the check-for-updates menu command in the renderer shell", async () => {
    await renderAndOpenDocument();

    expect(menuCommandListener).not.toBeNull();
    const openCountBefore = openMarkdownFile.mock.calls.length;
    const saveCountBefore = saveMarkdownFile.mock.calls.length;
    const saveAsCountBefore = saveMarkdownFileAs.mock.calls.length;

    await act(async () => {
      menuCommandListener?.("check-for-updates");
      await Promise.resolve();
    });

    expect(saveMarkdownFile.mock.calls.length).toBe(saveCountBefore);
    expect(saveMarkdownFileAs.mock.calls.length).toBe(saveAsCountBefore);
    expect(openMarkdownFile.mock.calls.length).toBe(openCountBefore);
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
          fontSize: 17,
          fontFamily: "Segoe UI"
        },
        document: {
          fontFamily: "IBM Plex Serif",
          cjkFontFamily: "Source Han Sans SC",
          fontSize: 18
        }
      })
    } as Window["yulora"];

    await renderApp();

    expect(document.documentElement.dataset.yuloraTheme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--yulora-ui-font-size")).toBe("17px");
    expect(document.documentElement.style.getPropertyValue("--yulora-ui-font-family")).toBe(
      "Segoe UI"
    );
    expect(document.documentElement.style.getPropertyValue("--yulora-document-font-family")).toBe(
      "IBM Plex Serif"
    );
    expect(document.documentElement.style.getPropertyValue("--yulora-document-cjk-font-family")).toBe(
      "Source Han Sans SC"
    );
    expect(document.documentElement.style.getPropertyValue("--yulora-document-font-size")).toBe(
      "18px"
    );
    expect(listFontFamilies).not.toHaveBeenCalled();
    expect(
      document.head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/yulora/themes/default/tokens-dark.css"));
  });

  it("updates theme variables and mounted stylesheets when preferences change", async () => {
    await renderApp();

    expect(preferencesChangedListener).not.toBeNull();

    await act(async () => {
      preferencesChangedListener?.({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: "graphite", effectsMode: "auto", parameters: {} },
        ui: {
          fontSize: 18,
          fontFamily: "Aptos"
        },
        document: {
          fontFamily: "Source Serif 4",
          cjkFontFamily: "霞鹜文楷",
          fontSize: 20
        }
      });
      await Promise.resolve();
    });

    expect(document.documentElement.dataset.yuloraTheme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--yulora-ui-font-size")).toBe("18px");
    expect(document.documentElement.style.getPropertyValue("--yulora-ui-font-family")).toBe(
      "Aptos"
    );
    expect(document.documentElement.style.getPropertyValue("--yulora-document-font-family")).toBe(
      "Source Serif 4"
    );
    expect(document.documentElement.style.getPropertyValue("--yulora-document-cjk-font-family")).toBe(
      "霞鹜文楷"
    );
    expect(document.documentElement.style.getPropertyValue("--yulora-document-font-size")).toBe(
      "20px"
    );
    expect(
      document.head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/yulora/themes/graphite/tokens-dark.css"));
  });

  it("treats legacy-suffixed package ids as missing and falls back to builtin default", async () => {
    window.yulora = {
      ...window.yulora,
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: "graphite-dark" }
      })
    } as Window["yulora"];

    await renderApp();

    expect(
      document.head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/yulora/themes/default/tokens-dark.css"));
    expect(container.textContent).toContain("已配置主题未找到");
  });

  it("mounts non-empty theme package catalogs through preview asset urls without a missing-theme warning", async () => {
    const packageThemes: ThemePackageDescriptor[] = [
      makeManifestThemePackage({ id: "default", name: "Yulora Default", source: "builtin" }),
      makeManifestThemePackage({ id: "rain-glass", name: "Rain Glass" })
    ];

    window.yulora = {
      ...window.yulora,
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: "rain-glass", effectsMode: "auto", parameters: {} }
      }),
      listThemePackages: vi.fn().mockResolvedValue(withBuiltinDefault(packageThemes))
    } as Window["yulora"];

    await renderApp();

    expect(
      document.head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/yulora/themes/rain-glass/tokens-dark.css"));
    expect(container.textContent).not.toContain("已配置主题未找到");
  });

  it("does not warn about a missing configured theme while the theme package catalog is still loading", async () => {
    window.yulora = {
      ...window.yulora,
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: "rain-glass", effectsMode: "auto", parameters: {} }
      }),
      listThemePackages: vi.fn<() => Promise<ThemePackageDescriptor[]>>(
        () => new Promise<ThemePackageDescriptor[]>(() => {})
      )
    } as Window["yulora"];

    await renderApp();

    expect(container.textContent).not.toContain("已配置主题未找到");
  });

  it("refreshes the package catalog from settings and falls back to default when the selected package disappears", async () => {
    const packageThemes = [
      makeManifestThemePackage({ id: "default", name: "Yulora Default", source: "builtin" }),
      makeManifestThemePackage({ id: "graphite", name: "Graphite" })
    ];
    const driver = await renderEditorApp({
      listThemePackagesResult: packageThemes,
      refreshThemePackagesResult: [
        makeManifestThemePackage({ id: "default", name: "Yulora Default", source: "builtin" })
      ],
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "graphite"
        }
      }
    });

    await driver.openSettings();

    const themeSelect = container.querySelector<HTMLSelectElement>("#settings-theme-package");
    const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("刷新主题")
    );

    expect(themeSelect?.value).toBe("graphite");
    expect(
      document
        .head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/yulora/themes/graphite/tokens-dark.css"));
    expect(
      Array.from(themeSelect?.options ?? []).map((option) => ({
        value: option.value,
        label: option.textContent
      }))
    ).toEqual([
      { value: "default", label: "Yulora 默认" },
      { value: "graphite", label: "Graphite" }
    ]);

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshThemePackages).toHaveBeenCalledTimes(1);
    expect(
      document
        .head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/yulora/themes/default/tokens-dark.css"));
    expect(themeSelect?.value).toBe("default");
  });

  it("persists theme effects mode changes from settings", async () => {
    const driver = await renderEditorApp();

    await driver.openSettings();
    await driver.selectSettingsOption("settings-theme-effects", "off");

    expect(window.yulora.updatePreferences).toHaveBeenCalledWith({
      theme: { effectsMode: "off" }
    });
  });

  it("shows the selected manifest package in the theme picker", async () => {
    const driver = await renderEditorApp({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          selectedId: "rain-glass"
        }
      },
      listThemePackagesResult: [makeManifestThemePackage({ id: "rain-glass", name: "Rain Glass" })]
    });

    await driver.openSettings();

    const themePackageSelect = driver.getByLabelText("主题包");
    expect((themePackageSelect as HTMLSelectElement).value).toBe("rain-glass");
  });

  it("mounts a workbench shader surface host for the active manifest package", async () => {
    await renderEditorApp({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "rain-glass",
          effectsMode: "auto"
        }
      },
      listThemePackagesResult: [
        makeManifestThemePackage({
          id: "rain-glass",
          name: "Rain Glass",
          scene: {
            id: "rain-scene",
            sharedUniforms: { rainAmount: 0.7 }
          },
          surfaces: {
            workbenchBackground: {
              kind: "fragment",
              scene: "rain-scene",
              shader: "/tmp/yulora/themes/rain-glass/shaders/workbench-background.glsl"
            }
          }
        })
      ]
    });

    const surfaceHost = container.querySelector('[data-yulora-theme-surface="workbenchBackground"]');

    expect(surfaceHost).not.toBeNull();
    expect(surfaceHost?.getAttribute("data-yulora-theme-scene")).toBe("rain-scene");
    expect(surfaceHost?.parentElement?.classList.contains("app-layout")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      createPreviewAssetUrl("/tmp/yulora/themes/rain-glass/shaders/workbench-background.glsl"),
      expect.any(Object)
    );
  });

  it('converts manifest channel "0" image src to preview asset URLs before runtime loads it', async () => {
    const loadedImageSrcs: string[] = [];

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      decoding = "";
      #src = "";

      set src(value: string) {
        this.#src = value;
        loadedImageSrcs.push(value);
        Promise.resolve().then(() => {
          this.onload?.();
        });
      }

      get src() {
        return this.#src;
      }

      decode(): Promise<void> {
        return Promise.resolve();
      }
    }

    vi.stubGlobal("Image", MockImage as unknown as typeof Image);

    await renderEditorApp({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "rain-glass",
          effectsMode: "auto"
        }
      },
      listThemePackagesResult: [
        makeManifestThemePackage({
          id: "rain-glass",
          name: "Rain Glass",
          scene: {
            id: "rain-scene",
            sharedUniforms: { rainAmount: 0.7 }
          },
          surfaces: {
            workbenchBackground: {
              kind: "fragment",
              scene: "rain-scene",
              shader: "/tmp/yulora/themes/rain-glass/shaders/workbench-background.glsl",
              channels: {
                "0": {
                  type: "image",
                  src: "/tmp/yulora/themes/rain-glass/textures/noise.png"
                }
              }
            }
          }
        })
      ]
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadedImageSrcs).toContain(
      createPreviewAssetUrl("/tmp/yulora/themes/rain-glass/textures/noise.png")
    );
  });

  it("marks the document-level dynamic mode as fallback and shows a warning when a shader surface falls back", async () => {
    await renderEditorApp({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "rain-glass",
          effectsMode: "auto"
        }
      },
      listThemePackagesResult: [
        makeManifestThemePackage({
          id: "rain-glass",
          name: "Rain Glass",
          scene: {
            id: "rain-scene",
            sharedUniforms: { rainAmount: 0.7 }
          },
          surfaces: {
            workbenchBackground: {
              kind: "fragment",
              scene: "rain-scene",
              shader: "/tmp/yulora/themes/rain-glass/shaders/workbench-background.glsl"
            }
          }
        })
      ]
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.documentElement.getAttribute("data-yulora-theme-dynamic-mode")).toBe("fallback");
    expect(container.querySelector('[data-yulora-region="app-notification-banner"]')?.textContent).toContain(
      "主题动态效果已自动关闭，已回退到静态样式。"
    );
  });

  it("renders a controlled titlebar host with built-in items on controlled-chrome platforms", async () => {
    window.yulora = {
      ...window.yulora,
      platform: "darwin"
    } as Window["yulora"];

    await renderApp();

    const titlebar = container.querySelector('[data-yulora-role="titlebar"]');

    expect(titlebar).not.toBeNull();
    expect(titlebar?.querySelector('[data-yulora-titlebar-item="document-title"]')?.textContent).toContain(
      "Local-first Markdown writing"
    );
    expect(titlebar?.querySelector('[data-yulora-titlebar-item="dirty-indicator"]')).not.toBeNull();
    expect(titlebar?.querySelector('[data-yulora-titlebar-item="app-icon"]')).toBeNull();
    expect(titlebar?.querySelector('[data-yulora-titlebar-item="theme-toggle"]')).toBeNull();
    expect(titlebar?.querySelector('[data-yulora-titlebar-item="window-actions"]')).toBeNull();
  });

  it("does not mount a renderer titlebar on Windows native-chrome platforms", async () => {
    await renderApp();

    expect(container.querySelector('[data-yulora-role="titlebar"]')).toBeNull();
  });

  it("renders the bridge-unavailable fallback inside a shell-safe container", async () => {
    window.yulora = undefined as unknown as Window["yulora"];

    await renderApp();

    expect(container.querySelector('[data-yulora-role="titlebar"]')).toBeNull();
    expect(container.querySelector(".app-shell-fallback")).not.toBeNull();
    expect(container.querySelector(".app-shell-fallback .error-banner")?.textContent).toContain(
      "Yulora bridge unavailable"
    );
  });

  it("uses the macOS default titlebar layout without renderer window actions", async () => {
    window.yulora = {
      ...window.yulora,
      platform: "darwin"
    } as Window["yulora"];

    await renderApp();

    const titlebar = container.querySelector('[data-yulora-role="titlebar"]');

    expect(titlebar?.querySelector('[data-yulora-titlebar-item="window-actions"]')).toBeNull();
    expect(titlebar?.querySelector('[data-yulora-titlebar-item="app-icon"]')).toBeNull();
  });

  it("keeps passive titlebar content draggable while limiting no-drag to controls", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");

    expect(appUiStylesheet).toContain('.app-titlebar-slot[data-yulora-drag-region="true"]');
    expect(appUiStylesheet).toContain('.app-titlebar-slot[data-yulora-drag-region="false"]');
    expect(appUiStylesheet).toContain(".app-titlebar button");
    expect(appUiStylesheet).not.toContain(".app-titlebar-item,\n.app-titlebar-item > *");
  });

  it("mounts a titlebar shader surface host for the active manifest package", async () => {
    window.yulora = {
      ...window.yulora,
      platform: "darwin"
    } as Window["yulora"];

    await renderEditorApp({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "rain-glass",
          effectsMode: "auto"
        }
      },
      listThemePackagesResult: [
        makeManifestThemePackage({
          id: "rain-glass",
          name: "Rain Glass",
          scene: {
            id: "rain-scene",
            sharedUniforms: { rainAmount: 0.7 }
          },
          surfaces: {
            titlebarBackdrop: {
              kind: "fragment",
              scene: "rain-scene",
              shader: "/tmp/yulora/themes/rain-glass/shaders/titlebar-backdrop.glsl"
            }
          }
        })
      ]
    });

    const surfaceHost = container.querySelector('[data-yulora-theme-surface="titlebarBackdrop"]');

    expect(surfaceHost).not.toBeNull();
    expect(surfaceHost?.getAttribute("data-yulora-theme-scene")).toBe("rain-scene");
  });

  it("does not refetch the workbench shader during ordinary app rerenders", async () => {
    listThemePackages = vi.fn<() => Promise<ThemePackageDescriptor[]>>().mockResolvedValue([
      makeManifestThemePackage({
        id: "rain-glass",
        name: "Rain Glass",
        scene: {
          id: "rain-scene",
          sharedUniforms: { rainAmount: 0.7 }
        },
        surfaces: {
          workbenchBackground: {
            kind: "fragment",
            scene: "rain-scene",
            shader: "/tmp/yulora/themes/rain-glass/shaders/workbench-background.glsl"
          }
        }
      })
    ]);

    window.yulora = {
      ...window.yulora,
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "rain-glass",
          effectsMode: "auto"
        }
      }),
      listThemePackages
    } as Window["yulora"];

    await renderApp();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    await act(async () => {
      codeEditorMock.changeContent("# Updated once\n");
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not mount a workbench shader surface host when theme effects are off", async () => {
    await renderEditorApp({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "rain-glass",
          effectsMode: "off"
        }
      },
      listThemePackagesResult: [
        makeManifestThemePackage({
          id: "rain-glass",
          name: "Rain Glass",
          scene: {
            id: "rain-scene",
            sharedUniforms: { rainAmount: 0.7 }
          },
          surfaces: {
            workbenchBackground: {
              kind: "fragment",
              scene: "rain-scene",
              shader: "/tmp/yulora/themes/rain-glass/shaders/workbench-background.glsl"
            }
          }
        })
      ]
    });

    expect(container.querySelector('[data-yulora-theme-surface="workbenchBackground"]')).toBeNull();
    expect(document.documentElement.getAttribute("data-yulora-theme-dynamic-mode")).toBe("off");
  });

  it("re-resolves shader surfaces through React state when the system theme flips", async () => {
    colorSchemeMediaQuery.__setMatches(true);

    await renderEditorApp({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "system",
          selectedId: "rain-glass",
          effectsMode: "auto"
        }
      },
      listThemePackagesResult: [
        makeManifestThemePackage({
          id: "rain-glass",
          name: "Rain Glass",
          supports: {
            light: false,
            dark: true
          },
          scene: {
            id: "rain-scene",
            sharedUniforms: { rainAmount: 0.7 }
          },
          surfaces: {
            workbenchBackground: {
              kind: "fragment",
              scene: "rain-scene",
              shader: "/tmp/yulora/themes/rain-glass/shaders/workbench-background.glsl"
            }
          }
        })
      ]
    });

    expect(container.querySelector('[data-yulora-theme-surface="workbenchBackground"]')).not.toBeNull();
    expect(document.documentElement.getAttribute("data-yulora-theme")).toBe("dark");

    await act(async () => {
      colorSchemeMediaQuery.__setMatches(false);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-yulora-theme-surface="workbenchBackground"]')).toBeNull();
    expect(document.documentElement.getAttribute("data-yulora-theme")).toBe("light");
  });

  it("shows a refresh error banner when refreshing theme packages fails", async () => {
    refreshThemePackages = vi
      .fn<() => Promise<ThemePackageDescriptor[]>>()
      .mockRejectedValue(new Error("refresh failed"));

    window.yulora = {
      ...window.yulora,
      listThemePackages: vi.fn().mockResolvedValue([]),
      refreshThemePackages
    } as Window["yulora"];

    await renderApp();

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await vi.dynamicImportSettled();
      await Promise.resolve();
      await Promise.resolve();
    });

    const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("刷新主题")
    );

    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("主题列表刷新失败。");
  });

  it("opens the themes directory from settings", async () => {
    await renderApp();

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const themesDirectoryButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="打开主题目录"]'
    );

    expect(themesDirectoryButton).not.toBeNull();

    await act(async () => {
      themesDirectoryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openThemesDirectory).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("无法打开主题目录。");
  });

  it("shows an error when opening the themes directory fails", async () => {
    openThemesDirectory = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("open failed"));

    window.yulora = {
      ...window.yulora,
      openThemesDirectory
    } as Window["yulora"];

    await renderApp();

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const themesDirectoryButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="打开主题目录"]'
    );

    expect(themesDirectoryButton).not.toBeNull();

    await act(async () => {
      themesDirectoryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openThemesDirectory).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("无法打开主题目录。");
  });

  it("falls back to the builtin theme and routes the unsupported-mode warning through the top notification banner", async () => {
    const darkOnlyThemes: ThemePackageDescriptor[] = [
      makeManifestThemePackage({ id: "default", name: "Yulora Default", source: "builtin" }),
      makeManifestThemePackage({
        id: "midnight",
        name: "Midnight",
        supports: {
          light: false,
          dark: true
        },
        tokens: {
          dark: "/tmp/yulora/themes/midnight/tokens-dark.css"
        },
        styles: {
          ui: "/tmp/yulora/themes/midnight/ui.css",
          editor: "/tmp/yulora/themes/midnight/editor.css"
        }
      })
    ];

    window.yulora = {
      ...window.yulora,
      listThemePackages: vi.fn().mockResolvedValue(darkOnlyThemes)
    } as Window["yulora"];

    await renderApp();

    expect(preferencesChangedListener).not.toBeNull();

    await act(async () => {
      preferencesChangedListener?.({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "light", selectedId: "midnight", effectsMode: "auto", parameters: {} }
      });
      await Promise.resolve();
    });

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(
      document.head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/yulora/themes/default/tokens-light.css"));
    expect(container.textContent).toContain("该主题不支持浅色模式");
    expect(container.querySelector('[data-yulora-region="app-notification-banner"]')?.textContent).toContain(
      "该主题不支持浅色模式"
    );
    expect(
      Array.from(container.querySelectorAll(".settings-inline-note")).some((node) =>
        node.textContent?.includes("该主题不支持浅色模式")
      )
    ).toBe(false);
  });

  it("marks recent-files capacity as pending TASK-006 in settings", async () => {
    await renderApp();

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

    expect(container.querySelector<HTMLElement>('[data-yulora-dialog="settings-drawer"]')?.dataset.state).toBe(
      "closing"
    );
    expect(container.querySelector<HTMLElement>('[data-yulora-panel="settings-drawer"]')?.dataset.state).toBe(
      "closing"
    );

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-yulora-dialog="settings-drawer"]')).toBeNull();
    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();
    expect(container.textContent).toContain("today.md");
  });

  it("renders rail, workspace header, status strip, and word count for an open document", async () => {
    await renderAndOpenDocument();

    const rail = container.querySelector('[data-yulora-layout="rail"]');
    const workspace = container.querySelector('[data-yulora-layout="workspace"]');
    const workspaceHeader = container.querySelector('[data-yulora-region="workspace-header"]');
    const statusStrip = container.querySelector('[data-yulora-region="status-strip"]');
    const outlineToggle = container.querySelector('[data-yulora-region="outline-toggle"]');
    const outlinePanel = container.querySelector('[data-yulora-region="outline-panel"]');

    expect(rail).not.toBeNull();
    expect(workspace).not.toBeNull();
    expect(outlineToggle).not.toBeNull();
    expect(outlinePanel).toBeNull();
    expect(workspaceHeader?.textContent).toContain("today.md");
    expect(workspaceHeader?.textContent).toContain("C:/notes/today.md");
    expect(statusStrip?.textContent).toContain("All changes saved");
    expect(statusStrip?.textContent).toContain("字数 6");
    expect(workspaceHeader?.textContent).not.toContain("All changes saved");
  });

  it("uses the workspace header as the single open-document identity surface while the outline stays collapsed by default", async () => {
    await renderAndOpenDocument();

    const rail = container.querySelector('[data-yulora-layout="rail"]');
    const workspaceHeader = container.querySelector('[data-yulora-region="workspace-header"]');
    const documentHeader = container.querySelector('[data-yulora-region="document-header"]');
    const outlineToggle = container.querySelector('[data-yulora-region="outline-toggle"]');
    const outlinePanel = container.querySelector('[data-yulora-region="outline-panel"]');

    expect(workspaceHeader?.textContent).toContain("today.md");
    expect(workspaceHeader?.textContent).toContain("C:/notes/today.md");
    expect(rail?.textContent).not.toContain("Workspace");
    expect(rail?.textContent).not.toContain("Outline");
    expect(outlineToggle).not.toBeNull();
    expect(outlinePanel).toBeNull();
    expect(documentHeader).toBeNull();
  });

  it("expands the floating outline panel from a compact right-side toggle and routes item clicks to editor navigation", async () => {
    await renderAndOpenDocument();

    const outlineToggle = container.querySelector<HTMLButtonElement>(
      '[data-yulora-region="outline-toggle"]'
    );

    expect(outlineToggle).not.toBeNull();

    await act(async () => {
      outlineToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const outlinePanel = container.querySelector('[data-yulora-region="outline-panel"]');
    const outlineHeader = container.querySelector('[data-yulora-region="outline-panel-header"]');
    const outlineBody = container.querySelector('[data-yulora-region="outline-panel-body"]');
    const outlineButton = Array.from(outlinePanel?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("Today")
    );

    expect(outlineHeader?.textContent).toContain("Outline");
    expect(outlineBody).not.toBeNull();
    expect(outlinePanel?.textContent).toContain("Outline");
    expect(outlinePanel?.textContent).toContain("Today");
    expect(outlineButton).not.toBeNull();

    await act(async () => {
      outlineButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(codeEditorMock.getNavigateCalls()).toEqual([0]);
  });

  it("collapses the floating outline panel back to a compact toggle", async () => {
    await renderAndOpenDocument();

    const outlineToggle = container.querySelector<HTMLButtonElement>(
      '[data-yulora-region="outline-toggle"]'
    );

    await act(async () => {
      outlineToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const collapseButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Collapse outline"]'
    );
    expect(container.querySelector('[data-yulora-region="outline-panel"]')).not.toBeNull();
    expect(collapseButton).not.toBeNull();

    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLElement>('[data-yulora-region="outline-panel"]')?.dataset.state).toBe(
      "closing"
    );
    expect(container.querySelector('[data-yulora-region="outline-toggle"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-yulora-region="outline-panel"]')).toBeNull();
    expect(container.querySelector('[data-yulora-region="outline-toggle"]')).not.toBeNull();
  });

  it("renders the empty state inside a shared workspace canvas", async () => {
    await renderApp();

    const workspaceHeader = container.querySelector('[data-yulora-region="workspace-header"]');
    const workspaceCanvas = container.querySelector('[data-yulora-region="workspace-canvas"]');
    const emptyState = container.querySelector('[data-yulora-region="empty-state"]');

    expect(workspaceHeader).not.toBeNull();
    expect(workspaceCanvas).not.toBeNull();
    expect(emptyState).not.toBeNull();
    expect(workspaceCanvas?.contains(emptyState)).toBe(true);
  });

  it("renders a fixed app status bar outside the scrolling document flow", async () => {
    await renderAndOpenDocument();

    const workspaceHeader = container.querySelector('[data-yulora-region="workspace-header"]');
    const workspaceCanvas = container.querySelector('[data-yulora-region="workspace-canvas"]');
    const documentHeader = container.querySelector('[data-yulora-region="document-header"]');
    const appStatusBar = container.querySelector('[data-yulora-region="app-status-bar"]');

    expect(workspaceHeader).not.toBeNull();
    expect(workspaceCanvas).not.toBeNull();
    expect(documentHeader).toBeNull();
    expect(workspaceCanvas?.contains(appStatusBar)).toBe(false);
    expect(appStatusBar?.textContent).toContain("All changes saved");
    expect(appStatusBar?.textContent).toContain("字数 6");
  });

  it("does not render an update download message by default", async () => {
    await renderAndOpenDocument();

    const appStatusBar = container.querySelector('[data-yulora-region="app-status-bar"]');

    expect(appStatusBar?.textContent).not.toContain("正在下载更新");
  });

  it("renders update download progress text while downloading updates", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      emitAppUpdateState({
        kind: "downloading",
        version: "1.1.0",
        percent: 37
      });
      await Promise.resolve();
    });

    const appStatusBar = container.querySelector('[data-yulora-region="app-status-bar"]');

    expect(appStatusBar?.textContent).toContain("正在下载更新 37%");
  });

  it("renders a top notification banner for transient notifications and hides it after 3 seconds", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      emitAppNotification({
        kind: "loading",
        message: "正在检查更新…"
      });
      await Promise.resolve();
    });

    const notificationBanner = container.querySelector('[data-yulora-region="app-notification-banner"]');
    const notificationSpinner = container.querySelector('[data-yulora-region="app-notification-spinner"]');

    expect(notificationBanner?.textContent).toContain("正在检查更新");
    expect(notificationBanner?.getAttribute("data-state")).toBe("open");
    expect(notificationSpinner).not.toBeNull();

    await act(async () => {
      emitAppNotification({
        kind: "info",
        message: "当前已是最新版本。"
      });
      await Promise.resolve();
    });

    expect(notificationBanner?.textContent).toContain("当前已是最新版本");
    expect(container.querySelector('[data-yulora-region="app-notification-spinner"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(notificationBanner?.getAttribute("data-state")).toBe("closing");

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-yulora-region="app-notification-banner"]')).toBeNull();
  });

  it("ensures the top notification banner stays above the settings drawer stacking layer", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const settingsStylesheet = readFileSync(settingsStylesheetPath, "utf-8");

    const notificationZMatch = appUiStylesheet.match(
      /\.app-notification-banner\s*\{\s*[\s\S]*?z-index:\s*(\d+);/
    );
    const settingsDialogZMatch = settingsStylesheet.match(
      /\[data-yulora-dialog="settings-drawer"\]\s*\{\s*[\s\S]*?z-index:\s*(\d+);/
    );
    const settingsShellZMatch = settingsStylesheet.match(/\.settings-shell\s*\{\s*[\s\S]*?z-index:\s*(\d+);/);

    expect(notificationZMatch?.[1]).toBeDefined();
    expect(settingsDialogZMatch?.[1]).toBeDefined();
    expect(settingsShellZMatch?.[1]).toBeDefined();

    const notificationZIndex = Number(notificationZMatch?.[1] ?? 0);
    const settingsDialogZIndex = Number(settingsDialogZMatch?.[1] ?? 0);
    const settingsShellZIndex = Number(settingsShellZMatch?.[1] ?? 0);

    expect(notificationZIndex).toBeGreaterThan(settingsDialogZIndex);
    expect(notificationZIndex).toBeGreaterThan(settingsShellZIndex);
  });

  it("hides the update download message after download completes", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      emitAppUpdateState({
        kind: "downloading",
        version: "1.1.0",
        percent: 100
      });
      await Promise.resolve();
    });

    await act(async () => {
      emitAppUpdateState({
        kind: "downloaded",
        version: "1.1.0"
      });
      await Promise.resolve();
    });

    const appStatusBar = container.querySelector('[data-yulora-region="app-status-bar"]');

    expect(appStatusBar?.textContent).not.toContain("正在下载更新");

    await act(async () => {
      emitAppUpdateState({
        kind: "idle"
      });
      await Promise.resolve();
    });

    expect(appStatusBar?.textContent).not.toContain("正在下载更新");
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

    expect(container.querySelector<HTMLElement>('[data-yulora-dialog="settings-drawer"]')?.dataset.state).toBe(
      "closing"
    );

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-yulora-dialog="settings-drawer"]')).toBeNull();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("mock-code-editor");
  });

  it("only renders the manual focus entry when the trigger mode is manual", async () => {
    await renderAndOpenDocument();

    expect(container.querySelector('[data-yulora-region="focus-toggle"]')).toBeNull();
  });

  it("enters and exits manual focus mode from the editor-corner toggle while keeping the editor mounted", async () => {
    await renderAndOpenDocument({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        focus: {
          ...DEFAULT_PREFERENCES.focus,
          triggerMode: "manual"
        }
      }
    });

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const rail = container.querySelector<HTMLElement>('[data-yulora-layout="rail"]');
    const workspaceHeader = container.querySelector<HTMLElement>('[data-yulora-region="workspace-header"]');
    const statusBar = container.querySelector<HTMLElement>('[data-yulora-region="app-status-bar"]');
    const workspaceCanvas = container.querySelector<HTMLElement>('[data-yulora-region="workspace-canvas"]');
    const focusToggle = container.querySelector<HTMLButtonElement>('[data-yulora-region="focus-toggle"]');

    expect(appShell?.dataset.yuloraFocusMode).toBe("inactive");
    expect(focusToggle).not.toBeNull();
    expect(workspaceCanvas?.contains(focusToggle ?? null)).toBe(true);
    expect(rail?.contains(focusToggle ?? null)).toBe(false);

    await act(async () => {
      focusToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("active");
    expect(rail?.dataset.visibility).toBe("collapsed");
    expect(workspaceHeader?.dataset.visibility).toBe("collapsed");
    expect(statusBar?.dataset.visibility).toBe("collapsed");
    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();

    await act(async () => {
      focusToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("inactive");
    expect(rail?.dataset.visibility).toBe("visible");
    expect(workspaceHeader?.dataset.visibility).toBe("visible");
    expect(statusBar?.dataset.visibility).toBe("visible");
  });

  it("auto-enters focus mode after the configured idle delay and exits on pointer activity", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    expect(appShell?.dataset.yuloraFocusMode).toBe("inactive");

    await act(async () => {
      vi.advanceTimersByTime(2999);
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("inactive");

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("active");

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("inactive");
  });

  it("enters auto focus on keyboard input in auto mode and keeps manual focus active through pointer input", async () => {
    let currentPreferences: Preferences = DEFAULT_PREFERENCES;

    await renderAndOpenDocument({
      updatePreferencesImplementation: async (patch) => {
        currentPreferences = {
          ...currentPreferences,
          ...patch,
          focus: {
            ...currentPreferences.focus,
            ...(patch.focus ?? {})
          }
        };

        return {
          status: "success",
          preferences: currentPreferences
        };
      }
    });
    const appShell = container.querySelector<HTMLElement>(".app-shell");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("active");

    await act(async () => {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("inactive");

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const focusTriggerMode = container.querySelector<HTMLSelectElement>("#settings-focus-trigger-mode");
    expect(focusTriggerMode).not.toBeNull();

    await act(async () => {
      if (focusTriggerMode) {
        focusTriggerMode.value = "manual";
        focusTriggerMode.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    const focusToggle = container.querySelector<HTMLButtonElement>('[data-yulora-region="focus-toggle"]');
    expect(focusToggle).not.toBeNull();

    await act(async () => {
      focusToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("active");

    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("active");
  });

  it("forces focus mode off when settings opens while leaving the outline state unchanged", async () => {
    await renderAndOpenDocument({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        focus: {
          ...DEFAULT_PREFERENCES.focus,
          triggerMode: "manual"
        }
      }
    });

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const focusToggle = container.querySelector<HTMLButtonElement>('[data-yulora-region="focus-toggle"]');
    const outlineToggle = container.querySelector<HTMLButtonElement>('[data-yulora-region="outline-toggle"]');

    await act(async () => {
      outlineToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-yulora-region="outline-panel"]')).not.toBeNull();

    await act(async () => {
      focusToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("active");

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.yuloraFocusMode).toBe("inactive");
    expect(container.querySelector('[data-yulora-dialog="settings-drawer"]')).not.toBeNull();
    expect(container.querySelector('[data-yulora-region="outline-panel"]')).not.toBeNull();
  });

  it("shows the shortcut hint overlay only after Control is held for 1 second while the editor is focused", async () => {
    await renderAndOpenDocument();

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    const overlay = container.querySelector('[data-yulora-region="shortcut-hint-overlay"]');
    const overlayShell = container.querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]');

    expect(overlayShell?.getAttribute("data-shortcut-hint-state")).toBe("hidden");
    expect(overlay).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(999);
      await Promise.resolve();
    });

    expect(overlayShell?.getAttribute("data-shortcut-hint-state")).toBe("hidden");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(overlayShell?.getAttribute("data-shortcut-hint-state")).toBe("visible");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')?.textContent).toContain("Ctrl+B");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')?.textContent).not.toContain("Save");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')?.textContent).not.toContain("Open");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Control",
          bubbles: true
        })
      );
    });

    expect(overlayShell?.getAttribute("data-shortcut-hint-state")).toBe("hidden");
  });

  it("does not show the shortcut hint overlay if Control is released before 1 second elapses", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          code: "ControlLeft",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Control",
          code: "ControlLeft",
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')).toBeNull();
  });

  it("does not show the shortcut hint overlay when Control is held without editor focus", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    const overlay = container.querySelector('[data-yulora-region="shortcut-hint-overlay"]');
    const overlayShell = container.querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]');

    expect(overlayShell?.getAttribute("data-shortcut-hint-state")).toBe("hidden");
    expect(overlay?.textContent ?? "").not.toContain("Ctrl+B");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Control",
          bubbles: true
        })
      );
    });
  });

  it("does not show the shortcut hint overlay when AltGraph is pressed", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "AltGraph",
          ctrlKey: true,
          altKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')).toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "AltGraph",
          bubbles: true
        })
      );
    });
  });

  it("shows the shortcut hint overlay while the editor is focused and Meta is held on macOS", async () => {
    window.yulora = {
      ...window.yulora,
      platform: "darwin"
    } as Window["yulora"];

    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Meta",
          metaKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    const overlay = container.querySelector('[data-yulora-region="shortcut-hint-overlay"]');

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("visible");
    expect(overlay?.textContent).toContain("Cmd+B");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Meta",
          bubbles: true
        })
      );
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
  });

  it("does not show the shortcut hint overlay when Control is held on macOS", async () => {
    window.yulora = {
      ...window.yulora,
      platform: "darwin"
    } as Window["yulora"];

    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')).toBeNull();
  });

  it("does not show the shortcut hint overlay when Meta is held on win32", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Meta",
          metaKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')).toBeNull();
  });

  it("shows the shortcut hint overlay even when the content column starts near the left edge", async () => {
    codeEditorMock.setLayout({
      hostLeft: 0,
      hostWidth: 720,
      contentLeft: 96,
      contentWidth: 560
    });

    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      codeEditorMock.triggerResize();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("visible");
    expect(container.querySelector('[data-yulora-region="shortcut-hint-overlay"]')).not.toBeNull();
  });

  it("keeps the shortcut hint overlay visible until every pressed primary modifier is released", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          code: "ControlLeft",
          ctrlKey: true,
          bubbles: true
        })
      );
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          code: "ControlRight",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("visible");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Control",
          code: "ControlLeft",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("visible");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Control",
          code: "ControlRight",
          bubbles: true
        })
      );
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
  });

  it("hides the shortcut hint overlay on window blur", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.focus();
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Control",
          ctrlKey: true,
          bubbles: true
        })
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('[data-yulora-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
  });

  it("hides the shortcut hint overlay with a document-canvas container rule instead of viewport-only media queries", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const overlayHideRule = /@container editor-canvas \(max-width: 520px\)\s*\{\s*\.shortcut-hint-overlay\s*\{\s*display:\s*none;/m;

    expect(appUiStylesheet).toContain(".document-canvas");
    expect(appUiStylesheet).toContain("container-type: inline-size;");
    expect(overlayHideRule.test(appUiStylesheet)).toBe(false);
  });

  it("keeps shortcut hint fade animations free of horizontal drift so the measured footprint stays valid", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const overlayEnterKeyframes =
      appUiStylesheet.match(/@keyframes shortcut-hint-overlay-enter \{[\s\S]*?\n\}/m)?.[0] ?? "";
    const overlayExitKeyframes =
      appUiStylesheet.match(/@keyframes shortcut-hint-overlay-exit \{[\s\S]*?\n\}/m)?.[0] ?? "";
    const overlayItemEnterRule =
      appUiStylesheet.match(
        /\.shortcut-hint-overlay\[data-state="open"\] \.shortcut-hint-overlay-item \{[\s\S]*?\n\}/m
      )?.[0] ?? "";
    const overlayItemExitRule =
      appUiStylesheet.match(
        /\.shortcut-hint-overlay\[data-state="closing"\] \.shortcut-hint-overlay-item \{[\s\S]*?\n\}/m
      )?.[0] ?? "";
    const overlayClosingRule =
      appUiStylesheet.match(/\.shortcut-hint-overlay\[data-state="closing"\] \{[\s\S]*?\n\}/m)?.[0] ?? "";
    const overlayShellHiddenRule =
      appUiStylesheet.match(
        /\.shortcut-hint-overlay-shell\[data-shortcut-hint-state="hidden"\] \{[\s\S]*?\n\}/m
      )?.[0] ?? "";
    const overlayItemEnterKeyframes =
      appUiStylesheet.match(/@keyframes shortcut-hint-overlay-item-enter \{[\s\S]*?\n\}/m)?.[0] ?? "";
    const overlayItemExitKeyframes =
      appUiStylesheet.match(/@keyframes shortcut-hint-overlay-item-exit \{[\s\S]*?\n\}/m)?.[0] ?? "";

    expect(overlayEnterKeyframes).toContain("opacity:");
    expect(overlayExitKeyframes).toContain("opacity:");
    expect(overlayEnterKeyframes).not.toContain("translateX");
    expect(overlayExitKeyframes).not.toContain("translateX");
    expect(overlayItemEnterRule).toContain("var(--shortcut-index, 0)");
    expect(overlayItemExitRule).toContain("var(--shortcut-index, 0)");
    expect(overlayClosingRule).not.toContain("animation:");
    expect(overlayShellHiddenRule).not.toContain("opacity:");
    expect(overlayItemEnterKeyframes).toContain("translateX");
    expect(overlayItemExitKeyframes).toContain("translateX");
    expect(overlayItemEnterKeyframes).toContain("scaleY");
    expect(overlayItemExitKeyframes).toContain("scaleY");
  });

  it("renders settings as a drawer panel with close affordance while keeping existing controls", async () => {
    const driver = await renderEditorApp();
    await driver.openSettings();

    const drawerPanel = container.querySelector<HTMLElement>('[data-yulora-panel="settings-drawer"]');
    const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="关闭设置"]');
    const themeSelect = container.querySelector<HTMLSelectElement>("#settings-theme-package");
    const documentFontSelect = container.querySelector<HTMLSelectElement>("#settings-document-font-preset");
    const documentCjkFontSelect = container.querySelector<HTMLSelectElement>("#settings-document-cjk-font-preset");
    const documentFontInput = container.querySelector<HTMLInputElement>("#settings-document-font-family");
    const recentFilesInput = container.querySelector<HTMLInputElement>("#settings-recent-max");

    const uiFontSelect = container.querySelector<HTMLSelectElement>("#settings-ui-font-preset");

    expect(drawerPanel?.getAttribute("role")).toBe("dialog");
    expect(drawerPanel?.getAttribute("aria-modal")).toBe("true");
    expect(drawerPanel?.textContent).toContain("偏好设置");
    expect(closeButton).not.toBeNull();
    expect(themeSelect).not.toBeNull();
    expect(uiFontSelect).not.toBeNull();
    expect(documentFontSelect).not.toBeNull();
    expect(documentCjkFontSelect).not.toBeNull();
    expect(themeSelect?.className).toContain("settings-select");
    expect(uiFontSelect?.className).toContain("settings-select");
    expect(documentFontSelect?.className).toContain("settings-select");
    expect(documentCjkFontSelect?.className).toContain("settings-select");
    expect(documentFontInput).toBeNull();
    expect(recentFilesInput?.disabled).toBe(true);
  });

  it("renders focus settings controls and persists trigger mode and idle delay changes", async () => {
    const driver = await renderEditorApp();
    await driver.openSettings();

    const focusTriggerMode = container.querySelector<HTMLSelectElement>("#settings-focus-trigger-mode");
    const focusIdlePreset = container.querySelector<HTMLSelectElement>("#settings-focus-idle-preset");
    const focusIdleSeconds = container.querySelector<HTMLInputElement>("#settings-focus-idle-seconds");

    expect(focusTriggerMode).not.toBeNull();
    expect(focusIdlePreset).not.toBeNull();
    expect(focusIdleSeconds).not.toBeNull();

    await act(async () => {
      focusTriggerMode!.value = "manual";
      focusTriggerMode!.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(window.yulora.updatePreferences).toHaveBeenCalledWith({
      focus: { triggerMode: "manual" }
    });

    await act(async () => {
      focusIdlePreset!.value = "5";
      focusIdlePreset!.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(window.yulora.updatePreferences).toHaveBeenCalledWith({
      focus: { idleDelayMs: 5000 }
    });

    await act(async () => {
      focusIdleSeconds!.focus();
      focusIdleSeconds!.value = "3.5";
      focusIdleSeconds!.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      focusIdleSeconds!.blur();
      await Promise.resolve();
    });

    expect(window.yulora.updatePreferences).toHaveBeenCalledWith({
      focus: { idleDelayMs: 3500 }
    });
  });

  it("persists the ui font preset from settings and applies it to the document root", async () => {
    let currentPreferences: Preferences = DEFAULT_PREFERENCES;
    const driver = await renderEditorApp({
      updatePreferencesImplementation: async (patch) => {
        currentPreferences = {
          ...currentPreferences,
          ...patch,
          ui: {
            ...currentPreferences.ui,
            ...(patch.ui ?? {})
          }
        };

        return {
          status: "success",
          preferences: currentPreferences
        };
      }
    });
    await driver.openSettings();

    const uiFontSelect = container.querySelector<HTMLSelectElement>("#settings-ui-font-preset");

    expect(uiFontSelect).not.toBeNull();

    await act(async () => {
      if (uiFontSelect) {
        uiFontSelect.value = "Segoe UI";
        uiFontSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await Promise.resolve();
    });

    expect(window.yulora.updatePreferences).toHaveBeenCalledWith({
      ui: { fontFamily: "Segoe UI" }
    });
    expect(document.documentElement.style.getPropertyValue("--yulora-ui-font-family")).toBe(
      "Segoe UI"
    );
  });

  it("shows the manual focus entry immediately after switching to manual mode in settings", async () => {
    let currentPreferences: Preferences = DEFAULT_PREFERENCES;

    await renderAndOpenDocument({
      updatePreferencesImplementation: async (patch) => {
        currentPreferences = {
          ...currentPreferences,
          ...patch,
          focus: {
            ...currentPreferences.focus,
            ...(patch.focus ?? {})
          }
        };

        return {
          status: "success",
          preferences: currentPreferences
        };
      }
    });

    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");
    expect(settingsButton).not.toBeNull();

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const triggerMode = container.querySelector<HTMLSelectElement>("#settings-focus-trigger-mode");
    expect(triggerMode).not.toBeNull();
    expect(container.querySelector('[data-yulora-region="focus-toggle"]')).toBeNull();

    await act(async () => {
      if (triggerMode) {
        triggerMode.value = "manual";
        triggerMode.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    const focusToggle = container.querySelector<HTMLButtonElement>('[data-yulora-region="focus-toggle"]');
    expect(focusToggle).not.toBeNull();
    expect(container.querySelector<HTMLElement>('[data-yulora-region="workspace-canvas"]')?.contains(focusToggle ?? null)).toBe(true);
  });

  it("defines animated shell chrome transitions for focus mode and fully retracts the rail", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const railRule = getCssRule(appUiStylesheet, ".app-rail");
    const collapsedRailRule = getCssRule(appUiStylesheet, '.app-rail[data-visibility="collapsed"]');
    const headerRule = getCssRule(appUiStylesheet, ".app-header");
    const collapsedHeaderRule = getCssRule(appUiStylesheet, '.app-header[data-visibility="collapsed"]');
    const statusBarRule = getCssRule(appUiStylesheet, ".app-status-bar");
    const collapsedStatusBarRule = getCssRule(
      appUiStylesheet,
      '.app-status-bar[data-visibility="collapsed"]'
    );

    expect(railRule).toContain("transition:");
    expect(collapsedRailRule).toContain("transform: translateX(calc(-100% - 1px));");
    expect(collapsedRailRule).toContain("opacity: 0;");
    expect(headerRule).toContain("transition:");
    expect(collapsedHeaderRule).toContain("transform:");
    expect(statusBarRule).toContain("transition:");
    expect(collapsedStatusBarRule).toContain("transform:");
  });

  it("updates document font presets through dropdowns only", async () => {
    const driver = await renderEditorApp();
    await driver.openSettings();

    const documentFontSelect = container.querySelector<HTMLSelectElement>("#settings-document-font-preset");
    const documentCjkFontSelect = container.querySelector<HTMLSelectElement>("#settings-document-cjk-font-preset");

    expect(documentFontSelect).not.toBeNull();
    expect(documentCjkFontSelect).not.toBeNull();

    await act(async () => {
      if (documentFontSelect) {
        documentFontSelect.value = "Segoe UI";
        documentFontSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await Promise.resolve();
    });

    expect(window.yulora.updatePreferences).toHaveBeenCalledWith({
      document: { fontFamily: "Segoe UI" }
    });

    await act(async () => {
      if (documentCjkFontSelect) {
        documentCjkFontSelect.value = "霞鹜文楷";
        documentCjkFontSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await Promise.resolve();
    });

    expect(window.yulora.updatePreferences).toHaveBeenCalledWith({
      document: { cjkFontFamily: "霞鹜文楷" }
    });
  });

  it("loads font families only after the settings drawer opens", async () => {
    const driver = await renderEditorApp();

    expect(listFontFamilies).not.toHaveBeenCalled();
    await driver.openSettings();

    expect(listFontFamilies).toHaveBeenCalledTimes(1);

    const documentFontSelect = container.querySelector<HTMLSelectElement>("#settings-document-font-preset");
    const documentCjkFontSelect = container.querySelector<HTMLSelectElement>("#settings-document-cjk-font-preset");

    expect(
      Array.from(documentFontSelect?.options ?? []).map((option) => option.value)
    ).toContain("Segoe UI");
    expect(
      Array.from(documentCjkFontSelect?.options ?? []).map((option) => option.value)
    ).toContain("霞鹜文楷");
  });

  it("keeps the settings drawer renderable for legacy preferences without theme parameter overrides", async () => {
    const driver = await renderEditorApp({
      listThemePackagesResult: [makeManifestThemePackage({ id: "graphite" })],
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          mode: "dark",
          selectedId: "graphite",
          effectsMode: "auto"
        }
      } as unknown as Preferences
    });

    await driver.openSettings();

    expect(container.querySelector('[data-yulora-panel="settings-drawer"]')?.textContent).toContain(
      "偏好设置"
    );
  });

  it("exposes active theme parameters as root CSS variables and clears them when the active theme changes", async () => {
    await renderEditorApp({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "rain-glass",
          effectsMode: "auto",
          parameters: {
            "rain-glass": {
              workspaceGlassOpacity: 0.35,
              rainAmount: 0.4,
              enableLightning: 0
            }
          }
        }
      },
      listThemePackagesResult: [
        makeManifestThemePackage({
          id: "rain-glass",
          name: "Rain Glass",
          parameters: [
            {
              id: "workspaceGlassOpacity",
              label: "Workspace Glass",
              type: "slider",
              min: 0,
              max: 1,
              step: 0.05,
              default: 0.24
            },
            {
              id: "rainAmount",
              label: "Rain Amount",
              type: "slider",
              min: 0,
              max: 1,
              step: 0.05,
              default: 0.72,
              uniform: "rainAmount"
            },
            {
              id: "enableLightning",
              label: "Lightning",
              type: "toggle",
              default: true,
              uniform: "enableLightning"
            }
          ]
        })
      ]
    });

    expect(
      document.documentElement.style.getPropertyValue("--yulora-theme-parameter-workspaceGlassOpacity")
    ).toBe("0.35");
    expect(document.documentElement.style.getPropertyValue("--yulora-theme-parameter-rainAmount")).toBe(
      "0.4"
    );
    expect(
      document.documentElement.style.getPropertyValue("--yulora-theme-parameter-enableLightning")
    ).toBe("0");

    await act(async () => {
      preferencesChangedListener?.({
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: null,
          effectsMode: "auto",
          parameters: {}
        }
      });
      await Promise.resolve();
    });

    expect(
      document.documentElement.style.getPropertyValue("--yulora-theme-parameter-workspaceGlassOpacity")
    ).toBe("");
    expect(document.documentElement.style.getPropertyValue("--yulora-theme-parameter-rainAmount")).toBe(
      ""
    );
    expect(
      document.documentElement.style.getPropertyValue("--yulora-theme-parameter-enableLightning")
    ).toBe("");
  });

  it("syncs runtime env CSS variables onto the document root", async () => {
    await renderAndOpenDocument({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark"
        }
      }
    });

    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();

    expect(document.documentElement.getAttribute(THEME_RUNTIME_THEME_MODE_ATTRIBUTE)).toBe("dark");
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.wordCount)).toBe(
      "6"
    );
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.focusMode)).toBe(
      "0"
    );
    expect(
      document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.viewportWidth)
    ).toBe(String(window.innerWidth));
    expect(
      document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.viewportHeight)
    ).toBe(String(window.innerHeight));
  });

  it("updates runtime env viewport vars on resize without rerendering the editor tree", async () => {
    await renderAndOpenDocument({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark"
        }
      }
    });

    const initialRenderCount = codeEditorMock.getRenderCount();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 900
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
    });

    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.viewportWidth)).toBe(
      "1440"
    );
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.viewportHeight)).toBe(
      "900"
    );
    expect(codeEditorMock.getRenderCount()).toBe(initialRenderCount);
  });

  it("marks settings as a floating drawer overlay surface", async () => {
    const driver = await renderEditorApp();
    await driver.openSettings();

    const overlay = container.querySelector<HTMLElement>('[data-yulora-dialog="settings-drawer"]');
    const drawerPanel = container.querySelector<HTMLElement>('[data-yulora-panel="settings-drawer"]');

    expect(overlay?.getAttribute("data-yulora-overlay-style")).toBe("floating-drawer");
    expect(drawerPanel?.getAttribute("data-yulora-surface")).toBe("floating-drawer");
  });

  it("anchors the rail to the viewport so the settings trigger stays visible", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const railRule = getCssRule(appUiStylesheet, ".app-rail");

    expect(railRule).toContain("align-self: start;");
    expect(railRule).toContain("position: sticky;");
    expect(railRule).toContain("top: 0;");
    expect(railRule).toContain("height: 100%;");
  });

  it("defines a fallback shell container for bridge-unavailable rendering", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const fallbackRule = getCssRule(appUiStylesheet, ".app-shell-fallback");

    expect(fallbackRule).toContain("grid-row: 1 / -1;");
    expect(fallbackRule).toContain("display: grid;");
    expect(fallbackRule).toContain("place-items: center;");
    expect(fallbackRule).toContain("padding:");
  });

  it("defines a compact floating outline panel with a fixed header and glass styling", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const appSource = readFileSync(join(process.cwd(), "src/renderer/editor/App.tsx"), "utf-8");

    expect(appUiStylesheet).toContain("--yulora-outline-column-width: 0px;");
    expect(appUiStylesheet).toContain("grid-template-columns: minmax(0, 1fr) var(--yulora-outline-column-width);");
    expect(appUiStylesheet).toContain("transition:");
    expect(appUiStylesheet).toContain("grid-template-columns 220ms cubic-bezier(0.2, 0.85, 0.2, 1)");
    expect(appUiStylesheet).toContain(".outline-entry");
    expect(appUiStylesheet).toContain(".outline-panel");
    expect(appUiStylesheet).toContain(".outline-panel-body");
    expect(appUiStylesheet).toContain(".outline-panel::before");
    expect(appUiStylesheet).toContain("overflow: hidden;");
    expect(appUiStylesheet).toContain("overflow-y: auto;");
    expect(appUiStylesheet).toContain(".outline-panel-list");
    expect(appUiStylesheet).toContain("backdrop-filter: blur(28px) saturate(1.12);");
    expect(appUiStylesheet).toContain(".workspace-shell.is-outline-open");
    expect(appUiStylesheet).toContain('.outline-panel[data-state="closing"]');
    expect(appUiStylesheet).toContain("@keyframes outline-panel-exit");
    expect(appUiStylesheet).toContain("@keyframes outline-toggle-enter");
    expect(appSource).toContain('d="M15 6l-6 6 6 6"');
    expect(appSource).toContain('d="M9 6l6 6-6 6"');
  });

  it("defines shared scrollbar styling for the desktop shell", () => {
    const baseStylesheet = readFileSync(baseStylesheetPath, "utf-8");

    expect(baseStylesheet).toContain("scrollbar-width: thin;");
    expect(baseStylesheet).toContain("scrollbar-color:");
    expect(baseStylesheet).toContain("::-webkit-scrollbar");
    expect(baseStylesheet).toContain("::-webkit-scrollbar-thumb");
  });

  it("uses Times New Roman as the default ui font family", () => {
    const baseStylesheet = readFileSync(baseStylesheetPath, "utf-8");

    expect(baseStylesheet).toContain('font-family: var(--yulora-ui-font-family, "Times New Roman")');
  });

  it("locks shell scrolling to the editor surface", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const editorStylesheet = readFileSync(join(process.cwd(), "src/renderer/styles/editor-source.css"), "utf-8");
    const shellRule = getCssRule(appUiStylesheet, ".app-shell");
    const layoutRule = getCssRule(appUiStylesheet, ".app-layout");
    const workspaceRule = getCssRule(appUiStylesheet, ".app-workspace");
    const titlebarRule = getCssRule(appUiStylesheet, ".app-titlebar");

    expect(shellRule).toContain("overflow: hidden;");
    expect(shellRule).toContain("display: grid;");
    expect(shellRule).toContain("grid-template-rows: var(--yulora-titlebar-height) minmax(0, 1fr);");
    expect(layoutRule).toContain("grid-row: 2;");
    expect(workspaceRule).toContain("height: 100%;");
    expect(workspaceRule).toContain("overflow: hidden;");
    expect(titlebarRule).toContain("min-height: var(--yulora-titlebar-height);");
    expect(appUiStylesheet).toContain(".workspace-canvas");
    expect(appUiStylesheet).toContain("overflow: hidden;");
    expect(appUiStylesheet).toContain(".document-editor");
    expect(appUiStylesheet).toContain("height: 100%;");
    expect(editorStylesheet).toContain(".document-editor .cm-editor");
    expect(editorStylesheet).toContain("height: 100%;");
    expect(editorStylesheet).toContain(".document-editor .cm-scroller");
    expect(editorStylesheet).toContain("overflow: auto;");
  });

  it("lets the document stage occupy most of the workspace width", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const editorStylesheet = readFileSync(join(process.cwd(), "src/renderer/styles/editor-source.css"), "utf-8");

    expect(appUiStylesheet).toContain(".workspace-canvas");
    expect(appUiStylesheet).toContain("width: 100%;");
    expect(appUiStylesheet).toContain("max-width: none;");
    expect(editorStylesheet).toContain(".document-editor .cm-content");
    expect(editorStylesheet).toContain("padding: 40px 48px 56px;");
  });

  it("styles theme surfaces as non-interactive workspace backgrounds", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");

    expect(appUiStylesheet).toContain(".theme-surface-host");
    expect(appUiStylesheet).toContain("position: absolute;");
    expect(appUiStylesheet).toContain("pointer-events: none;");
    expect(appUiStylesheet).toContain(".theme-surface-canvas");
    expect(appUiStylesheet).toContain("display: block;");
  });

  it("keeps the integrated rain glass status strip in normal workspace flow", () => {
    const rainGlassUiStylesheet = readFileSync(rainGlassUiStylesheetPath, "utf-8");

    expect(rainGlassUiStylesheet).toContain('[data-yulora-layout="workspace"].app-workspace');
    expect(rainGlassUiStylesheet).toContain("grid-template-rows: auto minmax(0, 1fr) auto;");
    expect(rainGlassUiStylesheet).toContain("padding: var(--yulora-space-4) var(--yulora-space-5);");
    expect(rainGlassUiStylesheet).toContain('[data-yulora-layout="workspace"] .app-status-bar');
    expect(rainGlassUiStylesheet).toContain("position: static;");
    expect(rainGlassUiStylesheet).toContain('[data-yulora-layout="workspace"] .app-status-bar [data-yulora-region="status-strip"]');
    expect(rainGlassUiStylesheet).toContain("border-top: 1px solid");
  });

  it("removes border framing from the editor shell and bottom status bar", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const documentEditorRule =
      appUiStylesheet.match(/\.document-editor \{\s+width: 100%;[\s\S]*?\n\}/m)?.[0] ?? "";
    const appStatusBarRule =
      appUiStylesheet.match(/\.app-status-bar \{\s+position: fixed;[\s\S]*?\n\}/m)?.[0] ?? "";

    expect(documentEditorRule).toContain("background: transparent;");
    expect(documentEditorRule).not.toContain("border:");
    expect(documentEditorRule).not.toContain("box-shadow:");
    expect(appStatusBarRule).not.toContain("border:");
    expect(appStatusBarRule).toContain("background: transparent;");
    expect(appStatusBarRule).not.toContain("box-shadow:");
    expect(appStatusBarRule).not.toContain("backdrop-filter:");
  });

  it("styles preferences as a semi-transparent glass drawer", () => {
    const settingsStylesheet = readFileSync(settingsStylesheetPath, "utf-8");
    const lightTokenStylesheet = readFileSync(lightTokenStylesheetPath, "utf-8");

    expect(settingsStylesheet).toContain(
      'background: color-mix(in srgb, var(--yulora-surface-bg) 78%, var(--yulora-scrim) 22%);'
    );
    expect(settingsStylesheet).toContain("backdrop-filter: blur(28px) saturate(1.12);");
    expect(settingsStylesheet).toContain(".settings-shell::before");
    expect(settingsStylesheet).toContain('.settings-shell[data-state="closing"]');
    expect(settingsStylesheet).toContain("@keyframes settings-drawer-exit");
    expect(settingsStylesheet).toContain("@keyframes settings-overlay-exit");
    expect(settingsStylesheet).toContain("linear-gradient(");
    expect(settingsStylesheet).toContain(
      "background: color-mix(in srgb, var(--yulora-surface-raised-bg) 97%, var(--yulora-surface-bg) 3%);"
    );
    expect(settingsStylesheet).toContain(
      "color-mix(in srgb, var(--yulora-surface-bg) 96%, var(--yulora-glass-strong-bg) 4%, transparent);"
    );
    expect(lightTokenStylesheet).toContain("--yulora-glass-bg: rgba(");
    expect(lightTokenStylesheet).toContain("--yulora-glass-bg: rgba(250, 249, 245, 0.42);");
    expect(lightTokenStylesheet).toContain("--yulora-glass-strong-bg: rgba(255, 254, 250, 0.62);");
    expect(lightTokenStylesheet).toContain("--yulora-glass-sheen:");
  });

  it("defines themed option styling for settings dropdown menus", () => {
    const primitivesStylesheet = readFileSync(primitivesStylesheetPath, "utf-8");

    expect(primitivesStylesheet).toContain(".settings-select option");
    expect(primitivesStylesheet).toContain(".settings-select optgroup");
    expect(primitivesStylesheet).toContain("background-color: var(--yu-input-bg);");
    expect(primitivesStylesheet).toContain("color: var(--yulora-text-body);");
    expect(primitivesStylesheet).toContain("color: var(--yulora-text-subtle);");
  });

  it("uses a light code block palette in the default light theme", () => {
    const lightMarkdownStylesheet = readFileSync(lightMarkdownStylesheetPath, "utf-8");
    const lightMarkdownRule = getCssRule(lightMarkdownStylesheet, ":root");

    expect(lightMarkdownRule).toContain("--yulora-code-block-bg: #f3f6fa;");
    expect(lightMarkdownRule).toContain("--yulora-code-block-text: #334155;");
    expect(lightMarkdownRule).not.toContain("--yulora-code-block-bg: #17212b;");
  });

  it("renders code blocks with visual wrapping instead of a horizontal scrollbar", () => {
    const markdownRenderStylesheet = readFileSync(markdownRenderStylesheetPath, "utf-8");

    expect(markdownRenderStylesheet).toContain(".document-editor .cm-inactive-code-block");
    expect(markdownRenderStylesheet).toContain("white-space: pre-wrap !important;");
    expect(markdownRenderStylesheet).toContain("overflow-x: hidden;");
    expect(markdownRenderStylesheet).not.toContain("white-space: pre !important;");
    expect(markdownRenderStylesheet).not.toContain("overflow-x: auto;");
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

  it("falls back to builtin default theme when selected package is missing", async () => {
    const packageThemes: ThemePackageDescriptor[] = [
      makeManifestThemePackage({ id: "default", name: "Yulora Default", source: "builtin" }),
      makeManifestThemePackage({ id: "rain-glass", name: "Rain Glass" })
    ];

    await renderEditorApp({
      listThemePackagesResult: packageThemes,
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark",
          selectedId: "missing-rain-glass",
          effectsMode: "auto",
          parameters: {}
        }
      }
    });

    expect(
      document.head
        .querySelector('link[data-yulora-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/yulora/themes/default/tokens-dark.css"));
  });

  async function renderAndOpenDocument(options: RenderEditorAppOptions = {}): Promise<void> {
    await renderEditorApp(options);

    expect(menuCommandListener).not.toBeNull();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    expect(openMarkdownFile).toHaveBeenCalledTimes(1);
  }

  function emitAppUpdateState(state: AppUpdateState): void {
    appUpdateStateListener?.(state);
  }

  function emitAppNotification(notification: AppNotification): void {
    appNotificationListener?.(notification);
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
