import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ProductBridge } from "../shared/product-bridge";
import type { TestBridge } from "../shared/test-bridge";
import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput
} from "../shared/save-markdown-file";
import type {
  OpenWorkspaceFileFromPathResult,
  OpenWorkspaceFileResult
} from "../shared/workspace";
// Preload runs inside Electron's sandboxed environment, so local module imports
// can prevent the bridge from loading at all. Keep the contract self-contained here.
const OPEN_MARKDOWN_FILE_CHANNEL = "fishmark:open-markdown-file";
const OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL = "fishmark:open-markdown-file-from-path";
const HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL = "fishmark:handle-dropped-markdown-file";
const GET_WORKSPACE_SNAPSHOT_CHANNEL = "fishmark:get-workspace-snapshot";
const CREATE_WORKSPACE_TAB_CHANNEL = "fishmark:create-workspace-tab";
const OPEN_WORKSPACE_FILE_CHANNEL = "fishmark:open-workspace-file";
const OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL = "fishmark:open-workspace-file-from-path";
const ACTIVATE_WORKSPACE_TAB_CHANNEL = "fishmark:activate-workspace-tab";
const CLOSE_WORKSPACE_TAB_CHANNEL = "fishmark:close-workspace-tab";
const REORDER_WORKSPACE_TAB_CHANNEL = "fishmark:reorder-workspace-tab";
const MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL = "fishmark:move-workspace-tab-to-window";
const DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL = "fishmark:detach-workspace-tab-to-new-window";
const UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL = "fishmark:update-workspace-tab-draft";
const RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL = "fishmark:reload-workspace-tab-from-path";
const OPEN_WORKSPACE_PATH_EVENT = "fishmark:open-workspace-path";
const SAVE_MARKDOWN_FILE_CHANNEL = "fishmark:save-markdown-file";
const SAVE_MARKDOWN_FILE_AS_CHANNEL = "fishmark:save-markdown-file-as";
const SYNC_WATCHED_MARKDOWN_FILE_CHANNEL = "fishmark:sync-watched-markdown-file";
const IMPORT_CLIPBOARD_IMAGE_CHANNEL = "fishmark:import-clipboard-image";
const OPEN_EDITOR_TEST_WINDOW_CHANNEL = "fishmark:open-editor-test-window";
const START_SCENARIO_RUN_CHANNEL = "fishmark:start-scenario-run";
const INTERRUPT_SCENARIO_RUN_CHANNEL = "fishmark:interrupt-scenario-run";
const SCENARIO_RUN_EVENT = "fishmark:scenario-run-event";
const SCENARIO_RUN_TERMINAL_EVENT = "fishmark:scenario-run-terminal";
const EDITOR_TEST_COMMAND_EVENT = "fishmark:editor-test-command";
const COMPLETE_EDITOR_TEST_COMMAND_CHANNEL = "fishmark:complete-editor-test-command";
const APP_MENU_COMMAND_EVENT = "fishmark:app-menu-command";
const GET_PREFERENCES_CHANNEL = "fishmark:get-preferences";
const UPDATE_PREFERENCES_CHANNEL = "fishmark:update-preferences";
const PREFERENCES_CHANGED_EVENT = "fishmark:preferences-changed";
const LIST_FONT_FAMILIES_CHANNEL = "fishmark:list-font-families";
const LIST_THEME_PACKAGES_CHANNEL = "fishmark:list-theme-packages";
const REFRESH_THEME_PACKAGES_CHANNEL = "fishmark:refresh-theme-packages";
const OPEN_THEMES_DIRECTORY_CHANNEL = "fishmark:open-themes-directory";
const CHECK_FOR_APP_UPDATES_CHANNEL = "fishmark:check-for-app-updates";
const APP_UPDATE_STATE_EVENT = "fishmark:app-update-state";
const APP_NOTIFICATION_EVENT = "fishmark:app-notification";
const EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT = "fishmark:external-markdown-file-changed";
const RUNTIME_MODE_ARGUMENT_PREFIX = "--fishmark-runtime-mode=";
const STARTUP_OPEN_PATH_ARGUMENT_PREFIX = "--fishmark-startup-open-path=";

