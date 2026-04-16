import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COMPLETE_EDITOR_TEST_COMMAND_CHANNEL,
  type EditorTestCommandEnvelope,
  type EditorTestCommandResultEnvelope,
  EDITOR_TEST_COMMAND_EVENT
} from "../shared/editor-test-command";
import { APP_MENU_COMMAND_EVENT, type AppMenuCommand } from "../shared/menu-command";
import {
  OPEN_MARKDOWN_FILE_CHANNEL,
  OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL
} from "../shared/open-markdown-file";
import {
  SAVE_MARKDOWN_FILE_AS_CHANNEL,
  SAVE_MARKDOWN_FILE_CHANNEL
} from "../shared/save-markdown-file";
import {
  INTERRUPT_SCENARIO_RUN_CHANNEL,
  SCENARIO_RUN_EVENT,
  SCENARIO_RUN_TERMINAL_EVENT,
  START_SCENARIO_RUN_CHANNEL,
  type RunnerEventEnvelope,
  type ScenarioRunTerminal
} from "../shared/test-run-session";

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
    const startRunInput = { scenarioId: "open-markdown-file-basic" };
    const interruptInput = { runId: "run-1" };
    const completeInput: EditorTestCommandResultEnvelope = {
      sessionId: "session-1",
      commandId: "command-1",
      result: {
        ok: true,
        details: {
          selection: { anchor: 1, head: 3 }
        }
      }
    };

    void api.openMarkdownFile();
    void api.openMarkdownFileFromPath(openPathInput.targetPath);
    void api.saveMarkdownFile(saveInput);
    void api.saveMarkdownFileAs(saveAsInput);
    void api.openEditorTestWindow();
    void api.startScenarioRun(startRunInput);
    void api.interruptScenarioRun(interruptInput);
    void api.completeEditorTestCommand(completeInput);

    expect(invoke.mock.calls).toEqual([
      [OPEN_MARKDOWN_FILE_CHANNEL],
      [OPEN_MARKDOWN_FILE_FROM_PATH_CHANNEL, openPathInput],
      [SAVE_MARKDOWN_FILE_CHANNEL, saveInput],
      [SAVE_MARKDOWN_FILE_AS_CHANNEL, saveAsInput],
      ["yulora:open-editor-test-window"],
      [START_SCENARIO_RUN_CHANNEL, startRunInput],
      [INTERRUPT_SCENARIO_RUN_CHANNEL, interruptInput],
      [COMPLETE_EDITOR_TEST_COMMAND_CHANNEL, completeInput]
    ]);
  });

  it("forwards shared event payloads without reshaping them", async () => {
    const api = await loadApi();
    const scenarioListener = vi.fn();
    const terminalListener = vi.fn();
    const editorListener = vi.fn();
    const menuListener = vi.fn();

    const detachScenario = api.onScenarioRunEvent(scenarioListener);
    const detachTerminal = api.onScenarioRunTerminal(terminalListener);
    const detachEditor = api.onEditorTestCommand(editorListener);
    const detachMenu = api.onMenuCommand(menuListener);

    expect(on.mock.calls).toHaveLength(4);

    const scenarioHandler = on.mock.calls[0]?.[1];
    const terminalHandler = on.mock.calls[1]?.[1];
    const editorHandler = on.mock.calls[2]?.[1];
    const menuHandler = on.mock.calls[3]?.[1];

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
    const selectionCommandPayload: EditorTestCommandEnvelope = {
      sessionId: "session-1",
      commandId: "command-1",
      command: {
        type: "set-editor-selection",
        anchor: 4,
        head: 7
      }
    };
    const enterCommandPayload: EditorTestCommandEnvelope = {
      sessionId: "session-1",
      commandId: "command-2",
      command: {
        type: "press-editor-enter"
      }
    };
    const menuPayload: AppMenuCommand = "save-markdown-file-as";

    scenarioHandler?.({}, scenarioPayload);
    terminalHandler?.({}, terminalPayload);
    editorHandler?.({}, selectionCommandPayload);
    editorHandler?.({}, enterCommandPayload);
    menuHandler?.({}, menuPayload);

    expect(scenarioListener).toHaveBeenCalledWith(scenarioPayload);
    expect(terminalListener).toHaveBeenCalledWith(terminalPayload);
    expect(editorListener).toHaveBeenNthCalledWith(1, selectionCommandPayload);
    expect(editorListener).toHaveBeenNthCalledWith(2, enterCommandPayload);
    expect(menuListener).toHaveBeenCalledWith(menuPayload);

    detachScenario();
    detachTerminal();
    detachEditor();
    detachMenu();

    expect(off.mock.calls).toEqual([
      [SCENARIO_RUN_EVENT, scenarioHandler],
      [SCENARIO_RUN_TERMINAL_EVENT, terminalHandler],
      [EDITOR_TEST_COMMAND_EVENT, editorHandler],
      [APP_MENU_COMMAND_EVENT, menuHandler]
    ]);
  });
});
