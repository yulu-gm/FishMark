import {
  APP_NOTIFICATION_EVENT,
  APP_UPDATE_STATE_EVENT,
  CHECK_FOR_APP_UPDATES_CHANNEL,
  type AppNotification,
  type AppUpdateState
} from "../shared/app-update";
import {
  IMPORT_CLIPBOARD_IMAGE_CHANNEL,
  type ImportClipboardImageInput,
  type ImportClipboardImageResult
} from "../shared/clipboard-image-import";
import {
  APPLY_DOCUMENT_EDITS_CHANNEL,
  FLUSH_DOCUMENT_EDITS_CHANNEL,
  type ApplyDocumentEditsInput,
  type ApplyDocumentEditsResult,
  type FlushDocumentEditsInput,
  type FlushDocumentEditsResult
} from "../shared/document-edit";
import {
  DOCUMENT_PROJECTION_EVENT,
  type DocumentProjectionEvent
} from "../shared/document-projection";
import { EXPORT_HTML_FILE_CHANNEL, type ExportHtmlFileInput } from "../shared/export-html-file";
import {
  EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
  SYNC_WATCHED_MARKDOWN_FILE_CHANNEL,
  type ExternalMarkdownFileChangedEvent
} from "../shared/external-file-change";
import { OPEN_EXTERNAL_LINK_CHANNEL, type OpenExternalLinkInput } from "../shared/external-link";
import { LIST_FONT_FAMILIES_CHANNEL } from "../shared/font-families";
import { APP_MENU_COMMAND_EVENT, type AppMenuCommand } from "../shared/menu-command";
import {
  HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
  type HandleDroppedMarkdownFileInput,
  type HandleDroppedMarkdownFileResult
} from "../shared/open-markdown-file";
import {
  GET_PREFERENCES_CHANNEL,
  PREFERENCES_CHANGED_EVENT,
  SELECT_TEMPORARY_IMAGE_DIRECTORY_CHANNEL,
  UPDATE_PREFERENCES_CHANNEL,
  type Preferences,
  type PreferencesUpdate,
  type UpdatePreferencesResult
} from "../shared/preferences";
import type { ProductBridge } from "../shared/product-bridge";
import {
  CLEAR_RECENT_FILE_CHANNEL,
  GET_RECENT_FILES_CHANNEL,
  RECENT_FILES_CHANGED_EVENT,
  type ClearRecentFileInput,
  type RecentFilesSnapshot
} from "../shared/recent-files";
import {
  SAVE_MARKDOWN_FILE_AS_CHANNEL,
  SAVE_MARKDOWN_FILE_CHANNEL,
  type SaveMarkdownFileAsInput,
  type SaveMarkdownFileInput,
  type SaveMarkdownFileResult
} from "../shared/save-markdown-file";
import {
  LIST_THEME_PACKAGES_CHANNEL,
  OPEN_THEMES_DIRECTORY_CHANNEL,
  REFRESH_THEME_PACKAGES_CHANNEL,
  type ThemePackageDescriptor
} from "../shared/theme-package";
import {
  ACTIVATE_WORKSPACE_TAB_CHANNEL,
  CLOSE_WORKSPACE_TAB_CHANNEL,
  COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL,
  CONFIRM_WORKSPACE_OWNER_TAB_ACTIVATION_CHANNEL,
  CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL,
  CREATE_WORKSPACE_TAB_CHANNEL,
  DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
  GET_WORKSPACE_SNAPSHOT_CHANNEL,
  MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
  OPEN_WORKSPACE_FILE_CHANNEL,
  OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL,
  OPEN_WORKSPACE_PATH_EVENT,
  RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
  REORDER_WORKSPACE_TAB_CHANNEL,
  REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT,
  REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT,
  RESOLVE_EXTERNAL_CHANGE_CHANNEL,
  type ActivateWorkspaceTabInput,
  type CloseWorkspaceTabInput,
  type CompleteWorkspaceWindowCloseInput,
  type ConfirmWorkspaceOwnerTabActivationInput,
  type ConfirmWorkspaceWindowCloseInput,
  type ConfirmWorkspaceWindowCloseResult,
  type CreateWorkspaceTabInput,
  type DetachWorkspaceTabToNewWindowInput,
  type MoveWorkspaceTabToWindowInput,
  type OpenWorkspaceFileFromPathResult,
  type OpenWorkspaceFileResult,
  type OpenWorkspacePathRequest,
  type ReloadWorkspaceTabFromPathInput,
  type ReloadWorkspaceTabFromPathResult,
  type ReorderWorkspaceTabInput,
  type ResolveExternalChangeInput,
  type ResolveExternalChangeResult,
  type WorkspaceMoveTabResult,
  type WorkspaceOwnerTabActivationRequest,
  type WorkspaceWindowCloseRequest,
  type WorkspaceWindowSnapshot
} from "../shared/workspace";

export interface ProductIpcPort {
  invoke<TResult>(channel: string, ...args: readonly unknown[]): Promise<TResult>;
  on(channel: string, listener: (event: unknown, payload: unknown) => void): void;
  off(channel: string, listener: (event: unknown, payload: unknown) => void): void;
}

