// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { DEFAULT_TEXT_SHORTCUT_GROUP } from "@fishmark/codemirror-adapter";
import { DEFAULT_PREFERENCES } from "../../shared/preferences";
import { WorkspaceShell } from "./WorkspaceShell";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let latestEditorOnChange: unknown;

vi.mock("../code-editor-view", () => ({
  CodeEditorView: (props: {
    initialContent: string;
    onChange?: (content: string, identity: {
      tabId: string;
      epoch: number;
      loadRevision: number;
    }) => void;
    viewMode?: "wysiwym" | "source";
  }) => {
    const { initialContent, onChange, viewMode } = props;
    latestEditorOnChange = onChange;
    return (
    createElement(
      "div",
      {
        "data-testid": "mock-code-editor",
        "data-view-mode": viewMode ?? "wysiwym"
      },
      createElement("textarea", {
        "aria-label": "Markdown editor",
        defaultValue: initialContent,
        readOnly: true
      }),
      createElement(
        "button",
        {
          type: "button",
          onClick: () => onChange?.("# Changed\n", {
            tabId: "tab-1",
            epoch: 1,
            loadRevision: 1
          })
        },
        "Change draft"
      )
    ));
  }
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  root = null;
  latestEditorOnChange = undefined;
  container?.remove();
  container = null;
});

function setTextInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function readSharedFishMarkSvg() {
  const sharedMarkPath = path.join(process.cwd(), "assets", "branding", "fishmark_mark.svg");

  expect(existsSync(sharedMarkPath)).toBe(true);

  return readFileSync(sharedMarkPath, "utf8");
}

function readSvgFingerprint(svg: SVGSVGElement | string) {
  const parsedSvg = typeof svg === "string"
    ? new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("svg")
    : svg;

  if (!parsedSvg) {
    throw new Error("FishMark mark SVG was not found.");
  }

  return {
    viewBox: parsedSvg.getAttribute("viewBox"),
    fill: parsedSvg.querySelector("g")?.getAttribute("fill"),
    paths: Array.from(parsedSvg.querySelectorAll("path")).map((element) => element.getAttribute("d"))
  };
}

it("renders workspace tabs and delegates commands without owning persistence logic", async () => {
  const onTabActivate = vi.fn();
  const onDocumentChangeFrame = vi.fn();
  const onDiscardedDocumentText = vi.fn();
  const onPendingDocumentChangesChange = vi.fn();
  const onNavigateToOutlineItem = vi.fn();
  const onToggleViewContainer = vi.fn();
  const onEditorViewModeChange = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      createElement(WorkspaceShell, {
        workspaceSnapshot: {
          windowId: "window-1",
          activeTabId: "tab-1",
          tabs: [
            {
              tabId: "tab-1",
              path: "C:/note.md",
              name: "note.md",
              isDirty: true,
              saveState: "idle"
            },
            {
              tabId: "tab-2",
              path: "C:/draft.md",
              name: "draft.md",
              isDirty: false,
              saveState: "idle"
            }
          ],
          activeDocument: {
            tabId: "tab-1",
            path: "C:/note.md",
            name: "note.md",
            content: "# Note\n",
            encoding: "utf-8",
            revision: 1,
            savedRevision: 0,
            isDirty: true,
            saveState: "idle"
          }
        },
        activeShortcutGroup: DEFAULT_TEXT_SHORTCUT_GROUP,
        activeTableToolId: null,
        appVersionLabel: "FishMark v0.0.0-test",
        appUpdateStatusLabel: null,
        controlledTitlebarEnabled: false,
        currentDocumentMetrics: { meaningfulCharacterCount: 6 },
        effectiveSaveState: "idle",
        externalFileState: { status: "idle" },
        externalFileConflictMessage: "",
        fishmarkPlatform: "win32",
        fontFamilies: [],
        headerTitle: "note.md",
        isDocumentOpen: true,
        activeViewContainer: "outline",
        closingViewContainer: null,
        isReadingMode: false,
        isRefreshingThemePackages: false,
        isSettingsDrawerVisible: false,
        isSettingsOpen: false,
        isShortcutHintVisible: false,
        notification: null,
        notificationState: "hidden",
        outlineItems: [
          {
            id: "heading-1",
            label: "A heading",
            depth: 1,
            startOffset: 3,
            startLine: 1
          }
        ],
        recentFiles: { version: 1, entries: [] },
        preferences: DEFAULT_PREFERENCES,
        saveStatusLabel: "Unsaved changes",
        shellMode: "editing",
        sidePanelStoredWidth: null,
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
        editorEpoch: 1,
        editorTransition: null,
        editorViewMode: "wysiwym",
        editorRef: { current: null },
        editorContainerRef: { current: null },
        settingsEntryRef: { current: null },
        activeWorkbenchSurface: null,
        activeTitlebarSurface: null,
        preferencesThemeEffectsMode: "auto",
        resolvedThemeMode: "light",
        themeRuntimeEnv: {
          wordCount: 6,
          readingMode: 0,
          themeMode: "light",
          viewport: { width: 1024, height: 768 }
        },
        themePackages: [],
        titlebarLayout: {
          height: 0,
          slots: {
            leading: [],
            center: [],
            trailing: []
          },
          dragRegions: [],
          compactWhenNarrow: false
        },
        onActiveBlockChange: vi.fn(),
        onAppWorkspaceMouseDownCapture: vi.fn(),
        onCaptureSettingsOpenOrigin: vi.fn(),
        onCloseViewContainer: vi.fn(),
        onCloseSettingsDrawer: vi.fn(),
        onCloseWorkspaceTab: vi.fn(),
        onEditorBlur: vi.fn(),
        onEditorViewModeChange,
        onImportClipboardImage: vi.fn(),
        onOpenExternalLink: vi.fn(),
        onInsertTableColumnLeft: vi.fn(),
        onInsertTableColumnRight: vi.fn(),
        onInsertTableRowAbove: vi.fn(),
        onInsertTableRowBelow: vi.fn(),
        onDeleteTable: vi.fn(),
        onDeleteTableColumn: vi.fn(),
        onDeleteTableRow: vi.fn(),
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
        onSidePanelWidthCommit: vi.fn(),
        onTableToolHoverChange: vi.fn(),
        onTabActivate,
        onTabDragEnd: vi.fn(),
        onTabDragOver: vi.fn(),
        onTabDragStart: vi.fn(),
        onTabDrop: vi.fn(),
        onTitlebarSurfaceRuntimeModeChange: vi.fn(),
        onUpdatePreferences: vi.fn(),
        onRefreshThemePackages: vi.fn(),
        onOpenRecentFile: vi.fn(),
        onClearRecentFile: vi.fn(),
        onWorkbenchSurfaceRuntimeModeChange: vi.fn(),
        onToggleViewContainer,
        onNavigateToOutlineItem,
        onDocumentChangeFrame,
        onDiscardedDocumentText,
        onPendingDocumentChangesChange,
        onEditorBarrierChange: vi.fn(),
        onEditorTransitionApplied: vi.fn(),
        onEditorLoadRevisionApplied: vi.fn()
      })
    );
  });

  const buttons = Array.from(container.querySelectorAll("button"));

  await act(async () => {
    buttons.find((button) => button.textContent?.includes("draft.md"))?.click();
  });

  await act(async () => {
    buttons.find((button) => button.textContent === "A heading")?.click();
  });

  const viewModeToggle = container.querySelector<HTMLButtonElement>(
    '[aria-label="Switch to source mode"]'
  );

  expect(viewModeToggle).not.toBeNull();
  expect(viewModeToggle?.textContent).toBe("</>");
  expect(viewModeToggle?.getAttribute("aria-pressed")).toBe("false");
  expect(container.querySelector('[data-testid="mock-code-editor"]')?.getAttribute("data-view-mode"))
    .toBe("wysiwym");

  await act(async () => {
    viewModeToggle?.click();
  });

  expect(onTabActivate).toHaveBeenCalledWith("tab-2");
  expect(latestEditorOnChange).toBeUndefined();
  expect(onNavigateToOutlineItem).toHaveBeenCalledWith(3);
  expect(onEditorViewModeChange).toHaveBeenCalledWith("source");
  expect(container.querySelector('[data-fishmark-region="workspace-header"]')).toBeNull();
  expect(container.querySelector('[data-fishmark-region="workspace-tab"]')?.getAttribute("title"))
    .toBe("C:/note.md");

  const findRailButton = container.querySelector<HTMLButtonElement>(
    '[data-fishmark-command="find-replace"]'
  );
  const outlineRailButton = container.querySelector<HTMLButtonElement>(
    '[data-fishmark-command="outline"]'
  );
  const sidePanel = container.querySelector<HTMLElement>('[data-fishmark-region="side-panel"]');

  // The rail owns the shared side panel: the expanded view reports `aria-pressed`.
  expect(outlineRailButton).not.toBeNull();
  expect(outlineRailButton?.getAttribute("aria-pressed")).toBe("true");
  // Search is the region's second view container, so its rail button carries
  // the same pressed contract as the outline button.
  expect(findRailButton).not.toBeNull();
  expect(findRailButton?.getAttribute("aria-pressed")).toBe("false");
  expect(sidePanel?.dataset.viewContainer).toBe("outline");
  expect(sidePanel?.dataset.state).toBe("open");
  expect(sidePanel?.querySelector('[data-fishmark-region="outline-panel"]')).not.toBeNull();
  // The outline is now a view container of the shared region, not its own drawer.
  expect(sidePanel?.querySelector(".side-panel-header")?.textContent).toContain("Outline");
  expect(container.querySelector(".outline-entry")).toBeNull();
  expect(container.querySelector('[data-fishmark-region="outline-panel-header"]')).toBeNull();
  expect(container.querySelector('[data-fishmark-region="outline-toggle"]')).toBeNull();

  await act(async () => {
    findRailButton?.click();
  });

  expect(onToggleViewContainer).toHaveBeenCalledWith("search");

  await act(async () => {
    outlineRailButton?.click();
  });

  expect(onToggleViewContainer).toHaveBeenCalledWith("outline");
});

