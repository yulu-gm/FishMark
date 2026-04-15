import { contextBridge, ipcRenderer } from "electron";
import {
  OPEN_MARKDOWN_FILE_CHANNEL,
  OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL
} from "../shared/open-markdown-file";
import {
  COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
  EDITOR_TEST_COMMAND_EVENT,
  type EditorTestCommandEnvelope,
  type EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
import {
  INTERRUPT_SCENARIO_RUN_CHANNEL,
  SCENARIO_RUN_EVENT,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL,
  type RunnerEventEnvelope,
  type ScenarioRunTerminal
} from "../shared/test-run-session";

const SAVE_MARKDOWN_FILE_CHANNEL = "yulora:save-markdown-file";
const SAVE_MARKDOWN_FILE_AS_CHANNEL = "yulora:save-markdown-file-as";
const OPEN_EDITOR_TEST_WINDOW_CHANNEL = "yulora:open-editor-test-window";
const APP_MENU_COMMAND_EVENT = "yulora:app-menu-command";
const RUNTIME_MODE_ARGUMENT_PREFIX = "--yulora-runtime-mode=";

type AppMenuCommand = "open-markdown-file" | "save-markdown-file" | "save-markdown-file-as";

function resolveRuntimeModeFromArgv(argv: string[]): "editor" | "test-workbench" {
  const runtimeArgument = argv.find((entry) => entry.startsWith(RUNTIME_MODE_ARGUMENT_PREFIX));
  const runtimeValue = runtimeArgument?.slice(RUNTIME_MODE_ARGUMENT_PREFIX.length);

  return runtimeValue === "test-workbench" ? "test-workbench" : "editor";
}

const api = {
  platform: process.platform,
  runtimeMode: resolveRuntimeModeFromArgv(process.argv ?? []),
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
  }
};

contextBridge.exposeInMainWorld("yulora", api);
