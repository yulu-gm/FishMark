import { describe, expect, it } from "vitest";

import {
  CLI_STREAM_EVENT_PREFIX,
  CLI_STREAM_TERMINAL_PREFIX,
  buildStreamedEventLine,
  buildStreamedTerminalLine
} from "./stream";

describe("cli stream helpers", () => {
  it("builds a prefixed event line", () => {
    const line = buildStreamedEventLine(
      { YULORA_CLI_STREAM_EVENTS: "1", YULORA_RUN_ID: "run-1" },
      { type: "scenario-start", scenarioId: "app-shell-startup", at: 100 }
    );

    expect(line).toBe(
      `${CLI_STREAM_EVENT_PREFIX}{"runId":"run-1","event":{"type":"scenario-start","scenarioId":"app-shell-startup","at":100}}`
    );
  });

  it("returns null when event streaming is disabled", () => {
    const line = buildStreamedEventLine(
      { YULORA_CLI_STREAM_EVENTS: "", YULORA_RUN_ID: "run-1" },
      { type: "scenario-start", scenarioId: "app-shell-startup", at: 100 }
    );

    expect(line).toBeNull();
  });

  it("builds a prefixed terminal line", () => {
    const line = buildStreamedTerminalLine(
      { YULORA_CLI_STREAM_EVENTS: "1", YULORA_RUN_ID: "run-1" },
      {
        exitCode: 0,
        status: "passed",
        resultPath: "out/result.json",
        stepTracePath: "out/step-trace.json"
      }
    );

    expect(line).toBe(
      `${CLI_STREAM_TERMINAL_PREFIX}{"runId":"run-1","exitCode":0,"status":"passed","resultPath":"out/result.json","stepTracePath":"out/step-trace.json"}`
    );
  });
});
