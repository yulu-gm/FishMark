import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createCliProcessRunner } from "./cli-process-runner";

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  send = vi.fn();
  kill = vi.fn();
}

describe("createCliProcessRunner", () => {
  it("parses streamed runner events and terminal payloads from the CLI process", async () => {
    const child = new FakeChildProcess();
    const spawnProcess = vi.fn(() => child);
    const runner = createCliProcessRunner({
      cliScriptPath: "D:/MyAgent/Yulora/Yulora/dist-cli/cli/bin.js",
      cwd: "D:/MyAgent/Yulora/Yulora",
      spawnProcess
    });
    const forwardedEvents: unknown[] = [];
    const forwardedTerminals: unknown[] = [];

    const runPromise = runner.startRun({
      runId: "run-1",
      scenarioId: "open-markdown-file-basic",
      signal: new AbortController().signal,
      onEvent: (payload) => forwardedEvents.push(payload),
      onTerminal: (payload) => forwardedTerminals.push(payload)
    });

    child.stdout.emit(
      "data",
      '__YULORA_EVENT__{"runId":"run-1","event":{"type":"scenario-start","scenarioId":"open-markdown-file-basic","at":100}}\n'
    );
    child.stdout.emit(
      "data",
      '__YULORA_TERMINAL__{"runId":"run-1","exitCode":0,"status":"passed","resultPath":"out/result.json","stepTracePath":"out/step-trace.json"}\n'
    );
    child.emit("close", 0);

    await runPromise;

    expect(spawnProcess).toHaveBeenCalledWith(
      process.execPath,
      ["D:/MyAgent/Yulora/Yulora/dist-cli/cli/bin.js", "--id", "open-markdown-file-basic"],
      expect.objectContaining({
        cwd: "D:/MyAgent/Yulora/Yulora",
        env: expect.objectContaining({
          YULORA_CLI_STREAM_EVENTS: "1",
          YULORA_RUN_ID: "run-1"
        })
      })
    );
    expect(forwardedEvents).toEqual([
      {
        runId: "run-1",
        event: {
          type: "scenario-start",
          scenarioId: "open-markdown-file-basic",
          at: 100
        }
      }
    ]);
    expect(forwardedTerminals).toEqual([
      {
        runId: "run-1",
        exitCode: 0,
        status: "passed",
        resultPath: "out/result.json",
        stepTracePath: "out/step-trace.json"
      }
    ]);
  });

  it("kills the CLI process when the run signal aborts", async () => {
    const child = new FakeChildProcess();
    const spawnProcess = vi.fn(() => child);
    const controller = new AbortController();
    const runner = createCliProcessRunner({
      cliScriptPath: "D:/MyAgent/Yulora/Yulora/dist-cli/cli/bin.js",
      cwd: "D:/MyAgent/Yulora/Yulora",
      spawnProcess
    });

    const runPromise = runner.startRun({
      runId: "run-2",
      scenarioId: "app-shell-startup",
      signal: controller.signal,
      onEvent: vi.fn(),
      onTerminal: vi.fn()
    });

    controller.abort(new Error("stop"));
    child.emit("close", 3);

    await runPromise;

    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it("routes editor command requests from the CLI child to the editor session runner", async () => {
    const child = new FakeChildProcess();
    const spawnProcess = vi.fn(() => child);
    const dispatchEditorCommand = vi.fn().mockResolvedValue({
      ok: true,
      message: "ready"
    });
    const runner = createCliProcessRunner({
      cliScriptPath: "D:/MyAgent/Yulora/Yulora/dist-cli/cli/bin.js",
      cwd: "D:/MyAgent/Yulora/Yulora",
      spawnProcess,
      ensureEditorSession: async () => ({ sessionId: "editor-session-1" }),
      dispatchEditorCommand
    });

    const runPromise = runner.startRun({
      runId: "run-3",
      scenarioId: "app-shell-startup",
      signal: new AbortController().signal,
      onEvent: vi.fn(),
      onTerminal: vi.fn()
    });
    await Promise.resolve();

    child.emit("message", {
      type: "editor-test-command-request",
      sessionId: "editor-session-1",
      commandId: "command-1",
      command: {
        type: "wait-for-editor-ready"
      }
    });
    child.emit("close", 0);

    await runPromise;

    expect(dispatchEditorCommand).toHaveBeenCalledWith({
      sessionId: "editor-session-1",
      command: {
        type: "wait-for-editor-ready"
      },
      signal: expect.any(AbortSignal)
    });
    expect(child.send).toHaveBeenCalledWith({
      type: "editor-test-command-result",
      sessionId: "editor-session-1",
      commandId: "command-1",
      result: {
        ok: true,
        message: "ready"
      }
    });
    expect(spawnProcess).toHaveBeenCalledWith(
      process.execPath,
      ["D:/MyAgent/Yulora/Yulora/dist-cli/cli/bin.js", "--id", "app-shell-startup"],
      expect.objectContaining({
        env: expect.objectContaining({
          YULORA_EDITOR_SESSION_ID: "editor-session-1"
        })
      })
    );
  });
});
