import { contextBridge, ipcRenderer, webUtils } from "electron";

import {
  COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
  EDITOR_TEST_COMMAND_EVENT,
  type EditorTestCommandEnvelope,
  type EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
import {
  resolvePreloadBridgeModeFromArgv,
  type PreloadBridgeMode
} from "../shared/preload-bridge-mode";
import type { TestBridge } from "../shared/test-bridge";
import {
  INTERRUPT_SCENARIO_RUN_CHANNEL,
  OPEN_EDITOR_TEST_WINDOW_CHANNEL,
  SCENARIO_RUN_EVENT,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL,
  type RunnerEventEnvelope,
  type ScenarioRunTerminal
} from "../shared/test-run-session";
import { createProductApi } from "./product-api";

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
  ExternalMarkdownFileChangedEvent as PreloadExternalMarkdownFileChangedEvent
} from "../shared/external-file-change";

const productApi = createProductApi({
  ipc: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => {
      ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1]);
    },
    off: (channel, listener) => {
      ipcRenderer.off(channel, listener as Parameters<typeof ipcRenderer.off>[1]);
    }
  },
  filePath: webUtils,
  runtime: { platform: process.platform, argv: process.argv ?? [] }
});

const testApi: TestBridge = {
  openEditorTestWindow: () => ipcRenderer.invoke(OPEN_EDITOR_TEST_WINDOW_CHANNEL),
  startScenarioRun: (input: { scenarioId: string }) =>
    ipcRenderer.invoke(START_SCENARIO_RUN_CHANNEL, input),
  interruptScenarioRun: (input: { runId: string }) =>
    ipcRenderer.invoke(INTERRUPT_SCENARIO_RUN_CHANNEL, input),
  onScenarioRunEvent: (listener: (payload: RunnerEventEnvelope) => void) => {
    const callback = (_event: unknown, payload: RunnerEventEnvelope) => listener(payload);
    ipcRenderer.on(SCENARIO_RUN_EVENT, callback);
    return () => ipcRenderer.off(SCENARIO_RUN_EVENT, callback);
  },
  onScenarioRunTerminal: (listener: (payload: ScenarioRunTerminal) => void) => {
    const callback = (_event: unknown, payload: ScenarioRunTerminal) => listener(payload);
    ipcRenderer.on(SCENARIO_RUN_TERMINAL_EVENT, callback);
    return () => ipcRenderer.off(SCENARIO_RUN_TERMINAL_EVENT, callback);
  },
  onEditorTestCommand: (listener: (payload: EditorTestCommandEnvelope) => void) => {
    const callback = (_event: unknown, payload: EditorTestCommandEnvelope) => listener(payload);
    ipcRenderer.on(EDITOR_TEST_COMMAND_EVENT, callback);
    return () => ipcRenderer.off(EDITOR_TEST_COMMAND_EVENT, callback);
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
