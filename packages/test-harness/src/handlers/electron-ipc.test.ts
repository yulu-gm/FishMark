import { describe, expect, it, vi } from "vitest";

import { createProcessEditorCommandRunner } from "./electron-ipc";

describe("createProcessEditorCommandRunner", () => {
  it("sends a command request and resolves when the matching result arrives", async () => {
    const listeners = new Set<(message: unknown) => void>();
    const sendMessage = vi.fn((message) => {
      listeners.forEach((listener) =>
        listener({
          type: "editor-test-command-result",
          sessionId: message.sessionId,
          commandId: message.commandId,
          result: {
            ok: true,
            message: "ready"
          }
        })
      );
    });

    const runCommand = createProcessEditorCommandRunner({
      sessionId: "editor-session-1",
      sendMessage,
      subscribeMessage: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    });

    await expect(
      runCommand({
        type: "wait-for-editor-ready"
      })
    ).resolves.toEqual({
      ok: true,
      message: "ready"
    });

    expect(sendMessage).toHaveBeenCalledWith({
      type: "editor-test-command-request",
      sessionId: "editor-session-1",
      commandId: "command-1",
      command: {
        type: "wait-for-editor-ready"
      }
    });
  });

  it("rejects when the command signal aborts", async () => {
    const controller = new AbortController();
    const runCommand = createProcessEditorCommandRunner({
      sessionId: "editor-session-1",
      sendMessage: vi.fn(),
      subscribeMessage: () => () => {}
    });

    const promise = runCommand(
      {
        type: "wait-for-editor-ready"
      },
      controller.signal
    );
    controller.abort(new Error("stop"));

    await expect(promise).rejects.toThrow(/aborted/i);
  });
});
