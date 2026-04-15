export const START_SCENARIO_RUN_CHANNEL = "yulora:start-scenario-run";
export const INTERRUPT_SCENARIO_RUN_CHANNEL = "yulora:interrupt-scenario-run";
export const SCENARIO_RUN_EVENT = "yulora:scenario-run-event";
export const SCENARIO_RUN_TERMINAL_EVENT = "yulora:scenario-run-terminal";

export type ScenarioRunId = string;
export type ScenarioRunStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "timed-out"
  | "interrupted";

export type ScenarioRunErrorInfo = {
  message: string;
  stack?: string;
  kind?: "config" | "step" | "timeout" | "abort";
};

export type ScenarioRunnerEvent =
  | { type: "scenario-start"; scenarioId: string; at: number }
  | {
      type: "step-start";
      scenarioId: string;
      stepId: string;
      at: number;
    }
  | {
      type: "step-end";
      scenarioId: string;
      stepId: string;
      status: "pending" | "running" | "passed" | "failed" | "timed-out" | "skipped";
      at: number;
      durationMs: number;
      error?: ScenarioRunErrorInfo;
    }
  | {
      type: "scenario-end";
      scenarioId: string;
      status: Exclude<ScenarioRunStatus, "idle">;
      at: number;
      error?: ScenarioRunErrorInfo & { stepId?: string };
    };

export type RunnerEventEnvelope = {
  runId: ScenarioRunId;
  event: ScenarioRunnerEvent;
};

export type ScenarioRunTerminal = {
  runId: ScenarioRunId;
  exitCode: number;
  status: Exclude<ScenarioRunStatus, "idle">;
  resultPath?: string;
  stepTracePath?: string;
  error?: ScenarioRunErrorInfo & { stepId?: string };
};
