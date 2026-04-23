// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorTestCommandEnvelope } from "../../shared/editor-test-command";
import { createInitialAppState, type AppState } from "../document-state";
import { EditorTestBridgeHost } from "./editor-test-bridge-host";

const { createEditorTestDriver, run } = vi.hoisted(() => {
  const run = vi.fn().mockResolvedValue({
    ok: true,
    message: "Editor test command handled."
  });

  return {
    run,
    createEditorTestDriver: vi.fn(() => ({
      run
    }))
  };
});

vi.mock("../editor-test-driver", () => ({
  createEditorTestDriver
}));

describe("EditorTestBridgeHost", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onEditorTestCommand: ReturnType<typeof vi.fn>;
  let completeEditorTestCommand: ReturnType<typeof vi.fn>;
  let editorTestCommandListener: ((payload: EditorTestCommandEnvelope) => void) | null;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    editorTestCommandListener = null;
    onEditorTestCommand = vi.fn((listener) => {
      editorTestCommandListener = listener;
      return () => {
        editorTestCommandListener = null;
      };
    });
    completeEditorTestCommand = vi.fn().mockResolvedValue(undefined);
    createEditorTestDriver.mockClear();
    run.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    container.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function renderHost(): Promise<void> {
    const fishmarkTest = {
      openEditorTestWindow: vi.fn().mockResolvedValue(undefined),
      startScenarioRun: vi.fn().mockResolvedValue({ runId: "run-1" }),
      interruptScenarioRun: vi.fn().mockResolvedValue(undefined),
      onScenarioRunEvent: vi.fn(() => () => {}),
      onScenarioRunTerminal: vi.fn(() => () => {}),
      onEditorTestCommand,
      completeEditorTestCommand
    } as Window["fishmarkTest"];

    await act(async () => {
      root.render(
        createElement(EditorTestBridgeHost, {
          fishmarkTest,
          getState: () => createInitialAppState() as AppState,
          applyState: (updater) => {
            void updater(createInitialAppState() as AppState);
          },
          resetAutosaveRuntime: vi.fn(),
          editor: {
            getContent: () => "",
            setContent: vi.fn(),
            insertText: vi.fn(),
            getSelection: vi.fn(() => ({ anchor: 0, head: 0 })),
            setSelection: vi.fn(),
            pressEnter: vi.fn(),
            pressBackspace: vi.fn(),
            pressTab: vi.fn(),
            pressArrowUp: vi.fn(),
            pressArrowDown: vi.fn()
          },
          setEditorContentSnapshot: vi.fn(),
          openWorkspaceFileFromPath: vi.fn().mockResolvedValue({
            kind: "success",
            snapshot: {
              windowId: "window-1",
              activeTabId: null,
              tabs: [],
              activeDocument: null
            }
          }),
          saveMarkdownFile: vi.fn().mockResolvedValue({
            status: "success",
            document: {
              path: "C:/notes/test.md",
              name: "test.md",
              content: "",
              encoding: "utf-8"
            }
          })
        })
      );
    });

    await vi.dynamicImportSettled();
  }

  it("routes editor test commands through the driver and completes them on the test bridge", async () => {
    await renderHost();

    expect(onEditorTestCommand).toHaveBeenCalledTimes(1);
    expect(createEditorTestDriver).not.toHaveBeenCalled();

    await act(async () => {
      editorTestCommandListener?.({
        sessionId: "session-1",
        commandId: "command-1",
        command: { type: "wait-for-editor-ready" }
      });

      await Promise.resolve();
    });

    expect(createEditorTestDriver).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ type: "wait-for-editor-ready" });
    expect(completeEditorTestCommand).toHaveBeenCalledWith({
      sessionId: "session-1",
      commandId: "command-1",
      result: {
        ok: true,
        message: "Editor test command handled."
      }
    });
  });
});
