import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type RefObject,
  type SVGProps
} from "react";

import {
  DEFAULT_TEXT_SHORTCUT_GROUP,
  formatShortcutHintKey,
  type EditorViewMode,
  type ShortcutGroup
} from "@fishmark/codemirror-adapter";
import type { ActiveBlockState } from "@fishmark/editor-model";
import type { AppNotification } from "../../shared/app-update";
import {
  SIDE_PANEL_WIDTH_DEFAULT,
  SIDE_PANEL_WIDTH_MAX,
  SIDE_PANEL_WIDTH_MIN,
  clampSidePanelWidth,
  type Preferences,
  type PreferencesUpdate
} from "../../shared/preferences";
import type { RecentFilesSnapshot } from "../../shared/recent-files";
import type { ThemeEffectsMode } from "../../shared/theme-package";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { CodeEditorView, type CodeEditorHandle } from "../code-editor-view";
import type {
  CodeEditorDiscardedDocumentText,
  CodeEditorDocumentChangeFrame
} from "../code-editor";
import type { OutlineItem } from "../outline";
import type { ThemeRuntimeEnv } from "../theme-runtime-env";
import type { ThemeSurfaceRuntimeMode } from "../shader/theme-surface-runtime";
import { ThemeSurfaceHost, type ThemeSurfaceHostDescriptor } from "./ThemeSurfaceHost";
import { TitlebarHost } from "./TitlebarHost";
import type { ExternalMarkdownFileState } from "./editor-shell-state";
import type { EditorLoadIdentity } from "./editor-load-identity";
import type { EditorTransition } from "./workspace-renderer-application";
import { ShortcutHintOverlay } from "./shortcut-hint-overlay";
import type { TitlebarLayoutDescriptor } from "./titlebar-layout";
import type { ThemePackageEntry, ResolvedThemeMode } from "./useThemeController";
import fishmarkMarkSvg from "../../../assets/branding/fishmark_mark.svg?raw";

const SettingsView = lazy(async () => {
  const module = await import("./settings-view");
  return { default: module.SettingsView };
});

type ShellMode = "reading" | "editing";
/**
 * The rail switches the shared side panel between view containers; the same
 * container id is what `aria-pressed` on the rail button reports, and `null`
 * means the region is collapsed.
 */
export type WorkspaceViewContainerId = "search" | "outline";
type AppNotificationBannerState = "hidden" | "open" | "closing";
type TableToolTone = "default" | "danger";
type TableToolIconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;
type FindReplaceSnapshot = {
  matchCount: number;
  currentMatchIndex: number | null;
};
/**
 * In-flight pointer drag of the shared side panel's right edge. `startWidth` is
 * the width when the drag began and `availableWidth` is the space the panel
 * column may occupy; both are captured at pointerdown so a frame only needs the
 * pointer delta.
 */
type SidePanelResizeSession = {
  pointerId: number;
  startX: number;
  startWidth: number;
  availableWidth: number;
};
type TableToolAction = {
  id: string;
  label: string;
  tone: TableToolTone;
  icon: TableToolIconComponent;
  onClick: () => void;
};

const VIEW_CONTAINER_LABELS: Record<WorkspaceViewContainerId, string> = {
  search: "Search",
  outline: "Outline"
};

/** Keyboard resize step for the panel separator, in CSS pixels. */
const SIDE_PANEL_RESIZE_KEY_STEP = 16;

function createWelcomeShortcutTip(platform: string, random = Math.random) {
  const shortcuts = DEFAULT_TEXT_SHORTCUT_GROUP.shortcuts;
  const shortcutIndex = Math.min(
    shortcuts.length - 1,
    Math.max(0, Math.floor(random() * shortcuts.length))
  );
  const shortcut = shortcuts[shortcutIndex];

  if (!shortcut) {
    return "Tip: Hold Ctrl for shortcuts";
  }

  return `Tip: ${formatShortcutHintKey(shortcut.key, platform)} · ${shortcut.label}`;
}

function RowAboveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M12 3v4M10 5h4M4 9h16M4 9v11M20 9v11M8 9v11M16 9v11M4 14.5h16" />
    </svg>
  );
}

function RowBelowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 4h16M4 4v11M20 4v11M8 4v11M16 4v11M4 9.5h16M12 17v4M10 19h4" />
    </svg>
  );
}

function ColumnLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 4h14M4 20h14M8 4v16M13 4v16M18 4v16M2 12h4M4 10v4" />
    </svg>
  );
}

function ColumnRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M6 4h14M6 20h14M6 4v16M11 4v16M16 4v16M18 12h4M20 10v4" />
    </svg>
  );
}

function DeleteRowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 4h16M4 4v16M20 4v16M8 4v16M16 4v16M4 9.5h16M9 14.5h6" />
      <path d="M18 12l3 3M21 12l-3 3" />
    </svg>
  );
}

function DeleteColumnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 4h16M4 20h16M4 4v16M9 4v16M14 4v16M4 9.5h16M4 14.5h16" />
      <path d="M17 3l3 3M20 3l-3 3" />
    </svg>
  );
}

function DeleteTableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M5 5h14M5 5v14M19 5v14M9.5 5v14M14.5 5v14M5 9.5h14M5 14.5h14" />
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M10.7 5.2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" />
      <path d="M15 15l4 4" />
    </svg>
  );
}

function OutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h6" />
    </svg>
  );
}

