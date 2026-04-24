import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppNotification, AppUpdateState } from "../shared/app-update";
import type { EditorTestCommandEnvelope, EditorTestCommandResultEnvelope } from "../shared/editor-test-command";
import type {
  ExternalMarkdownFileChangedEvent,
  SyncWatchedMarkdownFileInput
} from "../shared/external-file-change";
import { APP_MENU_COMMAND_EVENT, type AppMenuCommand } from "../shared/menu-command";
import type {
  Preferences,
  PreferencesUpdate,
  UpdatePreferencesResult
} from "../shared/preferences";
import type { ProductBridge } from "../shared/product-bridge";
import type { SaveMarkdownFileAsInput, SaveMarkdownFileInput } from "../shared/save-markdown-file";
import type {
  RunnerEventEnvelope,
  ScenarioRunTerminal
} from "../shared/test-run-session";
import type { TestBridge } from "../shared/test-bridge";
import {
  resolvePreloadBridgeModeFromArgv,
  type PreloadBridgeMode
} from "../shared/preload-bridge-mode";
import type {
  ActivateWorkspaceTabInput,
  CloseWorkspaceTabInput,
  CompleteWorkspaceWindowCloseInput,
  CreateWorkspaceTabInput,
  DetachWorkspaceTabToNewWindowInput,
  MoveWorkspaceTabToWindowInput,
  OpenWorkspaceFileFromPathResult,
  OpenWorkspaceFileResult,
  OpenWorkspacePathRequest,
  ReloadWorkspaceTabFromPathInput,
  ReorderWorkspaceTabInput,
  UpdateWorkspaceTabDraftInput,
  WorkspaceMoveTabResult,
  WorkspaceWindowCloseRequest,
  WorkspaceWindowSnapshot
} from "../shared/workspace";
import type { HandleDroppedMarkdownFileInput } from "../shared/open-markdown-file";
import {
  LIST_THEME_PACKAGES_CHANNEL,
  OPEN_THEMES_DIRECTORY_CHANNEL,
  REFRESH_THEME_PACKAGES_CHANNEL,
  type ThemePackageDescriptor
} from "../shared/theme-package";
import {
  HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
  OPEN_MARKDOWN_FILE_CHANNEL,
  OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL
} from "../shared/open-markdown-file";
import { LIST_FONT_FAMILIES_CHANNEL } from "../shared/font-families";

