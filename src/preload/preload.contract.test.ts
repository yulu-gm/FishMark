import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
  type EditorTestCommandEnvelope as SharedEditorTestCommandEnvelope,
  type EditorTestCommandResultEnvelope as SharedEditorTestCommandResultEnvelope,
  EDITOR_TEST_COMMAND_EVENT
} from "../shared/editor-test-command";
import {
  type EditorTestCommandEnvelope as PreloadEditorTestCommandEnvelope,
  type EditorTestCommandResultEnvelope as PreloadEditorTestCommandResultEnvelope
} from "./preload";
import { APP_MENU_COMMAND_EVENT, type AppMenuCommand } from "../shared/menu-command";
import {
  OPEN_MARKDOWN_FILE_CHANNEL,
  OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL
} from "../shared/open-markdown-file";
import {
  DEFAULT_PREFERENCES,
  GET_PREFERENCES_CHANNEL,
  PREFERENCES_CHANGED_EVENT,
  UPDATE_PREFERENCES_CHANNEL,
  type Preferences,
  type PreferencesUpdate
} from "../shared/preferences";
import type {
  PreloadPreferences,
  PreloadPreferencesUpdate,
  PreloadUpdatePreferencesResult
} from "./preload";
import {
  SAVE_MARKDOWN_FILE_AS_CHANNEL,
  SAVE_MARKDOWN_FILE_CHANNEL
} from "../shared/save-markdown-file";
import {
  IMPORT_CLIPBOARD_IMAGE_CHANNEL,
  type ImportClipboardImageInput
} from "../shared/clipboard-image-import";
import {
  INTERRUPT_SCENARIO_RUN_CHANNEL,
  SCENARIO_RUN_EVENT,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL,
  type RunnerEventEnvelope,
  type ScenarioRunTerminal
} from "../shared/test-run-session";
import {
  APP_NOTIFICATION_EVENT,
  APP_UPDATE_STATE_EVENT,
  CHECK_FOR_APP_UPDATES_CHANNEL,
  type AppNotification,
  type AppUpdateState
} from "../shared/app-update";

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const off = vi.fn();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke,
    on,
    off
  }
}));

async function loadApi() {
  await import("./preload");

  expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
  const [, api] = exposeInMainWorld.mock.calls[0] ?? [];
  return api;
}