function SettingsDrawerFallback({ surfaceState }: { surfaceState: "open" | "closing" }) {
  return (
    <section
      className="settings-shell"
      data-fishmark-panel="settings-drawer"
      data-fishmark-surface="settings-drawer"
      data-state={surfaceState}
      role="dialog"
      aria-modal="true"
      aria-busy="true"
    />
  );
}

export type WorkspaceShellProps = {
  workspaceSnapshot: WorkspaceWindowSnapshot | null;
  activeHeadingId: string | null;
  activeShortcutGroup: ShortcutGroup;
  activeTableToolId: string | null;
  activeThemePackageSurface?: never;
  activeTitlebarSurface: ThemeSurfaceHostDescriptor | null;
  activeViewContainer: WorkspaceViewContainerId | null;
  activeWorkbenchSurface: ThemeSurfaceHostDescriptor | null;
  appUpdateStatusLabel: string | null;
  appVersionLabel: string;
  closingViewContainer: WorkspaceViewContainerId | null;
  controlledTitlebarEnabled: boolean;
  currentDocumentMetrics: { meaningfulCharacterCount: number } | null;
  effectiveSaveState: "idle" | "manual-saving" | "autosaving";
  editorContainerRef: RefObject<HTMLDivElement | null>;
  editorLoadRevision: number;
  editorEpoch: number;
  editorTransition: EditorTransition | null;
  editorRef: RefObject<CodeEditorHandle | null>;
  editorViewMode: EditorViewMode;
  externalFileConflictMessage: string;
  externalFileState: ExternalMarkdownFileState;
  fishmarkPlatform: NodeJS.Platform;
  fontFamilies: string[];
  headerTitle: string;
  isDocumentOpen: boolean;
  isReadingMode: boolean;
  isRefreshingThemePackages: boolean;
  isSettingsDrawerVisible: boolean;
  isSettingsOpen: boolean;
  isShortcutHintVisible: boolean;
  notification: AppNotification | null;
  notificationState: AppNotificationBannerState;
  outlineItems: OutlineItem[];
  recentFiles: RecentFilesSnapshot;
  preferences: Preferences;
  preferencesThemeEffectsMode: ThemeEffectsMode;
  resolvedThemeMode: ResolvedThemeMode;
  saveStatusLabel: string;
  settingsEntryRef: RefObject<HTMLButtonElement | null>;
  shellMode: ShellMode;
  /**
   * Stored width of the shared side panel region, shared by every view
   * container. `null` means "not set yet" and resolves to the default.
   */
  sidePanelStoredWidth: number | null;
  themePackages: ThemePackageEntry[];
  themeRuntimeEnv: ThemeRuntimeEnv;
  titlebarHeight: number;
  titlebarLayout: TitlebarLayoutDescriptor;
  onActiveBlockChange: (activeBlockState: ActiveBlockState) => void;
  onAppWorkspaceMouseDownCapture: (event: MouseEvent<HTMLElement>) => void;
  onCaptureSettingsOpenOrigin: () => void;
  onCloseViewContainer: () => void;
  onCloseSettingsDrawer: () => void;
  onCloseWorkspaceTab: (tabId: string) => void;
  onDismissExternalFileConflict: () => void;
  onDocumentChangeFrame: (frame: CodeEditorDocumentChangeFrame) => void;
  onDiscardedDocumentText: (discarded: CodeEditorDiscardedDocumentText) => void;
  onPendingDocumentChangesChange: (input: {
    hasPending: boolean;
    identity: EditorLoadIdentity | null;
  }) => void;
  onEditorBarrierChange: (barrier: (() => Promise<{
    readonly text: string;
    readonly identity: EditorLoadIdentity | null;
  }>) | null) => void;
  onEditorRemotePatchChange?: (patch: ((input: {
    readonly identity: EditorLoadIdentity;
    readonly expectedBefore: string;
    readonly expectedAfter: string;
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }) => Promise<import("../code-editor").CodeEditorRemotePatchResult>) | null) => void;
  onEditorCanonicalRestoreChange?: (restore: ((input: {
    readonly identity: EditorLoadIdentity;
    readonly expectedBefore: string;
    readonly canonicalText: string;
  }) => Promise<import("../code-editor").CodeEditorCanonicalRestoreResult>) | null) => void;
  onEditorTransitionApplied: (input: { token: number; readOnly: boolean }) => void;
  onEditorLoadRevisionApplied: (identity: EditorLoadIdentity) => void;
  onEditorBlur: () => void;
  onEditorViewModeChange: (mode: EditorViewMode) => void;
  onImportClipboardImage: (input: { documentPath: string | null }) => Promise<string | null>;
  onOpenExternalLink: (href: string) => void;
  onInsertTableColumnLeft: () => void;
  onInsertTableColumnRight: () => void;
  onInsertTableRowAbove: () => void;
  onInsertTableRowBelow: () => void;
  onDeleteTable: () => void;
  onDeleteTableColumn: () => void;
  onDeleteTableRow: () => void;
  onKeepMemoryVersion: () => void;
  onNavigateToOutlineItem: (startOffset: number) => void;
  onToggleViewContainer: (viewContainerId: WorkspaceViewContainerId) => void;
  onOpenRecentFile: (targetPath: string) => void;
  onClearRecentFile: (targetPath: string) => void;
  onReloadExternalFile: () => void;
  onSaveAs: () => void;
  onSettingsOpen: () => void;
  /** Persist a pointerup/keyboard side panel width. Never called per frame. */
  onSidePanelWidthCommit: (width: number) => void;
  onTableToolHoverChange: (toolId: string | null) => void;
  onTabActivate: (tabId: string) => void;
  onTabDragEnd: (tabId: string) => void;
  onTabDragOver: (event: DragEvent<HTMLElement>) => void;
  onTabDragStart: (tabId: string, event: DragEvent<HTMLElement>) => void;
  onTabDrop: (tabId: string, index: number, event: DragEvent<HTMLElement>) => void;
  onTitlebarSurfaceRuntimeModeChange: (mode: ThemeSurfaceRuntimeMode) => void;
  onUpdatePreferences: (
    patch: PreferencesUpdate
  ) => Promise<Awaited<ReturnType<Window["fishmark"]["updatePreferences"]>>>;
  onRefreshThemePackages: () => Promise<void>;
  onWorkbenchSurfaceRuntimeModeChange: (mode: ThemeSurfaceRuntimeMode) => void;
};