export type {
  EditorTestCommandEnvelope,
  EditorTestCommandResultEnvelope,
  EditorTestCommandEnvelope as PreloadEditorTestCommandEnvelope,
  EditorTestCommandResultEnvelope as PreloadEditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
export type {
  Preferences as PreloadPreferences,
  PreferencesUpdate as PreloadPreferencesUpdate,
  UpdatePreferencesResult as PreloadUpdatePreferencesResult
} from "../shared/preferences";
export type {
  ThemePackageDescriptor as PreloadThemePackageDescriptor
} from "../shared/theme-package";
export type {
  ImportClipboardImageInput as PreloadImportClipboardImageInput,
  ImportClipboardImageResult as PreloadImportClipboardImageResult
} from "../shared/clipboard-image-import";
export type {
  ExternalMarkdownFileChangedEvent as PreloadExternalMarkdownFileChangedEvent,
  SyncWatchedMarkdownFileInput as PreloadSyncWatchedMarkdownFileInput
} from "../shared/external-file-change";

import {
  ACTIVATE_WORKSPACE_TAB_CHANNEL,
  CLOSE_WORKSPACE_TAB_CHANNEL,
  COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL,
  CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL,
  CREATE_WORKSPACE_TAB_CHANNEL,
  DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
  GET_WORKSPACE_SNAPSHOT_CHANNEL,
  OPEN_WORKSPACE_FILE_CHANNEL,
  OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL,
  OPEN_WORKSPACE_PATH_EVENT,
  RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
  REORDER_WORKSPACE_TAB_CHANNEL,
  REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT,
  UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL,
  MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL
} from "../shared/workspace";
import {
  APP_NOTIFICATION_EVENT,
  APP_UPDATE_STATE_EVENT,
  CHECK_FOR_APP_UPDATES_CHANNEL
} from "../shared/app-update";
import {
  COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
  EDITOR_TEST_COMMAND_EVENT
} from "../shared/editor-test-command";
import {
  EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
  SYNC_WATCHED_MARKDOWN_FILE_CHANNEL
} from "../shared/external-file-change";
import { GET_PREFERENCES_CHANNEL, PREFERENCES_CHANGED_EVENT, UPDATE_PREFERENCES_CHANNEL } from "../shared/preferences";
import {
  IMPORT_CLIPBOARD_IMAGE_CHANNEL,
  type ImportClipboardImageInput,
  type ImportClipboardImageResult
} from "../shared/clipboard-image-import";
import {
  INTERRUPT_SCENARIO_RUN_CHANNEL,
  OPEN_EDITOR_TEST_WINDOW_CHANNEL,
  SCENARIO_RUN_EVENT,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL
} from "../shared/test-run-session";
import { SAVE_MARKDOWN_FILE_AS_CHANNEL, SAVE_MARKDOWN_FILE_CHANNEL } from "../shared/save-markdown-file";
// Preload runs inside Electron's sandboxed environment, so only preload-local
// runtime helpers stay here. Contract shapes and IPC names come from shared modules.
const RUNTIME_MODE_ARGUMENT_PREFIX = "--fishmark-runtime-mode=";
const STARTUP_OPEN_PATH_ARGUMENT_PREFIX = "--fishmark-startup-open-path=";

function completeWorkspaceWindowClose(input: CompleteWorkspaceWindowCloseInput): Promise<void> {
  return ipcRenderer.invoke(COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL, input);
}

function resolveRuntimeModeFromArgv(argv: string[]): "editor" | "test-workbench" {
  const runtimeArgument = argv.find((entry) => entry.startsWith(RUNTIME_MODE_ARGUMENT_PREFIX));
  const runtimeValue = runtimeArgument?.slice(RUNTIME_MODE_ARGUMENT_PREFIX.length);

  return runtimeValue === "test-workbench" ? "test-workbench" : "editor";
}

function resolveStartupOpenPathFromArgv(argv: string[]): string | null {
  const startupArgument = argv.find((entry) => entry.startsWith(STARTUP_OPEN_PATH_ARGUMENT_PREFIX));
  const encodedPath = startupArgument?.slice(STARTUP_OPEN_PATH_ARGUMENT_PREFIX.length);

  if (!encodedPath) {
    return null;
  }

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

const productApi: ProductBridge = {
  platform: process.platform,
  runtimeMode: resolveRuntimeModeFromArgv(process.argv ?? []),
  startupOpenPath: resolveStartupOpenPathFromArgv(process.argv ?? []),
  openMarkdownFile: () => ipcRenderer.invoke(OPEN_MARKDOWN_FILE_CHANNEL),
  openMarkdownFileFromPath: (targetPath: string) =>
    ipcRenderer.invoke(OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL, { targetPath }),
  handleDroppedMarkdownFile: (input: HandleDroppedMarkdownFileInput) =>
    ipcRenderer.invoke(HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL, input),
  getWorkspaceSnapshot: (): Promise<WorkspaceWindowSnapshot> =>
    ipcRenderer.invoke(GET_WORKSPACE_SNAPSHOT_CHANNEL),
  createWorkspaceTab: (input: CreateWorkspaceTabInput): Promise<WorkspaceWindowSnapshot> =>
    ipcRenderer.invoke(CREATE_WORKSPACE_TAB_CHANNEL, input),
  openWorkspaceFile: (): Promise<OpenWorkspaceFileResult> =>
    ipcRenderer.invoke(OPEN_WORKSPACE_FILE_CHANNEL),
  openWorkspaceFileFromPath: (targetPath: string): Promise<OpenWorkspaceFileFromPathResult> =>
    ipcRenderer.invoke(OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL, { targetPath }),
  reloadWorkspaceTabFromPath: (
    input: ReloadWorkspaceTabFromPathInput
  ): Promise<WorkspaceWindowSnapshot> => ipcRenderer.invoke(RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL, input),
  activateWorkspaceTab: (input: ActivateWorkspaceTabInput): Promise<WorkspaceWindowSnapshot> =>
    ipcRenderer.invoke(ACTIVATE_WORKSPACE_TAB_CHANNEL, input),
  closeWorkspaceTab: (input: CloseWorkspaceTabInput): Promise<WorkspaceWindowSnapshot> =>
    ipcRenderer.invoke(CLOSE_WORKSPACE_TAB_CHANNEL, input),
  reorderWorkspaceTab: (input: ReorderWorkspaceTabInput): Promise<WorkspaceWindowSnapshot> =>
    ipcRenderer.invoke(REORDER_WORKSPACE_TAB_CHANNEL, input),
  moveWorkspaceTabToWindow: (input: MoveWorkspaceTabToWindowInput): Promise<WorkspaceMoveTabResult> =>
    ipcRenderer.invoke(MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL, input),
  detachWorkspaceTabToNewWindow: (
    input: DetachWorkspaceTabToNewWindowInput
  ): Promise<WorkspaceWindowSnapshot> => ipcRenderer.invoke(DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL, input),
  updateWorkspaceTabDraft: (input: UpdateWorkspaceTabDraftInput): Promise<WorkspaceWindowSnapshot> =>
    ipcRenderer.invoke(UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL, input),
  getPathForDroppedFile: (file: File) => webUtils.getPathForFile(file),
  saveMarkdownFile: (input: SaveMarkdownFileInput) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_CHANNEL, input),
  saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_AS_CHANNEL, input),
  syncWatchedMarkdownFile: (input: SyncWatchedMarkdownFileInput): Promise<void> =>
    ipcRenderer.invoke(SYNC_WATCHED_MARKDOWN_FILE_CHANNEL, input),
  importClipboardImage: (input: ImportClipboardImageInput): Promise<ImportClipboardImageResult> =>
    ipcRenderer.invoke(IMPORT_CLIPBOARD_IMAGE_CHANNEL, input),
  onMenuCommand: (listener: (command: AppMenuCommand) => void) => {
    const handleMenuCommand = (_event: unknown, command: AppMenuCommand) => {
      listener(command);
    };

    ipcRenderer.on(APP_MENU_COMMAND_EVENT, handleMenuCommand);

    return () => {
      ipcRenderer.off(APP_MENU_COMMAND_EVENT, handleMenuCommand);
    };
  },
  onOpenWorkspacePath: (listener: (payload: OpenWorkspacePathRequest) => void) => {
    const handleOpenWorkspacePath = (_event: unknown, payload: OpenWorkspacePathRequest) => {
      listener(payload);
    };

    ipcRenderer.on(OPEN_WORKSPACE_PATH_EVENT, handleOpenWorkspacePath);

    return () => {
      ipcRenderer.off(OPEN_WORKSPACE_PATH_EVENT, handleOpenWorkspacePath);
    };
  },
  confirmWorkspaceWindowClose: (): Promise<boolean> =>
    ipcRenderer.invoke(CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL),
  onWorkspaceWindowCloseRequest: (listener: () => Promise<boolean>) => {
    const handleWorkspaceWindowCloseRequest = async (
      _event: unknown,
      payload: WorkspaceWindowCloseRequest
    ) => {
      let shouldClose = false;

      try {
        shouldClose = await listener();
      } finally {
        await completeWorkspaceWindowClose({
          requestId: payload.requestId,
          shouldClose
        });
      }
    };

    ipcRenderer.on(REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT, handleWorkspaceWindowCloseRequest);

    return () => {
      ipcRenderer.off(REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT, handleWorkspaceWindowCloseRequest);
    };
  },
  getPreferences: (): Promise<Preferences> => ipcRenderer.invoke(GET_PREFERENCES_CHANNEL),
  updatePreferences: (patch: PreferencesUpdate): Promise<UpdatePreferencesResult> =>
    ipcRenderer.invoke(UPDATE_PREFERENCES_CHANNEL, patch),
  listFontFamilies: (): Promise<string[]> => ipcRenderer.invoke(LIST_FONT_FAMILIES_CHANNEL),
  listThemePackages: (): Promise<ThemePackageDescriptor[]> =>
    ipcRenderer.invoke(LIST_THEME_PACKAGES_CHANNEL),
  refreshThemePackages: (): Promise<ThemePackageDescriptor[]> =>
    ipcRenderer.invoke(REFRESH_THEME_PACKAGES_CHANNEL),
  openThemesDirectory: (): Promise<void> => ipcRenderer.invoke(OPEN_THEMES_DIRECTORY_CHANNEL),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke(CHECK_FOR_APP_UPDATES_CHANNEL),
  onPreferencesChanged: (listener: (preferences: Preferences) => void) => {
    const handlePreferencesChanged = (_event: unknown, preferences: Preferences) => {
      listener(preferences);
    };

    ipcRenderer.on(PREFERENCES_CHANGED_EVENT, handlePreferencesChanged);

    return () => {
      ipcRenderer.off(PREFERENCES_CHANGED_EVENT, handlePreferencesChanged);
    };
  },
  onAppUpdateState: (listener: (state: AppUpdateState) => void) => {
    const handleAppUpdateState = (_event: unknown, state: AppUpdateState) => {
      listener(state);
    };

    ipcRenderer.on(APP_UPDATE_STATE_EVENT, handleAppUpdateState);

    return () => {
      ipcRenderer.off(APP_UPDATE_STATE_EVENT, handleAppUpdateState);
    };
  },
  onAppNotification: (listener: (notification: AppNotification) => void) => {
    const handleAppNotification = (_event: unknown, notification: AppNotification) => {
      listener(notification);
    };

    ipcRenderer.on(APP_NOTIFICATION_EVENT, handleAppNotification);

    return () => {
      ipcRenderer.off(APP_NOTIFICATION_EVENT, handleAppNotification);
    };
  },
  onExternalMarkdownFileChanged: (listener: (event: ExternalMarkdownFileChangedEvent) => void) => {
    const handleExternalMarkdownFileChanged = (
      _event: unknown,
      payload: ExternalMarkdownFileChangedEvent
    ) => {
      listener(payload);
    };

    ipcRenderer.on(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, handleExternalMarkdownFileChanged);

    return () => {
      ipcRenderer.off(EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, handleExternalMarkdownFileChanged);
    };
  }
};

