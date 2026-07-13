import { describe, expect, it, vi } from "vitest";

import { runScenario, type RunnerEvent, type StepHandlerMap } from "./runner";
import type { TestScenario } from "./scenario";

function scenario(
  steps: readonly { id: string; kind?: "setup" | "action" | "assertion" | "teardown" }[]
): TestScenario {
  return {
    id: "runner-sample",
    title: "Runner sample",
    summary: "sample",
    surface: "editor",
    tags: ["smoke"],
    execution: { kind: "headless" },
    steps: steps.map((s) => ({ id: s.id, title: s.id, kind: s.kind ?? "action" }))
  };
}

describe("runScenario", () => {
  it("advances every step and reports passed when all handlers resolve", async () => {
    const sc = scenario([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const order: string[] = [];
    const handlers: StepHandlerMap = {
      a: () => void order.push("a"),
      b: async () => void order.push("b"),
      c: () => void order.push("c")
    };

    const result = await runScenario(sc, { handlers });

    expect(order).toEqual(["a", "b", "c"]);
    expect(result.status).toBe("passed");
    expect(result.steps.map((s) => s.status)).toEqual(["passed", "passed", "passed"]);
    expect(result.error).toBeUndefined();
  });

  it("stops on the first failing step and marks later steps skipped", async () => {
    const sc = scenario([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const cRan = vi.fn();
    const handlers: StepHandlerMap = {
      a: () => undefined,
      b: () => {
        throw new Error("boom");
      },
      c: cRan
    };

    const result = await runScenario(sc, { handlers });

    expect(result.status).toBe("failed");
    expect(result.steps.map((s) => s.status)).toEqual(["passed", "failed", "skipped"]);
    expect(result.error?.message).toBe("boom");
    expect(result.error?.stepId).toBe("b");
    expect(cRan).not.toHaveBeenCalled();
  });

  it("reports timed-out when a step exceeds the budget", async () => {
    const sc = scenario([{ id: "slow" }, { id: "next" }]);
    const handlers: StepHandlerMap = {
      slow: () => new Promise(() => undefined), // never resolves
      next: vi.fn()
    };

    const result = await runScenario(sc, { handlers, stepTimeoutMs: 20 });

    expect(result.status).toBe("timed-out");
    expect(result.steps[0]!.status).toBe("timed-out");
    expect(result.steps[1]!.status).toBe("skipped");
    expect(result.error?.kind).toBe("timeout");
    expect(result.error?.stepId).toBe("slow");
    expect(handlers.next).not.toHaveBeenCalled();
  });

  it("reports interrupted when the external signal aborts mid-run", async () => {
    const sc = scenario([{ id: "wait" }, { id: "after" }]);
    const controller = new AbortController();

    const handlers: StepHandlerMap = {
      wait: () =>
        new Promise<void>(() => {
          setTimeout(() => controller.abort(), 10);
        }),
      after: vi.fn()
    };

    const result = await runScenario(sc, { handlers, signal: controller.signal });

    expect(result.status).toBe("interrupted");
    expect(result.steps[1]!.status).toBe("skipped");
    expect(result.error?.kind).toBe("abort");
    expect(handlers.after).not.toHaveBeenCalled();
  });

  it("waits for bounded abort-aware handler cleanup before returning", async () => {
    const sc = scenario([{ id: "wait" }]);
    const controller = new AbortController();
    let cleanupFinished = false;
    const handlers: StepHandlerMap = {
      wait: ({ signal }) =>
        new Promise<void>((_, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              setTimeout(() => {
                cleanupFinished = true;
                reject(new Error("cleanup complete"));
              }, 30);
            },
            { once: true }
          );
          setTimeout(() => controller.abort(new Error("stop")), 10);
        })
    };

    const result = await runScenario(sc, {
      handlers,
      signal: controller.signal,
      abortCleanupTimeoutMs: 1_000
    });

    expect(result.status).toBe("interrupted");
    expect(cleanupFinished).toBe(true);
  });

  it("returns interrupted without running any step if the signal is pre-aborted", async () => {
    const sc = scenario([{ id: "a" }]);
    const handler = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const result = await runScenario(sc, {
      handlers: { a: handler },
      signal: controller.signal
    });

    expect(result.status).toBe("interrupted");
    expect(result.steps[0]!.status).toBe("pending");
    expect(handler).not.toHaveBeenCalled();
  });

  it("fails with a config error when a step has no registered handler", async () => {
    const sc = scenario([{ id: "a" }, { id: "missing" }]);
    const result = await runScenario(sc, { handlers: { a: () => undefined } });

    expect(result.status).toBe("failed");
    expect(result.steps[1]!.status).toBe("failed");
    expect(result.error?.kind).toBe("config");
    expect(result.error?.stepId).toBe("missing");
  });

  it("emits a consumable event stream for the workbench", async () => {
    const sc = scenario([{ id: "a" }, { id: "b" }]);
    const events: RunnerEvent[] = [];

    await runScenario(sc, {
      handlers: {
        a: () => undefined,
        b: () => {
          throw new Error("nope");
        }
      },
      onEvent: (event) => events.push(event)
    });

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "scenario-start",
      "step-start",
      "step-end",
      "step-start",
      "step-end",
      "scenario-end"
    ]);
    const last = events.at(-1)!;
    expect(last.type).toBe("scenario-end");
    if (last.type === "scenario-end") {
      expect(last.status).toBe("failed");
    }
  });
});
