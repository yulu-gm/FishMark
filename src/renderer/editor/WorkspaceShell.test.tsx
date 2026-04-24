// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { DEFAULT_TEXT_SHORTCUT_GROUP } from "@fishmark/editor-core";
import { DEFAULT_PREFERENCES } from "../../shared/preferences";
import { WorkspaceShell } from "./WorkspaceShell";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../code-editor-view", () => ({
  CodeEditorView: ({ initialContent, onChange }: {
    initialContent: string;
    onChange: (content: string) => void;
  }) =>
    createElement(
      "div",
      null,
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

it("renders workspace tabs and delegates commands without owning persistence logic", async () => {
  const onTabActivate = vi.fn();
  const onDraftChange = vi.fn();
  const onNavigateToOutlineItem = vi.fn();
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
        headerDetail: "C:/note.md",
        headerEyebrow: "Current document",
        headerTitle: "note.md",
        hintText: "Use File > Open...",
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
        preferences: DEFAULT_PREFERENCES,
        saveStatusLabel: "Unsaved changes",
        shellMode: "editing",
        titlebarHeight: 0,
        activeHeadingId: null,
        editorLoadRevision: 1,
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
        onImportClipboardImage: vi.fn(),
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

  expect(onTabActivate).toHaveBeenCalledWith("tab-2");
  expect(onDraftChange).toHaveBeenCalledWith("# Changed\n");
  expect(onNavigateToOutlineItem).toHaveBeenCalledWith(3);
});