it("opens find and replace controls and delegates search actions to the editor", async () => {
  const updateFindReplaceQuery = vi.fn(() => ({
    matchCount: 2,
    currentMatchIndex: 1
  }));
  const findNextMatch = vi.fn(() => ({
    matchCount: 2,
    currentMatchIndex: 2
  }));
  const replaceCurrentMatch = vi.fn(() => ({
    matchCount: 1,
    currentMatchIndex: 1
  }));
  const replaceAllMatches = vi.fn(() => ({
    matchCount: 0,
    currentMatchIndex: null
  }));
  const clearFindReplaceQuery = vi.fn(() => ({
    matchCount: 0,
    currentMatchIndex: null
  }));
  const onCloseViewContainer = vi.fn();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      createElement(WorkspaceShell, {
        workspaceSnapshot: {
          windowId: "window-1",
          activeTabId: "tab-1",
          tabs: [
            {
              tabId: "tab-1",
              path: "C:/note.md",
              name: "note.md",
              isDirty: false,
              saveState: "idle"
            }
          ],
          activeDocument: {
            tabId: "tab-1",
            path: "C:/note.md",
            name: "note.md",
            content: "alpha beta\nBeta alpha\n",
            encoding: "utf-8",
            revision: 0,
            savedRevision: 0,
            isDirty: false,
            saveState: "idle"
          }
        },
        activeShortcutGroup: DEFAULT_TEXT_SHORTCUT_GROUP,
        activeTableToolId: null,
        appVersionLabel: "FishMark v0.0.0-test",
        appUpdateStatusLabel: null,
        controlledTitlebarEnabled: false,
        currentDocumentMetrics: { meaningfulCharacterCount: 21 },
        effectiveSaveState: "idle",
        externalFileState: { status: "idle" },
        externalFileConflictMessage: "",
        fishmarkPlatform: "win32",
        fontFamilies: [],
        headerTitle: "note.md",
        isDocumentOpen: true,
        activeViewContainer: "search",
        closingViewContainer: null,
        isReadingMode: false,
        isRefreshingThemePackages: false,
        isSettingsDrawerVisible: false,
        isSettingsOpen: false,
        isShortcutHintVisible: false,
        notification: null,
        notificationState: "hidden",
        outlineItems: [],
        recentFiles: { version: 1, entries: [] },
        preferences: DEFAULT_PREFERENCES,
        saveStatusLabel: "All changes saved",
        shellMode: "editing",
        sidePanelStoredWidth: null,
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
        editorEpoch: 1,
        editorTransition: null,
        editorViewMode: "wysiwym",
        editorRef: {
          current: {
            getContent: vi.fn(),
            getSelection: vi.fn(),
            setContent: vi.fn(),
            setDocumentPath: vi.fn(),
            focus: vi.fn(),
            navigateToOffset: vi.fn(),
            insertText: vi.fn(),
            setSelection: vi.fn(),
            selectTableCell: vi.fn(),
            editTableCell: vi.fn(),
            insertTableRowAbove: vi.fn(),
            insertTableRowBelow: vi.fn(),
            insertTableColumnLeft: vi.fn(),
            insertTableColumnRight: vi.fn(),
            deleteTableRow: vi.fn(),
            deleteTableColumn: vi.fn(),
            deleteTable: vi.fn(),
            pressEnter: vi.fn(),
            pressBackspace: vi.fn(),
            pressTab: vi.fn(),
            pressArrowUp: vi.fn(),
            pressArrowDown: vi.fn(),
            setViewMode: vi.fn(),
            updateFindReplaceQuery,
            findNextMatch,
            findPreviousMatch: vi.fn(),
            replaceCurrentMatch,
            replaceAllMatches,
            clearFindReplaceQuery
          }
        },
        editorContainerRef: { current: null },
        settingsEntryRef: { current: null },
        activeWorkbenchSurface: null,
        activeTitlebarSurface: null,
        preferencesThemeEffectsMode: "auto",
        resolvedThemeMode: "light",
        themeRuntimeEnv: {
          wordCount: 21,
          readingMode: 0,
          themeMode: "light",
          viewport: { width: 1024, height: 768 }
        },
        themePackages: [],
        titlebarLayout: {
          height: 0,
          slots: {
            leading: [],
            center: [],
            trailing: []
          },
          dragRegions: [],
          compactWhenNarrow: false
        },
        onActiveBlockChange: vi.fn(),
        onAppWorkspaceMouseDownCapture: vi.fn(),
        onCaptureSettingsOpenOrigin: vi.fn(),
        onCloseViewContainer,
        onCloseSettingsDrawer: vi.fn(),
        onCloseWorkspaceTab: vi.fn(),
        onEditorBlur: vi.fn(),
        onEditorViewModeChange: vi.fn(),
        onImportClipboardImage: vi.fn(),
        onOpenExternalLink: vi.fn(),
        onInsertTableColumnLeft: vi.fn(),
        onInsertTableColumnRight: vi.fn(),
        onInsertTableRowAbove: vi.fn(),
        onInsertTableRowBelow: vi.fn(),
        onDeleteTable: vi.fn(),
        onDeleteTableColumn: vi.fn(),
        onDeleteTableRow: vi.fn(),
        onToggleViewContainer: vi.fn(),
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
        onSidePanelWidthCommit: vi.fn(),
        onTableToolHoverChange: vi.fn(),
        onTabActivate: vi.fn(),
        onTabDragEnd: vi.fn(),
        onTabDragOver: vi.fn(),
        onTabDragStart: vi.fn(),
        onTabDrop: vi.fn(),
        onTitlebarSurfaceRuntimeModeChange: vi.fn(),
        onUpdatePreferences: vi.fn(),
        onRefreshThemePackages: vi.fn(),
        onOpenRecentFile: vi.fn(),
        onClearRecentFile: vi.fn(),
        onWorkbenchSurfaceRuntimeModeChange: vi.fn(),
        onNavigateToOutlineItem: vi.fn(),
        onDocumentChangeFrame: vi.fn(),
        onDiscardedDocumentText: vi.fn(),
        onPendingDocumentChangesChange: vi.fn(),
        onEditorBarrierChange: vi.fn(),
        onEditorTransitionApplied: vi.fn(),
        onEditorLoadRevisionApplied: vi.fn()
      })
    );
  });

  const activeContainer = container;

  if (!activeContainer) {
    throw new Error("test container was not created");
  }

  const searchRailButton = activeContainer.querySelector<HTMLButtonElement>(
    '[data-fishmark-command="find-replace"]'
  );

  // The search view container reports the same pressed state as the outline.
  expect(searchRailButton?.getAttribute("aria-pressed")).toBe("true");

  const sidePanel = activeContainer.querySelector<HTMLElement>('[data-fishmark-region="side-panel"]');
  const panel = activeContainer.querySelector('[data-fishmark-region="search"]');
  const findInput = activeContainer.querySelector<HTMLInputElement>('[aria-label="Find text"]');
  const replaceInput = activeContainer.querySelector<HTMLInputElement>('[aria-label="Replace with"]');

  // Search is a view container of the shared region, not a floating bar in the
  // document column, and it holds the region's `search` hook.
  expect(sidePanel?.dataset.viewContainer).toBe("search");
  expect(sidePanel?.querySelector(".side-panel-header")?.textContent).toContain("Search");
  expect(panel).not.toBeNull();
  expect(findInput).not.toBeNull();
  expect(replaceInput).not.toBeNull();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Find text");

  await act(async () => {
    setTextInputValue(findInput!, "beta");
  });

  expect(updateFindReplaceQuery).toHaveBeenLastCalledWith({
    search: "beta",
    replace: ""
  });
  expect(panel?.textContent).toContain("1 / 2");

  await act(async () => {
    activeContainer.querySelector<HTMLButtonElement>('[aria-label="Next match"]')?.click();
  });

  expect(findNextMatch).toHaveBeenCalledTimes(1);
  expect(activeContainer.querySelector('[data-fishmark-region="search"]')?.textContent)
    .toContain("2 / 2");

  await act(async () => {
    setTextInputValue(replaceInput!, "gamma");
    activeContainer.querySelector<HTMLButtonElement>('[aria-label="Replace current match"]')?.click();
  });

  expect(replaceCurrentMatch).toHaveBeenCalledTimes(1);

  await act(async () => {
    activeContainer.querySelector<HTMLButtonElement>('[aria-label="Replace all matches"]')?.click();
  });

  expect(replaceAllMatches).toHaveBeenCalledTimes(1);

  await act(async () => {
    activeContainer.querySelector<HTMLButtonElement>('[aria-label="Collapse search"]')?.click();
  });

  // Collapsing the region collapses the shared panel and clears the editor's
  // search query, which stays the single source of truth for the search.
  expect(onCloseViewContainer).toHaveBeenCalledTimes(1);
  expect(clearFindReplaceQuery).toHaveBeenCalledTimes(1);
});

