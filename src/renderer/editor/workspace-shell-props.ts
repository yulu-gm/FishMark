import {
  type DragEvent,
  type MouseEvent,
  type RefObject
} from "react";

import type {
  EditorViewMode,
  ShortcutGroupId
} from "@fishmark/codemirror-adapter";
import type { ActiveBlockState } from "@fishmark/editor-model";
import type { AppNotification } from "../../shared/app-update";
import {
  type Preferences,
  type PreferencesUpdate
} from "../../shared/preferences";
import type { RecentFilesSnapshot } from "../../shared/recent-files";
import type { ThemeEffectsMode } from "../../shared/theme-package";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import type { EditorLoadIdentity } from "../application/editor-load-identity";
import type { ExternalMarkdownFileState } from "../application/editor-shell-state";
import type { EditorTransition } from "../application/workspace-renderer-application";
import type {
  CodeEditorDiscardedDocumentText,
  CodeEditorDocumentChangeFrame
} from "../code-editor";
import type { CodeEditorHandle } from "../code-editor-view";
import type { OutlineItem } from "../outline";
import type { ThemeSurfaceRuntimeMode } from "../shader/theme-surface-runtime";
import type { ThemeRuntimeEnv } from "../theme-runtime-env";
import type { ThemeSurfaceHostDescriptor } from "./ThemeSurfaceHost";
import type { TitlebarLayoutDescriptor } from "./titlebar-layout";
import type { ResolvedThemeMode, ThemePackageEntry } from "./useThemeController";


type ShellMode = "reading" | "editing";
/**
 * The rail switches the shared side panel between view containers; the same
 * container id is what `aria-pressed` on the rail button reports, and `null`
 * means the region is collapsed.
 */
export type WorkspaceViewContainerId = "search" | "outline";
type AppNotificationBannerState = "hidden" | "open" | "closing";
export type WorkspaceShellProps = {
  workspaceSnapshot: WorkspaceWindowSnapshot | null;
  activeHeadingId: string | null;
  activeShortcutGroupId: ShortcutGroupId;
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
  onToggleReadingMode?: () => void;
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
  onOpenThemesDirectory: () => Promise<void>;
  onSelectTemporaryImageDirectory: () => Promise<Awaited<ReturnType<Window["fishmark"]["updatePreferences"]>> | null>;
  onWorkbenchSurfaceRuntimeModeChange: (mode: ThemeSurfaceRuntimeMode) => void;
};
