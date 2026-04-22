// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { AppNotification, AppUpdateState } from "../shared/app-update";
import type { EditorTestCommandEnvelope } from "../shared/editor-test-command";
import type { ExternalMarkdownFileChangedEvent } from "../shared/external-file-change";
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
import type {
  ActivateWorkspaceTabInput,
  CloseWorkspaceTabInput,
  CreateWorkspaceTabInput,
  DetachWorkspaceTabToNewWindowInput,
  MoveWorkspaceTabToWindowInput,
  OpenWorkspacePathRequest,
  ReorderWorkspaceTabInput,
  UpdateWorkspaceTabDraftInput,
  OpenWorkspaceFileResult,
  OpenWorkspaceFileFromPathResult,
  WorkspaceDocumentSnapshot,
  WorkspaceWindowSnapshot
} from "../shared/workspace";
import App from "./App";
import * as codeEditorViewModule from "./code-editor-view";

type MenuCommandListener = (
  command:
    | "new-markdown-document"
    | "open-markdown-file"
    | "new-editor-window"
    | "save-markdown-file"
    | "save-markdown-file-as"
    | "check-for-updates"
) => void;
type EditorTestCommandListener = (payload: EditorTestCommandEnvelope) => void;
type ScenarioRunEventListener = (payload: RunnerEventEnvelope) => void;
type ScenarioRunTerminalListener = (payload: ScenarioRunTerminal) => void;
type PreferencesChangedListener = (preferences: Preferences) => void;
type ExternalMarkdownFileChangedListener = (event: ExternalMarkdownFileChangedEvent) => void;
type OpenWorkspacePathListener = (payload: OpenWorkspacePathRequest) => void;
type ThemePackageDescriptor = Awaited<ReturnType<Window["fishmark"]["listThemePackages"]>>[number];
type UpdatePreferencesResult = Awaited<ReturnType<Window["fishmark"]["updatePreferences"]>>;
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