it("opens the Search view container from the Ctrl/Cmd+F shortcut", async () => {
  const onToggleViewContainer = vi.fn();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      createElement(WorkspaceShell, {
        workspaceSnapshot: {
          windowId: "window-1",
          activeTabId: "tab-1",
          tabs: [
            {
              tabId: "tab-1",
              path: "C:/note.md",
              name: "note.md",
              isDirty: false,
              saveState: "idle"
            }
          ],
          activeDocument: {
            tabId: "tab-1",
            path: "C:/note.md",
            name: "note.md",
            content: "alpha beta\n",
            encoding: "utf-8",
            revision: 0,
            savedRevision: 0,
            isDirty: false,
            saveState: "idle"
          }
        },
        activeShortcutGroup: DEFAULT_TEXT_SHORTCUT_GROUP,
        activeTableToolId: null,
        appVersionLabel: "FishMark v0.0.0-test",
        appUpdateStatusLabel: null,
        controlledTitlebarEnabled: false,
        currentDocumentMetrics: { meaningfulCharacterCount: 8 },
        effectiveSaveState: "idle",
        externalFileState: { status: "idle" },
        externalFileConflictMessage: "",
        fishmarkPlatform: "win32",
        fontFamilies: [],
        headerTitle: "note.md",
        isDocumentOpen: true,
        activeViewContainer: null,
        closingViewContainer: null,
        isReadingMode: false,
        isRefreshingThemePackages: false,
        isSettingsDrawerVisible: false,
        isSettingsOpen: false,
        isShortcutHintVisible: false,
        notification: null,
        notificationState: "hidden",
        outlineItems: [],
        recentFiles: { version: 1, entries: [] },
        preferences: DEFAULT_PREFERENCES,
        saveStatusLabel: "All changes saved",
        shellMode: "editing",
        sidePanelStoredWidth: null,
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
        editorEpoch: 1,
        editorTransition: null,
        editorViewMode: "wysiwym",
        editorRef: { current: null },
        editorContainerRef: { current: null },
        settingsEntryRef: { current: null },
        activeWorkbenchSurface: null,
        activeTitlebarSurface: null,
        preferencesThemeEffectsMode: "auto",
        resolvedThemeMode: "light",
        themeRuntimeEnv: {
          wordCount: 8,
          readingMode: 0,
          themeMode: "light",
          viewport: { width: 1024, height: 768 }
        },
        themePackages: [],
        titlebarLayout: {
          height: 0,
          slots: {
            leading: [],
            center: [],
            trailing: []
          },
          dragRegions: [],
          compactWhenNarrow: false
        },
        onActiveBlockChange: vi.fn(),
        onAppWorkspaceMouseDownCapture: vi.fn(),
        onCaptureSettingsOpenOrigin: vi.fn(),
        onCloseViewContainer: vi.fn(),
        onCloseSettingsDrawer: vi.fn(),
        onCloseWorkspaceTab: vi.fn(),
        onEditorBlur: vi.fn(),
        onEditorViewModeChange: vi.fn(),
        onImportClipboardImage: vi.fn(),
        onOpenExternalLink: vi.fn(),
        onInsertTableColumnLeft: vi.fn(),
        onInsertTableColumnRight: vi.fn(),
        onInsertTableRowAbove: vi.fn(),
        onInsertTableRowBelow: vi.fn(),
        onDeleteTable: vi.fn(),
        onDeleteTableColumn: vi.fn(),
        onDeleteTableRow: vi.fn(),
        onToggleViewContainer,
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
        onSidePanelWidthCommit: vi.fn(),
        onTableToolHoverChange: vi.fn(),
        onTabActivate: vi.fn(),
        onTabDragEnd: vi.fn(),
        onTabDragOver: vi.fn(),
        onTabDragStart: vi.fn(),
        onTabDrop: vi.fn(),
        onTitlebarSurfaceRuntimeModeChange: vi.fn(),
        onUpdatePreferences: vi.fn(),
        onRefreshThemePackages: vi.fn(),
        onOpenRecentFile: vi.fn(),
        onClearRecentFile: vi.fn(),
        onWorkbenchSurfaceRuntimeModeChange: vi.fn(),
        onNavigateToOutlineItem: vi.fn(),
        onDocumentChangeFrame: vi.fn(),
        onDiscardedDocumentText: vi.fn(),
        onPendingDocumentChangesChange: vi.fn(),
        onEditorBarrierChange: vi.fn(),
        onEditorTransitionApplied: vi.fn(),
        onEditorLoadRevisionApplied: vi.fn()
      })
    );
  });

  const activeContainer = container;

  if (!activeContainer) {
    throw new Error("test container was not created");
  }

  const workspace = activeContainer.querySelector<HTMLElement>(".app-workspace");

  expect(workspace).not.toBeNull();

  await act(async () => {
    workspace?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "f", ctrlKey: true })
    );
  });

  // `Ctrl/Cmd+F` is the keyboard entry into the same Search view container the
  // rail button toggles — there is no second, inline search surface.
  expect(onToggleViewContainer).toHaveBeenCalledWith("search");
  expect(activeContainer.querySelector('[data-fishmark-region="find-replace-panel"]')).toBeNull();
});

