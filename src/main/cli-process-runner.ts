import { spawn, type SpawnOptions } from "node:child_process";

import type { RunnerEventEnvelope, ScenarioRunTerminal } from "../shared/test-run-session";
import type { EditorTestCommand, EditorTestCommandResult } from "../shared/editor-test-command";

const EVENT_PREFIX = "__YULORA_EVENT__";
const TERMINAL_PREFIX = "__YULORA_TERMINAL__";

type StartRunArgs = {
  runId: string;
  scenarioId: string;
  signal: AbortSignal;
  onEvent: (payload: RunnerEventEnvelope) => void;
  onTerminal: (payload: ScenarioRunTerminal) => void;
};

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => {
  stdout: {
    on: (event: "data", listener: (chunk: Buffer | string) => void) => void;
  };
  once: (event: "error" | "close", listener: (arg?: unknown) => void) => void;
  on: (event: "message", listener: (arg: unknown) => void) => void;
  off: (event: "message", listener: (arg: unknown) => void) => void;
  send?: (message: unknown) => void;
  kill: () => void;
};

export function createCliProcessRunner(input: {
  cliScriptPath: string;
  cwd: string;
  spawnProcess?: SpawnProcess;
  ensureEditorSession?: () => Promise<{ sessionId: string }>;
  dispatchEditorCommand?: (args: {
    sessionId: string;
    command: EditorTestCommand;
    signal: AbortSignal;
  }) => Promise<EditorTestCommandResult>;
}) {
  const spawnProcess = input.spawnProcess ?? spawn;

  return {
    async startRun(args: StartRunArgs): Promise<void> {
      const editorSession = input.ensureEditorSession
        ? await input.ensureEditorSession()
        : null;
      const child = spawnProcess(
        process.execPath,
        [input.cliScriptPath, "--id", args.scenarioId],
        {
          cwd: input.cwd,
          stdio: ["ignore", "pipe", "ignore", "ipc"],
          env: {
            ...process.env,
            YULORA_CLI_STREAM_EVENTS: "1",
            YULORA_RUN_ID: args.runId,
            ...(editorSession ? { YULORA_EDITOR_SESSION_ID: editorSession.sessionId } : {})
          }
        }
      );

      let stdoutBuffer = "";

      const handleStdout = (chunk: Buffer | string) => {
        stdoutBuffer += String(chunk);
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith(EVENT_PREFIX)) {
            args.onEvent(JSON.parse(line.slice(EVENT_PREFIX.length)) as RunnerEventEnvelope);
            continue;
          }

          if (line.startsWith(TERMINAL_PREFIX)) {
            args.onTerminal(JSON.parse(line.slice(TERMINAL_PREFIX.length)) as ScenarioRunTerminal);
          }
        }
      };

      const handleAbort = () => {
        child.kill();
      };
      const handleMessage = async (rawMessage: unknown) => {
        if (
          !input.dispatchEditorCommand ||
          !isEditorCommandRequest(rawMessage)
        ) {
          return;
        }

        const result = await input.dispatchEditorCommand({
          sessionId: rawMessage.sessionId,
          command: rawMessage.command,
          signal: args.signal
        }).catch((error: unknown) => ({
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        }));

        child.send?.({
          type: "editor-test-command-result",
          sessionId: rawMessage.sessionId,
          commandId: rawMessage.commandId,
          result
        });
      };

      if (!child.stdout) {
        throw new Error("CLI child process did not expose stdout.");
      }

      child.stdout.on("data", handleStdout);
      child.on("message", handleMessage);
      args.signal.addEventListener("abort", handleAbort, { once: true });

      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", () => resolve());
      });

      child.off("message", handleMessage);
      args.signal.removeEventListener("abort", handleAbort);
    }
  };
}

function isEditorCommandRequest(
  value: unknown
): value is {
  type: "editor-test-command-request";
  sessionId: string;
  commandId: string;
  command: EditorTestCommand;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "editor-test-command-request" &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "commandId" in value &&
    typeof value.commandId === "string" &&
    "command" in value &&
    typeof value.command === "object" &&
    value.command !== null &&
    "type" in value.command &&
    typeof value.command.type === "string"
  );
}
