import type { RunnerEventEnvelope, ScenarioRunId, ScenarioRunTerminal } from "../shared/test-run-session";

type StartRunArgs = {
  runId: ScenarioRunId;
  scenarioId: string;
  signal: AbortSignal;
  onEvent: (payload: RunnerEventEnvelope) => void;
  onTerminal: (payload: ScenarioRunTerminal) => void;
};

type CreateTestRunSessionsInput = {
  createRunId?: () => ScenarioRunId;
  startRun: (args: StartRunArgs) => Promise<void>;
};

type RunEventListener = (payload: RunnerEventEnvelope) => void;
type RunTerminalListener = (payload: ScenarioRunTerminal) => void;

export function createTestRunSessions(input: CreateTestRunSessionsInput) {
  const activeRuns = new Map<ScenarioRunId, AbortController>();
  const runEventListeners = new Set<RunEventListener>();
  const runTerminalListeners = new Set<RunTerminalListener>();
  let nextRunId = 1;

  function emitEvent(payload: RunnerEventEnvelope): void {
    for (const listener of runEventListeners) {
      listener(payload);
    }
  }

  function emitTerminal(payload: ScenarioRunTerminal): void {
    activeRuns.delete(payload.runId);
    for (const listener of runTerminalListeners) {
      listener(payload);
    }
  }

  return {
    onRunEvent(listener: RunEventListener): () => void {
      runEventListeners.add(listener);
      return () => {
        runEventListeners.delete(listener);
      };
    },
    onRunTerminal(listener: RunTerminalListener): () => void {
      runTerminalListeners.add(listener);
      return () => {
        runTerminalListeners.delete(listener);
      };
    },
    async startScenarioRun(inputArgs: { scenarioId: string }): Promise<{ runId: ScenarioRunId }> {
      const runId = input.createRunId?.() ?? `run-${nextRunId++}`;
      const controller = new AbortController();
      activeRuns.set(runId, controller);

      void input
        .startRun({
          runId,
          scenarioId: inputArgs.scenarioId,
          signal: controller.signal,
          onEvent: emitEvent,
          onTerminal: emitTerminal
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          emitTerminal({
            runId,
            exitCode: 4,
            status: "failed",
            error: {
              message,
              kind: "config"
            }
          });
        });

      return { runId };
    },
    interruptScenarioRun(inputArgs: { runId: ScenarioRunId }): boolean {
      const controller = activeRuns.get(inputArgs.runId);
      if (!controller) {
        return false;
      }

      controller.abort(new Error(`Scenario run ${inputArgs.runId} interrupted.`));
      return true;
    }
  };
}