it("resizes the shared panel on the right edge and persists the width once on pointerup", async () => {
  const onSidePanelWidthCommit = vi.fn();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      createElement(WorkspaceShell, {
        workspaceSnapshot: {
          windowId: "window-1",
          activeTabId: "tab-1",
          tabs: [
            {
              tabId: "tab-1",
              path: "C:/note.md",
              name: "note.md",
              isDirty: false,
              saveState: "idle"
            }
          ],
          activeDocument: {
            tabId: "tab-1",
            path: "C:/note.md",
            name: "note.md",
            content: "alpha beta\nBeta alpha\n",
            encoding: "utf-8",
            revision: 0,
            savedRevision: 0,
            isDirty: false,
            saveState: "idle"
          }
        },
        activeShortcutGroup: DEFAULT_TEXT_SHORTCUT_GROUP,
        activeTableToolId: null,
        appVersionLabel: "FishMark v0.0.0-test",
        appUpdateStatusLabel: null,
        controlledTitlebarEnabled: false,
        currentDocumentMetrics: { meaningfulCharacterCount: 21 },
        effectiveSaveState: "idle",
        externalFileState: { status: "idle" },
        externalFileConflictMessage: "",
        fishmarkPlatform: "win32",
        fontFamilies: [],
        headerTitle: "note.md",
        isDocumentOpen: true,
        activeViewContainer: "outline",
        closingViewContainer: null,
        isReadingMode: false,
        isRefreshingThemePackages: false,
        isSettingsDrawerVisible: false,
        isSettingsOpen: false,
        isShortcutHintVisible: false,
        notification: null,
        notificationState: "hidden",
        outlineItems: [],
        recentFiles: { version: 1, entries: [] },
        preferences: DEFAULT_PREFERENCES,
        saveStatusLabel: "All changes saved",
        shellMode: "editing",
        sidePanelStoredWidth: 248,
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
        editorEpoch: 1,
        editorTransition: null,
        editorViewMode: "wysiwym",
        editorRef: { current: null },
        editorContainerRef: { current: null },
        settingsEntryRef: { current: null },
        activeWorkbenchSurface: null,
        activeTitlebarSurface: null,
        preferencesThemeEffectsMode: "auto",
        resolvedThemeMode: "light",
        themeRuntimeEnv: {
          wordCount: 21,
          readingMode: 0,
          themeMode: "light",
          viewport: { width: 1024, height: 768 }
        },
        themePackages: [],
        titlebarLayout: {
          height: 0,
          slots: {
            leading: [],
            center: [],
            trailing: []
          },
          dragRegions: [],
          compactWhenNarrow: false
        },
        onActiveBlockChange: vi.fn(),
        onAppWorkspaceMouseDownCapture: vi.fn(),
        onCaptureSettingsOpenOrigin: vi.fn(),
        onCloseViewContainer: vi.fn(),
        onCloseSettingsDrawer: vi.fn(),
        onCloseWorkspaceTab: vi.fn(),
        onEditorBlur: vi.fn(),
        onEditorViewModeChange: vi.fn(),
        onImportClipboardImage: vi.fn(),
        onOpenExternalLink: vi.fn(),
        onInsertTableColumnLeft: vi.fn(),
        onInsertTableColumnRight: vi.fn(),
        onInsertTableRowAbove: vi.fn(),
        onInsertTableRowBelow: vi.fn(),
        onDeleteTable: vi.fn(),
        onDeleteTableColumn: vi.fn(),
        onDeleteTableRow: vi.fn(),
        onToggleViewContainer: vi.fn(),
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
        onSidePanelWidthCommit,
        onTableToolHoverChange: vi.fn(),
        onTabActivate: vi.fn(),
        onTabDragEnd: vi.fn(),
        onTabDragOver: vi.fn(),
        onTabDragStart: vi.fn(),
        onTabDrop: vi.fn(),
        onTitlebarSurfaceRuntimeModeChange: vi.fn(),
        onUpdatePreferences: vi.fn(),
        onRefreshThemePackages: vi.fn(),
        onOpenRecentFile: vi.fn(),
        onClearRecentFile: vi.fn(),
        onWorkbenchSurfaceRuntimeModeChange: vi.fn(),
        onNavigateToOutlineItem: vi.fn(),
        onDocumentChangeFrame: vi.fn(),
        onDiscardedDocumentText: vi.fn(),
        onPendingDocumentChangesChange: vi.fn(),
        onEditorBarrierChange: vi.fn(),
        onEditorTransitionApplied: vi.fn(),
        onEditorLoadRevisionApplied: vi.fn()
      })
    );
  });

  const activeContainer = container;

  if (!activeContainer) {
    throw new Error("test container was not created");
  }

  const shell = activeContainer.querySelector<HTMLElement>(".workspace-shell");
  const resizer = activeContainer.querySelector<HTMLElement>(
    '[data-fishmark-region="side-panel-resizer"]'
  );

  expect(shell?.style.getPropertyValue("--fishmark-side-panel-stored-width")).toBe("248px");
  expect(resizer).not.toBeNull();
  // The drag cap follows the space the workspace stage actually offers.
  vi.spyOn(shell!, "getBoundingClientRect").mockReturnValue({
    width: 1200,
    height: 800,
    top: 0,
    left: 0,
    right: 1200,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });

  await act(async () => {
    resizer?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: 100 })
    );
  });

  expect(shell?.classList.contains("is-side-panel-resizing")).toBe(true);

  for (const clientX of [110, 120, 130]) {
    await act(async () => {
      resizer?.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX })
      );
    });

    // The live width only ever moves the CSS variable.
    expect(onSidePanelWidthCommit).not.toHaveBeenCalled();
  }

  expect(shell?.style.getPropertyValue("--fishmark-side-panel-stored-width")).toBe("278px");

  await act(async () => {
    resizer?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  });

  expect(onSidePanelWidthCommit).toHaveBeenCalledTimes(1);
  expect(onSidePanelWidthCommit).toHaveBeenCalledWith(278);
  expect(shell?.classList.contains("is-side-panel-resizing")).toBe(false);
});

