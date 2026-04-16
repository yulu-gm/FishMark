import { contextBridge, ipcRenderer } from "electron";

// Preload runs inside Electron's sandboxed environment, so local module imports
// can prevent the bridge from loading at all. Keep the contract self-contained here.
const OPEN_MARKDOWN_FILE_CHANNEL = "yulora:open-markdown-file";
const OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL = "yulora:open-markdown-file-from-path";
const SAVE_MARKDOWN_FILE_CHANNEL = "yulora:save-markdown-file";
const SAVE_MARKDOWN_FILE_AS_CHANNEL = "yulora:save-markdown-file-as";
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
const LIST_THEMES_CHANNEL = "yulora:list-themes";
const REFRESH_THEMES_CHANNEL = "yulora:refresh-themes";
const RUNTIME_MODE_ARGUMENT_PREFIX = "--yulora-runtime-mode=";
const STARTUP_OPEN_PATH_ARGUMENT_PREFIX = "--yulora-startup-open-path=";

type EditorTestCommand =
  | { type: "wait-for-editor-ready" }
  | { type: "open-fixture-file"; fixturePath: string }
  | { type: "set-editor-content"; content: string }
  | { type: "insert-editor-text"; text: string }
  | { type: "set-editor-selection"; anchor: number; head?: number }
  | { type: "press-editor-enter" }
  | { type: "save-document" }
  | { type: "assert-document-path"; expectedPath: string }
  | { type: "assert-editor-content"; expectedContent: string }
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

type AppMenuCommand = "open-markdown-file" | "save-markdown-file" | "save-markdown-file-as";

type ThemeMode = "system" | "light" | "dark";

type Preferences = {
  version: 2;
  autosave: { idleDelayMs: number };
  recentFiles: { maxEntries: number };
  ui: { fontSize: number | null };
  document: { fontFamily: string | null; fontSize: number | null };
  theme: { mode: ThemeMode; selectedId: string | null };
};

type PreferencesUpdate = {
  autosave?: Partial<Preferences["autosave"]>;
  recentFiles?: Partial<Preferences["recentFiles"]>;
  ui?: Partial<Preferences["ui"]>;
  document?: Partial<Preferences["document"]>;
  theme?: Partial<Preferences["theme"]>;
};

type ThemeDescriptor = {
  id: string;
  source: "builtin" | "community";
  name: string;
  directoryName: string;
  availableParts: {
    tokens: boolean;
    ui: boolean;
    editor: boolean;
    markdown: boolean;
  };
  partUrls: Partial<{
    tokens: string;
    ui: string;
    editor: string;
    markdown: string;
  }>;
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
  ThemeDescriptor as PreloadThemeDescriptor,
  UpdatePreferencesResult as PreloadUpdatePreferencesResult
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
  saveMarkdownFile: (input: { path: string; content: string }) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_CHANNEL, input),
  saveMarkdownFileAs: (input: { currentPath: string; content: string }) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_AS_CHANNEL, input),
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
  listThemes: (): Promise<ThemeDescriptor[]> => ipcRenderer.invoke(LIST_THEMES_CHANNEL),
  refreshThemes: (): Promise<ThemeDescriptor[]> => ipcRenderer.invoke(REFRESH_THEMES_CHANNEL),
  onPreferencesChanged: (listener: (preferences: Preferences) => void) => {
    const handlePreferencesChanged = (_event: unknown, preferences: Preferences) => {
      listener(preferences);
    };

    ipcRenderer.on(PREFERENCES_CHANGED_EVENT, handlePreferencesChanged);

    return () => {
      ipcRenderer.off(PREFERENCES_CHANGED_EVENT, handlePreferencesChanged);
    };
  }
};

contextBridge.exposeInMainWorld("yulora", api);
