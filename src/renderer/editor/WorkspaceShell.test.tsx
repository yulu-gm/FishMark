// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { DEFAULT_TEXT_SHORTCUT_GROUP } from "@fishmark/editor-core";
import { DEFAULT_PREFERENCES } from "../../shared/preferences";
import { WorkspaceShell } from "./WorkspaceShell";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../code-editor-view", () => ({
  CodeEditorView: ({ initialContent, onChange, viewMode }: {
    initialContent: string;
    onChange: (content: string) => void;
    viewMode?: "wysiwym" | "source";
  }) =>
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
          onClick: () => onChange("# Changed\n")
        },
        "Change draft"
      )
    )
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
  const onDraftChange = vi.fn();
  const onNavigateToOutlineItem = vi.fn();
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
        isOutlineOpen: true,
        isOutlinePanelVisible: true,
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
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
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
        onCloseOutlinePanel: vi.fn(),
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
        onOpenOutlinePanel: vi.fn(),
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
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
        onNavigateToOutlineItem,
        onDraftChange
      })
    );
  });

  const buttons = Array.from(container.querySelectorAll("button"));

  await act(async () => {
    buttons.find((button) => button.textContent?.includes("draft.md"))?.click();
  });

  await act(async () => {
    buttons.find((button) => button.textContent === "Change draft")?.click();
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
  expect(onDraftChange).toHaveBeenCalledWith("# Changed\n");
  expect(onNavigateToOutlineItem).toHaveBeenCalledWith(3);
  expect(onEditorViewModeChange).toHaveBeenCalledWith("source");
  expect(container.querySelector('[data-fishmark-region="workspace-header"]')).toBeNull();
  expect(container.querySelector('[data-fishmark-region="workspace-tab"]')?.getAttribute("title"))
    .toBe("C:/note.md");
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

  container = document.createElement("div");
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
        isOutlineOpen: false,
        isOutlinePanelVisible: false,
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
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
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
        onCloseOutlinePanel: vi.fn(),
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
        onOpenOutlinePanel: vi.fn(),
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
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
        onDraftChange: vi.fn()
      })
    );
  });

  const activeContainer = container;

  if (!activeContainer) {
    throw new Error("test container was not created");
  }

  await act(async () => {
    activeContainer.querySelector<HTMLButtonElement>('[data-fishmark-command="find-replace"]')?.click();
  });
  clearFindReplaceQuery.mockClear();

  const panel = activeContainer.querySelector('[data-fishmark-region="find-replace-panel"]');
  const findInput = activeContainer.querySelector<HTMLInputElement>('[aria-label="Find text"]');
  const replaceInput = activeContainer.querySelector<HTMLInputElement>('[aria-label="Replace with"]');

  expect(panel).not.toBeNull();
  expect(findInput).not.toBeNull();
  expect(replaceInput).not.toBeNull();

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
  expect(activeContainer.querySelector('[data-fishmark-region="find-replace-panel"]')?.textContent)
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
    activeContainer.querySelector<HTMLButtonElement>('[aria-label="Close find and replace"]')?.click();
  });

  expect(clearFindReplaceQuery).toHaveBeenCalledTimes(1);
  expect(activeContainer.querySelector('[data-fishmark-region="find-replace-panel"]')).toBeNull();
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
        isOutlineOpen: false,
        isOutlinePanelVisible: false,
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
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
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
        onCloseOutlinePanel: vi.fn(),
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
        onOpenOutlinePanel: vi.fn(),
        onReloadExternalFile: vi.fn(),
        onKeepMemoryVersion: vi.fn(),
        onDismissExternalFileConflict: vi.fn(),
        onSaveAs: vi.fn(),
        onSettingsOpen: vi.fn(),
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
        onDraftChange: vi.fn()
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