it("never exceeds the panel bounds while dragging and keeps the stored width otherwise", async () => {
  const onSidePanelWidthCommit = vi.fn();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      createElement(WorkspaceShell, {
        workspaceSnapshot: {
          windowId: "window-1",
          activeTabId: "tab-1",
          tabs: [
            {
              tabId: "tab-1",
              path: "C:/note.md",
              name: "note.md",
              isDirty: false,
              saveState: "idle"
            }
          ],
          activeDocument: {
            tabId: "tab-1",
            path: "C:/note.md",
            name: "note.md",
            content: "alpha\n",
            encoding: "utf-8",
            revision: 0,
            savedRevision: 0,
            isDirty: false,
            saveState: "idle"
          }
        },
        activeShortcutGroup: DEFAULT_TEXT_SHORTCUT_GROUP,
        activeTableToolId: null,
        appVersionLabel: "FishMark v0.0.0-test",
        appUpdateStatusLabel: null,
        controlledTitlebarEnabled: false,
        currentDocumentMetrics: { meaningfulCharacterCount: 5 },
        effectiveSaveState: "idle",
        externalFileState: { status: "idle" },
        externalFileConflictMessage: "",
        fishmarkPlatform: "win32",
        fontFamilies: [],
        headerTitle: "note.md",
        isDocumentOpen: true,
        activeViewContainer: "outline",
        closingViewContainer: null,
        isReadingMode: false,
        isRefreshingThemePackages: false,
        isSettingsDrawerVisible: false,
        isSettingsOpen: false,
        isShortcutHintVisible: false,
        notification: null,
        notificationState: "hidden",
        outlineItems: [],
        recentFiles: { version: 1, entries: [] },
        preferences: DEFAULT_PREFERENCES,
        saveStatusLabel: "All changes saved",
        shellMode: "editing",
        sidePanelStoredWidth: 460,
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
        editorEpoch: 1,
        editorTransition: null,
        editorViewMode: "wysiwym",
        editorRef: { current: null },
        editorContainerRef: { current: null },
        settingsEntryRef: { current: null },
        activeWorkbenchSurface: null,
        activeTitlebarSurface: null,
        preferencesThemeEffectsMode: "auto",
        resolvedThemeMode: "light",
        themeRuntimeEnv: {
          wordCount: 5,
          readingMode: 0,
          themeMode: "light",
          viewport: { width: 1024, height: 768 }
        },
        themePackages: [],
        titlebarLayout: {
          height: 0,
          slots: {
            leading: [],
            center: [],
            trailing: []
          },
          dragRegions: [],
          compactWhenNarrow: false
        },
        onActiveBlockChange: vi.fn(),
        onAppWorkspaceMouseDownCapture: vi.fn(),
        onCaptureSettingsOpenOrigin: vi.fn(),
        onCloseViewContainer: vi.fn(),
        onCloseSettingsDrawer: vi.fn(),
        onCloseWorkspaceTab: vi.fn(),
        onEditorBlur: vi.fn(),
        onEditorViewModeChange: vi.fn(),
        onImportClipboardImage: vi.fn(),
        onOpenExternalLink: vi.fn(),
        onInsertTableColumnLeft: vi.fn(),
        onInsertTableColumnRight: vi.fn(),
        onInsertTableRowAbove: vi.fn(),
        onInsertTableRowBelow: vi.fn(),
        onDeleteTable: vi.fn(),
        onDeleteTableColumn: vi.fn(),
        onDeleteTableRow: vi.fn(),
        onToggleViewContainer: vi.fn(),
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
        onSidePanelWidthCommit,
        onTableToolHoverChange: vi.fn(),
        onTabActivate: vi.fn(),
        onTabDragEnd: vi.fn(),
        onTabDragOver: vi.fn(),
        onTabDragStart: vi.fn(),
        onTabDrop: vi.fn(),
        onTitlebarSurfaceRuntimeModeChange: vi.fn(),
        onUpdatePreferences: vi.fn(),
        onRefreshThemePackages: vi.fn(),
        onOpenRecentFile: vi.fn(),
        onClearRecentFile: vi.fn(),
        onWorkbenchSurfaceRuntimeModeChange: vi.fn(),
        onNavigateToOutlineItem: vi.fn(),
        onDocumentChangeFrame: vi.fn(),
        onDiscardedDocumentText: vi.fn(),
        onPendingDocumentChangesChange: vi.fn(),
        onEditorBarrierChange: vi.fn(),
        onEditorTransitionApplied: vi.fn(),
        onEditorLoadRevisionApplied: vi.fn()
      })
    );
  });

  const activeContainer = container;

  if (!activeContainer) {
    throw new Error("test container was not created");
  }

  const shell = activeContainer.querySelector<HTMLElement>(".workspace-shell");
  const resizer = activeContainer.querySelector<HTMLElement>(
    '[data-fishmark-region="side-panel-resizer"]'
  );

  vi.spyOn(shell!, "getBoundingClientRect").mockReturnValue({
    width: 600,
    height: 800,
    top: 0,
    left: 0,
    right: 600,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });

  // A 600px stage caps the panel at 60% of itself, even when the stored width
  // asks for more: display is clamped.
  expect(resizer?.getAttribute("aria-valuenow")).toBe("460");

  await act(async () => {
    resizer?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: 600 })
    );
  });

  // The drag starts from the clamped value, so the first frame does not jump.
  expect(shell?.style.getPropertyValue("--fishmark-side-panel-stored-width")).toBe("360px");

  await act(async () => {
    resizer?.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 4000 })
    );
  });

  await act(async () => {
    resizer?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  });

  expect(onSidePanelWidthCommit).toHaveBeenCalledWith(360);

  // Escape cancels: the pre-drag width comes back and nothing is written.
  onSidePanelWidthCommit.mockClear();

  await act(async () => {
    resizer?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 2, clientX: 500 })
    );
  });
  await act(async () => {
    resizer?.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 2, clientX: 100 })
    );
  });

  // 360 → 500px of pointer travel left, clamped to the 160px minimum.
  expect(shell?.style.getPropertyValue("--fishmark-side-panel-stored-width")).toBe("160px");

  await act(async () => {
    resizer?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
    );
  });

  expect(onSidePanelWidthCommit).not.toHaveBeenCalled();
  // Cancelling restores the stored width — display clamping never writes back.
  expect(shell?.style.getPropertyValue("--fishmark-side-panel-stored-width")).toBe("460px");
});