type EditorTestCommand =
  | { type: "wait-for-editor-ready" }
  | { type: "open-fixture-file"; fixturePath: string }
  | { type: "set-editor-content"; content: string }
  | { type: "insert-editor-text"; text: string }
  | { type: "set-editor-selection"; anchor: number; head?: number }
  | { type: "press-editor-enter" }
  | { type: "press-editor-backspace" }
  | { type: "press-editor-tab"; shiftKey?: boolean }
  | { type: "press-editor-arrow-up" }
  | { type: "press-editor-arrow-down" }
  | { type: "save-document" }
  | { type: "assert-document-path"; expectedPath: string }
  | { type: "assert-editor-content"; expectedContent: string }
  | { type: "assert-editor-selection"; expectedAnchor: number; expectedHead?: number }
  | { type: "assert-dirty-state"; expectedDirty: boolean }
  | { type: "assert-empty-workspace" }
  | { type: "close-editor-window" };

type EditorTestCommandEnvelope = {
  sessionId: string;
  commandId: string;
  command: EditorTestCommand;
};

type EditorTestCommandResultEnvelope = {
  sessionId: string;
  commandId: string;
  result: {
    ok: boolean;
    message?: string;
    details?: Record<string, unknown>;
  };
};

export type { EditorTestCommandEnvelope, EditorTestCommandResultEnvelope };

type AppMenuCommand =
  | "new-markdown-document"
  | "open-markdown-file"
  | "new-editor-window"
  | "save-markdown-file"
  | "save-markdown-file-as"
  | "check-for-updates";

type ThemeMode = "system" | "light" | "dark";
type ThemeEffectsMode = "auto" | "full" | "off";
type ThemeParameterOverrides = Record<string, Record<string, number>>;
type ThemeSurfaceSlot = "workbenchBackground" | "titlebarBackdrop" | "welcomeHero";
type ThemeStylePart = "ui" | "editor" | "markdown" | "titlebar";
type ThemeSurfaceRenderSettings = {
  renderScale?: number;
  frameRate?: number;
};
type ThemeSurfaceDescriptor = {
  kind: "fragment";
  scene: string;
  shader: string;
  channels?: Partial<Record<"0", { type: "image"; src: string }>>;
  render?: ThemeSurfaceRenderSettings;
};
type ThemeParameterDescriptor =
  | {
      id: string;
      label: string;
      type: "slider";
      min: number;
      max: number;
      step: number;
      default: number;
      uniform?: string;
      description?: string;
    }
  | {
      id: string;
      label: string;
      type: "toggle";
      default: boolean;
      uniform?: string;
      description?: string;
    };
type ThemePackageManifest = {
  id: string;
  contractVersion: 2;
  name: string;
  version: string;
  author: string | null;
  supports: { light: boolean; dark: boolean };
  tokens: Partial<Record<"light" | "dark", string>>;
  styles: Partial<Record<ThemeStylePart, string>>;
  layout: { titlebar: string | null };
  scene: {
    id: string;
    sharedUniforms: Record<string, number>;
    render?: ThemeSurfaceRenderSettings;
  } | null;
  surfaces: Partial<Record<ThemeSurfaceSlot, ThemeSurfaceDescriptor>>;
  parameters: ThemeParameterDescriptor[];
};

type Preferences = {
  version: 2;
  autosave: { idleDelayMs: number };
  recentFiles: { maxEntries: number };
  ui: { fontFamily: string | null; fontSize: number | null };
  document: { fontFamily: string | null; cjkFontFamily: string | null; fontSize: number | null };
  theme: {
    mode: ThemeMode;
    selectedId: string | null;
    effectsMode: ThemeEffectsMode;
    parameters: ThemeParameterOverrides;
  };
};

type PreferencesUpdate = {
  autosave?: Partial<Preferences["autosave"]>;
  recentFiles?: Partial<Preferences["recentFiles"]>;
  ui?: Partial<Preferences["ui"]>;
  document?: Partial<Preferences["document"]>;
  theme?: Partial<Preferences["theme"]>;
};

type ThemePackageDescriptor = {
  id: string;
  kind: "manifest-package";
  source: "builtin" | "community";
  packageRoot: string;
  manifest: ThemePackageManifest;
};

type AppUpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; message: string };

