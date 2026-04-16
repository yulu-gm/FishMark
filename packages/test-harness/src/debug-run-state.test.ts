import { describe, expect, it } from "vitest";

import type { TestScenario } from "./scenario";
import type { RunnerEvent } from "./runner";
import {
  applyRunnerEventToDebugState,
  applyScenarioRunTerminalToDebugState,
  createIdleDebugRunState,
  type DebugRunTerminal,
  formatRunStatus
} from "./debug-run-state";

function createScenario(): TestScenario {
  return {
    id: "app-shell-startup",
    title: "App shell starts with editor window visible",
    summary: "Starts the shell and waits for the empty workspace.",
    surface: "editor",
    tags: ["smoke", "editor"],
    steps: [
      { id: "launch-dev-shell", title: "Launch shell", kind: "setup" },
      { id: "wait-for-empty-workspace", title: "Wait for empty workspace", kind: "assertion" }
    ]
  };
}

describe("debug-run-state", () => {
  it("creates an idle state seeded from the selected scenario", () => {
    const state = createIdleDebugRunState(createScenario());

    expect(state.scenarioId).toBe("app-shell-startup");
    expect(state.status).toBe("idle");
    expect(state.totalSteps).toBe(2);
    expect(state.steps.map((step) => step.id)).toEqual([
      "launch-dev-shell",
      "wait-for-empty-workspace"
    ]);
    expect(state.steps.every((step) => step.status === "pending")).toBe(true);
  });

  it("tracks step progress and terminal failure details from runner events", () => {
    const scenario = createScenario();
    let state = createIdleDebugRunState(scenario);

    const events: RunnerEvent[] = [
      { type: "scenario-start", scenarioId: scenario.id, at: 100 },
      {
        type: "step-start",
        scenarioId: scenario.id,
        stepId: "launch-dev-shell",
        at: 110
      },
      {
        type: "step-end",
        scenarioId: scenario.id,
        stepId: "launch-dev-shell",
        status: "failed",
        at: 125,
        durationMs: 15,
        error: { message: "boom", kind: "step" }
      },
      {
        type: "scenario-end",
        scenarioId: scenario.id,
        status: "failed",
        at: 125,
        error: { message: "boom", kind: "step", stepId: "launch-dev-shell" }
      }
    ];

    for (const event of events) {
      state = applyRunnerEventToDebugState(state, scenario, event);
    }

    expect(state.status).toBe("failed");
    expect(state.currentStepId).toBe("launch-dev-shell");
    expect(state.completedSteps).toBe(1);
    expect(state.steps[0]).toMatchObject({
      id: "launch-dev-shell",
      status: "failed",
      durationMs: 15,
      error: { message: "boom", kind: "step" }
    });
    expect(state.terminalError).toEqual({
      message: "boom",
      kind: "step",
      stepId: "launch-dev-shell"
    });
    expect(state.events.map((event) => event.type)).toEqual([
      "scenario-end",
      "step-end",
      "step-start",
      "scenario-start"
    ]);
  });

  it("applies terminal metadata without discarding the active step trace", () => {
    const scenario = createScenario();
    let state = createIdleDebugRunState(scenario);
    state = applyRunnerEventToDebugState(state, scenario, {
      type: "step-start",
      scenarioId: scenario.id,
      stepId: "launch-dev-shell",
      at: 110
    });

    const terminal: DebugRunTerminal = {
      runId: "run-1",
      status: "failed",
      resultPath: "out/result.json",
      stepTracePath: "out/step-trace.json",
      error: { message: "boom", kind: "step", stepId: "launch-dev-shell" }
    };

    state = applyScenarioRunTerminalToDebugState(state, terminal);

    expect(state.runId).toBe("run-1");
    expect(state.resultPath).toBe("out/result.json");
    expect(state.stepTracePath).toBe("out/step-trace.json");
    expect(state.currentStepId).toBe("launch-dev-shell");
  });

  it("formats timed-out as title case for the UI", () => {
    expect(formatRunStatus("timed-out")).toBe("Timed Out");
    expect(formatRunStatus("failed")).toBe("Failed");
  });
});