it("renders recent files without the old empty headline and delegates open and clear actions", async () => {
  const onOpenRecentFile = vi.fn();
  const onClearRecentFile = vi.fn();
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
  container = document.createElement("div");
  root = createRoot(container);

  await act(async () => {
    root?.render(
      createElement(WorkspaceShell, {
        workspaceSnapshot: {
          windowId: "window-1",
          activeTabId: null,
          tabs: [],
          activeDocument: null
        },
        activeShortcutGroup: DEFAULT_TEXT_SHORTCUT_GROUP,
        activeTableToolId: null,
        appVersionLabel: "FishMark v0.0.0-test",
        appUpdateStatusLabel: null,
        controlledTitlebarEnabled: false,
        currentDocumentMetrics: null,
        effectiveSaveState: "idle",
        externalFileState: { status: "idle" },
        externalFileConflictMessage: "",
        fishmarkPlatform: "win32",
        fontFamilies: [],
        headerTitle: "Local-first Markdown writing",
        isDocumentOpen: false,
        activeViewContainer: null,
        closingViewContainer: null,
        isReadingMode: true,
        isRefreshingThemePackages: false,
        isSettingsDrawerVisible: false,
        isSettingsOpen: false,
        isShortcutHintVisible: false,
        notification: null,
        notificationState: "hidden",
        outlineItems: [],
        recentFiles: {
          version: 1,
          entries: [
            { path: "C:/notes/today.md", name: "today.md", lastOpenedAt: 100 },
            { path: "C:/notes/archive.md", name: "archive.md", lastOpenedAt: 90 }
          ]
        },
        preferences: DEFAULT_PREFERENCES,
        saveStatusLabel: "All changes saved",
        shellMode: "reading",
        sidePanelStoredWidth: null,
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
        editorEpoch: 1,
        editorTransition: null,
        editorViewMode: "wysiwym",
        editorRef: { current: null },
        editorContainerRef: { current: null },
        settingsEntryRef: { current: null },
        activeWorkbenchSurface: null,
        activeTitlebarSurface: null,
        preferencesThemeEffectsMode: "auto",
        resolvedThemeMode: "light",
        themeRuntimeEnv: {
          wordCount: 0,
          readingMode: 1,
          themeMode: "light",
          viewport: { width: 1024, height: 768 }
        },
        themePackages: [],
        titlebarLayout: {
          height: 0,
          slots: {
            leading: [],
            center: [],
            trailing: []
          },
          dragRegions: [],
          compactWhenNarrow: false
        },
        onActiveBlockChange: vi.fn(),
        onAppWorkspaceMouseDownCapture: vi.fn(),
        onCaptureSettingsOpenOrigin: vi.fn(),
        onCloseViewContainer: vi.fn(),
        onCloseSettingsDrawer: vi.fn(),
        onCloseWorkspaceTab: vi.fn(),
        onEditorBlur: vi.fn(),
        onEditorViewModeChange: vi.fn(),
        onImportClipboardImage: vi.fn(),
        onOpenExternalLink: vi.fn(),
        onInsertTableColumnLeft: vi.fn(),
        onInsertTableColumnRight: vi.fn(),
        onInsertTableRowAbove: vi.fn(),
        onInsertTableRowBelow: vi.fn(),
        onDeleteTable: vi.fn(),
        onDeleteTableColumn: vi.fn(),
        onDeleteTableRow: vi.fn(),
        onToggleViewContainer: vi.fn(),
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
        onSidePanelWidthCommit: vi.fn(),
        onTableToolHoverChange: vi.fn(),
        onTabActivate: vi.fn(),
        onTabDragEnd: vi.fn(),
        onTabDragOver: vi.fn(),
        onTabDragStart: vi.fn(),
        onTabDrop: vi.fn(),
        onTitlebarSurfaceRuntimeModeChange: vi.fn(),
        onUpdatePreferences: vi.fn(),
        onRefreshThemePackages: vi.fn(),
        onOpenRecentFile,
        onClearRecentFile,
        onWorkbenchSurfaceRuntimeModeChange: vi.fn(),
        onNavigateToOutlineItem: vi.fn(),
        onDocumentChangeFrame: vi.fn(),
        onDiscardedDocumentText: vi.fn(),
        onPendingDocumentChangesChange: vi.fn(),
        onEditorBarrierChange: vi.fn(),
        onEditorTransitionApplied: vi.fn(),
        onEditorLoadRevisionApplied: vi.fn()
      })
    );
  });

  await act(async () => {
    container!.querySelector<HTMLButtonElement>('[data-fishmark-recent-action="open"]')?.click();
  });
  await act(async () => {
    container!.querySelector<HTMLButtonElement>('[data-fishmark-recent-action="clear"]')?.click();
  });

  expect(container.textContent).toContain("today.md");
  expect(container.textContent).toContain("C:/notes/today.md");
  expect(container.textContent).not.toContain("Your writing space");
  expect(container.textContent).not.toContain(
    "Open a Markdown file to begin. Edits are written back without reformatting."
  );
  expect(container.querySelector(".empty-copy")?.textContent).toBe("Tip: Ctrl+B · Bold");
  expect(container.querySelector(".empty-inner h1")).toBeNull();
  expect(readSvgFingerprint(container.querySelector<SVGSVGElement>(".empty-mark svg") ?? ""))
    .toEqual(readSvgFingerprint(readSharedFishMarkSvg()));
  expect(onOpenRecentFile).toHaveBeenCalledWith("C:/notes/today.md");
  expect(onClearRecentFile).toHaveBeenCalledWith("C:/notes/today.md");
  randomSpy.mockRestore();
});