describe("preload contract", () => {
  type TypeEquals<A, B> = A extends B ? (B extends A ? true : never) : never;

  it("aligns editor-test command types with shared contract types", () => {
    const editorEnvelopeContract: TypeEquals<
      SharedEditorTestCommandEnvelope,
      PreloadEditorTestCommandEnvelope
    > = true;
    const resultEnvelopeContract: TypeEquals<
      SharedEditorTestCommandResultEnvelope,
      PreloadEditorTestCommandResultEnvelope
    > = true;

    void editorEnvelopeContract;
    void resultEnvelopeContract;
  });

  it("aligns preference types with the shared contract", () => {
    const preferencesContract: TypeEquals<Preferences, PreloadPreferences> = true;
    const updateContract: TypeEquals<PreferencesUpdate, PreloadPreferencesUpdate> = true;

    void preferencesContract;
    void updateContract;

    const sample: PreloadUpdatePreferencesResult = {
      status: "success",
      preferences: DEFAULT_PREFERENCES
    };
    expect(sample.status).toBe("success");
  });

  beforeEach(() => {
    exposeInMainWorld.mockClear();
    invoke.mockClear();
    on.mockClear();
    off.mockClear();
    vi.resetModules();
  });

  it("uses shared IPC channel constants for invoke-based APIs", async () => {
    const api = await loadApi();

    const openPathInput = { targetPath: "D:/fixtures/note.md" };
    const saveInput = { path: "D:/fixtures/note.md", content: "# note" };
    const saveAsInput = { currentPath: "D:/fixtures/note.md", content: "# note" };
    const importClipboardImageInput: ImportClipboardImageInput = {
      documentPath: "D:/fixtures/note.md"
    };
    const startRunInput = { scenarioId: "open-markdown-file-basic" };
    const interruptInput = { runId: "run-1" };
    const completeInput: SharedEditorTestCommandResultEnvelope = {
      sessionId: "session-1",
      commandId: "command-1",
      result: {
        ok: true,
        details: {
          selection: { anchor: 1, head: 3 }
        }
      }
    };
    const updatePreferencesInput: PreferencesUpdate = {
      autosave: { idleDelayMs: 1500 },
      document: { fontFamily: "IBM Plex Serif", fontSize: 18 }
    };

    void api.openMarkdownFile();
    void api.openMarkdownFileFromPath(openPathInput.targetPath);
    void api.saveMarkdownFile(saveInput);
    void api.saveMarkdownFileAs(saveAsInput);
    void api.importClipboardImage(importClipboardImageInput);
    void api.openEditorTestWindow();
    void api.startScenarioRun(startRunInput);
    void api.interruptScenarioRun(interruptInput);
    void api.completeEditorTestCommand(completeInput);
    void api.getPreferences();
    void api.updatePreferences(updatePreferencesInput);
    void api.listFontFamilies();
    void api.listThemes();
    void api.refreshThemes();
    void api.checkForUpdates();

    expect(invoke.mock.calls).toEqual([
      [OPEN_MARKDOWN_FILE_CHANNEL],
      [OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL, openPathInput],
      [SAVE_MARKDOWN_FILE_CHANNEL, saveInput],
      [SAVE_MARKDOWN_FILE_AS_CHANNEL, saveAsInput],
      [IMPORT_CLIPBOARD_IMAGE_CHANNEL, importClipboardImageInput],
      ["yulora:open-editor-test-window"],
      [START_SCENARIO_RUN_CHANNEL, startRunInput],
      [INTERRUPT_SCENARIO_RUN_CHANNEL, interruptInput],
      [COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, completeInput],
      [GET_PREFERENCES_CHANNEL],
      [UPDATE_PREFERENCES_CHANNEL, updatePreferencesInput],
      ["yulora:list-font-families"],
      ["yulora:list-themes"],
      ["yulora:refresh-themes"],
      [CHECK_FOR_APP_UPDATES_CHANNEL]
    ]);
  });

  it("forwards shared event payloads without reshaping them", async () => {
    const api = await loadApi();
    const scenarioListener = vi.fn();
    const terminalListener = vi.fn();
    const editorListener = vi.fn();
    const menuListener = vi.fn();
    const preferencesListener = vi.fn();
    const updateListener = vi.fn();
    const notificationListener = vi.fn();

    const detachScenario = api.onScenarioRunEvent(scenarioListener);
    const detachTerminal = api.onScenarioRunTerminal(terminalListener);
    const detachEditor = api.onEditorTestCommand(editorListener);
    const detachMenu = api.onMenuCommand(menuListener);
    const detachPreferences = api.onPreferencesChanged(preferencesListener);
    const detachUpdate = api.onAppUpdateState(updateListener);
    const detachNotification = api.onAppNotification(notificationListener);

    expect(on.mock.calls).toHaveLength(7);

    const scenarioHandler = on.mock.calls[0]?.[1];
    const terminalHandler = on.mock.calls[1]?.[1];
    const editorHandler = on.mock.calls[2]?.[1];
    const menuHandler = on.mock.calls[3]?.[1];
    const preferencesHandler = on.mock.calls[4]?.[1];
    const updateHandler = on.mock.calls[5]?.[1];
    const notificationHandler = on.mock.calls[6]?.[1];

    const scenarioPayload: RunnerEventEnvelope = {
      runId: "run-1",
      event: {
        type: "step-end",
        scenarioId: "open-markdown-file-basic",
        stepId: "open",
        status: "passed",
        at: 100,
        durationMs: 20
      }
    };
    const terminalPayload: ScenarioRunTerminal = {
      runId: "run-1",
      exitCode: 0,
      status: "passed",
      resultPath: ".artifacts/test-runs/run-1/result.json"
    };
    const selectionCommandPayload: SharedEditorTestCommandEnvelope = {
      sessionId: "session-1",
      commandId: "command-1",
      command: {
        type: "set-editor-selection",
        anchor: 4,
        head: 7
      }
    };
    const enterCommandPayload: SharedEditorTestCommandEnvelope = {
      sessionId: "session-1",
      commandId: "command-2",
      command: {
        type: "press-editor-enter"
      }
    };
    const menuPayload: AppMenuCommand = "new-markdown-document";
    const preferencesPayload: Preferences = DEFAULT_PREFERENCES;
    const updatePayload: AppUpdateState = {
      kind: "downloading",
      version: "0.1.1",
      percent: 42
    };
    const notificationPayload: AppNotification = {
      kind: "info",
      message: "当前已是最新版本。"
    };

    scenarioHandler?.({}, scenarioPayload);
    terminalHandler?.({}, terminalPayload);
    editorHandler?.({}, selectionCommandPayload);
    editorHandler?.({}, enterCommandPayload);
    menuHandler?.({}, menuPayload);
    preferencesHandler?.({}, preferencesPayload);
    updateHandler?.({}, updatePayload);
    notificationHandler?.({}, notificationPayload);

    expect(scenarioListener).toHaveBeenCalledWith(scenarioPayload);
    expect(terminalListener).toHaveBeenCalledWith(terminalPayload);
    expect(editorListener).toHaveBeenNthCalledWith(1, selectionCommandPayload);
    expect(editorListener).toHaveBeenNthCalledWith(2, enterCommandPayload);
    expect(menuListener).toHaveBeenCalledWith(menuPayload);
    expect(preferencesListener).toHaveBeenCalledWith(preferencesPayload);
    expect(updateListener).toHaveBeenCalledWith(updatePayload);
    expect(notificationListener).toHaveBeenCalledWith(notificationPayload);

    detachScenario();
    detachTerminal();
    detachEditor();
    detachMenu();
    detachPreferences();
    detachUpdate();
    detachNotification();

    expect(off.mock.calls).toEqual([
      [SCENARIO_RUN_EVENT, scenarioHandler],
      [SCENARIO_RUN_TERMINAL_EVENT, terminalHandler],
      [EDITOR_TEST_COMMAND_EVENT, editorHandler],
      [APP_MENU_COMMAND_EVENT, menuHandler],
      [PREFERENCES_CHANGED_EVENT, preferencesHandler],
      [APP_UPDATE_STATE_EVENT, updateHandler],
      [APP_NOTIFICATION_EVENT, notificationHandler]
    ]);
  });
});