function createTableToolActions({
  onDeleteTable,
  onDeleteTableColumn,
  onDeleteTableRow,
  onInsertTableColumnLeft,
  onInsertTableColumnRight,
  onInsertTableRowAbove,
  onInsertTableRowBelow
}: Pick<
  WorkspaceShellProps,
  | "onDeleteTable"
  | "onDeleteTableColumn"
  | "onDeleteTableRow"
  | "onInsertTableColumnLeft"
  | "onInsertTableColumnRight"
  | "onInsertTableRowAbove"
  | "onInsertTableRowBelow"
>): TableToolAction[] {
  return [
    {
      id: "row-above",
      label: "Row Above",
      tone: "default",
      icon: RowAboveIcon,
      onClick: onInsertTableRowAbove
    },
    {
      id: "row-below",
      label: "Row Below",
      tone: "default",
      icon: RowBelowIcon,
      onClick: onInsertTableRowBelow
    },
    {
      id: "column-left",
      label: "Column Left",
      tone: "default",
      icon: ColumnLeftIcon,
      onClick: onInsertTableColumnLeft
    },
    {
      id: "column-right",
      label: "Column Right",
      tone: "default",
      icon: ColumnRightIcon,
      onClick: onInsertTableColumnRight
    },
    {
      id: "delete-row",
      label: "Delete Row",
      tone: "danger",
      icon: DeleteRowIcon,
      onClick: onDeleteTableRow
    },
    {
      id: "delete-column",
      label: "Delete Column",
      tone: "danger",
      icon: DeleteColumnIcon,
      onClick: onDeleteTableColumn
    },
    {
      id: "delete-table",
      label: "Delete Table",
      tone: "danger",
      icon: DeleteTableIcon,
      onClick: onDeleteTable
    }
  ];
}