type WorkspaceTabRecord = WorkspaceDocumentSnapshot & {
  lastSavedContent: string;
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
    packageRoot: `/tmp/fishmark/themes/${id}`,
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
        dark: `/tmp/fishmark/themes/${id}/tokens-dark.css`,
        light: `/tmp/fishmark/themes/${id}/tokens-light.css`
      },
      styles: overrides.styles ?? {
        ui: `/tmp/fishmark/themes/${id}/ui.css`,
        editor: `/tmp/fishmark/themes/${id}/editor.css`,
        markdown: `/tmp/fishmark/themes/${id}/markdown.css`
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

function cloneWorkspaceSnapshot(snapshot: WorkspaceWindowSnapshot): WorkspaceWindowSnapshot {
  return {
    windowId: snapshot.windowId,
    activeTabId: snapshot.activeTabId,
    tabs: snapshot.tabs.map((tab) => ({ ...tab })),
    activeDocument: snapshot.activeDocument ? { ...snapshot.activeDocument } : null
  };
}

function createWorkspaceTabRecord(input: {
  tabId: string;
  path: string | null;
  name: string;
  content: string;
  isDirty?: boolean;
  saveState?: WorkspaceDocumentSnapshot["saveState"];
}): WorkspaceTabRecord {
  return {
    tabId: input.tabId,
    path: input.path,
    name: input.name,
    content: input.content,
    encoding: "utf-8",
    isDirty: input.isDirty ?? false,
    saveState: input.saveState ?? "idle",
    lastSavedContent: input.content
  };
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

type MockCodeEditorModule = typeof codeEditorViewModule & {
  __mock: {
    changeContent: (content: string) => void;
    blur: () => void;
    focus: () => void;
    getCurrentContent: () => string;
    getRenderCount: () => number;
    emitActiveBlockChange: (state: unknown) => void;
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
const pearlDriftUiStylesheetPath = join(
  process.cwd(),
  "fixtures/themes/pearl-drift/styles/ui.css"
);
const emberAscendUiStylesheetPath = join(
  process.cwd(),
  "fixtures/themes/ember-ascend/styles/ui.css"
);
const defaultUiStylesheetPath = join(
  process.cwd(),
  "src/renderer/theme-packages/default/styles/ui.css"
);
const lightMarkdownStylesheetPath = join(
  process.cwd(),
  "src/renderer/theme-packages/default/styles/markdown.css"
);
const pearlDriftManifestPath = join(process.cwd(), "fixtures/themes/pearl-drift/manifest.json");
const emberAscendManifestPath = join(process.cwd(), "fixtures/themes/ember-ascend/manifest.json");
const pearlDriftLightTokensPath = join(process.cwd(), "fixtures/themes/pearl-drift/tokens/light.css");
const pearlDriftDarkTokensPath = join(process.cwd(), "fixtures/themes/pearl-drift/tokens/dark.css");
const emberAscendDarkTokensPath = join(process.cwd(), "fixtures/themes/ember-ascend/tokens/dark.css");

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
      selectTableCell: (position: { row: number; column: number }) => void;
      editTableCell: (input: { row: number; column: number; text: string }) => void;
      insertTableRowAbove: () => void;
      insertTableRowBelow: () => void;
      insertTableColumnLeft: () => void;
      insertTableColumnRight: () => void;
      deleteTableRow: () => void;
      deleteTableColumn: () => void;
      deleteTable: () => void;
    }>
  ) {
    const { initialContent, loadRevision } = props;

    React.useEffect(() => {
      renderCount += 1;
    });

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
      },
      selectTableCell: () => {},
      editTableCell: () => {},
      insertTableRowAbove: () => {},
      insertTableRowBelow: () => {},
      insertTableColumnLeft: () => {},
      insertTableColumnRight: () => {},
      deleteTableRow: () => {},
      deleteTableColumn: () => {},
      deleteTable: () => {}
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
      getCurrentContent() {
        return currentContent;
      },
      getRenderCount() {
        return renderCount;
      },
      emitActiveBlockChange(state: unknown) {
        latestProps?.onActiveBlockChange?.(state);
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
  let externalMarkdownFileChangedListener: ExternalMarkdownFileChangedListener | null;
  let openWorkspacePathListener: OpenWorkspacePathListener | null;
  let fetchMock: ReturnType<typeof vi.fn>;
  let canvasGetContextSpy: { mockRestore: () => void };
  let openMarkdownFile: ReturnType<typeof vi.fn<() => Promise<OpenMarkdownFileResult>>>;
  let openMarkdownFileFromPath: ReturnType<
    typeof vi.fn<(targetPath: string) => Promise<OpenMarkdownFileResult>>
  >;
  let getWorkspaceSnapshot: ReturnType<typeof vi.fn<() => Promise<WorkspaceWindowSnapshot>>>;
  let createWorkspaceTab: ReturnType<
    typeof vi.fn<(input: CreateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>>
  >;
  let openWorkspaceFile: ReturnType<
    typeof vi.fn<() => Promise<OpenWorkspaceFileResult>>
  >;
  let openWorkspaceFileFromPath: ReturnType<
    typeof vi.fn<(targetPath: string) => Promise<OpenWorkspaceFileFromPathResult>>
  >;
  let activateWorkspaceTab: ReturnType<
    typeof vi.fn<(input: ActivateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>>
  >;
  let closeWorkspaceTab: ReturnType<
    typeof vi.fn<(input: CloseWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>>
  >;
  let reorderWorkspaceTab: ReturnType<
    typeof vi.fn<(input: ReorderWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>>
  >;
  let moveWorkspaceTabToWindow: ReturnType<
    typeof vi.fn<
      (input: MoveWorkspaceTabToWindowInput) => Promise<{
        sourceWindowSnapshot: WorkspaceWindowSnapshot;
        targetWindowSnapshot: WorkspaceWindowSnapshot;
      }>
    >
  >;
  let detachWorkspaceTabToNewWindow: ReturnType<
    typeof vi.fn<(input: DetachWorkspaceTabToNewWindowInput) => Promise<WorkspaceWindowSnapshot>>
  >;
  let updateWorkspaceTabDraft: ReturnType<
    typeof vi.fn<(input: UpdateWorkspaceTabDraftInput) => Promise<WorkspaceWindowSnapshot>>
  >;
  let reloadWorkspaceTabFromPath: ReturnType<
    typeof vi.fn<
      (input: { tabId: string; targetPath: string }) => Promise<WorkspaceWindowSnapshot>
    >
  >;
  let handleDroppedMarkdownFile: ReturnType<
    typeof vi.fn<
      (input: { targetPaths: string[]; hasOpenDocument: boolean }) => Promise<{
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
  let syncWatchedMarkdownFile: ReturnType<
    typeof vi.fn<(input: { tabId: string | null }) => Promise<void>>
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
  let workspaceWindowId: string;
  let workspaceTabs: WorkspaceTabRecord[];
  let workspaceActiveTabId: string | null;
  let nextWorkspaceTabId: number;
  let queuedWorkspaceOpenDocuments: Array<{ path: string; name: string; content: string }>;

  const builtinDefaultThemePackage = makeManifestThemePackage({
    id: "default",
    name: "FishMark Default",
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

  function buildWorkspaceSnapshot(): WorkspaceWindowSnapshot {
    const activeDocument =
      workspaceActiveTabId === null
        ? null
        : (workspaceTabs.find((tab) => tab.tabId === workspaceActiveTabId) ?? null);

    return {
      windowId: workspaceWindowId,
      activeTabId: workspaceActiveTabId,
      tabs: workspaceTabs.map((tab) => ({
        tabId: tab.tabId,
        path: tab.path,
        name: tab.name,
        isDirty: tab.isDirty,
        saveState: tab.saveState
      })),
      activeDocument: activeDocument
        ? {
            tabId: activeDocument.tabId,
            path: activeDocument.path,
            name: activeDocument.name,
            content: activeDocument.content,
            encoding: activeDocument.encoding,
            isDirty: activeDocument.isDirty,
            saveState: activeDocument.saveState
          }
        : null
    };
  }

  function queueWorkspaceOpenDocuments(...documents: Array<{ path: string; name: string; content: string }>): void {
    queuedWorkspaceOpenDocuments = documents.map((document) => ({ ...document }));
  }

  function appendWorkspaceDocument(document: {
    path: string | null;
    name: string;
    content: string;
  }): WorkspaceWindowSnapshot {
    const tabId = `tab-${nextWorkspaceTabId++}`;
    workspaceTabs = [
      ...workspaceTabs,
      createWorkspaceTabRecord({
        tabId,
        path: document.path,
        name: document.name,
        content: document.content
      })
    ];
    workspaceActiveTabId = tabId;
    return cloneWorkspaceSnapshot(buildWorkspaceSnapshot());
  }

  function getQueuedWorkspaceDocument(targetPath?: string): {
    path: string | null;
    name: string;
    content: string;
  } {
    const queuedDocument = queuedWorkspaceOpenDocuments.shift();

    if (queuedDocument) {
      return queuedDocument;
    }

    if (!targetPath) {
      return {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n"
      };
    }

    const normalizedPath = targetPath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/");
    const name = segments[segments.length - 1] ?? "opened.md";
    const stem = name.replace(/\.[^.]+$/, "");

    return {
      path: targetPath,
      name,
      content: `# ${stem}\n`
    };
  }

  function setWorkspaceActiveTab(tabId: string): WorkspaceWindowSnapshot {
    workspaceActiveTabId = tabId;
    return cloneWorkspaceSnapshot(buildWorkspaceSnapshot());
  }

  function updateWorkspaceDraft(tabId: string, content: string): WorkspaceWindowSnapshot {
    workspaceTabs = workspaceTabs.map((tab) =>
      tab.tabId === tabId
        ? {
            ...tab,
            content,
            isDirty: content !== tab.lastSavedContent
          }
        : tab
    );

    return cloneWorkspaceSnapshot(buildWorkspaceSnapshot());
  }

  function replaceWorkspaceDocument(input: {
    tabId: string;
    path: string;
    name: string;
    content: string;
  }): WorkspaceWindowSnapshot {
    const tabExists = workspaceTabs.some((tab) => tab.tabId === input.tabId);

    if (!tabExists) {
      throw new Error(`Unknown workspace tab '${input.tabId}'`);
    }

    workspaceTabs = workspaceTabs.map((tab) =>
      tab.tabId === input.tabId
        ? {
            ...tab,
            path: input.path,
            name: input.name,
            content: input.content,
            isDirty: false,
            saveState: "idle",
            lastSavedContent: input.content
          }
        : tab
    );
    workspaceActiveTabId = input.tabId;

    return cloneWorkspaceSnapshot(buildWorkspaceSnapshot());
  }

  function closeWorkspaceSession(tabId: string): WorkspaceWindowSnapshot {
    const closingIndex = workspaceTabs.findIndex((tab) => tab.tabId === tabId);

    if (closingIndex < 0) {
      throw new Error(`Unknown workspace tab '${tabId}'`);
    }

    workspaceTabs = workspaceTabs.filter((tab) => tab.tabId !== tabId);

    if (workspaceTabs.length === 0) {
      workspaceActiveTabId = null;
      return cloneWorkspaceSnapshot(buildWorkspaceSnapshot());
    }

    if (workspaceActiveTabId === tabId) {
      const fallbackIndex = Math.max(0, closingIndex - 1);
      workspaceActiveTabId = workspaceTabs[fallbackIndex]?.tabId ?? workspaceTabs[0]?.tabId ?? null;
    }

    return cloneWorkspaceSnapshot(buildWorkspaceSnapshot());
  }

  function reorderWorkspaceSession(tabId: string, toIndex: number): WorkspaceWindowSnapshot {
    const fromIndex = workspaceTabs.findIndex((tab) => tab.tabId === tabId);

    if (fromIndex < 0) {
      throw new Error(`Unknown workspace tab '${tabId}'`);
    }

    const clampedIndex = Math.max(0, Math.min(toIndex, workspaceTabs.length - 1));

    if (fromIndex === clampedIndex) {
      return cloneWorkspaceSnapshot(buildWorkspaceSnapshot());
    }

    const [movedTab] = workspaceTabs.splice(fromIndex, 1);

    if (!movedTab) {
      throw new Error(`Unable to move workspace tab '${tabId}'`);
    }

    workspaceTabs.splice(clampedIndex, 0, movedTab);
    return cloneWorkspaceSnapshot(buildWorkspaceSnapshot());
  }

  function detachWorkspaceSession(tabId: string): WorkspaceWindowSnapshot {
    return closeWorkspaceSession(tabId);
  }

  function getWorkspaceTabContent(tabId: string): string {
    return workspaceTabs.find((tab) => tab.tabId === tabId)?.content ?? "";
  }

  function commitWorkspaceSave(input: { tabId: string; path: string }): void {
    const content = getWorkspaceTabContent(input.tabId);
    workspaceTabs = workspaceTabs.map((tab) =>
      tab.tabId === input.tabId
        ? {
            ...tab,
            path: input.path,
            content,
            isDirty: false,
            lastSavedContent: content
          }
        : tab
    );
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
    externalMarkdownFileChangedListener = null;
    openWorkspacePathListener = null;
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

    workspaceWindowId = "window-1";
    workspaceTabs = [];
    workspaceActiveTabId = null;
    nextWorkspaceTabId = 1;
    queueWorkspaceOpenDocuments({
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Today\n"
    });

    getWorkspaceSnapshot = vi
      .fn<() => Promise<WorkspaceWindowSnapshot>>()
      .mockImplementation(async () => cloneWorkspaceSnapshot(buildWorkspaceSnapshot()));
    createWorkspaceTab = vi
      .fn<(input: CreateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>>()
      .mockImplementation(async (input) => {
        expect(input).toEqual({ kind: "untitled" });
        return appendWorkspaceDocument({
          path: null,
          name: "Untitled.md",
          content: ""
        });
      });
    openWorkspaceFile = vi
      .fn<() => Promise<OpenWorkspaceFileResult>>()
      .mockImplementation(async () => ({
        kind: "success",
        snapshot: appendWorkspaceDocument(getQueuedWorkspaceDocument())
      }));
    openWorkspaceFileFromPath = vi
      .fn<(targetPath: string) => Promise<OpenWorkspaceFileFromPathResult>>()
      .mockImplementation(async (targetPath) => ({
        kind: "success",
        snapshot: appendWorkspaceDocument(getQueuedWorkspaceDocument(targetPath))
      }));
    activateWorkspaceTab = vi
      .fn<(input: ActivateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>>()
      .mockImplementation(async (input) => setWorkspaceActiveTab(input.tabId));
    closeWorkspaceTab = vi
      .fn<(input: CloseWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>>()
      .mockImplementation(async (input) => closeWorkspaceSession(input.tabId));
    reorderWorkspaceTab = vi
      .fn<(input: ReorderWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>>()
      .mockImplementation(async (input) => reorderWorkspaceSession(input.tabId, input.toIndex));
    moveWorkspaceTabToWindow = vi
      .fn<
        (input: MoveWorkspaceTabToWindowInput) => Promise<{
          sourceWindowSnapshot: WorkspaceWindowSnapshot;
          targetWindowSnapshot: WorkspaceWindowSnapshot;
        }>
      >()
      .mockImplementation(async () => ({
        sourceWindowSnapshot: cloneWorkspaceSnapshot(buildWorkspaceSnapshot()),
        targetWindowSnapshot: cloneWorkspaceSnapshot(buildWorkspaceSnapshot())
      }));
    detachWorkspaceTabToNewWindow = vi
      .fn<(input: DetachWorkspaceTabToNewWindowInput) => Promise<WorkspaceWindowSnapshot>>()
      .mockImplementation(async (input) => detachWorkspaceSession(input.tabId));
    updateWorkspaceTabDraft = vi
      .fn<(input: UpdateWorkspaceTabDraftInput) => Promise<WorkspaceWindowSnapshot>>()
      .mockImplementation(async (input) => updateWorkspaceDraft(input.tabId, input.content));
    reloadWorkspaceTabFromPath = vi
      .fn<(input: { tabId: string; targetPath: string }) => Promise<WorkspaceWindowSnapshot>>()
      .mockImplementation(async (input) => {
        const document = getQueuedWorkspaceDocument(input.targetPath);
        return replaceWorkspaceDocument({
          tabId: input.tabId,
          path: document.path ?? input.targetPath,
          name: document.name,
          content: document.content
        });
      });

    saveMarkdownFile = vi
      .fn<(input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>>()
      .mockImplementation(async (input) => {
        commitWorkspaceSave(input);
        const activeTab = workspaceTabs.find((tab) => tab.tabId === workspaceActiveTabId) ?? null;
        const content = getWorkspaceTabContent(input.tabId);

        return {
          status: "success",
          document: {
            path: input.path,
            name: activeTab?.name ?? "today.md",
            content,
            encoding: "utf-8"
          }
        };
      });

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
    syncWatchedMarkdownFile = vi.fn<(input: { tabId: string | null }) => Promise<void>>().mockResolvedValue(
      undefined
    );
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

    window.fishmark = {
      platform: "win32",
      runtimeMode: "editor",
      startupOpenPath: null,
      openMarkdownFile,
      openMarkdownFileFromPath,
      getWorkspaceSnapshot,
      createWorkspaceTab,
      openWorkspaceFile,
      openWorkspaceFileFromPath,
      activateWorkspaceTab,
      closeWorkspaceTab,
      reorderWorkspaceTab,
      moveWorkspaceTabToWindow,
      detachWorkspaceTabToNewWindow,
      updateWorkspaceTabDraft,
      reloadWorkspaceTabFromPath,
      handleDroppedMarkdownFile,
      getPathForDroppedFile,
      saveMarkdownFile,
      saveMarkdownFileAs,
      syncWatchedMarkdownFile,
      importClipboardImage,
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
      },
      onExternalMarkdownFileChanged(listener: ExternalMarkdownFileChangedListener) {
        externalMarkdownFileChangedListener = listener;
        return () => {
          if (externalMarkdownFileChangedListener === listener) {
            externalMarkdownFileChangedListener = null;
          }
        };
      },
      onOpenWorkspacePath(listener: OpenWorkspacePathListener) {
        openWorkspacePathListener = listener;
        return () => {
          if (openWorkspacePathListener === listener) {
            openWorkspacePathListener = null;
          }
        };
      }
    } as Window["fishmark"];

    window.fishmarkTest = {
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
      completeEditorTestCommand: vi.fn().mockResolvedValue(undefined)
    } as Window["fishmarkTest"];
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

    window.fishmark = {
      ...window.fishmark,
      getPreferences: vi.fn().mockResolvedValue(getPreferencesResult),
      updatePreferences:
        updatePreferencesImplementation !== undefined
          ? vi.fn(updatePreferencesImplementation)
          : window.fishmark.updatePreferences,
      listThemePackages,
      refreshThemePackages,
      openThemesDirectory
    } as Window["fishmark"];

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
    queueWorkspaceOpenDocuments({
      path: "C:/notes/startup.md",
      name: "startup.md",
      content: "# Startup\n"
    });

    window.fishmark = {
      ...window.fishmark,
      openWorkspaceFileFromPath,
      startupOpenPath: "C:/notes/startup.md"
    } as unknown as Window["fishmark"];

    await renderApp();

    expect(openWorkspaceFileFromPath).toHaveBeenCalledTimes(1);
    expect(openWorkspaceFileFromPath).toHaveBeenCalledWith("C:/notes/startup.md");
  });

  it("opens a Markdown document when a .md file is dropped onto the workspace", async () => {
    queueWorkspaceOpenDocuments({
      path: "C:/notes/dropped.md",
      name: "dropped.md",
      content: "# Dropped\n"
    });

    window.fishmark = {
      ...window.fishmark,
      handleDroppedMarkdownFile,
      openWorkspaceFileFromPath
    } as Window["fishmark"];

    await renderApp();

    const workspaceCanvas = container.querySelector('[data-fishmark-region="workspace-canvas"]');
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
      targetPaths: ["C:/notes/dropped.md"],
      hasOpenDocument: false
    });
    expect(openWorkspaceFileFromPath).toHaveBeenCalledTimes(1);
    expect(openWorkspaceFileFromPath).toHaveBeenCalledWith("C:/notes/dropped.md");
  });

  it("opens a Markdown document when the dropped File exposes its path only through the preload bridge", async () => {
    queueWorkspaceOpenDocuments({
      path: "C:/notes/bridge-drop.md",
      name: "bridge-drop.md",
      content: "# Bridge Drop\n"
    });
    getPathForDroppedFile = vi.fn().mockReturnValue("C:/notes/bridge-drop.md");

    window.fishmark = {
      ...window.fishmark,
      handleDroppedMarkdownFile,
      getPathForDroppedFile,
      openWorkspaceFileFromPath
    } as Window["fishmark"];

    await renderApp();

    const workspaceCanvas = container.querySelector('[data-fishmark-region="workspace-canvas"]');
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
      targetPaths: ["C:/notes/bridge-drop.md"],
      hasOpenDocument: false
    });
    expect(openWorkspaceFileFromPath).toHaveBeenCalledWith("C:/notes/bridge-drop.md");
  });

  it("appends a dropped Markdown document as a new tab when the editor is already open", async () => {
    queueWorkspaceOpenDocuments({
      path: "C:/notes/current.md",
      name: "current.md",
      content: "# Current\n"
    });
    queueWorkspaceOpenDocuments({
      path: "C:/notes/dropped.md",
      name: "dropped.md",
      content: "# Dropped\n"
    });

    window.fishmark = {
      ...window.fishmark,
      startupOpenPath: "C:/notes/current.md",
      handleDroppedMarkdownFile,
      openWorkspaceFileFromPath
    } as Window["fishmark"];

    await renderApp();

    const editorSurface = container.querySelector('[data-testid="mock-code-editor"]');
    if (!(editorSurface instanceof HTMLDivElement)) {
      throw new Error("mock code editor not found");
    }

    openWorkspaceFileFromPath.mockClear();

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

    const workspaceTabs = container.querySelectorAll<HTMLElement>(
      '[data-fishmark-region="workspace-tab"]'
    );

    expect(handleDroppedMarkdownFile).toHaveBeenCalledTimes(1);
    expect(handleDroppedMarkdownFile).toHaveBeenCalledWith({
      targetPaths: ["C:/notes/dropped.md"],
      hasOpenDocument: true
    });
    expect(openWorkspaceFileFromPath).toHaveBeenCalledTimes(1);
    expect(openWorkspaceFileFromPath).toHaveBeenCalledWith("C:/notes/dropped.md");
    expect(workspaceTabs).toHaveLength(2);
    expect(workspaceTabs[1]?.textContent).toContain("dropped.md");
    expect(container.querySelectorAll('[data-testid="mock-code-editor"]')).toHaveLength(1);
  });

  it("appends every dropped Markdown file as its own tab when multiple files are dragged in", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/current.md",
        name: "current.md",
        content: "# Current\n"
      },
      {
        path: "C:/notes/alpha.md",
        name: "alpha.md",
        content: "# Alpha\n"
      },
      {
        path: "C:/notes/beta.md",
        name: "beta.md",
        content: "# Beta\n"
      }
    );

    window.fishmark = {
      ...window.fishmark,
      startupOpenPath: "C:/notes/current.md",
      handleDroppedMarkdownFile,
      openWorkspaceFileFromPath
    } as Window["fishmark"];

    await renderApp();

    const editorSurface = container.querySelector('[data-testid="mock-code-editor"]');
    if (!(editorSurface instanceof HTMLDivElement)) {
      throw new Error("mock code editor not found");
    }

    openWorkspaceFileFromPath.mockClear();

    editorSurface.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    const firstDroppedFile = new File(["content"], "alpha.md", { type: "text/markdown" });
    Object.defineProperty(firstDroppedFile, "path", {
      value: "C:/notes/alpha.md"
    });
    const secondDroppedFile = new File(["content"], "beta.md", { type: "text/markdown" });
    Object.defineProperty(secondDroppedFile, "path", {
      value: "C:/notes/beta.md"
    });

    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(dropEvent, "dataTransfer", {
      value: {
        files: [firstDroppedFile, secondDroppedFile] as unknown as FileList
      }
    });

    await act(async () => {
      editorSurface.dispatchEvent(dropEvent);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const workspaceTabs = container.querySelectorAll<HTMLElement>(
      '[data-fishmark-region="workspace-tab"]'
    );

    expect(handleDroppedMarkdownFile).toHaveBeenCalledTimes(1);
    expect(handleDroppedMarkdownFile).toHaveBeenCalledWith({
      targetPaths: ["C:/notes/alpha.md", "C:/notes/beta.md"],
      hasOpenDocument: true
    });
    expect(openWorkspaceFileFromPath).toHaveBeenCalledTimes(2);
    expect(openWorkspaceFileFromPath.mock.calls).toEqual([
      ["C:/notes/alpha.md"],
      ["C:/notes/beta.md"]
    ]);
    expect(workspaceTabs).toHaveLength(3);
    expect(workspaceTabs[1]?.textContent).toContain("alpha.md");
    expect(workspaceTabs[2]?.textContent).toContain("beta.md");
  });

  it("opens a new untitled document from the File menu", async () => {
    await renderApp();

    expect(menuCommandListener).not.toBeNull();

    await act(async () => {
      menuCommandListener?.("new-markdown-document");
      await Promise.resolve();
    });

    expect(createWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(createWorkspaceTab).toHaveBeenCalledWith({ kind: "untitled" });
    expect(container.textContent).toContain("Untitled.md");
    expect(container.querySelector('[data-fishmark-region="empty-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();
    expect(container.querySelector<HTMLElement>(".app-shell")?.dataset.fishmarkShellMode).toBe(
      "editing"
    );
  });

  it("creates a second untitled tab without replacing the first one", async () => {
    await renderApp();

    await act(async () => {
      menuCommandListener?.("new-markdown-document");
      await Promise.resolve();
    });

    await act(async () => {
      codeEditorMock.changeContent("# First untitled\n");
      await Promise.resolve();
    });

    await act(async () => {
      menuCommandListener?.("new-markdown-document");
      await Promise.resolve();
    });

    const workspaceTabs = container.querySelectorAll<HTMLElement>(
      '[data-fishmark-region="workspace-tab"]'
    );

    expect(createWorkspaceTab).toHaveBeenCalledTimes(2);
    expect(workspaceTabs).toHaveLength(2);
    expect(workspaceTabs[0]?.textContent).toContain("Untitled.md");
    expect(workspaceTabs[1]?.dataset.active).toBe("true");
    expect(container.querySelectorAll('[data-testid="mock-code-editor"]')).toHaveLength(1);
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
      tabId: "tab-1",
      currentPath: null
    });
    expect(container.textContent).toContain("untitled.md");
  });

  it("saves the currently active workspace tab by tab id after switching tabs", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      },
      {
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }
    );

    await renderAndOpenDocument();

    expect(menuCommandListener).not.toBeNull();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    await act(async () => {
      codeEditorMock.changeContent("# Second updated\n");
      menuCommandListener?.("save-markdown-file");
      await Promise.resolve();
    });

    expect(saveMarkdownFile).toHaveBeenCalledWith({
      tabId: "tab-2",
      path: "C:/notes/second.md"
    });
  });

  it("opens a second document into a second workspace tab instead of replacing the first one", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      },
      {
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }
    );

    await renderApp();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });
    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    const workspaceTabs = container.querySelectorAll<HTMLElement>(
      '[data-fishmark-region="workspace-tab"]'
    );

    expect(openWorkspaceFile).toHaveBeenCalledTimes(2);
    expect(workspaceTabs).toHaveLength(2);
    expect(workspaceTabs[0]?.textContent).toContain("first.md");
    expect(workspaceTabs[1]?.textContent).toContain("second.md");
    expect(workspaceTabs[1]?.dataset.active).toBe("true");
    expect(container.querySelectorAll('[data-testid="mock-code-editor"]')).toHaveLength(1);
  });

  it("switches the active editor payload when the user clicks another workspace tab", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      },
      {
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }
    );

    await renderApp();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });
    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    const firstTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-fishmark-region="workspace-tab"]')
    ).find((element) => element.textContent?.includes("first.md"));

    await act(async () => {
      firstTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const activeTab = container.querySelector<HTMLElement>(
      '[data-fishmark-region="workspace-tab"][data-active="true"]'
    );

    expect(activateWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-1" });
    expect(activeTab?.textContent).toContain("first.md");
    expect(codeEditorMock.getCurrentContent()).toBe("# First\n");
    expect(container.querySelectorAll('[data-testid="mock-code-editor"]')).toHaveLength(1);
  });

  it("surfaces active-tab dirty state in the workspace tab strip", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      },
      {
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }
    );

    await renderApp();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });
    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    await act(async () => {
      codeEditorMock.changeContent("# Second dirty\n");
      await Promise.resolve();
      await Promise.resolve();
    });

    const activeTab = container.querySelector<HTMLElement>(
      '[data-fishmark-region="workspace-tab"][data-active="true"]'
    );

    expect(updateWorkspaceTabDraft).toHaveBeenLastCalledWith({
      tabId: "tab-2",
      content: "# Second dirty\n"
    });
    expect(activeTab?.textContent).toContain("second.md");
    expect(activeTab?.dataset.dirty).toBe("true");
  });

  it("appends an externally opened Markdown path as a new workspace tab in the current window", async () => {
    queueWorkspaceOpenDocuments({
      path: "C:/notes/current.md",
      name: "current.md",
      content: "# Current\n"
    });
    queueWorkspaceOpenDocuments({
      path: "C:/notes/external.md",
      name: "external.md",
      content: "# External\n"
    });

    window.fishmark = {
      ...window.fishmark,
      startupOpenPath: "C:/notes/current.md",
      openWorkspaceFileFromPath
    } as Window["fishmark"];

    await renderApp();

    expect(openWorkspacePathListener).not.toBeNull();

    await act(async () => {
      openWorkspacePathListener?.({ targetPath: "C:/notes/external.md" });
      await Promise.resolve();
      await Promise.resolve();
    });

    const workspaceTabs = container.querySelectorAll<HTMLElement>(
      '[data-fishmark-region="workspace-tab"]'
    );

    expect(openWorkspaceFileFromPath).toHaveBeenCalledWith("C:/notes/external.md");
    expect(workspaceTabs).toHaveLength(2);
    expect(workspaceTabs[1]?.dataset.active).toBe("true");
    expect(workspaceTabs[1]?.textContent).toContain("external.md");
  });

  it("closes a workspace tab from the tab strip without replacing the editor instance", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      },
      {
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }
    );

    await renderApp();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });
    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    const closeButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-fishmark-region="workspace-tab-close"]')
    ).find((element) =>
      element.closest('[data-fishmark-region="workspace-tab-shell"]')?.textContent?.includes("first.md")
    );

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const workspaceTabs = container.querySelectorAll<HTMLElement>(
      '[data-fishmark-region="workspace-tab"]'
    );

    expect(closeWorkspaceTab).toHaveBeenCalledWith({ tabId: "tab-1" });
    expect(workspaceTabs).toHaveLength(1);
    expect(workspaceTabs[0]?.textContent).toContain("second.md");
    expect(container.querySelectorAll('[data-testid="mock-code-editor"]')).toHaveLength(1);
  });

  it("reorders workspace tabs when the user drops a dragged tab on another tab", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      },
      {
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      },
      {
        path: "C:/notes/third.md",
        name: "third.md",
        content: "# Third\n"
      }
    );

    await renderApp();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });
    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });
    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    const workspaceTabs = container.querySelectorAll<HTMLButtonElement>(
      '[data-fishmark-region="workspace-tab"]'
    );
    const firstTab = Array.from(workspaceTabs).find((element) => element.textContent?.includes("first.md"));
    const thirdTab = Array.from(workspaceTabs).find((element) => element.textContent?.includes("third.md"));

    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn()
    };

    await act(async () => {
      const dragStartEvent = new Event("dragstart", { bubbles: true }) as DragEvent;
      Object.defineProperty(dragStartEvent, "dataTransfer", { value: dataTransfer });
      firstTab?.dispatchEvent(dragStartEvent);

      const dragOverEvent = new Event("dragover", { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(dragOverEvent, "dataTransfer", { value: dataTransfer });
      thirdTab?.dispatchEvent(dragOverEvent);

      const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
      thirdTab?.dispatchEvent(dropEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    const reorderedLabels = Array.from(
      container.querySelectorAll<HTMLElement>('[data-fishmark-region="workspace-tab"]')
    ).map((element) => element.textContent ?? "");

    expect(reorderWorkspaceTab).toHaveBeenCalledWith({
      tabId: "tab-1",
      toIndex: 2
    });
    expect(reorderedLabels[0]).toContain("second.md");
    expect(reorderedLabels[2]).toContain("first.md");
  });

  it("detaches a dragged tab into a new window when the drag ends outside the tab strip", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      },
      {
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }
    );

    await renderApp();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });
    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    const secondTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-fishmark-region="workspace-tab"]')
    ).find((element) => element.textContent?.includes("second.md"));

    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn()
    };

    await act(async () => {
      const dragStartEvent = new Event("dragstart", { bubbles: true }) as DragEvent;
      Object.defineProperty(dragStartEvent, "dataTransfer", { value: dataTransfer });
      secondTab?.dispatchEvent(dragStartEvent);

      const dragEndEvent = new Event("dragend", { bubbles: true }) as DragEvent;
      Object.defineProperty(dragEndEvent, "dataTransfer", { value: dataTransfer });
      secondTab?.dispatchEvent(dragEndEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    const workspaceTabs = container.querySelectorAll<HTMLElement>(
      '[data-fishmark-region="workspace-tab"]'
    );

    expect(detachWorkspaceTabToNewWindow).toHaveBeenCalledWith({ tabId: "tab-2" });
    expect(workspaceTabs).toHaveLength(1);
    expect(workspaceTabs[0]?.textContent).toContain("first.md");
  });

  it("ignores the check-for-updates menu command in the renderer shell", async () => {
    await renderAndOpenDocument();

    expect(menuCommandListener).not.toBeNull();
    const openCountBefore = openWorkspaceFile.mock.calls.length;
    const saveCountBefore = saveMarkdownFile.mock.calls.length;
    const saveAsCountBefore = saveMarkdownFileAs.mock.calls.length;

    await act(async () => {
      menuCommandListener?.("check-for-updates");
      await Promise.resolve();
    });

    expect(saveMarkdownFile.mock.calls.length).toBe(saveCountBefore);
    expect(saveMarkdownFileAs.mock.calls.length).toBe(saveAsCountBefore);
    expect(openWorkspaceFile.mock.calls.length).toBe(openCountBefore);
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
      tabId: "tab-1",
      path: "C:/notes/today.md"
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
      tabId: "tab-1",
      path: "C:/notes/today.md"
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
      tabId: "tab-1",
      path: "C:/notes/today.md"
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
      tabId: "tab-1",
      path: "C:/notes/today.md"
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
      tabId: "tab-1",
      path: "C:/notes/today.md"
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
      tabId: "tab-1",
      path: "C:/notes/today.md"
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
      tabId: "tab-1",
      path: "C:/notes/today.md"
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
      tabId: "tab-1",
      path: "C:/notes/today.md"
    });
  });

  it("pauses autosave and shows recovery actions after an external modification", async () => {
    await renderAndOpenDocument();

    expect(syncWatchedMarkdownFile).toHaveBeenCalledWith({ tabId: "tab-1" });
    expect(externalMarkdownFileChangedListener).not.toBeNull();

    await act(async () => {
      codeEditorMock.changeContent("# Local draft\n");
      await Promise.resolve();
    });

    await act(async () => {
      externalMarkdownFileChangedListener?.({
        path: "C:/notes/today.md",
        kind: "modified"
      });
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();
    expect(container.textContent).toContain("当前文件已被外部修改");
    expect(findButtonByText("重载磁盘版本")).not.toBeNull();
    expect(findButtonByText("保留当前编辑")).not.toBeNull();
    expect(findButtonByText("另存为新文件")).not.toBeNull();
  });

  it("routes Save to Save As after keeping the in-memory version during an external conflict", async () => {
    saveMarkdownFileAs.mockResolvedValue({
      status: "success",
      document: {
        path: "C:/notes/conflict-copy.md",
        name: "conflict-copy.md",
        content: "# Local draft\n",
        encoding: "utf-8"
      }
    });

    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.changeContent("# Local draft\n");
      externalMarkdownFileChangedListener?.({
        path: "C:/notes/today.md",
        kind: "modified"
      });
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText("保留当前编辑")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    saveMarkdownFile.mockClear();
    saveMarkdownFileAs.mockClear();

    await act(async () => {
      menuCommandListener?.("save-markdown-file");
      await Promise.resolve();
    });

    expect(saveMarkdownFile).not.toHaveBeenCalled();
    expect(saveMarkdownFileAs).toHaveBeenCalledWith({
      tabId: "tab-1",
      currentPath: "C:/notes/today.md"
    });
  });

  it("retargets the external watcher when the active workspace tab changes", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/first.md",
        name: "first.md",
        content: "# First\n"
      },
      {
        path: "C:/notes/second.md",
        name: "second.md",
        content: "# Second\n"
      }
    );

    await renderAndOpenDocument();

    expect(menuCommandListener).not.toBeNull();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    syncWatchedMarkdownFile.mockClear();

    const workspaceTabs = container.querySelectorAll<HTMLElement>(
      '[data-fishmark-region="workspace-tab"]'
    );

    await act(async () => {
      workspaceTabs[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(syncWatchedMarkdownFile).toHaveBeenCalledWith({ tabId: "tab-1" });
  });

  it("reloads the disk version when the user accepts the external-change prompt", async () => {
    queueWorkspaceOpenDocuments({
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Disk update\n"
    });
    window.fishmark = {
      ...window.fishmark,
      reloadWorkspaceTabFromPath
    } as Window["fishmark"];

    await renderAndOpenDocument();

    await act(async () => {
      externalMarkdownFileChangedListener?.({
        path: "C:/notes/today.md",
        kind: "modified"
      });
      await Promise.resolve();
    });

    await act(async () => {
      findButtonByText("重载磁盘版本")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(reloadWorkspaceTabFromPath).toHaveBeenCalledWith({
      tabId: "tab-1",
      targetPath: "C:/notes/today.md"
    });
    expect(container.querySelectorAll('[data-fishmark-region="workspace-tab"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("当前文件已被外部修改");
  });

  it("applies initial theme and typography preferences to the document root", async () => {
    window.fishmark = {
      ...window.fishmark,
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
    } as Window["fishmark"];

    await renderApp();

    expect(document.documentElement.dataset.fishmarkTheme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--fishmark-ui-font-size")).toBe("17px");
    expect(document.documentElement.style.getPropertyValue("--fishmark-ui-font-family")).toBe(
      "Segoe UI"
    );
    expect(document.documentElement.style.getPropertyValue("--fishmark-document-font-family")).toBe(
      "IBM Plex Serif"
    );
    expect(document.documentElement.style.getPropertyValue("--fishmark-document-cjk-font-family")).toBe(
      "Source Han Sans SC"
    );
    expect(document.documentElement.style.getPropertyValue("--fishmark-document-font-size")).toBe(
      "18px"
    );
    expect(listFontFamilies).not.toHaveBeenCalled();
    expect(
      document.head
        .querySelector('link[data-fishmark-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/fishmark/themes/default/tokens-dark.css"));
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

    expect(document.documentElement.dataset.fishmarkTheme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--fishmark-ui-font-size")).toBe("18px");
    expect(document.documentElement.style.getPropertyValue("--fishmark-ui-font-family")).toBe(
      "Aptos"
    );
    expect(document.documentElement.style.getPropertyValue("--fishmark-document-font-family")).toBe(
      "Source Serif 4"
    );
    expect(document.documentElement.style.getPropertyValue("--fishmark-document-cjk-font-family")).toBe(
      "霞鹜文楷"
    );
    expect(document.documentElement.style.getPropertyValue("--fishmark-document-font-size")).toBe(
      "20px"
    );
    expect(
      document.head
        .querySelector('link[data-fishmark-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/fishmark/themes/graphite/tokens-dark.css"));
  });

  it("treats legacy-suffixed package ids as missing and falls back to builtin default", async () => {
    window.fishmark = {
      ...window.fishmark,
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: "graphite-dark" }
      })
    } as Window["fishmark"];

    await renderApp();

    expect(
      document.head
        .querySelector('link[data-fishmark-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/fishmark/themes/default/tokens-dark.css"));
    expect(container.textContent).toContain("已配置主题未找到");
  });

  it("mounts non-empty theme package catalogs through preview asset urls without a missing-theme warning", async () => {
    const packageThemes: ThemePackageDescriptor[] = [
      makeManifestThemePackage({ id: "default", name: "FishMark Default", source: "builtin" }),
      makeManifestThemePackage({ id: "rain-glass", name: "Rain Glass" })
    ];

    window.fishmark = {
      ...window.fishmark,
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: "rain-glass", effectsMode: "auto", parameters: {} }
      }),
      listThemePackages: vi.fn().mockResolvedValue(withBuiltinDefault(packageThemes))
    } as Window["fishmark"];

    await renderApp();

    expect(
      document.head
        .querySelector('link[data-fishmark-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/fishmark/themes/rain-glass/tokens-dark.css"));
    expect(container.textContent).not.toContain("已配置主题未找到");
  });

  it("does not warn about a missing configured theme while the theme package catalog is still loading", async () => {
    window.fishmark = {
      ...window.fishmark,
      getPreferences: vi.fn().mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        theme: { mode: "dark", selectedId: "rain-glass", effectsMode: "auto", parameters: {} }
      }),
      listThemePackages: vi.fn<() => Promise<ThemePackageDescriptor[]>>(
        () => new Promise<ThemePackageDescriptor[]>(() => {})
      )
    } as Window["fishmark"];

    await renderApp();

    expect(container.textContent).not.toContain("已配置主题未找到");
  });

  it("refreshes the package catalog from settings and falls back to default when the selected package disappears", async () => {
    const packageThemes = [
      makeManifestThemePackage({ id: "default", name: "FishMark Default", source: "builtin" }),
      makeManifestThemePackage({ id: "graphite", name: "Graphite" })
    ];
    const driver = await renderEditorApp({
      listThemePackagesResult: packageThemes,
      refreshThemePackagesResult: [
        makeManifestThemePackage({ id: "default", name: "FishMark Default", source: "builtin" })
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
        .querySelector('link[data-fishmark-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/fishmark/themes/graphite/tokens-dark.css"));
    expect(
      Array.from(themeSelect?.options ?? []).map((option) => ({
        value: option.value,
        label: option.textContent
      }))
    ).toEqual([
      { value: "default", label: "FishMark 默认" },
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
        .querySelector('link[data-fishmark-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/fishmark/themes/default/tokens-dark.css"));
    expect(themeSelect?.value).toBe("default");
  });

  it("persists theme effects mode changes from settings", async () => {
    const driver = await renderEditorApp();

    await driver.openSettings();
    await driver.selectSettingsOption("settings-theme-effects", "off");

    expect(window.fishmark.updatePreferences).toHaveBeenCalledWith({
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
              shader: "/tmp/fishmark/themes/rain-glass/shaders/workbench-background.glsl"
            }
          }
        })
      ]
    });

    const surfaceHost = container.querySelector('[data-fishmark-theme-surface="workbenchBackground"]');

    expect(surfaceHost).not.toBeNull();
    expect(surfaceHost?.getAttribute("data-fishmark-theme-scene")).toBe("rain-scene");
    expect(surfaceHost?.parentElement?.classList.contains("app-layout")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      createPreviewAssetUrl("/tmp/fishmark/themes/rain-glass/shaders/workbench-background.glsl"),
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
              shader: "/tmp/fishmark/themes/rain-glass/shaders/workbench-background.glsl",
              channels: {
                "0": {
                  type: "image",
                  src: "/tmp/fishmark/themes/rain-glass/textures/noise.png"
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
      createPreviewAssetUrl("/tmp/fishmark/themes/rain-glass/textures/noise.png")
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
              shader: "/tmp/fishmark/themes/rain-glass/shaders/workbench-background.glsl"
            }
          }
        })
      ]
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(document.documentElement.getAttribute("data-fishmark-theme-dynamic-mode")).toBe("fallback");
    expect(container.querySelector('[data-fishmark-region="app-notification-banner"]')?.textContent).toContain(
      "主题动态效果已自动关闭，已回退到静态样式。"
    );
  });

  it("renders a controlled titlebar host with built-in items on controlled-chrome platforms", async () => {
    window.fishmark = {
      ...window.fishmark,
      platform: "darwin"
    } as Window["fishmark"];

    await renderApp();

    const titlebar = container.querySelector('[data-fishmark-role="titlebar"]');

    expect(titlebar).not.toBeNull();
    expect(titlebar?.querySelector('[data-fishmark-titlebar-item="document-title"]')?.textContent).toContain(
      "Local-first Markdown writing"
    );
    expect(titlebar?.querySelector('[data-fishmark-titlebar-item="dirty-indicator"]')).not.toBeNull();
    expect(titlebar?.querySelector('[data-fishmark-titlebar-item="app-icon"]')).toBeNull();
    expect(titlebar?.querySelector('[data-fishmark-titlebar-item="theme-toggle"]')).toBeNull();
    expect(titlebar?.querySelector('[data-fishmark-titlebar-item="window-actions"]')).toBeNull();
  });

  it("does not mount a renderer titlebar on Windows native-chrome platforms", async () => {
    await renderApp();

    expect(container.querySelector('[data-fishmark-role="titlebar"]')).toBeNull();
  });

  it("renders the bridge-unavailable fallback inside a shell-safe container", async () => {
    window.fishmark = undefined as unknown as Window["fishmark"];

    await renderApp();

    expect(container.querySelector('[data-fishmark-role="titlebar"]')).toBeNull();
    expect(container.querySelector(".app-shell-fallback")).not.toBeNull();
    expect(container.querySelector(".app-shell-fallback .error-banner")?.textContent).toContain(
      "FishMark bridge unavailable"
    );
  });

  it("uses the macOS default titlebar layout without renderer window actions", async () => {
    window.fishmark = {
      ...window.fishmark,
      platform: "darwin"
    } as Window["fishmark"];

    await renderApp();

    const titlebar = container.querySelector('[data-fishmark-role="titlebar"]');

    expect(titlebar?.querySelector('[data-fishmark-titlebar-item="window-actions"]')).toBeNull();
    expect(titlebar?.querySelector('[data-fishmark-titlebar-item="app-icon"]')).toBeNull();
  });

  it("keeps passive titlebar content draggable while limiting no-drag to controls", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");

    expect(appUiStylesheet).toContain('.app-titlebar-slot[data-fishmark-drag-region="true"]');
    expect(appUiStylesheet).toContain('.app-titlebar-slot[data-fishmark-drag-region="false"]');
    expect(appUiStylesheet).toContain(".app-titlebar button");
    expect(appUiStylesheet).not.toContain(".app-titlebar-item,\n.app-titlebar-item > *");
  });

  it("mounts a titlebar shader surface host for the active manifest package", async () => {
    window.fishmark = {
      ...window.fishmark,
      platform: "darwin"
    } as Window["fishmark"];

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
              shader: "/tmp/fishmark/themes/rain-glass/shaders/titlebar-backdrop.glsl"
            }
          }
        })
      ]
    });

    const surfaceHost = container.querySelector('[data-fishmark-theme-surface="titlebarBackdrop"]');

    expect(surfaceHost).not.toBeNull();
    expect(surfaceHost?.getAttribute("data-fishmark-theme-scene")).toBe("rain-scene");
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
            shader: "/tmp/fishmark/themes/rain-glass/shaders/workbench-background.glsl"
          }
        }
      })
    ]);

    window.fishmark = {
      ...window.fishmark,
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
    } as Window["fishmark"];

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
              shader: "/tmp/fishmark/themes/rain-glass/shaders/workbench-background.glsl"
            }
          }
        })
      ]
    });

    expect(container.querySelector('[data-fishmark-theme-surface="workbenchBackground"]')).toBeNull();
    expect(document.documentElement.getAttribute("data-fishmark-theme-dynamic-mode")).toBe("off");
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
              shader: "/tmp/fishmark/themes/rain-glass/shaders/workbench-background.glsl"
            }
          }
        })
      ]
    });

    expect(container.querySelector('[data-fishmark-theme-surface="workbenchBackground"]')).not.toBeNull();
    expect(document.documentElement.getAttribute("data-fishmark-theme")).toBe("dark");

    await act(async () => {
      colorSchemeMediaQuery.__setMatches(false);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-fishmark-theme-surface="workbenchBackground"]')).toBeNull();
    expect(document.documentElement.getAttribute("data-fishmark-theme")).toBe("light");
  });

  it("shows a refresh error banner when refreshing theme packages fails", async () => {
    refreshThemePackages = vi
      .fn<() => Promise<ThemePackageDescriptor[]>>()
      .mockRejectedValue(new Error("refresh failed"));

    window.fishmark = {
      ...window.fishmark,
      listThemePackages: vi.fn().mockResolvedValue([]),
      refreshThemePackages
    } as Window["fishmark"];

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

    window.fishmark = {
      ...window.fishmark,
      openThemesDirectory
    } as Window["fishmark"];

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
      makeManifestThemePackage({ id: "default", name: "FishMark Default", source: "builtin" }),
      makeManifestThemePackage({
        id: "midnight",
        name: "Midnight",
        supports: {
          light: false,
          dark: true
        },
        tokens: {
          dark: "/tmp/fishmark/themes/midnight/tokens-dark.css"
        },
        styles: {
          ui: "/tmp/fishmark/themes/midnight/ui.css",
          editor: "/tmp/fishmark/themes/midnight/editor.css"
        }
      })
    ];

    window.fishmark = {
      ...window.fishmark,
      listThemePackages: vi.fn().mockResolvedValue(darkOnlyThemes)
    } as Window["fishmark"];

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
        .querySelector('link[data-fishmark-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/fishmark/themes/default/tokens-light.css"));
    expect(container.textContent).toContain("该主题不支持浅色模式");
    expect(container.querySelector('[data-fishmark-region="app-notification-banner"]')?.textContent).toContain(
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
    expect(container.querySelector('[data-fishmark-dialog="settings-drawer"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLElement>('[data-fishmark-dialog="settings-drawer"]')?.dataset.state).toBe(
      "closing"
    );
    expect(container.querySelector<HTMLElement>('[data-fishmark-panel="settings-drawer"]')?.dataset.state).toBe(
      "closing"
    );

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-fishmark-dialog="settings-drawer"]')).toBeNull();
    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();
    expect(container.textContent).toContain("today.md");
  });

  it("renders rail, workspace header, status strip, and word count for an open document", async () => {
    await renderAndOpenDocument();

    await clickEditorContent();

    const rail = container.querySelector('[data-fishmark-layout="rail"]');
    const workspace = container.querySelector('[data-fishmark-layout="workspace"]');
    const workspaceHeader = container.querySelector('[data-fishmark-region="workspace-header"]');
    const statusStrip = container.querySelector('[data-fishmark-region="status-strip"]');
    const outlineToggle = container.querySelector('[data-fishmark-region="outline-toggle"]');
    const outlinePanel = container.querySelector('[data-fishmark-region="outline-panel"]');

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

    await clickEditorContent();

    const rail = container.querySelector('[data-fishmark-layout="rail"]');
    const workspaceHeader = container.querySelector('[data-fishmark-region="workspace-header"]');
    const documentHeader = container.querySelector('[data-fishmark-region="document-header"]');
    const outlineToggle = container.querySelector('[data-fishmark-region="outline-toggle"]');
    const outlinePanel = container.querySelector('[data-fishmark-region="outline-panel"]');

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

    await clickEditorContent();

    const outlineToggle = container.querySelector<HTMLButtonElement>(
      '[data-fishmark-region="outline-toggle"]'
    );

    expect(outlineToggle).not.toBeNull();

    await act(async () => {
      outlineToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const outlinePanel = container.querySelector('[data-fishmark-region="outline-panel"]');
    const outlineHeader = container.querySelector('[data-fishmark-region="outline-panel-header"]');
    const outlineBody = container.querySelector('[data-fishmark-region="outline-panel-body"]');
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

    await clickEditorContent();

    const outlineToggle = container.querySelector<HTMLButtonElement>(
      '[data-fishmark-region="outline-toggle"]'
    );

    await act(async () => {
      outlineToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const collapseButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Collapse outline"]'
    );
    expect(container.querySelector('[data-fishmark-region="outline-panel"]')).not.toBeNull();
    expect(collapseButton).not.toBeNull();

    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLElement>('[data-fishmark-region="outline-panel"]')?.dataset.state).toBe(
      "closing"
    );
    expect(container.querySelector('[data-fishmark-region="outline-toggle"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-fishmark-region="outline-panel"]')).toBeNull();
    expect(container.querySelector('[data-fishmark-region="outline-toggle"]')).not.toBeNull();
  });

  it("renders the empty state inside a shared workspace canvas", async () => {
    await renderApp();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const appLayout = container.querySelector<HTMLElement>(".app-layout");
    const appWorkspace = container.querySelector<HTMLElement>(".app-workspace");
    const rail = container.querySelector<HTMLElement>('[data-fishmark-layout="rail"]');
    const workspaceHeader = container.querySelector('[data-fishmark-region="workspace-header"]');
    const workspaceCanvas = container.querySelector<HTMLElement>('[data-fishmark-region="workspace-canvas"]');
    const emptyState = container.querySelector('[data-fishmark-region="empty-state"]');

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
    expect(appLayout?.dataset.fishmarkHasDocument).toBe("false");
    expect(appWorkspace?.dataset.fishmarkHasDocument).toBe("false");
    expect(workspaceCanvas?.dataset.fishmarkHasDocument).toBe("false");
    expect(rail?.dataset.visibility).toBe("visible");
    expect(workspaceHeader).not.toBeNull();
    expect(workspaceCanvas).not.toBeNull();
    expect(emptyState).not.toBeNull();
    expect(workspaceCanvas?.contains(emptyState)).toBe(true);
  });

  it("keeps the welcome screen in reading mode when settings opens and closes", async () => {
    await renderApp();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const settingsButton = container.querySelector<HTMLButtonElement>(".settings-entry");

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");

    await act(async () => {
      settingsButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
    expect(container.querySelector('[data-fishmark-dialog="settings-drawer"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
  });

  it("renders a fixed app status bar outside the scrolling document flow", async () => {
    await renderAndOpenDocument();

    const workspaceHeader = container.querySelector('[data-fishmark-region="workspace-header"]');
    const workspaceCanvas = container.querySelector('[data-fishmark-region="workspace-canvas"]');
    const documentHeader = container.querySelector('[data-fishmark-region="document-header"]');
    const appStatusBar = container.querySelector('[data-fishmark-region="app-status-bar"]');

    expect(workspaceHeader).not.toBeNull();
    expect(workspaceCanvas).not.toBeNull();
    expect(documentHeader).toBeNull();
    expect(workspaceCanvas?.contains(appStatusBar)).toBe(false);
    expect(appStatusBar?.textContent).toContain("All changes saved");
    expect(appStatusBar?.textContent).toContain("字数 6");
  });

  it("does not render an update download message by default", async () => {
    await renderAndOpenDocument();

    const appStatusBar = container.querySelector('[data-fishmark-region="app-status-bar"]');

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

    const appStatusBar = container.querySelector('[data-fishmark-region="app-status-bar"]');

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

    const notificationBanner = container.querySelector('[data-fishmark-region="app-notification-banner"]');
    const notificationSpinner = container.querySelector('[data-fishmark-region="app-notification-spinner"]');

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
    expect(container.querySelector('[data-fishmark-region="app-notification-spinner"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(notificationBanner?.getAttribute("data-state")).toBe("closing");

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-fishmark-region="app-notification-banner"]')).toBeNull();
  });

  it("ensures the top notification banner stays above the settings drawer stacking layer", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const baseStylesheet = readFileSync(baseStylesheetPath, "utf-8");
    const settingsStylesheet = readFileSync(settingsStylesheetPath, "utf-8");

    const notificationRule = getCssRule(appUiStylesheet, ".app-notification-banner");
    const alertZTokenMatch = baseStylesheet.match(/--fishmark-z-alert:\s*(\d+);/);
    const settingsDialogZMatch = settingsStylesheet.match(
      /\[data-fishmark-dialog="settings-drawer"\]\s*\{\s*[\s\S]*?z-index:\s*(\d+);/
    );
    const settingsShellZMatch = settingsStylesheet.match(/\.settings-shell\s*\{\s*[\s\S]*?z-index:\s*(\d+);/);

    expect(notificationRule).toContain("z-index: var(--fishmark-z-alert);");
    expect(alertZTokenMatch?.[1]).toBeDefined();
    expect(settingsDialogZMatch?.[1]).toBeDefined();
    expect(settingsShellZMatch?.[1]).toBeDefined();

    const notificationZIndex = Number(alertZTokenMatch?.[1] ?? 0);
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

    const appStatusBar = container.querySelector('[data-fishmark-region="app-status-bar"]');

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
      tabId: "tab-1",
      path: "C:/notes/today.md"
    });
    expect(container.querySelector('[data-fishmark-dialog="settings-drawer"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLElement>('[data-fishmark-dialog="settings-drawer"]')?.dataset.state).toBe(
      "closing"
    );

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-fishmark-dialog="settings-drawer"]')).toBeNull();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("mock-code-editor");
  });

  it("opens an existing document in reading mode", async () => {
    await renderAndOpenDocument();

    expect(container.querySelector<HTMLElement>(".app-shell")?.dataset.fishmarkShellMode).toBe(
      "reading"
    );
  });

  it("blurs lingering editor focus when opening another document from the file picker", async () => {
    queueWorkspaceOpenDocuments(
      {
        path: "C:/notes/empty.md",
        name: "empty.md",
        content: ""
      },
      {
        path: "C:/notes/test.md",
        name: "test.md",
        content: "# Test\n"
      }
    );

    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const editorSurface = container.querySelector<HTMLElement>('[data-testid="mock-code-editor"]');

    await act(async () => {
      editorSurface?.focus();
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(editorSurface);

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    expect(openWorkspaceFile).toHaveBeenCalledTimes(2);
    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
    expect(document.activeElement).not.toBe(editorSurface);
    expect(document.activeElement?.getAttribute("data-testid")).not.toBe("mock-code-editor");
  });

  it("enters editing mode when the user clicks into the editor body", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const editorSurface = container.querySelector<HTMLElement>('[data-testid="mock-code-editor"]');

    await act(async () => {
      editorSurface?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.focus();
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("editing");
  });

  it("enters editing mode from content mousedown even when focus is already stuck on the editor", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const editorSurface = container.querySelector<HTMLElement>('[data-testid="mock-code-editor"]');
    const editorContent = editorSurface?.querySelector<HTMLElement>(".cm-content");

    await act(async () => {
      editorSurface?.focus();
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
    expect(document.activeElement).toBe(editorSurface);

    await act(async () => {
      editorContent?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 300 }));
      editorContent?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, clientX: 300 }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("editing");
  });

  it("keeps reading mode when the editor only receives middle-click focus", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const editorSurface = container.querySelector<HTMLElement>('[data-testid="mock-code-editor"]');

    await act(async () => {
      editorSurface?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 1 }));
      editorSurface?.focus();
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
  });

  it("exits editing mode when Escape is pressed", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const editorSurface = container.querySelector<HTMLElement>('[data-testid="mock-code-editor"]');

    await act(async () => {
      editorSurface?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.focus();
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("editing");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
  });

  it("exits editing mode when the user clicks the editor blank area", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const editorSurface = container.querySelector<HTMLElement>('[data-testid="mock-code-editor"]');

    await act(async () => {
      editorSurface?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.focus();
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("editing");

    await act(async () => {
      editorSurface?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 40 }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
  });

  it("exits editing mode when the user clicks workspace-canvas blank area outside the editor", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const workspaceShell = container.querySelector<HTMLElement>(".workspace-shell");

    await clickEditorContent();

    expect(appShell?.dataset.fishmarkShellMode).toBe("editing");

    await act(async () => {
      workspaceShell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 24 }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
  });

  it("exits editing mode when the user clicks app-workspace blank area outside the canvas", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const appWorkspace = container.querySelector<HTMLElement>(".app-workspace");

    await clickEditorContent();

    expect(appShell?.dataset.fishmarkShellMode).toBe("editing");

    await act(async () => {
      appWorkspace?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 24 }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
  });

  it("collapses the rail in document reading mode while keeping it available on the welcome screen", async () => {
    await renderAndOpenDocument();

    const appShell = container.querySelector<HTMLElement>(".app-shell");
    const rail = container.querySelector<HTMLElement>('[data-fishmark-layout="rail"]');
    const workspaceHeader = container.querySelector<HTMLElement>('[data-fishmark-region="workspace-header"]');
    const statusBar = container.querySelector<HTMLElement>('[data-fishmark-region="app-status-bar"]');
    const editorSurface = container.querySelector<HTMLElement>('[data-testid="mock-code-editor"]');

    await clickEditorContent();

    const outlineToggle = container.querySelector<HTMLButtonElement>('[data-fishmark-region="outline-toggle"]');
    await act(async () => {
      outlineToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("editing");
    expect(container.querySelector('[data-fishmark-region="outline-panel"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("reading");
    expect(rail?.dataset.visibility).toBe("collapsed");
    expect(workspaceHeader?.dataset.visibility).toBe("collapsed");
    expect(statusBar?.dataset.visibility).toBe("collapsed");
    expect(container.querySelector('[data-fishmark-region="outline-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="mock-code-editor"]')).not.toBeNull();

    await act(async () => {
      editorSurface?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.focus();
      await Promise.resolve();
    });

    expect(appShell?.dataset.fishmarkShellMode).toBe("editing");
    expect(rail?.dataset.visibility).toBe("visible");
    expect(workspaceHeader?.dataset.visibility).toBe("visible");
    expect(statusBar?.dataset.visibility).toBe("visible");
    expect(container.querySelector('[data-fishmark-region="outline-panel"]')).not.toBeNull();
  });

  it("shows the shortcut hint overlay only after Control is held for 1 second while the editor is focused", async () => {
    await renderAndOpenDocument();

    expect(
      container
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
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

    const overlay = container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]');
    const overlayShell = container.querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]');

    expect(overlayShell?.getAttribute("data-shortcut-hint-state")).toBe("hidden");
    expect(overlay).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(999);
      await Promise.resolve();
    });

    expect(overlayShell?.getAttribute("data-shortcut-hint-state")).toBe("hidden");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(overlayShell?.getAttribute("data-shortcut-hint-state")).toBe("visible");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')?.textContent).toContain("Ctrl+B");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')?.textContent).not.toContain("Save");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')?.textContent).not.toContain("Open");

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

  it("switches shortcut hints and rail mode when the active editing context becomes a table", async () => {
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
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')?.textContent).toContain(
      "Bold"
    );

    await act(async () => {
      codeEditorMock.emitActiveBlockChange({
        activeBlock: {
          id: "table:0-1",
          type: "table"
        },
        blockMap: { blocks: [] },
        selection: { anchor: 0, head: 0 },
        tableCursor: {
          mode: "inside",
          tableStartOffset: 0,
          row: 0,
          column: 0,
          offsetInCell: 0
        }
      });
      await Promise.resolve();
    });

    const overlay = container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]');
    const rail = container.querySelector<HTMLElement>(".app-rail");
    const tableStrip = container.querySelector<HTMLElement>('[data-fishmark-region="table-tool-strip"]');

    expect(overlay?.getAttribute("data-shortcut-group")).toBe("table-editing");
    expect(overlay?.textContent).toContain("Next Cell");
    expect(overlay?.textContent).not.toContain("Bold");
    expect(rail?.getAttribute("data-fishmark-rail-mode")).toBe("table-editing");
    expect(
      container.querySelector('.app-rail-mode-group-table')?.getAttribute("data-state")
    ).toBe("open");
    expect(
      container.querySelector('.app-rail-mode-group-default')?.getAttribute("data-state")
    ).toBe("closing");
    expect(tableStrip).not.toBeNull();
  });

  it("renders table rail tools as icon buttons with accessible labels", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.emitActiveBlockChange({
        activeBlock: {
          id: "table:0-1",
          type: "table"
        },
        blockMap: { blocks: [] },
        selection: { anchor: 0, head: 0 },
        tableCursor: {
          mode: "inside",
          tableStartOffset: 0,
          row: 0,
          column: 0,
          offsetInCell: 0
        }
      });
      await Promise.resolve();
    });

    const tableStrip = container.querySelector<HTMLElement>('[data-fishmark-region="table-tool-strip"]');
    const toolButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-fishmark-region="table-tool-button"]')
    );

    expect(tableStrip).not.toBeNull();
    expect(toolButtons).toHaveLength(7);
    expect(toolButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Row Above",
      "Row Below",
      "Column Left",
      "Column Right",
      "Delete Row",
      "Delete Column",
      "Delete Table"
    ]);
    expect(toolButtons.every((button) => button.querySelector("svg") !== null)).toBe(true);
    expect(tableStrip?.textContent?.trim()).toBe("");
  });

  it("shows a table tool tooltip on hover and hides it on mouse leave", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      codeEditorMock.emitActiveBlockChange({
        activeBlock: {
          id: "table:0-1",
          type: "table"
        },
        blockMap: { blocks: [] },
        selection: { anchor: 0, head: 0 },
        tableCursor: {
          mode: "inside",
          tableStartOffset: 0,
          row: 0,
          column: 0,
          offsetInCell: 0
        }
      });
      await Promise.resolve();
    });

    const rowAboveButton = container.querySelector<HTMLButtonElement>(
      '[data-fishmark-region="table-tool-button"][aria-label="Row Above"]'
    );

    expect(container.querySelector('[data-fishmark-region="table-tool-tooltip"]')).toBeNull();

    await act(async () => {
      rowAboveButton?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-fishmark-region="table-tool-tooltip"]')?.textContent).toContain("Row Above");

    await act(async () => {
      rowAboveButton?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-fishmark-region="table-tool-tooltip"]')).toBeNull();
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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')).toBeNull();
  });

  it("does not show the shortcut hint overlay when Control is held without editor focus", async () => {
    await renderAndOpenDocument();

    await act(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
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

    const overlay = container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]');
    const overlayShell = container.querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]');

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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')).toBeNull();

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
    window.fishmark = {
      ...window.fishmark,
      platform: "darwin"
    } as Window["fishmark"];

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

    const overlay = container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]');

    expect(
      container
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
  });

  it("does not show the shortcut hint overlay when Control is held on macOS", async () => {
    window.fishmark = {
      ...window.fishmark,
      platform: "darwin"
    } as Window["fishmark"];

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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')).toBeNull();
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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("hidden");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')).toBeNull();
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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
        ?.getAttribute("data-shortcut-hint-state")
    ).toBe("visible");
    expect(container.querySelector('[data-fishmark-region="shortcut-hint-overlay"]')).not.toBeNull();
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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
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
        .querySelector('[data-fishmark-region="shortcut-hint-overlay-shell"]')
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

    const drawerPanel = container.querySelector<HTMLElement>('[data-fishmark-panel="settings-drawer"]');
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

  it("does not render removed focus settings controls", async () => {
    const driver = await renderEditorApp();
    await driver.openSettings();

    const focusTriggerMode = container.querySelector<HTMLSelectElement>("#settings-focus-trigger-mode");
    const focusIdlePreset = container.querySelector<HTMLSelectElement>("#settings-focus-idle-preset");
    const focusIdleSeconds = container.querySelector<HTMLInputElement>("#settings-focus-idle-seconds");

    expect(focusTriggerMode).toBeNull();
    expect(focusIdlePreset).toBeNull();
    expect(focusIdleSeconds).toBeNull();
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

    expect(window.fishmark.updatePreferences).toHaveBeenCalledWith({
      ui: { fontFamily: "Segoe UI" }
    });
    expect(document.documentElement.style.getPropertyValue("--fishmark-ui-font-family")).toBe(
      "Segoe UI"
    );
  });

  it("does not render a legacy mode toggle entry in the workspace", async () => {
    await renderAndOpenDocument();

    expect(container.querySelector('[data-fishmark-region="focus-toggle"]')).toBeNull();
  });

  it("defines animated shell chrome transitions for document reading mode and fully retracts the rail", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const railRule = getCssRule(appUiStylesheet, ".app-rail");
    const collapsedRailRule = getCssRule(appUiStylesheet, '.app-rail[data-visibility="collapsed"]');
    const readingLayoutRule = getCssRule(
      appUiStylesheet,
      '.app-layout[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"]'
    );
    const readingWorkspaceRule = getCssRule(
      appUiStylesheet,
      '.app-workspace[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"]'
    );
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
    expect(readingLayoutRule).toContain("grid-template-columns: 0 minmax(0, 1fr);");
    expect(readingWorkspaceRule).toContain("grid-template-rows: minmax(0, 1fr);");
    expect(headerRule).toContain("transition:");
    expect(collapsedHeaderRule).toContain("transform:");
    expect(statusBarRule).toContain("transition:");
    expect(collapsedStatusBarRule).toContain("transform:");
  });

  it("removes collapsed reading-mode chrome from workspace flow so the canvas stays pinned to the top", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const collapsedReadingHeaderRule = getCssRule(
      appUiStylesheet,
      '.app-workspace[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"] > .app-header[data-fishmark-region="workspace-header"][data-visibility="collapsed"]'
    );
    const collapsedReadingStatusBarRule = getCssRule(
      appUiStylesheet,
      '.app-workspace[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"] > .app-status-bar[data-fishmark-region="app-status-bar"][data-visibility="collapsed"]'
    );

    expect(collapsedReadingHeaderRule).toContain("display: none;");
    expect(collapsedReadingStatusBarRule).toContain("display: none;");
  });

  it("defines compact icon rail tool styles and tooltip positioning", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const appSource = readFileSync(join(process.cwd(), "src/renderer/editor/App.tsx"), "utf-8");
    const railRule = getCssRule(appUiStylesheet, ".app-rail");
    const stripRule = getCssRule(appUiStylesheet, ".table-tool-strip");
    const buttonRule = getCssRule(appUiStylesheet, ".table-tool-button");
    const tooltipRule = getCssRule(appUiStylesheet, ".table-tool-tooltip");
    const dangerRule = getCssRule(appUiStylesheet, '.table-tool-button[data-tone="danger"]');

    expect(railRule).toContain("z-index: var(--fishmark-z-shell);");
    expect(appUiStylesheet).not.toContain(".app-layout > .app-rail");
    expect(stripRule).toContain("justify-items: center;");
    expect(buttonRule).toContain("inline-size: 44px;");
    expect(buttonRule).toContain("block-size: 44px;");
    expect(tooltipRule).toContain("position: absolute;");
    expect(tooltipRule).toContain("left: calc(100% + var(--fishmark-space-2));");
    expect(tooltipRule).toContain("transform: translateY(-50%);");
    expect(tooltipRule).toContain("z-index: 3;");
    expect(appSource).not.toContain('data-fishmark-region="table-tool-tooltip-layer"');
    expect(dangerRule).toContain("color:");
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

    expect(window.fishmark.updatePreferences).toHaveBeenCalledWith({
      document: { fontFamily: "Segoe UI" }
    });

    await act(async () => {
      if (documentCjkFontSelect) {
        documentCjkFontSelect.value = "霞鹜文楷";
        documentCjkFontSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await Promise.resolve();
    });

    expect(window.fishmark.updatePreferences).toHaveBeenCalledWith({
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

    expect(container.querySelector('[data-fishmark-panel="settings-drawer"]')?.textContent).toContain(
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
      document.documentElement.style.getPropertyValue("--fishmark-theme-parameter-workspaceGlassOpacity")
    ).toBe("0.35");
    expect(document.documentElement.style.getPropertyValue("--fishmark-theme-parameter-rainAmount")).toBe(
      "0.4"
    );
    expect(
      document.documentElement.style.getPropertyValue("--fishmark-theme-parameter-enableLightning")
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
      document.documentElement.style.getPropertyValue("--fishmark-theme-parameter-workspaceGlassOpacity")
    ).toBe("");
    expect(document.documentElement.style.getPropertyValue("--fishmark-theme-parameter-rainAmount")).toBe(
      ""
    );
    expect(
      document.documentElement.style.getPropertyValue("--fishmark-theme-parameter-enableLightning")
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
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.readingMode)).toBe(
      "1"
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

  it("styles shell and markdown surfaces through formal semantic slots", async () => {
    await renderAndOpenDocument({
      getPreferencesResult: {
        ...DEFAULT_PREFERENCES,
        theme: {
          ...DEFAULT_PREFERENCES.theme,
          mode: "dark"
        }
      }
    });

    const baseStylesheet = readFileSync(baseStylesheetPath, "utf-8");
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const primitivesStylesheet = readFileSync(primitivesStylesheetPath, "utf-8");
    const editorStylesheet = readFileSync(join(process.cwd(), "src/renderer/styles/editor-source.css"), "utf-8");
    const markdownStylesheet = readFileSync(markdownRenderStylesheetPath, "utf-8");
    const settingsStylesheet = readFileSync(settingsStylesheetPath, "utf-8");

    expect(document.documentElement.getAttribute(THEME_RUNTIME_THEME_MODE_ATTRIBUTE)).toBe("dark");
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.wordCount)).toBe(
      "6"
    );
    expect(baseStylesheet).toContain("--fishmark-app-bg");
    expect(baseStylesheet).toContain("--fishmark-markdown-table-border");
    expect(baseStylesheet).toContain("--fishmark-markdown-code-token-keyword");
    expect(appUiStylesheet).toContain("var(--fishmark-titlebar-bg");
    expect(appUiStylesheet).toContain("var(--fishmark-panel-bg");
    expect(appUiStylesheet).toContain("var(--fishmark-control-bg");
    expect(appUiStylesheet).not.toContain("var(--fishmark-surface-bg");
    expect(appUiStylesheet).not.toContain("var(--fishmark-text-body");
    expect(settingsStylesheet).toContain("var(--fishmark-panel-bg");
    expect(primitivesStylesheet).not.toContain("--yu-ctrl-");
    expect(primitivesStylesheet).not.toContain("--yu-input-");
    expect(primitivesStylesheet).not.toContain("--yu-segment-");
    expect(editorStylesheet).toContain("var(--fishmark-editor-bg");
    expect(editorStylesheet).toContain("var(--fishmark-selection-bg");
    expect(editorStylesheet).toContain("var(--fishmark-caret-color");
    expect(markdownStylesheet).toContain("var(--fishmark-markdown-heading");
    expect(markdownStylesheet).toContain("var(--fishmark-markdown-code-bg");
    expect(markdownStylesheet).toContain("var(--fishmark-markdown-code-token-keyword");
  });

  it("marks settings as a floating drawer overlay surface", async () => {
    const driver = await renderEditorApp();
    await driver.openSettings();

    const overlay = container.querySelector<HTMLElement>('[data-fishmark-dialog="settings-drawer"]');
    const drawerPanel = container.querySelector<HTMLElement>('[data-fishmark-panel="settings-drawer"]');

    expect(overlay?.getAttribute("data-fishmark-overlay-style")).toBe("floating-drawer");
    expect(drawerPanel?.getAttribute("data-fishmark-surface")).toBe("floating-drawer");
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
    const baseStylesheet = readFileSync(baseStylesheetPath, "utf-8");
    const appSource = readFileSync(join(process.cwd(), "src/renderer/editor/App.tsx"), "utf-8");

    expect(appUiStylesheet).toContain("--fishmark-outline-column-width: 0px;");
    expect(appUiStylesheet).toContain("grid-template-columns: minmax(0, 1fr) var(--fishmark-outline-column-width);");
    expect(appUiStylesheet).toContain("transition:");
    expect(appUiStylesheet).toContain("grid-template-columns 220ms var(--fishmark-ease-standard)");
    expect(baseStylesheet).toContain("--fishmark-ease-standard: cubic-bezier(0.2, 0.85, 0.2, 1);");
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

  it("keeps the reading shell full width so the scrollbar and outline controls stay on the far right", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8").replace(/\r\n/g, "\n");

    expect(appUiStylesheet).toContain(
      '.workspace-canvas[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"] {\n  width: 100%;\n  max-width: none;\n  margin: 0;\n}'
    );
    expect(appUiStylesheet).toContain(
      '.workspace-canvas[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"] .workspace-shell {\n  width: 100%;\n  max-width: none;\n  margin: 0;\n}'
    );
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

    expect(baseStylesheet).toContain('font-family: var(--fishmark-ui-font-family, "Times New Roman")');
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
    expect(shellRule).toContain("grid-template-rows: var(--fishmark-titlebar-height) minmax(0, 1fr);");
    expect(layoutRule).toContain("grid-row: 2;");
    expect(workspaceRule).toContain("height: 100%;");
    expect(workspaceRule).toContain("overflow: hidden;");
    expect(titlebarRule).toContain("min-height: var(--fishmark-titlebar-height);");
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
    const editorContentRule = getCssRule(editorStylesheet, ".document-editor .cm-content");

    expect(appUiStylesheet).toContain(".workspace-canvas");
    expect(appUiStylesheet).toContain("width: 100%;");
    expect(appUiStylesheet).toContain("max-width: none;");
    expect(editorStylesheet).toContain(".document-editor .cm-content");
    expect(editorContentRule).toContain("width: 100%;");
    expect(editorContentRule).toContain("box-sizing: border-box;");
    expect(editorContentRule).toContain("padding: 40px clamp(64px, 12vw, 220px) 56px;");
    expect(editorContentRule).not.toContain("padding: 40px clamp(48px, 9vw, 160px) 56px;");
    expect(editorContentRule).not.toContain("padding: 40px 48px 56px;");
    expect(editorContentRule).not.toContain("max-width: 72ch;");
  });

  it("keeps the reading-mode scroll surface full width so the scrollbar and outline stay pinned right", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const readingCanvasRule = getCssRule(
      appUiStylesheet,
      '.workspace-canvas[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"]'
    );
    const readingShellRule = getCssRule(
      appUiStylesheet,
      '.workspace-canvas[data-fishmark-shell-mode="reading"][data-fishmark-has-document="true"] .workspace-shell'
    );

    expect(readingCanvasRule).not.toContain("width: min(100%, var(--fishmark-workspace-max-width));");
    expect(readingCanvasRule).not.toContain("margin: 0 auto;");
    expect(readingShellRule).not.toContain("max-width: min(100%, 960px);");
    expect(readingShellRule).not.toContain("margin: 0 auto;");
  });

  it("styles theme surfaces as non-interactive workspace backgrounds", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");

    expect(appUiStylesheet).toContain(".theme-surface-host");
    expect(appUiStylesheet).toContain("position: absolute;");
    expect(appUiStylesheet).toContain("pointer-events: none;");
    expect(appUiStylesheet).toContain(".theme-surface-canvas");
    expect(appUiStylesheet).toContain("display: block;");
  });

  it("keeps bundled shader themes aligned to the shared workspace shell layout", () => {
    const themeUiStylesheets = [
      readFileSync(rainGlassUiStylesheetPath, "utf-8").replace(/\r\n/g, "\n"),
      readFileSync(emberAscendUiStylesheetPath, "utf-8").replace(/\r\n/g, "\n"),
      readFileSync(pearlDriftUiStylesheetPath, "utf-8").replace(/\r\n/g, "\n")
    ] as const;

    const [rainGlassUiStylesheet, emberAscendUiStylesheet, pearlDriftUiStylesheet] = themeUiStylesheets;

    for (const stylesheet of themeUiStylesheets) {
      expect(stylesheet).not.toContain('[data-fishmark-layout="workspace"].app-workspace');
      expect(stylesheet).not.toContain('[data-fishmark-layout="workspace"] .app-status-bar');
      expect(stylesheet).toContain(".document-editor {");
      expect(stylesheet).toContain("backdrop-filter:");
    }

    const rainGlassHeaderRule = getCssRule(
      rainGlassUiStylesheet,
      '[data-fishmark-layout="workspace"] .workspace-header'
    );
    const rainGlassEditorRule = getCssRule(rainGlassUiStylesheet, ".document-editor");
    const emberHeaderRule = getCssRule(
      emberAscendUiStylesheet,
      '[data-fishmark-layout="workspace"] .workspace-header'
    );
    const emberEditorRule = getCssRule(emberAscendUiStylesheet, ".document-editor");
    const pearlHeaderRule = getCssRule(
      pearlDriftUiStylesheet,
      '[data-fishmark-layout="workspace"] .workspace-header'
    );
    const pearlEditorRule = getCssRule(pearlDriftUiStylesheet, ".document-editor");

    expect(rainGlassHeaderRule).not.toContain("width:");
    expect(rainGlassHeaderRule).not.toContain("margin:");
    expect(rainGlassEditorRule).not.toContain("width:");
    expect(rainGlassEditorRule).not.toContain("height:");
    expect(rainGlassEditorRule).not.toContain("margin:");
    expect(rainGlassEditorRule).not.toContain("padding:");
    expect(rainGlassEditorRule).not.toContain("grid-template-rows:");
    expect(rainGlassEditorRule).not.toContain("gap:");
    expect(emberHeaderRule).not.toContain("width:");
    expect(emberHeaderRule).not.toContain("margin:");
    expect(emberEditorRule).not.toContain("width:");
    expect(emberEditorRule).not.toContain("height:");
    expect(emberEditorRule).not.toContain("margin:");
    expect(emberEditorRule).not.toContain("padding:");
    expect(emberEditorRule).not.toContain("grid-template-rows:");
    expect(emberEditorRule).not.toContain("gap:");
    expect(pearlHeaderRule).not.toContain("width:");
    expect(pearlHeaderRule).not.toContain("margin:");
    expect(pearlEditorRule).not.toContain("width:");
    expect(pearlEditorRule).not.toContain("height:");
    expect(pearlEditorRule).not.toContain("margin:");
    expect(pearlEditorRule).not.toContain("padding:");
    expect(pearlEditorRule).not.toContain("grid-template-rows:");
    expect(pearlEditorRule).not.toContain("gap:");
  });

  it("removes border framing from the editor shell and bottom status bar", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const documentEditorRule =
      appUiStylesheet.match(/\.document-editor \{\s+width: 100%;[\s\S]*?\n\}/m)?.[0] ?? "";
    const appStatusBarRule =
      appUiStylesheet.match(/\.app-status-bar \{\s+position: fixed;[\s\S]*?\n\}/m)?.[0] ?? "";
    const statusStripRule =
      appUiStylesheet.match(
        /\.app-status-bar \[data-fishmark-region="status-strip"\] \{\s+width: 100%;[\s\S]*?\n\}/m
      )?.[0] ?? "";

    expect(documentEditorRule).toContain("background: var(--fishmark-editor-bg, transparent);");
    expect(documentEditorRule).not.toContain("border:");
    expect(documentEditorRule).not.toContain("box-shadow:");
    expect(appStatusBarRule).not.toContain("border:");
    expect(appStatusBarRule).toContain("background: transparent;");
    expect(appStatusBarRule).not.toContain("box-shadow:");
    expect(appStatusBarRule).not.toContain("backdrop-filter:");
    expect(statusStripRule).toContain("background: transparent;");
    expect(statusStripRule).not.toContain("border:");
  });

  it("does not paint active paragraphs with block fills or accent rails", () => {
    const markdownRenderStylesheet = readFileSync(markdownRenderStylesheetPath, "utf-8");
    const activeParagraphRule = getCssRule(markdownRenderStylesheet, ".document-editor .cm-active-paragraph");

    expect(activeParagraphRule).toContain("color: var(--fishmark-editor-fg, var(--fishmark-markdown-body, #31353d));");
    expect(activeParagraphRule).not.toContain("background:");
    expect(activeParagraphRule).not.toContain("box-shadow:");
  });

  it("styles preferences as a semi-transparent glass drawer", () => {
    const settingsStylesheet = readFileSync(settingsStylesheetPath, "utf-8").replace(/\r\n/g, "\n");

    expect(settingsStylesheet).toContain(
      "background: color-mix(in srgb, var(--fishmark-scrim, rgba(15, 18, 24, 0.12)) 72%, transparent);"
    );
    expect(settingsStylesheet).toContain("backdrop-filter: blur(28px) saturate(1.12);");
    expect(settingsStylesheet).toContain(".settings-shell::before");
    expect(settingsStylesheet).toContain('.settings-shell[data-state="closing"]');
    expect(settingsStylesheet).toContain("@keyframes settings-drawer-exit");
    expect(settingsStylesheet).toContain("@keyframes settings-overlay-exit");
    expect(settingsStylesheet).toContain(
      "background: var(--fishmark-panel-bg, rgba(255, 255, 255, 0.92));"
    );
    expect(settingsStylesheet).toContain(
      "background: color-mix(\n    in srgb,\n    var(--fishmark-panel-bg, rgba(255, 255, 255, 0.92)) 92%,"
    );
    expect(settingsStylesheet).toContain(
      "border: 1px solid var(--fishmark-panel-border, rgba(15, 23, 42, 0.12));"
    );
    expect(settingsStylesheet).toContain(
      "background: color-mix(\n    in srgb,\n    var(--fishmark-panel-bg, rgba(255, 255, 255, 0.92)) 92%,"
    );
  });

  it("defines themed option styling for settings dropdown menus", () => {
    const primitivesStylesheet = readFileSync(primitivesStylesheetPath, "utf-8");

    expect(primitivesStylesheet).toContain(".settings-select option");
    expect(primitivesStylesheet).toContain(".settings-select optgroup");
    expect(primitivesStylesheet).toContain(
      "background-color: color-mix(in srgb, var(--fishmark-panel-bg) 94%, transparent);"
    );
    expect(primitivesStylesheet).toContain("color: var(--fishmark-text-secondary);");
    expect(primitivesStylesheet).toContain("color: var(--fishmark-text-muted);");
  });

  it("routes welcome card copy and the rail settings button through theme-specific ui tokens", () => {
    const appUiStylesheet = readFileSync(appUiStylesheetPath, "utf-8");
    const primitivesStylesheet = readFileSync(primitivesStylesheetPath, "utf-8");
    const welcomeHeadingRule = getCssRule(appUiStylesheet, ".empty-inner h1");
    const welcomeKickerRule = getCssRule(appUiStylesheet, ".empty-kicker");
    const welcomeCopyRule = getCssRule(appUiStylesheet, ".empty-copy");
    const welcomeMetaRule = getCssRule(appUiStylesheet, ".empty-meta");
    const settingsEntryRule = getCssRule(primitivesStylesheet, ".settings-entry");
    const settingsEntryHoverRule = getCssRule(primitivesStylesheet, ".settings-entry:hover");

    expect(welcomeHeadingRule).toContain("color: var(--fishmark-welcome-heading, var(--fishmark-text-primary, #171a1f));");
    expect(welcomeKickerRule).toContain("color: var(--fishmark-welcome-kicker, var(--fishmark-text-muted, #687180));");
    expect(welcomeCopyRule).toContain("color: var(--fishmark-welcome-copy, var(--fishmark-text-muted, #687180));");
    expect(welcomeMetaRule).toContain("border: 1px solid var(--fishmark-welcome-meta-border, var(--fishmark-panel-border, rgba(15, 23, 42, 0.12)));");
    expect(welcomeMetaRule).toContain("background: var(--fishmark-welcome-meta-bg, transparent);");
    expect(welcomeMetaRule).toContain("color: var(--fishmark-welcome-meta-text, var(--fishmark-text-muted, #687180));");
    expect(settingsEntryRule).toContain("border: 1px solid var(--fishmark-rail-control-border, var(--fishmark-control-border));");
    expect(settingsEntryRule).toContain("background: var(--fishmark-rail-control-bg, var(--fishmark-control-bg));");
    expect(settingsEntryRule).toContain("color: var(--fishmark-rail-control-fg, var(--fishmark-control-fg));");
    expect(settingsEntryHoverRule).toContain("--fishmark-rail-control-border-hover");
    expect(settingsEntryHoverRule).toContain("background: var(--fishmark-rail-control-bg-hover, var(--fishmark-control-bg-hover));");
    expect(settingsEntryHoverRule).toContain("color: var(--fishmark-rail-control-fg-hover, var(--fishmark-text-primary));");
  });

  it("defines welcome card and rail button ui tokens for bundled and fixture themes", () => {
    const defaultUiStylesheet = readFileSync(defaultUiStylesheetPath, "utf-8");
    const rainGlassUiStylesheet = readFileSync(rainGlassUiStylesheetPath, "utf-8");
    const pearlDriftUiStylesheet = readFileSync(pearlDriftUiStylesheetPath, "utf-8");
    const emberAscendUiStylesheet = readFileSync(emberAscendUiStylesheetPath, "utf-8");
    const pearlDarkRule = getCssRule(
      pearlDriftUiStylesheet,
      ':root[data-fishmark-theme-mode="dark"]'
    );

    for (const stylesheet of [
      defaultUiStylesheet,
      rainGlassUiStylesheet,
      pearlDriftUiStylesheet,
      emberAscendUiStylesheet
    ]) {
      expect(stylesheet).toContain("--fishmark-welcome-heading:");
      expect(stylesheet).toContain("--fishmark-welcome-copy:");
      expect(stylesheet).toContain("--fishmark-welcome-meta-border:");
      expect(stylesheet).toContain("--fishmark-rail-control-bg:");
      expect(stylesheet).toContain("--fishmark-rail-control-bg-hover:");
      expect(stylesheet).toContain("--fishmark-rail-control-border:");
      expect(stylesheet).toContain("--fishmark-rail-control-fg:");
    }

    expect(pearlDarkRule).toContain("--fishmark-welcome-heading:");
    expect(pearlDarkRule).toContain("--fishmark-rail-control-bg:");
    expect(pearlDarkRule).toContain("--fishmark-rail-control-fg:");
  });

  it("keeps rain glass list and quote overrides aligned with the shared markdown structure tokens", () => {
    const rainGlassMarkdownStylesheet = readFileSync(
      join(process.cwd(), "fixtures/themes/rain-glass/styles/markdown.css"),
      "utf-8"
    );
    const rainGlassRootRule = getCssRule(rainGlassMarkdownStylesheet, ":root");
    const rainGlassUnorderedListMarkerRule = getCssRule(
      rainGlassMarkdownStylesheet,
      '[data-fishmark-region="workspace-canvas"] .document-editor .cm-inactive-list-unordered .cm-inactive-list-marker::before'
    );
    const rainGlassBlockquoteRule = getCssRule(
      rainGlassMarkdownStylesheet,
      '[data-fishmark-region="workspace-canvas"] .document-editor .cm-inactive-blockquote'
    );

    expect(rainGlassRootRule).toContain("--fishmark-list-marker-size:");
    expect(rainGlassRootRule).toContain("--fishmark-list-ordered-marker-width:");
    expect(rainGlassRootRule).toContain("--fishmark-task-size:");
    expect(rainGlassRootRule).toContain("--fishmark-blockquote-bg:");
    expect(rainGlassMarkdownStylesheet).not.toContain(
      '[data-fishmark-region="workspace-canvas"] .document-editor .cm-inactive-list-marker {'
    );
    expect(rainGlassMarkdownStylesheet).toContain(
      '[data-fishmark-region="workspace-canvas"] .document-editor .cm-inactive-list-ordered .cm-inactive-list-marker {'
    );
    expect(rainGlassUnorderedListMarkerRule).toContain("background: var(--fishmark-list-marker);");
    expect(rainGlassBlockquoteRule).toContain("background: var(--fishmark-blockquote-bg);");
    expect(rainGlassBlockquoteRule).toContain("box-shadow: inset 2px 0 0 var(--fishmark-blockquote-border);");
  });

  it("defines formal semantic text, control, editor, and markdown slots for bundled dark fixture themes", () => {
    const pearlDriftLightTokens = readFileSync(pearlDriftLightTokensPath, "utf-8");
    const pearlDriftDarkTokens = readFileSync(pearlDriftDarkTokensPath, "utf-8");
    const emberAscendDarkTokens = readFileSync(emberAscendDarkTokensPath, "utf-8");

    for (const stylesheet of [pearlDriftLightTokens, pearlDriftDarkTokens, emberAscendDarkTokens]) {
      expect(stylesheet).toContain("--fishmark-text-primary:");
      expect(stylesheet).toContain("--fishmark-text-secondary:");
      expect(stylesheet).toContain("--fishmark-control-bg:");
      expect(stylesheet).toContain("--fishmark-control-border:");
      expect(stylesheet).toContain("--fishmark-editor-fg:");
      expect(stylesheet).toContain("--fishmark-markdown-body:");
      expect(stylesheet).toContain("--fishmark-markdown-heading:");
      expect(stylesheet).toContain("--fishmark-markdown-strong:");
    }
  });

  it("keeps ember-ascend and pearl-drift workspace backgrounds translucent so workbench shaders stay visible", () => {
    const pearlDriftLightTokens = readFileSync(pearlDriftLightTokensPath, "utf-8");
    const pearlDriftDarkTokens = readFileSync(pearlDriftDarkTokensPath, "utf-8");
    const emberAscendDarkTokens = readFileSync(emberAscendDarkTokensPath, "utf-8");

    for (const stylesheet of [pearlDriftLightTokens, pearlDriftDarkTokens, emberAscendDarkTokens]) {
      const workspaceBackgroundMatch = stylesheet.match(
        /--fishmark-workspace-bg:\s*([^;]+);/
      );

      expect(workspaceBackgroundMatch?.[1]).toBeDefined();
      expect(workspaceBackgroundMatch?.[1]).toContain("transparent");
      expect(workspaceBackgroundMatch?.[1]?.trim()).not.toBe("var(--fishmark-surface-bg)");
    }
  });

  it("routes the default light markdown palette through formal semantic slots", () => {
    const lightMarkdownStylesheet = readFileSync(lightMarkdownStylesheetPath, "utf-8");
    const lightMarkdownRule = getCssRule(lightMarkdownStylesheet, ":root");

    expect(lightMarkdownRule).toContain("--fishmark-inline-code-bg: var(--fishmark-markdown-inline-code-bg);");
    expect(lightMarkdownRule).toContain("--fishmark-list-marker: var(--fishmark-markdown-list-bullet);");
    expect(lightMarkdownRule).toContain("--fishmark-code-block-bg: var(--fishmark-markdown-code-bg);");
    expect(lightMarkdownRule).toContain("--fishmark-code-block-text: var(--fishmark-markdown-code-fg);");
  });

  it("defines table theming tokens in the default markdown theme stylesheet", () => {
    const lightMarkdownStylesheet = readFileSync(lightMarkdownStylesheetPath, "utf-8");
    const lightMarkdownRule = getCssRule(lightMarkdownStylesheet, ":root");

    expect(lightMarkdownRule).toContain("--fishmark-table-bg:");
    expect(lightMarkdownRule).toContain("--fishmark-table-border-color:");
    expect(lightMarkdownRule).toContain("--fishmark-table-cell-active-bg:");
    expect(lightMarkdownRule).toContain("--fishmark-table-cell-min-height:");
    expect(lightMarkdownRule).toContain("--fishmark-table-header-font-weight:");
  });

  it("keeps bundled community theme fixtures on contract version 2 so they stay discoverable", () => {
    const pearlDriftManifest = JSON.parse(
      readFileSync(pearlDriftManifestPath, "utf-8")
    ) as { contractVersion?: number };
    const emberAscendManifest = JSON.parse(
      readFileSync(emberAscendManifestPath, "utf-8")
    ) as { contractVersion?: number };

    expect(pearlDriftManifest.contractVersion).toBe(2);
    expect(emberAscendManifest.contractVersion).toBe(2);
  });

  it("defines restrained list, task, and blockquote tokens in the default markdown theme stylesheet", () => {
    const lightMarkdownStylesheet = readFileSync(lightMarkdownStylesheetPath, "utf-8");
    const lightMarkdownRule = getCssRule(lightMarkdownStylesheet, ":root");

    expect(lightMarkdownRule).toContain("--fishmark-list-marker-size:");
    expect(lightMarkdownRule).toContain("--fishmark-list-ordered-marker-width:");
    expect(lightMarkdownRule).toContain("--fishmark-task-size:");
    expect(lightMarkdownRule).toContain("--fishmark-task-radius:");
    expect(lightMarkdownRule).toContain("--fishmark-blockquote-bg:");
    expect(lightMarkdownRule).toContain("--fishmark-blockquote-border:");
  });

  it("renders markdown lists and quotes with explicit markers instead of solid blocks", () => {
    const markdownRenderStylesheet = readFileSync(markdownRenderStylesheetPath, "utf-8");
    const listMarkerRule = getCssRule(markdownRenderStylesheet, ".document-editor .cm-inactive-list-marker");
    const unorderedListMarkerRule = getCssRule(
      markdownRenderStylesheet,
      ".document-editor .cm-inactive-list-unordered .cm-inactive-list-marker::before"
    );
    const orderedListMarkerRule = getCssRule(
      markdownRenderStylesheet,
      ".document-editor .cm-inactive-list-ordered .cm-inactive-list-marker"
    );
    const taskMarkerRule = getCssRule(markdownRenderStylesheet, ".document-editor .cm-inactive-task-marker::before");
    const blockquoteRule = getCssRule(markdownRenderStylesheet, ".document-editor .cm-inactive-blockquote");

    expect(listMarkerRule).not.toContain("background:");
    expect(unorderedListMarkerRule).toContain("width: var(--fishmark-list-marker-size);");
    expect(unorderedListMarkerRule).toContain("height: var(--fishmark-list-marker-size);");
    expect(unorderedListMarkerRule).toContain("background: var(--fishmark-list-marker);");
    expect(orderedListMarkerRule).toContain("min-width: var(--fishmark-list-ordered-marker-width);");
    expect(orderedListMarkerRule).toContain("font-variant-numeric: tabular-nums;");
    expect(taskMarkerRule).toContain("width: var(--fishmark-task-size);");
    expect(taskMarkerRule).toContain("height: var(--fishmark-task-size);");
    expect(taskMarkerRule).toContain("border-radius: var(--fishmark-task-radius);");
    expect(blockquoteRule).toContain("background: var(--fishmark-blockquote-bg);");
    expect(blockquoteRule).toContain("box-shadow: inset 2px 0 0 var(--fishmark-blockquote-border);");
  });

  it("renders code blocks with visual wrapping instead of a horizontal scrollbar", () => {
    const markdownRenderStylesheet = readFileSync(markdownRenderStylesheetPath, "utf-8");
    const codeBlockRule = getCssRule(markdownRenderStylesheet, ".document-editor .cm-inactive-code-block");

    expect(markdownRenderStylesheet).toContain(".document-editor .cm-inactive-code-block");
    expect(codeBlockRule).toContain("white-space: pre-wrap !important;");
    expect(codeBlockRule).toContain("overflow-x: hidden;");
    expect(markdownRenderStylesheet).not.toContain("white-space: pre !important;");
    expect(codeBlockRule).not.toContain("overflow-x: auto;");
  });

  it("renders table widgets through theme variables instead of hard-coded visual constants", () => {
    const markdownRenderStylesheet = readFileSync(markdownRenderStylesheetPath, "utf-8");

    expect(markdownRenderStylesheet).toContain("margin: var(--fishmark-table-margin-top) 0 var(--fishmark-table-margin-bottom);");
    expect(markdownRenderStylesheet).toContain("overflow-x: auto;");
    expect(markdownRenderStylesheet).toContain("table-layout: auto;");
    expect(markdownRenderStylesheet).toContain("background: var(--fishmark-table-bg);");
    expect(markdownRenderStylesheet).toContain("border-radius: var(--fishmark-table-radius);");
    expect(markdownRenderStylesheet).toContain("background: var(--fishmark-table-cell-active-bg);");
    expect(markdownRenderStylesheet).toContain("min-height: var(--fishmark-table-cell-min-height);");
    expect(markdownRenderStylesheet).toContain("font-weight: var(--fishmark-table-header-font-weight);");
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

    expect(window.fishmarkTest.completeEditorTestCommand).toHaveBeenCalledWith({
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
      makeManifestThemePackage({ id: "default", name: "FishMark Default", source: "builtin" }),
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
        .querySelector('link[data-fishmark-theme-part="tokens"]')
        ?.getAttribute("href")
    ).toBe(createPreviewAssetUrl("/tmp/fishmark/themes/default/tokens-dark.css"));
  });

  async function renderAndOpenDocument(options: RenderEditorAppOptions = {}): Promise<void> {
    await renderEditorApp(options);

    expect(menuCommandListener).not.toBeNull();

    await act(async () => {
      menuCommandListener?.("open-markdown-file");
      await Promise.resolve();
    });

    expect(openWorkspaceFile).toHaveBeenCalledTimes(1);
  }

  async function clickEditorContent(): Promise<void> {
    const editorSurface = container.querySelector<HTMLElement>('[data-testid="mock-code-editor"]');

    await act(async () => {
      editorSurface?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, clientX: 300 }));
      editorSurface?.focus();
      await Promise.resolve();
    });
  }

  function emitAppUpdateState(state: AppUpdateState): void {
    appUpdateStateListener?.(state);
  }

  function emitAppNotification(notification: AppNotification): void {
    appNotificationListener?.(notification);
  }

  function findButtonByText(text: string): HTMLButtonElement | null {
    return (
      [...container.querySelectorAll("button")].find(
        (element): element is HTMLButtonElement => element.textContent?.includes(text) ?? false
      ) ?? null
    );
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