const testApi: TestBridge = {
  openEditorTestWindow: () => ipcRenderer.invoke(OPEN_EDITOR_TEST_WINDOW_CHANNEL),
  startScenarioRun: (input: { scenarioId: string }) =>
    ipcRenderer.invoke(START_SCENARIO_RUN_CHANNEL, input),
  interruptScenarioRun: (input: { runId: string }) =>
    ipcRenderer.invoke(INTERRUPT_SCENARIO_RUN_CHANNEL, input),
  onScenarioRunEvent: (listener: (payload: RunnerEventEnvelope) => void) => {
    const handleScenarioRunEvent = (_event: unknown, payload: RunnerEventEnvelope) => {
      listener(payload);
    };

    ipcRenderer.on(SCENARIO_RUN_EVENT, handleScenarioRunEvent);

    return () => {
      ipcRenderer.off(SCENARIO_RUN_EVENT, handleScenarioRunEvent);
    };
  },
  onScenarioRunTerminal: (listener: (payload: ScenarioRunTerminal) => void) => {
    const handleScenarioRunTerminal = (_event: unknown, payload: ScenarioRunTerminal) => {
      listener(payload);
    };

    ipcRenderer.on(SCENARIO_RUN_TERMINAL_EVENT, handleScenarioRunTerminal);

    return () => {
      ipcRenderer.off(SCENARIO_RUN_TERMINAL_EVENT, handleScenarioRunTerminal);
    };
  },
  onEditorTestCommand: (listener: (payload: EditorTestCommandEnvelope) => void) => {
    const handleEditorTestCommand = (_event: unknown, payload: EditorTestCommandEnvelope) => {
      listener(payload);
    };

    ipcRenderer.on(EDITOR_TEST_COMMAND_EVENT, handleEditorTestCommand);

    return () => {
      ipcRenderer.off(EDITOR_TEST_COMMAND_EVENT, handleEditorTestCommand);
    };
  },
  completeEditorTestCommand: (payload: EditorTestCommandResultEnvelope) =>
    ipcRenderer.invoke(COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, payload)
};

contextBridge.exposeInMainWorld("fishmark", productApi);

const preloadBridgeMode: PreloadBridgeMode = resolvePreloadBridgeModeFromArgv({
  argv: process.argv ?? [],
  fallbackMode: productApi.runtimeMode
});

if (preloadBridgeMode !== "product") {
  contextBridge.exposeInMainWorld("fishmarkTest", testApi);
}
