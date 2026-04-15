import { describe, expect, it, vi } from "vitest";

import { createTestRunSessions } from "./test-run-sessions";

describe("createTestRunSessions", () => {
  it("starts a run, forwards events, and publishes terminal state", async () => {
    const forwardedEvents: unknown[] = [];
    const forwardedTerminals: unknown[] = [];

    const sessions = createTestRunSessions({
      createRunId: () => "run-1",
      startRun: async ({ runId, scenarioId, onEvent, onTerminal }) => {
        onEvent({
          runId,
          event: { type: "scenario-start", scenarioId, at: 100 }
        });
        onTerminal({
          runId,
          exitCode: 0,
          status: "passed",
          resultPath: "out/result.json",
          stepTracePath: "out/step-trace.json"
        });
      }
    });

    sessions.onRunEvent((payload) => forwardedEvents.push(payload));
    sessions.onRunTerminal((payload) => forwardedTerminals.push(payload));

    const { runId } = await sessions.startScenarioRun({ scenarioId: "open-markdown-file-basic" });

    expect(runId).toBe("run-1");
    expect(forwardedEvents).toEqual([
      {
        runId: "run-1",
        event: { type: "scenario-start", scenarioId: "open-markdown-file-basic", at: 100 }
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

  it("aborts an active run when interrupted", async () => {
    const abortStates: boolean[] = [];

    const sessions = createTestRunSessions({
      createRunId: () => "run-2",
      startRun: async ({ signal }) => {
        abortStates.push(signal.aborted);
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              abortStates.push(signal.aborted);
              resolve();
            },
            { once: true }
          );
        });
      }
    });

    const runPromise = sessions.startScenarioRun({ scenarioId: "open-markdown-file-basic" });
    await Promise.resolve();

    expect(sessions.interruptScenarioRun({ runId: "run-2" })).toBe(true);
    await runPromise;

    expect(abortStates).toEqual([false, true]);
  });

  it("returns false when interrupting an unknown run", () => {
    const sessions = createTestRunSessions({
      createRunId: () => "run-3",
      startRun: vi.fn(async () => {})
    });

    expect(sessions.interruptScenarioRun({ runId: "missing" })).toBe(false);
  });

  it("returns the run id before the underlying run finishes", async () => {
    let resolveRun!: () => void;

    const sessions = createTestRunSessions({
      createRunId: () => "run-4",
      startRun: async () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        })
    });

    const startPromise = sessions.startScenarioRun({ scenarioId: "open-markdown-file-basic" });
    await Promise.resolve();

    await expect(startPromise).resolves.toEqual({ runId: "run-4" });

    resolveRun();
  });
});
