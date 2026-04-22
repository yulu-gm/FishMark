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
  HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
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
  PreloadThemePackageDescriptor,
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
  EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT,
  SYNC_WATCHED_MARKDOWN_FILE_CHANNEL,
  type ExternalMarkdownFileChangedEvent,
  type SyncWatchedMarkdownFileInput
} from "../shared/external-file-change";
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
import type { ThemePackageManifest } from "../shared/theme-package";
import {
  ACTIVATE_WORKSPACE_TAB_CHANNEL,
  CLOSE_WORKSPACE_TAB_CHANNEL,
  CREATE_WORKSPACE_TAB_CHANNEL,
  DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
  GET_WORKSPACE_SNAPSHOT_CHANNEL,
  MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
  OPEN_WORKSPACE_PATH_EVENT,
  OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL,
  OPEN_WORKSPACE_FILE_CHANNEL,
  RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
  REORDER_WORKSPACE_TAB_CHANNEL,
  UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL,
  type OpenWorkspacePathRequest
} from "../shared/workspace";

const exposeInMainWorld = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const off = vi.fn();
const getPathForFile = vi.fn();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld
  },
  ipcRenderer: {
    invoke,
    on,
    off
  },
  webUtils: {
    getPathForFile
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

  it("aligns theme package manifest typing with the shared contract", () => {
    const descriptorContract: TypeEquals<
      ThemePackageManifest,
      PreloadThemePackageDescriptor["manifest"]
    > = true;

    void descriptorContract;
  });

  beforeEach(() => {
    exposeInMainWorld.mockClear();
    invoke.mockClear();
    on.mockClear();
    off.mockClear();
    getPathForFile.mockClear();
    vi.resetModules();
  });

  it("uses shared IPC channel constants for invoke-based APIs", async () => {
    const api = await loadApi();

    const openPathInput = { targetPath: "D:/fixtures/note.md" };
    const droppedMarkdownInput = {
      targetPaths: ["D:/fixtures/drop.md", "D:/fixtures/second-drop.md"],
      hasOpenDocument: true
    };
    const saveInput = { tabId: "tab-2", path: "D:/fixtures/note.md", content: "# note" };
    const saveAsInput = { tabId: "tab-2", currentPath: "D:/fixtures/note.md", content: "# note" };
    const createWorkspaceTabInput = { kind: "untitled" } as const;
    const activateWorkspaceTabInput = { tabId: "tab-2" };
    const closeWorkspaceTabInput = { tabId: "tab-2" };
    const reorderWorkspaceTabInput = { tabId: "tab-2", toIndex: 0 };
    const moveWorkspaceTabToWindowInput = {
      tabId: "tab-2",
      targetWindowId: "window-2"
    };
    const detachWorkspaceTabToNewWindowInput = { tabId: "tab-2" };
    const updateWorkspaceTabDraftInput = {
      tabId: "tab-2",
      content: "# Updated note\n"
    };
    const reloadWorkspaceTabFromPathInput = {
      tabId: "tab-2",
      targetPath: "D:/fixtures/reload.md"
    };
    const syncWatchedFileInput: SyncWatchedMarkdownFileInput = {
      tabId: "tab-2"
    };
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
      theme: { effectsMode: "off" }
    };

    void api.openMarkdownFile();
    void api.openMarkdownFileFromPath(openPathInput.targetPath);
    void api.handleDroppedMarkdownFile(droppedMarkdownInput);
    void api.getWorkspaceSnapshot();
    void api.createWorkspaceTab(createWorkspaceTabInput);
    void api.openWorkspaceFile();
    void api.openWorkspaceFileFromPath(openPathInput.targetPath);
    void api.reloadWorkspaceTabFromPath(reloadWorkspaceTabFromPathInput);
    void api.activateWorkspaceTab(activateWorkspaceTabInput);
    void api.closeWorkspaceTab(closeWorkspaceTabInput);
    void api.reorderWorkspaceTab(reorderWorkspaceTabInput);
    void api.moveWorkspaceTabToWindow(moveWorkspaceTabToWindowInput);
    void api.detachWorkspaceTabToNewWindow(detachWorkspaceTabToNewWindowInput);
    void api.updateWorkspaceTabDraft(updateWorkspaceTabDraftInput);
    void api.saveMarkdownFile(saveInput);
    void api.saveMarkdownFileAs(saveAsInput);
    void api.syncWatchedMarkdownFile(syncWatchedFileInput);
    void api.importClipboardImage(importClipboardImageInput);
    void api.openEditorTestWindow();
    void api.startScenarioRun(startRunInput);
    void api.interruptScenarioRun(interruptInput);
    void api.completeEditorTestCommand(completeInput);
    void api.getPreferences();
    void api.updatePreferences(updatePreferencesInput);
    expect(api).not.toHaveProperty("listThemes");
    expect(api).not.toHaveProperty("refreshThemes");

    void api.listFontFamilies();
    void api.listThemePackages();
    void api.refreshThemePackages();
    void api.openThemesDirectory();
    void api.checkForUpdates();

    expect(invoke.mock.calls).toContainEqual([OPEN_MARKDOWN_FILE_CHANNEL]);
    expect(invoke.mock.calls).toContainEqual([OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL, openPathInput]);
    expect(invoke.mock.calls).toContainEqual([HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL, droppedMarkdownInput]);
    expect(invoke.mock.calls).toContainEqual([GET_WORKSPACE_SNAPSHOT_CHANNEL]);
    expect(invoke.mock.calls).toContainEqual([CREATE_WORKSPACE_TAB_CHANNEL, createWorkspaceTabInput]);
    expect(invoke.mock.calls).toContainEqual([OPEN_WORKSPACE_FILE_CHANNEL]);
    expect(invoke.mock.calls).toContainEqual([OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL, openPathInput]);
    expect(invoke.mock.calls).toContainEqual([
      RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
      reloadWorkspaceTabFromPathInput
    ]);
    expect(invoke.mock.calls).toContainEqual([ACTIVATE_WORKSPACE_TAB_CHANNEL, activateWorkspaceTabInput]);
    expect(invoke.mock.calls).toContainEqual([CLOSE_WORKSPACE_TAB_CHANNEL, closeWorkspaceTabInput]);
    expect(invoke.mock.calls).toContainEqual([REORDER_WORKSPACE_TAB_CHANNEL, reorderWorkspaceTabInput]);
    expect(invoke.mock.calls).toContainEqual([
      MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
      moveWorkspaceTabToWindowInput
    ]);
    expect(invoke.mock.calls).toContainEqual([
      DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
      detachWorkspaceTabToNewWindowInput
    ]);
    expect(invoke.mock.calls).toContainEqual([
      UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL,
      updateWorkspaceTabDraftInput
    ]);
    expect(invoke.mock.calls).toContainEqual([SAVE_MARKDOWN_FILE_CHANNEL, saveInput]);
    expect(invoke.mock.calls).toContainEqual([SAVE_MARKDOWN_FILE_AS_CHANNEL, saveAsInput]);
    expect(invoke.mock.calls).toContainEqual([SYNC_WATCHED_MARKDOWN_FILE_CHANNEL, syncWatchedFileInput]);
    expect(invoke.mock.calls).toContainEqual([IMPORT_CLIPBOARD_IMAGE_CHANNEL, importClipboardImageInput]);
    expect(invoke.mock.calls).toContainEqual(["fishmark:open-editor-test-window"]);
    expect(invoke.mock.calls).toContainEqual([START_SCENARIO_RUN_CHANNEL, startRunInput]);
    expect(invoke.mock.calls).toContainEqual([INTERRUPT_SCENARIO_RUN_CHANNEL, interruptInput]);
    expect(invoke.mock.calls).toContainEqual([COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, completeInput]);
    expect(invoke.mock.calls).toContainEqual([GET_PREFERENCES_CHANNEL]);
    expect(invoke.mock.calls).toContainEqual([UPDATE_PREFERENCES_CHANNEL, updatePreferencesInput]);
    expect(invoke.mock.calls).toContainEqual(["fishmark:list-font-families"]);
    expect(invoke.mock.calls).toContainEqual(["fishmark:list-theme-packages"]);
    expect(invoke.mock.calls).toContainEqual(["fishmark:refresh-theme-packages"]);
    expect(invoke.mock.calls).toContainEqual(["fishmark:open-themes-directory"]);
    expect(invoke.mock.calls).toContainEqual([CHECK_FOR_APP_UPDATES_CHANNEL]);

    expect(invoke.mock.calls).not.toContainEqual(["fishmark:list-themes"]);
    expect(invoke.mock.calls).not.toContainEqual(["fishmark:refresh-themes"]);
  });

  it("resolves dropped file paths through Electron webUtils", async () => {
    const api = await loadApi();
    const droppedFile = new File(["content"], "drop.md", { type: "text/markdown" });
    getPathForFile.mockReturnValueOnce("D:/fixtures/drop.md");

    expect(api.getPathForDroppedFile(droppedFile)).toBe("D:/fixtures/drop.md");
    expect(getPathForFile).toHaveBeenCalledTimes(1);
    expect(getPathForFile).toHaveBeenCalledWith(droppedFile);
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
    const externalFileListener = vi.fn();
    const openWorkspacePathListener = vi.fn();

    const detachScenario = api.onScenarioRunEvent(scenarioListener);
    const detachTerminal = api.onScenarioRunTerminal(terminalListener);
    const detachEditor = api.onEditorTestCommand(editorListener);
    const detachMenu = api.onMenuCommand(menuListener);
    const detachOpenWorkspacePath = api.onOpenWorkspacePath(openWorkspacePathListener);
    const detachPreferences = api.onPreferencesChanged(preferencesListener);
    const detachUpdate = api.onAppUpdateState(updateListener);
    const detachNotification = api.onAppNotification(notificationListener);
    const detachExternalFile = api.onExternalMarkdownFileChanged(externalFileListener);

    expect(on.mock.calls).toHaveLength(9);

    const scenarioHandler = on.mock.calls[0]?.[1];
    const terminalHandler = on.mock.calls[1]?.[1];
    const editorHandler = on.mock.calls[2]?.[1];
    const menuHandler = on.mock.calls[3]?.[1];
    const openWorkspacePathHandler = on.mock.calls[4]?.[1];
    const preferencesHandler = on.mock.calls[5]?.[1];
    const updateHandler = on.mock.calls[6]?.[1];
    const notificationHandler = on.mock.calls[7]?.[1];
    const externalFileHandler = on.mock.calls[8]?.[1];

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
    const openWorkspacePathPayload: OpenWorkspacePathRequest = {
      targetPath: "D:/fixtures/external.md"
    };
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
    const externalFilePayload: ExternalMarkdownFileChangedEvent = {
      path: "D:/fixtures/note.md",
      kind: "modified"
    };

    scenarioHandler?.({}, scenarioPayload);
    terminalHandler?.({}, terminalPayload);
    editorHandler?.({}, selectionCommandPayload);
    editorHandler?.({}, enterCommandPayload);
    menuHandler?.({}, menuPayload);
    openWorkspacePathHandler?.({}, openWorkspacePathPayload);
    preferencesHandler?.({}, preferencesPayload);
    updateHandler?.({}, updatePayload);
    notificationHandler?.({}, notificationPayload);
    externalFileHandler?.({}, externalFilePayload);

    expect(scenarioListener).toHaveBeenCalledWith(scenarioPayload);
    expect(terminalListener).toHaveBeenCalledWith(terminalPayload);
    expect(editorListener).toHaveBeenNthCalledWith(1, selectionCommandPayload);
    expect(editorListener).toHaveBeenNthCalledWith(2, enterCommandPayload);
    expect(menuListener).toHaveBeenCalledWith(menuPayload);
    expect(openWorkspacePathListener).toHaveBeenCalledWith(openWorkspacePathPayload);
    expect(preferencesListener).toHaveBeenCalledWith(preferencesPayload);
    expect(updateListener).toHaveBeenCalledWith(updatePayload);
    expect(notificationListener).toHaveBeenCalledWith(notificationPayload);
    expect(externalFileListener).toHaveBeenCalledWith(externalFilePayload);

    detachScenario();
    detachTerminal();
    detachEditor();
    detachMenu();
    detachOpenWorkspacePath();
    detachPreferences();
    detachUpdate();
    detachNotification();
    detachExternalFile();

    expect(off.mock.calls).toEqual([
      [SCENARIO_RUN_EVENT, scenarioHandler],
      [SCENARIO_RUN_TERMINAL_EVENT, terminalHandler],
      [EDITOR_TEST_COMMAND_EVENT, editorHandler],
      [APP_MENU_COMMAND_EVENT, menuHandler],
      [OPEN_WORKSPACE_PATH_EVENT, openWorkspacePathHandler],
      [PREFERENCES_CHANGED_EVENT, preferencesHandler],
      [APP_UPDATE_STATE_EVENT, updateHandler],
      [APP_NOTIFICATION_EVENT, notificationHandler],
      [EXTERNAL_MARKDOWN_FILE_CHANGED_EVENT, externalFileHandler]
    ]);
  });
});
