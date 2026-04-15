import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_COMMAND_EVENT } from "../shared/editor-test-command";
import { createEditorTestSessions } from "./editor-test-sessions";

function createWindowHarness() {
  const send = vi.fn();
  const close = vi.fn();
  const window = {
    webContents: {
      send
    },
    isDestroyed: vi.fn(() => false),
    close
  };

  return {
    window,
    send,
    close
  };
}

describe("createEditorTestSessions", () => {
  it("opens one editor window and reuses the same session", () => {
    const first = createWindowHarness();
    const openEditorWindow = vi.fn(() => first.window);
    const sessions = createEditorTestSessions({
      openEditorWindow,
      createSessionId: () => "editor-session-1"
    });

    expect(sessions.ensureSession()).toEqual({ sessionId: "editor-session-1" });
    expect(sessions.ensureSession()).toEqual({ sessionId: "editor-session-1" });
    expect(openEditorWindow).toHaveBeenCalledTimes(1);
  });

  it("dispatches an allowlisted command to the active editor session and resolves on completion", async () => {
    const first = createWindowHarness();
    const sessions = createEditorTestSessions({
      openEditorWindow: () => first.window,
      createSessionId: () => "editor-session-1",
      createCommandId: () => "command-1"
    });
    const { sessionId } = sessions.ensureSession();

    const resultPromise = sessions.dispatchCommand({
      sessionId,
      command: {
        type: "wait-for-editor-ready"
      }
    });

    expect(first.send).toHaveBeenCalledWith(EDITOR_TEST_COMMAND_EVENT, {
      sessionId: "editor-session-1",
      commandId: "command-1",
      command: {
        type: "wait-for-editor-ready"
      }
    });

    expect(
      sessions.completeCommand({
        sessionId: "editor-session-1",
        commandId: "command-1",
        result: {
          ok: true,
          message: "ready"
        }
      })
    ).toBe(true);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      message: "ready"
    });
  });

  it("rejects pending commands when the run aborts", async () => {
    const first = createWindowHarness();
    const sessions = createEditorTestSessions({
      openEditorWindow: () => first.window,
      createSessionId: () => "editor-session-1",
      createCommandId: () => "command-1"
    });
    const controller = new AbortController();
    const { sessionId } = sessions.ensureSession();

    const resultPromise = sessions.dispatchCommand({
      sessionId,
      command: {
        type: "wait-for-editor-ready"
      },
      signal: controller.signal
    });

    controller.abort(new Error("stop"));

    await expect(resultPromise).rejects.toThrow(/aborted/i);
  });

  it("returns false when a completion payload does not match a pending command", () => {
    const first = createWindowHarness();
    const sessions = createEditorTestSessions({
      openEditorWindow: () => first.window
    });

    expect(
      sessions.completeCommand({
        sessionId: "missing",
        commandId: "missing",
        result: { ok: true }
      })
    ).toBe(false);
  });

  it("can close the active editor window without routing through the renderer", async () => {
    const first = createWindowHarness();
    const sessions = createEditorTestSessions({
      openEditorWindow: () => first.window,
      createSessionId: () => "editor-session-1"
    });
    const { sessionId } = sessions.ensureSession();

    await expect(
      sessions.dispatchCommand({
        sessionId,
        command: {
          type: "close-editor-window"
        }
      })
    ).resolves.toEqual({
      ok: true,
      message: "Editor window closed."
    });
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(first.send).not.toHaveBeenCalled();
  });
});