export interface ProductFilePathPort {
  getPathForFile(file: File): string;
}

export interface ProductRuntimePort {
  readonly platform: NodeJS.Platform;
  readonly argv: readonly string[];
}

export interface CreateProductApiInput {
  readonly ipc: ProductIpcPort;
  readonly filePath: ProductFilePathPort;
  readonly runtime: ProductRuntimePort;
}

const RUNTIME_MODE_ARGUMENT_PREFIX = "--fishmark-runtime-mode=";
const STARTUP_OPEN_PATH_ARGUMENT_PREFIX = "--fishmark-startup-open-path=";

export function createProductApi({ ipc, filePath, runtime }: CreateProductApiInput): ProductBridge {
  const subscribe = <TPayload>(
    channel: string,
    listener: (payload: TPayload) => void
  ): (() => void) => {
    const callback = (_event: unknown, payload: unknown) => listener(payload as TPayload);
    ipc.on(channel, callback);
    return () => ipc.off(channel, callback);
  };

  return {
    platform: runtime.platform,
    runtimeMode: resolveRuntimeModeFromArgv(runtime.argv),
    startupOpenPath: resolveStartupOpenPathFromArgv(runtime.argv),
    handleDroppedMarkdownFile: (input: HandleDroppedMarkdownFileInput) =>
      ipc.invoke<HandleDroppedMarkdownFileResult>(HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL, input),
    getPathForDroppedFile: (file: File) => filePath.getPathForFile(file),
    getWorkspaceSnapshot: () =>
      ipc.invoke<WorkspaceWindowSnapshot>(GET_WORKSPACE_SNAPSHOT_CHANNEL),
    resolveExternalChange: (input: ResolveExternalChangeInput) =>
      ipc.invoke<ResolveExternalChangeResult>(RESOLVE_EXTERNAL_CHANGE_CHANNEL, input),
    createWorkspaceTab: (input: CreateWorkspaceTabInput) =>
      ipc.invoke<WorkspaceWindowSnapshot>(CREATE_WORKSPACE_TAB_CHANNEL, input),
    openWorkspaceFile: () => ipc.invoke<OpenWorkspaceFileResult>(OPEN_WORKSPACE_FILE_CHANNEL),
    openWorkspaceFileFromPath: (targetPath: string) =>
      ipc.invoke<OpenWorkspaceFileFromPathResult>(OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL, { targetPath }),
    reloadWorkspaceTabFromPath: (input: ReloadWorkspaceTabFromPathInput) =>
      ipc.invoke<ReloadWorkspaceTabFromPathResult>(RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL, input),
    activateWorkspaceTab: (input: ActivateWorkspaceTabInput) =>
      ipc.invoke<WorkspaceWindowSnapshot>(ACTIVATE_WORKSPACE_TAB_CHANNEL, input),
    closeWorkspaceTab: (input: CloseWorkspaceTabInput) =>
      ipc.invoke<WorkspaceWindowSnapshot>(CLOSE_WORKSPACE_TAB_CHANNEL, input),
    reorderWorkspaceTab: (input: ReorderWorkspaceTabInput) =>
      ipc.invoke<WorkspaceWindowSnapshot>(REORDER_WORKSPACE_TAB_CHANNEL, input),
    moveWorkspaceTabToWindow: (input: MoveWorkspaceTabToWindowInput) =>
      ipc.invoke<WorkspaceMoveTabResult>(MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL, input),
    detachWorkspaceTabToNewWindow: (input: DetachWorkspaceTabToNewWindowInput) =>
      ipc.invoke<WorkspaceWindowSnapshot>(DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL, input),
    applyDocumentEdits: (input: ApplyDocumentEditsInput) =>
      ipc.invoke<ApplyDocumentEditsResult>(APPLY_DOCUMENT_EDITS_CHANNEL, input),
    flushDocumentEdits: (input: FlushDocumentEditsInput) =>
      ipc.invoke<FlushDocumentEditsResult>(FLUSH_DOCUMENT_EDITS_CHANNEL, input),
    onDocumentProjection: (listener: (event: DocumentProjectionEvent) => void) =>
      subscribe(DOCUMENT_PROJECTION_EVENT, listener),
    saveMarkdownFile: (input: SaveMarkdownFileInput) =>
      ipc.invoke<SaveMarkdownFileResult>(SAVE_MARKDOWN_FILE_CHANNEL, input),
    saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) =>
      ipc.invoke<SaveMarkdownFileResult>(SAVE_MARKDOWN_FILE_AS_CHANNEL, input),
    exportHtmlFile: (input: ExportHtmlFileInput) =>
      ipc.invoke(EXPORT_HTML_FILE_CHANNEL, input),
    syncWatchedMarkdownFile: () => ipc.invoke<void>(SYNC_WATCHED_MARKDOWN_FILE_CHANNEL),
    importClipboardImage: (input: ImportClipboardImageInput) =>
      ipc.invoke<ImportClipboardImageResult>(IMPORT_CLIPBOARD_IMAGE_CHANNEL, input),
    onMenuCommand: (listener: (command: AppMenuCommand) => void) =>
      subscribe(APP_MENU_COMMAND_EVENT, listener),
    onOpenWorkspacePath: (listener: (payload: OpenWorkspacePathRequest) => void) =>
      subscribe(OPEN_WORKSPACE_PATH_EVENT, listener),
    onWorkspaceOwnerTabActivationRequest: (listener) => {
      const callback = async (_event: unknown, payload: unknown) => {
        const request = payload as WorkspaceOwnerTabActivationRequest;
        let success = false;
        try {
          success = await listener(request);
        } catch {
          success = false;
        }
        try {
          await ipc.invoke<void>(CONFIRM_WORKSPACE_OWNER_TAB_ACTIVATION_CHANNEL, {
            requestId: request.requestId,
            tabId: request.tabId,
            success
          } satisfies ConfirmWorkspaceOwnerTabActivationInput);
        } catch {
          // Main owns timeout/abort settlement when confirmation transport fails.
        }
      };
      ipc.on(REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT, callback);
      return () => ipc.off(REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT, callback);
    },
    confirmWorkspaceWindowClose: (input: ConfirmWorkspaceWindowCloseInput) =>
      ipc.invoke<ConfirmWorkspaceWindowCloseResult>(CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL, input),
    onWorkspaceWindowCloseRequest: (listener) => {
      const callback = async (_event: unknown, rawPayload: unknown) => {
        const payload = rawPayload as WorkspaceWindowCloseRequest;
        let shouldClose = false;
        try {
          shouldClose = await listener(payload);
        } finally {
          await ipc.invoke<void>(COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL, {
            requestId: payload.requestId,
            shouldClose
          } satisfies CompleteWorkspaceWindowCloseInput);
        }
      };
      ipc.on(REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT, callback);
      return () => ipc.off(REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT, callback);
    },
    getPreferences: () => ipc.invoke<Preferences>(GET_PREFERENCES_CHANNEL),
    updatePreferences: (patch: PreferencesUpdate) =>
      ipc.invoke<UpdatePreferencesResult>(UPDATE_PREFERENCES_CHANNEL, patch),
    selectTemporaryImageDirectory: () =>
      ipc.invoke<string | null>(SELECT_TEMPORARY_IMAGE_DIRECTORY_CHANNEL),
    onPreferencesChanged: (listener) => subscribe(PREFERENCES_CHANGED_EVENT, listener),
    getRecentFiles: () => ipc.invoke<RecentFilesSnapshot>(GET_RECENT_FILES_CHANNEL),
    clearRecentFile: (input: ClearRecentFileInput) =>
      ipc.invoke<RecentFilesSnapshot>(CLEAR_RECENT_FILE_CHANNEL, input),
    onRecentFilesChanged: (listener) => subscribe(RECENT_FILES_CHANGED_EVENT, listener),
    onAppUpdateState: (listener: (state: AppUpdateState) => void) =>
      subscribe(APP_UPDATE_STATE_EVENT, listener),
    onAppNotification: (listener: (notification: AppNotification) => void) =>
      subscribe(APP_NOTIFICATION_EVENT, listener),
    onExternalMarkdownFileChanged: (listener: (event: ExternalMarkdownFileChangedEvent) => void) =>
      subscribe(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, listener),
    listFontFamilies: () => ipc.invoke<string[]>(LIST_FONT_FAMILIES_CHANNEL),
    listThemePackages: () => ipc.invoke<ThemePackageDescriptor[]>(LIST_THEME_PACKAGES_CHANNEL),
    refreshThemePackages: () => ipc.invoke<ThemePackageDescriptor[]>(REFRESH_THEME_PACKAGES_CHANNEL),
    openThemesDirectory: () => ipc.invoke<void>(OPEN_THEMES_DIRECTORY_CHANNEL),
    checkForUpdates: () => ipc.invoke<void>(CHECK_FOR_APP_UPDATES_CHANNEL),
    openExternalLink: (href: OpenExternalLinkInput["href"]) =>
      ipc.invoke<void>(OPEN_EXTERNAL_LINK_CHANNEL, { href })
  };
}

function resolveRuntimeModeFromArgv(argv: readonly string[]): "editor" | "test-workbench" {
  const value = argv.find((entry) => entry.startsWith(RUNTIME_MODE_ARGUMENT_PREFIX))
    ?.slice(RUNTIME_MODE_ARGUMENT_PREFIX.length);
  return value === "test-workbench" ? "test-workbench" : "editor";
}

function resolveStartupOpenPathFromArgv(argv: readonly string[]): string | null {
  const encodedPath = argv.find((entry) => entry.startsWith(STARTUP_OPEN_PATH_ARGUMENT_PREFIX))
    ?.slice(STARTUP_OPEN_PATH_ARGUMENT_PREFIX.length);
  if (!encodedPath) return null;
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}
