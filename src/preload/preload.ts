import { contextBridge, ipcRenderer, webUtils } from "electron";
// Preload runs inside Electron's sandboxed environment, so local module imports
// can prevent the bridge from loading at all. Keep the contract self-contained here.
const OPEN_MARKDOWN_FILE_CHANNEL = "yulora:open-markdown-file";
const OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL = "yulora:open-markdown-file-from-path";
const HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL = "yulora:handle-dropped-markdown-file";
const SAVE_MARKDOWN_FILE_CHANNEL = "yulora:save-markdown-file";
const SAVE_MARKDOWN_FILE_AS_CHANNEL = "yulora:save-markdown-file-as";
const IMPORT_CLIPBOARD_IMAGE_CHANNEL = "yulora:import-clipboard-image";
const OPEN_EDITOR_TEST_WINDOW_CHANNEL = "yulora:open-editor-test-window";
const START_SCENARIO_RUN_CHANNEL = "yulora:start-scenario-run";
const INTERRUPT_SCENARIO_RUN_CHANNEL = "yulora:interrupt-scenario-run";
const SCENARIO_RUN_EVENT = "yulora:scenario-run-event";
const SCENARIO_RUN_TERMINAL_EVENT = "yulora:scenario-run-terminal";
const EDITOR_TEST_COMMAND_EVENT = "yulora:editor-test-command";
const COMPLETE_EDITOR_TEST_COMMAND_CHANNEL = "yulora:complete-editor-test-command";
const APP_MENU_COMMAND_EVENT = "yulora:app-menu-command";
const GET_PREFERENCES_CHANNEL = "yulora:get-preferences";
const UPDATE_PREFERENCES_CHANNEL = "yulora:update-preferences";
const PREFERENCES_CHANGED_EVENT = "yulora:preferences-changed";
const LIST_FONT_FAMILIES_CHANNEL = "yulora:list-font-families";
const LIST_THEME_PACKAGES_CHANNEL = "yulora:list-theme-packages";
const REFRESH_THEME_PACKAGES_CHANNEL = "yulora:refresh-theme-packages";
const OPEN_THEMES_DIRECTORY_CHANNEL = "yulora:open-themes-directory";
const CHECK_FOR_APP_UPDATES_CHANNEL = "yulora:check-for-app-updates";
const APP_UPDATE_STATE_EVENT = "yulora:app-update-state";
const APP_NOTIFICATION_EVENT = "yulora:app-notification";
const RUNTIME_MODE_ARGUMENT_PREFIX = "--yulora-runtime-mode=";
const STARTUP_OPEN_PATH_ARGUMENT_PREFIX = "--yulora-startup-open-path=";

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
  | "save-markdown-file"
  | "save-markdown-file-as";

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

const api = {
  platform: process.platform,
  runtimeMode: resolveRuntimeModeFromArgv(process.argv ?? []),
  startupOpenPath: resolveStartupOpenPathFromArgv(process.argv ?? []),
  openMarkdownFile: () => ipcRenderer.invoke(OPEN_MARKDOWN_FILE_CHANNEL),
  openMarkdownFileFromPath: (targetPath: string) =>
    ipcRenderer.invoke(OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL, { targetPath }),
  handleDroppedMarkdownFile: (input: { targetPath: string; hasOpenDocument: boolean }) =>
    ipcRenderer.invoke(HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL, input),
  getPathForDroppedFile: (file: File) => webUtils.getPathForFile(file),
  saveMarkdownFile: (input: { path: string; content: string }) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_CHANNEL, input),
  saveMarkdownFileAs: (input: { currentPath: string | null; content: string }) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_AS_CHANNEL, input),
  importClipboardImage: (input: ImportClipboardImageInput): Promise<ImportClipboardImageResult> =>
    ipcRenderer.invoke(IMPORT_CLIPBOARD_IMAGE_CHANNEL, input),
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
    ipcRenderer.invoke(COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, payload),
  onMenuCommand: (listener: (command: AppMenuCommand) => void) => {
    const handleMenuCommand = (_event: unknown, command: AppMenuCommand) => {
      listener(command);
    };

    ipcRenderer.on(APP_MENU_COMMAND_EVENT, handleMenuCommand);

    return () => {
      ipcRenderer.off(APP_MENU_COMMAND_EVENT, handleMenuCommand);
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
  }
};

contextBridge.exposeInMainWorld("yulora", api);