type AppNotification = {
  kind: "loading" | "info" | "success" | "warning" | "error";
  message: string;
};
type ExternalMarkdownFileChangedEvent = {
  path: string;
  kind: "modified" | "deleted";
};
type WorkspaceTabSaveState = "idle" | "manual-saving" | "autosaving";
type WorkspaceTabStripItem = {
  tabId: string;
  path: string | null;
  name: string;
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
};
type WorkspaceDocumentSnapshot = {
  tabId: string;
  path: string | null;
  name: string;
  content: string;
  encoding: "utf-8";
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
};
type WorkspaceWindowSnapshot = {
  windowId: string;
  activeTabId: string | null;
  tabs: WorkspaceTabStripItem[];
  activeDocument: WorkspaceDocumentSnapshot | null;
};
type CreateWorkspaceTabInput = {
  kind: "untitled";
};
type ActivateWorkspaceTabInput = {
  tabId: string;
};
type CloseWorkspaceTabInput = {
  tabId: string;
};
type ReorderWorkspaceTabInput = {
  tabId: string;
  toIndex: number;
};
type MoveWorkspaceTabToWindowInput = {
  tabId: string;
  targetWindowId: string;
  targetIndex?: number;
};
type DetachWorkspaceTabToNewWindowInput = {
  tabId: string;
};
type UpdateWorkspaceTabDraftInput = {
  tabId: string;
  content: string;
};
type ReloadWorkspaceTabFromPathInput = {
  tabId: string;
  targetPath: string;
};
type WorkspaceMoveTabResult = {
  sourceWindowSnapshot: WorkspaceWindowSnapshot;
  targetWindowSnapshot: WorkspaceWindowSnapshot;
};
type OpenWorkspacePathRequest = {
  targetPath: string;
};
type SyncWatchedMarkdownFileInput = {
  tabId: string | null;
};
type ImportClipboardImageInput = {
  documentPath: string;
};

type ImportClipboardImageResult =
  | {
      status: "success";
      markdown: string;
      relativePath: string;
    }
  | {
      status: "error";
      error: {
        code:
          | "document-path-required"
          | "no-image"
          | "image-too-large"
          | "write-failed";
        message: string;
      };
    };
type UpdatePreferencesResult =
  | { status: "success"; preferences: Preferences }
  | {
      status: "error";
      error: { code: "write-failed" | "commit-failed"; message: string };
      preferences: Preferences;
    };

export type {
  Preferences as PreloadPreferences,
  PreferencesUpdate as PreloadPreferencesUpdate,
  ThemePackageDescriptor as PreloadThemePackageDescriptor,
  AppNotification as PreloadAppNotification,
  AppUpdateState as PreloadAppUpdateState,
  UpdatePreferencesResult as PreloadUpdatePreferencesResult
};
export type {
  ImportClipboardImageInput as PreloadImportClipboardImageInput,
  ImportClipboardImageResult as PreloadImportClipboardImageResult
};
export type {
  ExternalMarkdownFileChangedEvent as PreloadExternalMarkdownFileChangedEvent,
  SyncWatchedMarkdownFileInput as PreloadSyncWatchedMarkdownFileInput
};

type ScenarioRunStatus = "idle" | "running" | "passed" | "failed" | "timed-out" | "interrupted";

type ScenarioRunErrorInfo = {
  message: string;
  stack?: string;
  kind?: "config" | "step" | "timeout" | "abort";
};

type RunnerEventEnvelope = {
  runId: string;
  event:
    | { type: "scenario-start"; scenarioId: string; at: number }
    | { type: "step-start"; scenarioId: string; stepId: string; at: number }
    | {
        type: "step-end";
        scenarioId: string;
        stepId: string;
        status: "pending" | "running" | "passed" | "failed" | "timed-out" | "skipped";
        at: number;
        durationMs: number;
        error?: ScenarioRunErrorInfo;
      }
    | {
        type: "scenario-end";
        scenarioId: string;
        status: Exclude<ScenarioRunStatus, "idle">;
        at: number;
        error?: ScenarioRunErrorInfo & { stepId?: string };
      };
};

type ScenarioRunTerminal = {
  runId: string;
  exitCode: number;
  status: Exclude<ScenarioRunStatus, "idle">;
  resultPath?: string;
  stepTracePath?: string;
  error?: ScenarioRunErrorInfo & { stepId?: string };
};

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
  handleDroppedMarkdownFile: (input: { targetPaths: string[]; hasOpenDocument: boolean }) =>
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
contextBridge.exposeInMainWorld("fishmarkTest", testApi);
