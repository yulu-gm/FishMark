import type { RunnerEvent, RunErrorInfo, ScenarioStatus, StepStatus } from "./runner";
import type { TestScenario } from "./scenario";

const DEBUG_EVENT_LIMIT = 8;

export type DebugRunStep = {
  readonly id: string;
  readonly title: string;
  readonly kind: TestScenario["steps"][number]["kind"];
  readonly status: StepStatus;
  readonly durationMs?: number;
  readonly error?: RunErrorInfo;
};

export type DebugEventEntry = {
  readonly key: string;
  readonly type: RunnerEvent["type"];
  readonly detail: string;
};

export type DebugRunState = {
  readonly runId?: string;
  readonly scenarioId: string | null;
  readonly status: "idle" | ScenarioStatus;
  readonly currentStepId: string | null;
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly steps: readonly DebugRunStep[];
  readonly events: readonly DebugEventEntry[];
  readonly startedAt?: number;
  readonly finishedAt?: number;
  readonly durationMs?: number;
  readonly resultPath?: string;
  readonly stepTracePath?: string;
  readonly terminalError?: RunErrorInfo & { readonly stepId?: string };
};

export type DebugRunTerminal = {
  readonly runId: string;
  readonly status: Exclude<ScenarioStatus, "idle">;
  readonly resultPath?: string;
  readonly stepTracePath?: string;
  readonly error?: RunErrorInfo & { readonly stepId?: string };
};

export function createIdleDebugRunState(scenario: TestScenario | null): DebugRunState {
  return {
    runId: undefined,
    scenarioId: scenario?.id ?? null,
    status: "idle",
    currentStepId: null,
    totalSteps: scenario?.steps.length ?? 0,
    completedSteps: 0,
    steps: createDebugStepsFromScenario(scenario),
    events: []
  };
}

export function applyRunnerEventToDebugState(
  current: DebugRunState,
  scenario: TestScenario,
  event: RunnerEvent
): DebugRunState {
  const base =
    current.scenarioId === scenario.id ? current : createIdleDebugRunState(scenario);
  const next: DebugRunState = {
    ...base,
    events: [createDebugEventEntry(event), ...base.events].slice(0, DEBUG_EVENT_LIMIT)
  };

  if (event.type === "scenario-start") {
    return {
      ...next,
      status: "running",
      startedAt: event.at,
      finishedAt: undefined,
      durationMs: undefined,
      currentStepId: null,
      completedSteps: 0,
      steps: createDebugStepsFromScenario(scenario),
      terminalError: undefined
    };
  }

  if (event.type === "step-start") {
    return {
      ...next,
      currentStepId: event.stepId,
      steps: next.steps.map((step) =>
        step.id === event.stepId ? { ...step, status: "running", error: undefined } : step
      )
    };
  }

  if (event.type === "step-end") {
    const steps = next.steps.map((step) =>
      step.id === event.stepId
        ? {
            ...step,
            status: event.status,
            durationMs: event.durationMs,
            error: event.error
          }
        : step
    );

    return {
      ...next,
      completedSteps: countCompletedSteps(steps),
      steps
    };
  }

  return {
    ...next,
    status: event.status,
    currentStepId: event.error?.stepId ?? next.currentStepId,
    finishedAt: event.at,
    terminalError: event.error
  };
}

export function applyScenarioRunTerminalToDebugState(
  current: DebugRunState,
  terminal: DebugRunTerminal
): DebugRunState {
  return {
    ...current,
    runId: terminal.runId,
    status: terminal.status,
    currentStepId: terminal.error?.stepId ?? current.currentStepId,
    resultPath: terminal.resultPath,
    stepTracePath: terminal.stepTracePath,
    terminalError: terminal.error
  };
}

export function formatRunStatus(status: DebugRunState["status"] | StepStatus): string {
  if (status === "timed-out") {
    return "Timed Out";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function createDebugStepsFromScenario(scenario: TestScenario | null): readonly DebugRunStep[] {
  return (
    scenario?.steps.map((step) => ({
      id: step.id,
      title: step.title,
      kind: step.kind,
      status: "pending"
    })) ?? []
  );
}

function countCompletedSteps(steps: readonly DebugRunStep[]): number {
  return steps.filter((step) => step.status !== "pending" && step.status !== "running").length;
}

function createDebugEventEntry(event: RunnerEvent): DebugEventEntry {
  if (event.type === "scenario-start") {
    return {
      key: `${event.type}-${event.at}`,
      type: event.type,
      detail: `${event.scenarioId} started at ${event.at}`
    };
  }

  if (event.type === "step-start") {
    return {
      key: `${event.type}-${event.stepId}-${event.at}`,
      type: event.type,
      detail: `${event.stepId} started at ${event.at}`
    };
  }

  if (event.type === "step-end") {
    return {
      key: `${event.type}-${event.stepId}-${event.at}`,
      type: event.type,
      detail: `${event.stepId} finished as ${event.status} in ${event.durationMs} ms`
    };
  }

  return {
    key: `${event.type}-${event.at}`,
    type: event.type,
    detail: `${event.status}${event.error?.stepId ? ` at ${event.error.stepId}` : ""}${
      event.error ? `: ${event.error.message}` : ""
    }`
  };
}