export function WorkspaceShell({
  activeHeadingId,
  activeShortcutGroup,
  activeTableToolId,
  activeTitlebarSurface,
  activeViewContainer,
  activeWorkbenchSurface,
  appUpdateStatusLabel,
  appVersionLabel,
  closingViewContainer,
  controlledTitlebarEnabled,
  currentDocumentMetrics,
  editorContainerRef,
  editorLoadRevision,
  editorEpoch,
  editorTransition,
  editorRef,
  editorViewMode,
  externalFileConflictMessage,
  externalFileState,
  fishmarkPlatform,
  fontFamilies,
  headerTitle,
  isDocumentOpen,
  isReadingMode,
  isRefreshingThemePackages,
  isSettingsDrawerVisible,
  isSettingsOpen,
  isShortcutHintVisible,
  notification,
  notificationState,
  outlineItems,
  recentFiles,
  preferences,
  preferencesThemeEffectsMode,
  resolvedThemeMode,
  saveStatusLabel,
  settingsEntryRef,
  shellMode,
  sidePanelStoredWidth,
  themePackages,
  themeRuntimeEnv,
  titlebarHeight,
  titlebarLayout,
  workspaceSnapshot,
  onActiveBlockChange,
  onAppWorkspaceMouseDownCapture,
  onCaptureSettingsOpenOrigin,
  onCloseViewContainer,
  onCloseSettingsDrawer,
  onCloseWorkspaceTab,
  onDeleteTable,
  onDeleteTableColumn,
  onDeleteTableRow,
  onDismissExternalFileConflict,
  onDocumentChangeFrame,
  onDiscardedDocumentText,
  onPendingDocumentChangesChange,
  onEditorBarrierChange,
  onEditorRemotePatchChange,
  onEditorCanonicalRestoreChange,
  onEditorTransitionApplied,
  onEditorLoadRevisionApplied,
  onEditorBlur,
  onEditorViewModeChange,
  onImportClipboardImage,
  onInsertTableColumnLeft,
  onInsertTableColumnRight,
  onInsertTableRowAbove,
  onInsertTableRowBelow,
  onKeepMemoryVersion,
  onNavigateToOutlineItem,
  onToggleViewContainer,
  onOpenExternalLink,
  onOpenRecentFile,
  onClearRecentFile,
  onReloadExternalFile,
  onRefreshThemePackages,
  onSaveAs,
  onSettingsOpen,
  onSidePanelWidthCommit,
  onTableToolHoverChange,
  onTabActivate,
  onTabDragEnd,
  onTabDragOver,
  onTabDragStart,
  onTabDrop,
  onTitlebarSurfaceRuntimeModeChange,
  onUpdatePreferences,
  onWorkbenchSurfaceRuntimeModeChange
}: WorkspaceShellProps) {
  const activeDocument = workspaceSnapshot?.activeDocument ?? null;
  const workspaceTabs = workspaceSnapshot?.tabs ?? [];
  const activeTabId = workspaceSnapshot?.activeTabId ?? null;
  const nextEditorViewMode: EditorViewMode = editorViewMode === "source" ? "wysiwym" : "source";
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [welcomeShortcutTip] = useState(() => createWelcomeShortcutTip(fishmarkPlatform));
  const [findReplaceSnapshot, setFindReplaceSnapshot] = useState<FindReplaceSnapshot>({
    matchCount: 0,
    currentMatchIndex: null
  });
  const [resizeSession, setResizeSession] = useState<SidePanelResizeSession | null>(null);
  const [draggedPanelWidth, setDraggedPanelWidth] = useState<number | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const resizeSessionRef = useRef<SidePanelResizeSession | null>(null);
  const draggedPanelWidthRef = useRef<number | null>(null);
  const workspaceShellRef = useRef<HTMLElement | null>(null);
  /*
   * The rail switches the shared side panel between view containers and
   * `Ctrl/Cmd+F` opens the Search container; the inline find bar no longer
   * exists, so CodeMirror's own search query stays the only source of truth for
   * what is searched while these fields only mirror it for editing.
   */
  const visibleViewContainer = activeViewContainer ?? closingViewContainer;
  const isSidePanelOpen = activeViewContainer !== null;
  const isSidePanelVisible = visibleViewContainer !== null;
  const isSearchViewActive = activeViewContainer === "search";
  const tableToolActions = createTableToolActions({
    onDeleteTable,
    onDeleteTableColumn,
    onDeleteTableRow,
    onInsertTableColumnLeft,
    onInsertTableColumnRight,
    onInsertTableRowAbove,
    onInsertTableRowBelow
  });
  const isViewContainerEnabled = isDocumentOpen && activeDocument !== null;
  /*
   * The stored width is resolved for the drag maths (the CSS clamps it for
   * display); a collapsed region never overwrites it.
   */
  const displayedSidePanelWidth = draggedPanelWidth ?? sidePanelStoredWidth ?? SIDE_PANEL_WIDTH_DEFAULT;
  const isResizingSidePanel = resizeSession !== null;
  /*
   * The shared side panel renders `activeViewContainer` while it is expanded
   * and keeps `closingViewContainer` mounted until the exit animation ends.
   */
  const visibleViewContainerLabel = visibleViewContainer
    ? VIEW_CONTAINER_LABELS[visibleViewContainer]
    : null;

  useEffect(() => {
    if (!isSearchViewActive) {
      return;
    }

    findInputRef.current?.focus();
  }, [isSearchViewActive]);

  /*
   * While the region is expanded the canvas publishes the stored width as a CSS
   * variable; the stylesheet clamps it for the available viewport (display
   * only), and the drag path overrides the same variable for live resizing.
   * While it is closing the override is dropped so the column animates to 0px.
   */
  const sidePanelWidthVariables =
    isSidePanelVisible
      ? ({
          "--fishmark-side-panel-stored-width": `${displayedSidePanelWidth}px`
        } as CSSProperties)
      : undefined;

  const closeFindReplacePanel = () => {
    setFindText("");
    setReplaceText("");
    setFindReplaceSnapshot(
      editorRef.current?.clearFindReplaceQuery() ?? {
        matchCount: 0,
        currentMatchIndex: null
      }
    );
    editorRef.current?.focus();
  };

  const exitSearchViewContainer = () => {
    closeFindReplacePanel();
    onCloseViewContainer();
  };

  /*
   * The panel's collapse affordance clears this view container's query as well
   * as collapsing the region; CodeMirror search state stays the single source
   * of truth, so nothing else has to mirror it.
   */
  const collapseVisibleViewContainer = () => {
    if (visibleViewContainer === "search") {
      closeFindReplacePanel();
    }

    onCloseViewContainer();
  };

  /*
   * The panel column may occupy the workspace stage minus the gap; when the
   * shell has not been laid out (or is not mounted) fall back to the window so
   * the drag still has a sane maximum.
   */
  const measureSidePanelAvailableWidth = (): number => {
    const shell = workspaceShellRef.current;
    const shellWidth = shell?.getBoundingClientRect().width ?? 0;

    return shellWidth > 0 ? shellWidth : window.innerWidth;
  };

  const applyDraggedPanelWidth = (width: number | null) => {
    draggedPanelWidthRef.current = width;
    setDraggedPanelWidth(width);
  };

  const handleSidePanelResizePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    // Keep focus (and the caret) where it was while the pointer drags.
    event.preventDefault();

    const availableWidth = measureSidePanelAvailableWidth();
    const displayWidth = clampSidePanelWidth(displayedSidePanelWidth, availableWidth);
    const session: SidePanelResizeSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: displayWidth,
      availableWidth
    };

    resizeSessionRef.current = session;
    setResizeSession(session);
    applyDraggedPanelWidth(displayWidth);
  };

  const handleSidePanelResizePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const session = resizeSessionRef.current;

    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const pointerDelta = event.clientX - session.startX;

    applyDraggedPanelWidth(
      clampSidePanelWidth(session.startWidth + pointerDelta, session.availableWidth)
    );
  };

  /**
   * End the drag. `commit` writes the resulting width to preferences exactly
   * once; cancelling (Escape) restores the pre-drag width without writing.
   */
  const finishSidePanelResize = (commit: boolean) => {
    const session = resizeSessionRef.current;
    const width = draggedPanelWidthRef.current;

    resizeSessionRef.current = null;
    setResizeSession(null);
    applyDraggedPanelWidth(null);

    if (!commit || session === null || width === null) {
      return;
    }

    onSidePanelWidthCommit(clampSidePanelWidth(width, session.availableWidth));
  };

  const handleSidePanelResizeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && resizeSessionRef.current !== null) {
      event.preventDefault();
      finishSidePanelResize(false);
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const availableWidth = measureSidePanelAvailableWidth();
    const baseWidth = clampSidePanelWidth(displayedSidePanelWidth, availableWidth);
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const nextWidth = clampSidePanelWidth(
      baseWidth + direction * SIDE_PANEL_RESIZE_KEY_STEP,
      availableWidth
    );

    applyDraggedPanelWidth(nextWidth);
    onSidePanelWidthCommit(nextWidth);
  };

  const handleFindTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFindText = event.currentTarget.value;

    setFindText(nextFindText);
    setFindReplaceSnapshot(
      editorRef.current?.updateFindReplaceQuery({
        search: nextFindText,
        replace: replaceText
      }) ?? {
        matchCount: 0,
        currentMatchIndex: null
      }
    );
  };

  const handleReplaceTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextReplaceText = event.currentTarget.value;

    setReplaceText(nextReplaceText);
    setFindReplaceSnapshot(
      editorRef.current?.updateFindReplaceQuery({
        search: findText,
        replace: nextReplaceText
      }) ?? {
        matchCount: 0,
        currentMatchIndex: null
      }
    );
  };

  const handleFindReplaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      exitSearchViewContainer();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      setFindReplaceSnapshot(
        event.shiftKey
          ? editorRef.current?.findPreviousMatch() ?? findReplaceSnapshot
          : editorRef.current?.findNextMatch() ?? findReplaceSnapshot
      );
    }
  };

  const handleWorkspaceKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (
      !isViewContainerEnabled ||
      event.key.toLowerCase() !== "f" ||
      (!event.metaKey && !event.ctrlKey)
    ) {
      return;
    }

    /*
     * `Ctrl/Cmd+F` is the keyboard entry point into the shared region's Search
     * view container; the rail button drives the same toggle.
     */
    event.preventDefault();
    onToggleViewContainer("search");
  };

  const matchStatusLabel = findText.length === 0
    ? "No query"
    : findReplaceSnapshot.matchCount === 0
      ? "No matches"
      : `${findReplaceSnapshot.currentMatchIndex ?? 0} / ${findReplaceSnapshot.matchCount}`;

  return (
    <main
      className="app-shell"
      data-fishmark-shell-mode={shellMode}
      style={
        {
          "--fishmark-titlebar-height": controlledTitlebarEnabled
            ? `${titlebarHeight}px`
            : "0px"
        } as CSSProperties
      }
    >
      {controlledTitlebarEnabled ? (
        <TitlebarHost
          platform={fishmarkPlatform}
          layout={titlebarLayout}
          title={headerTitle}
          isDirty={activeDocument?.isDirty ?? false}
          themeMode={resolvedThemeMode}
          runtimeEnv={themeRuntimeEnv}
          effectsMode={preferencesThemeEffectsMode}
          titlebarSurface={activeTitlebarSurface}
          onTitlebarSurfaceRuntimeModeChange={onTitlebarSurfaceRuntimeModeChange}
        />
      ) : null}
      <div
        className="app-layout"
        data-fishmark-shell-mode={shellMode}
        data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
      >
        {activeWorkbenchSurface ? (
          <ThemeSurfaceHost
            surface="workbenchBackground"
            descriptor={activeWorkbenchSurface}
            themeMode={resolvedThemeMode}
            runtimeEnv={themeRuntimeEnv}
            effectsMode={preferencesThemeEffectsMode}
            onRuntimeModeChange={onWorkbenchSurfaceRuntimeModeChange}
          />
        ) : null}
        <aside
          className="app-rail"
          data-fishmark-layout="rail"
          data-fishmark-rail-mode={activeShortcutGroup.id}
        >
          <div className="app-rail-brand">
            <p className="app-name">FishMark</p>
            <p className="app-subtitle">Desktop editor</p>
          </div>
          <div className="app-rail-content">
            <div
              className="app-rail-mode-group app-rail-mode-group-default"
              data-state={activeShortcutGroup.id === "default-text" ? "open" : "closing"}
              aria-hidden={activeShortcutGroup.id !== "default-text"}
            >
              <button
                type="button"
                className="rail-tool-button"
                data-fishmark-command="find-replace"
                aria-label="Find and replace"
                aria-pressed={activeViewContainer === "search"}
                title="Find and replace"
                disabled={!isViewContainerEnabled}
                onClick={() => onToggleViewContainer("search")}
              >
                <SearchIcon className="rail-tool-button-icon" />
              </button>
              <button
                type="button"
                className="rail-tool-button"
                data-fishmark-command="outline"
                aria-label="Outline"
                aria-pressed={activeViewContainer === "outline"}
                title="Outline"
                disabled={!isViewContainerEnabled}
                onClick={() => onToggleViewContainer("outline")}
              >
                <OutlineIcon className="rail-tool-button-icon" />
              </button>
              <div
                className="app-rail-spacer"
                aria-hidden="true"
              />
            </div>
            <div
              className="app-rail-mode-group app-rail-mode-group-table"
              data-state={activeShortcutGroup.id === "table-editing" ? "open" : "closing"}
              aria-hidden={activeShortcutGroup.id !== "table-editing"}
            >
              <div className="table-tool-strip" data-fishmark-region="table-tool-strip">
                {tableToolActions.map((action) => {
                  const Icon = action.icon;
                  const isTooltipVisible = activeTableToolId === action.id;

                  return (
                    <button
                      key={action.id}
                      type="button"
                      className="table-tool-button"
                      data-tone={action.tone}
                      data-fishmark-region="table-tool-button"
                      aria-label={action.label}
                      onClick={action.onClick}
                      onMouseEnter={() => onTableToolHoverChange(action.id)}
                      onMouseLeave={() => onTableToolHoverChange(null)}
                      onFocus={() => onTableToolHoverChange(action.id)}
                      onBlur={() => onTableToolHoverChange(null)}
                    >
                      <Icon className="table-tool-button-icon" />
                      {isTooltipVisible ? (
                        <span
                          className="table-tool-tooltip"
                          data-fishmark-region="table-tool-tooltip"
                          role="tooltip"
                        >
                          {action.label}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="settings-entry"
            ref={settingsEntryRef}
            onMouseDown={onCaptureSettingsOpenOrigin}
            onClick={onSettingsOpen}
            aria-label="打开偏好设置"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M19.14 12.94a7.94 7.94 0 0 0 .05-.94 7.94 7.94 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.9 7.9 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.94 7.94 0 0 0 0 1.88L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7.9 7.9 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="2.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            <span>设置</span>
          </button>
        </aside>

        <div
          className="app-workspace"
          data-fishmark-layout="workspace"
          data-fishmark-shell-mode={shellMode}
          data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
          onMouseDownCapture={onAppWorkspaceMouseDownCapture}
          onKeyDownCapture={handleWorkspaceKeyDownCapture}
        >
          {notification && notificationState !== "hidden" ? (
            <div
              className={`app-notification-banner is-${notification.kind}`}
              data-fishmark-region="app-notification-banner"
              data-state={notificationState}
              role="status"
              aria-live="polite"
            >
              <p className="app-notification-message">
                {notification.kind === "loading" ? (
                  <span
                    className="app-notification-spinner"
                    data-fishmark-region="app-notification-spinner"
                    aria-hidden="true"
                  />
                ) : null}
                <span>{notification.message}</span>
              </p>
            </div>
          ) : null}
          {externalFileState.status !== "idle" ? (
            <section
              className="external-file-conflict-banner"
              data-fishmark-region="external-file-conflict-banner"
              data-status={externalFileState.status}
              role="status"
              aria-live="polite"
            >
              <p className="external-file-conflict-message">{externalFileConflictMessage}</p>
              <div className="external-file-conflict-actions">
                <button
                  type="button"
                  className="external-file-conflict-button"
                  onClick={onReloadExternalFile}
                >
                  重载磁盘版本
                </button>
                {externalFileState.status === "pending" ? (
                  <button
                    type="button"
                    className="external-file-conflict-button"
                    onClick={onKeepMemoryVersion}
                  >
                    保留当前编辑
                  </button>
                ) : null}
                <button
                  type="button"
                  className="external-file-conflict-button"
                  onClick={onSaveAs}
                >
                  另存为新文件
                </button>
                {externalFileState.status === "keeping-memory" ? (
                  <button
                    type="button"
                    className="external-file-conflict-button is-secondary"
                    onClick={onDismissExternalFileConflict}
                  >
                    关闭提示
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
          {workspaceTabs.length > 0 ? (
            <nav
              className="workspace-tab-strip"
              data-fishmark-region="workspace-tab-strip"
              data-visibility={isReadingMode && isDocumentOpen ? "collapsed" : "visible"}
              aria-label="Open documents"
            >
              <div className="workspace-tab-strip-scroll">
                {workspaceTabs.map((tab, index) => {
                  const isActive = tab.tabId === activeTabId;
                  const tooltip = tab.path ?? tab.name;

                  return (
                    <div
                      key={tab.tabId}
                      className={`workspace-tab-shell ${isActive ? "is-active" : ""}`}
                      data-fishmark-region="workspace-tab-shell"
                      data-active={isActive ? "true" : "false"}
                      data-dirty={tab.isDirty ? "true" : "false"}
                    >
                      <button
                        type="button"
                        className={`workspace-tab ${isActive ? "is-active" : ""}`}
                        data-fishmark-region="workspace-tab"
                        data-active={isActive ? "true" : "false"}
                        data-dirty={tab.isDirty ? "true" : "false"}
                        title={tooltip}
                        draggable
                        onClick={() => onTabActivate(tab.tabId)}
                        onAuxClick={(event) => {
                          if (event.button === 1) {
                            event.preventDefault();
                            event.stopPropagation();
                            onCloseWorkspaceTab(tab.tabId);
                          }
                        }}
                        onDragStart={(event) => onTabDragStart(tab.tabId, event)}
                        onDragOver={onTabDragOver}
                        onDrop={(event) => onTabDrop(tab.tabId, index, event)}
                        onDragEnd={() => onTabDragEnd(tab.tabId)}
                      >
                        <span className="workspace-tab-label">{tab.name}</span>
                        <span
                          className="workspace-tab-dirty-indicator"
                          data-visibility={tab.isDirty ? "visible" : "hidden"}
                          aria-hidden="true"
                        >
                          •
                        </span>
                      </button>
                      <button
                        type="button"
                        className="workspace-tab-close"
                        data-fishmark-region="workspace-tab-close"
                        aria-label={`Close ${tab.name}`}
                        title={`Close ${tab.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onCloseWorkspaceTab(tab.tabId);
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M3 3 L9 9 M9 3 L3 9"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </nav>
          ) : null}
          <section
            className={`workspace-canvas ${activeDocument ? "is-editor-open" : ""}`}
            data-fishmark-region="workspace-canvas"
            data-fishmark-shell-mode={shellMode}
            data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
            style={sidePanelWidthVariables}
          >
            {activeDocument ? (
              <>
                <div
                  data-fishmark-region="shortcut-hint-overlay-shell"
                  className="shortcut-hint-overlay-shell"
                  data-shortcut-hint-state={isShortcutHintVisible ? "visible" : "hidden"}
                >
                  <ShortcutHintOverlay
                    visible={isShortcutHintVisible}
                    platform={fishmarkPlatform}
                    group={activeShortcutGroup}
                  />
                </div>
                <section
                  className={`workspace-shell ${isSidePanelOpen ? "is-side-panel-open" : ""} ${
                    isResizingSidePanel ? "is-side-panel-resizing" : ""
                  }`}
                  ref={workspaceShellRef}
                  style={sidePanelWidthVariables}
                >
                  <div
                    className="document-canvas"
                    ref={editorContainerRef}
                  >
                    <CodeEditorView
                      ref={editorRef}
                      initialContent={activeDocument.content}
                      documentPath={activeDocument.path}
                      documentTabId={activeDocument.tabId}
                      editorEpoch={editorEpoch}
                      loadRevision={editorLoadRevision}
                      readOnly={editorTransition?.readOnly ?? false}
                      editorTransitionToken={editorTransition?.token ?? null}
                      importClipboardImage={onImportClipboardImage}
                      openExternalLink={onOpenExternalLink}
                      viewMode={editorViewMode}
                      onActiveBlockChange={onActiveBlockChange}
                      onDocumentChangeFrame={onDocumentChangeFrame}
                      onDiscardedDocumentText={onDiscardedDocumentText}
                      onPendingDocumentChangesChange={onPendingDocumentChangesChange}
                      onEditorBarrierChange={onEditorBarrierChange}
                      onEditorRemotePatchChange={onEditorRemotePatchChange}
                      onEditorCanonicalRestoreChange={onEditorCanonicalRestoreChange}
                      onEditorTransitionApplied={onEditorTransitionApplied}
                      onLoadRevisionApplied={onEditorLoadRevisionApplied}
                      onBlur={onEditorBlur}
                    />
                  </div>
                  {visibleViewContainer && visibleViewContainerLabel ? (
                    <aside
                      className="side-panel"
                      data-fishmark-region="side-panel"
                      data-view-container={visibleViewContainer}
                      data-state={isSidePanelOpen ? "open" : "closing"}
                      aria-label={visibleViewContainerLabel}
                    >
                      <div
                        className="side-panel-header"
                        data-fishmark-region="side-panel-header"
                      >
                        <p className="side-panel-title">{visibleViewContainerLabel}</p>
                        <button
                          type="button"
                          className="side-panel-close"
                          aria-label={`Collapse ${visibleViewContainerLabel.toLowerCase()}`}
                          onClick={collapseVisibleViewContainer}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path
                              d="M15 6l-6 6 6 6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <div
                        className="side-panel-body"
                        data-fishmark-region="side-panel-body"
                      >
                        {visibleViewContainer === "search" ? (
                          <div
                            className="find-replace-panel"
                            data-fishmark-region="search"
                            aria-label="Find and replace"
                            onKeyDown={handleFindReplaceKeyDown}
                          >
                            <label className="find-replace-field">
                              <span>Find</span>
                              <input
                                type="search"
                                className="find-replace-input"
                                aria-label="Find text"
                                ref={findInputRef}
                                value={findText}
                                onChange={handleFindTextChange}
                              />
                            </label>
                            <div className="find-replace-row">
                              <p
                                className="find-replace-status"
                                data-fishmark-region="find-replace-status"
                                aria-live="polite"
                              >
                                {matchStatusLabel}
                              </p>
                              <button
                                type="button"
                                className="find-replace-icon-button"
                                aria-label="Previous match"
                                disabled={findReplaceSnapshot.matchCount === 0}
                                onClick={() =>
                                  setFindReplaceSnapshot(
                                    editorRef.current?.findPreviousMatch() ?? findReplaceSnapshot
                                  )
                                }
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                  <path d="M6 14l6-6 6 6" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="find-replace-icon-button"
                                aria-label="Next match"
                                disabled={findReplaceSnapshot.matchCount === 0}
                                onClick={() =>
                                  setFindReplaceSnapshot(
                                    editorRef.current?.findNextMatch() ?? findReplaceSnapshot
                                  )
                                }
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                  <path d="M6 10l6 6 6-6" />
                                </svg>
                              </button>
                            </div>
                            <label className="find-replace-field">
                              <span>Replace</span>
                              <input
                                type="text"
                                className="find-replace-input"
                                aria-label="Replace with"
                                value={replaceText}
                                onChange={handleReplaceTextChange}
                              />
                            </label>
                            <div className="find-replace-row">
                              <button
                                type="button"
                                className="find-replace-text-button"
                                aria-label="Replace current match"
                                disabled={findReplaceSnapshot.matchCount === 0}
                                onClick={() =>
                                  setFindReplaceSnapshot(
                                    editorRef.current?.replaceCurrentMatch() ?? findReplaceSnapshot
                                  )
                                }
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                className="find-replace-text-button"
                                aria-label="Replace all matches"
                                disabled={findReplaceSnapshot.matchCount === 0}
                                onClick={() =>
                                  setFindReplaceSnapshot(
                                    editorRef.current?.replaceAllMatches() ?? findReplaceSnapshot
                                  )
                                }
                              >
                                Replace all
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {visibleViewContainer === "outline" ? (
                          <div
                            className="outline-panel"
                            data-fishmark-region="outline-panel"
                          >
                            {outlineItems.length > 0 ? (
                              <ol className="outline-panel-list">
                                {outlineItems.map((item) => (
                                  <li key={item.id}>
                                    <button
                                      type="button"
                                      className={`outline-panel-item ${activeHeadingId === item.id ? "is-current" : ""}`}
                                      style={{
                                        paddingInlineStart: `${10 + Math.max(item.depth - 1, 0) * 10}px`
                                      }}
                                      onClick={() => onNavigateToOutlineItem(item.startOffset)}
                                    >
                                      <span className="outline-panel-item-label">{item.label}</span>
                                    </button>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="outline-panel-empty">No headings yet.</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </aside>
                  ) : null}
                  {isSidePanelOpen ? (
                    <div
                      className="side-panel-resizer"
                      data-fishmark-region="side-panel-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize side panel"
                      aria-valuemin={SIDE_PANEL_WIDTH_MIN}
                      aria-valuemax={SIDE_PANEL_WIDTH_MAX}
                      aria-valuenow={displayedSidePanelWidth}
                      tabIndex={0}
                      onPointerDown={handleSidePanelResizePointerDown}
                      onPointerMove={handleSidePanelResizePointerMove}
                      onPointerUp={() => finishSidePanelResize(true)}
                      onPointerCancel={() => finishSidePanelResize(false)}
                      onKeyDown={handleSidePanelResizeKeyDown}
                      onLostPointerCapture={() => finishSidePanelResize(false)}
                    />
                  ) : null}
                </section>
              </>
            ) : (
              <section
                className="empty-workspace"
                data-fishmark-region="empty-state"
              >
                <div className="empty-inner">
                  <span
                    className="empty-mark"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: fishmarkMarkSvg }}
                  />
                  <p className="empty-kicker">FishMark</p>
                  <p className="empty-copy">{welcomeShortcutTip}</p>
                  <p className="empty-meta">⌘ O · Ctrl O</p>
                  {recentFiles.entries.length > 0 ? (
                    <section
                      className="recent-files"
                      aria-label="Recent files"
                    >
                      <h2>Recent files</h2>
                      <ul className="recent-file-list">
                        {recentFiles.entries.map((entry) => (
                          <li
                            key={entry.path}
                            className="recent-file-item"
                          >
                            <button
                              type="button"
                              className="recent-file-open"
                              data-fishmark-recent-action="open"
                              onClick={() => onOpenRecentFile(entry.path)}
                            >
                              <span className="recent-file-name">{entry.name}</span>
                              <span className="recent-file-path">{entry.path}</span>
                            </button>
                            <button
                              type="button"
                              className="recent-file-clear"
                              data-fishmark-recent-action="clear"
                              aria-label={`Remove ${entry.name} from recent files`}
                              onClick={() => onClearRecentFile(entry.path)}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path
                                  d="M18 6L6 18M6 6l12 12"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </section>
            )}
          </section>

          <footer
            className="app-status-bar"
            data-fishmark-region="app-status-bar"
            data-visibility={isReadingMode && isDocumentOpen ? "collapsed" : "visible"}
          >
            <div data-fishmark-region="status-strip">
              {isDocumentOpen ? (
                <>
                  {appUpdateStatusLabel ? (
                    <p className="app-update-status">{appUpdateStatusLabel}</p>
                  ) : null}
                  <p
                    className={`save-status ${activeDocument?.isDirty ? "is-dirty" : "is-clean"}`}
                  >
                    {saveStatusLabel}
                  </p>
                  <p className="document-word-count">
                    字数 {currentDocumentMetrics?.meaningfulCharacterCount ?? 0}
                  </p>
                  <button
                    type="button"
                    className="editor-view-mode-toggle"
                    aria-label={
                      editorViewMode === "source"
                        ? "Switch to WYSIWYM mode"
                        : "Switch to source mode"
                    }
                    aria-pressed={editorViewMode === "source"}
                    title={
                      editorViewMode === "source"
                        ? "Switch to WYSIWYM mode"
                        : "Switch to source mode"
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onEditorViewModeChange(nextEditorViewMode)}
                  >
                    &lt;/&gt;
                  </button>
                </>
              ) : (
                <>
                  <p className="app-version-label">{appVersionLabel}</p>
                  {appUpdateStatusLabel ? (
                    <p className="app-update-status">{appUpdateStatusLabel}</p>
                  ) : null}
                </>
              )}
            </div>
          </footer>
        </div>
      </div>

      {isSettingsDrawerVisible ? (
        <div
          data-fishmark-dialog="settings-drawer"
          data-fishmark-overlay-style="floating-drawer"
          data-state={isSettingsOpen ? "open" : "closing"}
          onClick={onCloseSettingsDrawer}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <Suspense
              fallback={
                <SettingsDrawerFallback surfaceState={isSettingsOpen ? "open" : "closing"} />
              }
            >
              <SettingsView
                surfaceState={isSettingsOpen ? "open" : "closing"}
                preferences={preferences}
                fontFamilies={fontFamilies}
                themePackages={themePackages}
                isRefreshingThemes={isRefreshingThemePackages}
                onRefreshThemes={onRefreshThemePackages}
                onUpdate={onUpdatePreferences}
                onOpenExternalLink={onOpenExternalLink}
                onClose={onCloseSettingsDrawer}
              />
            </Suspense>
          </div>
        </div>
      ) : null}
    </main>
  );
}
