import { describe, expect, it } from "vitest";

import { CLI_EXIT_CODES } from "./exit-codes";
import { runCli } from "./run";
import { createScenarioRegistry } from "../registry";
import type { WrittenArtifacts } from "./artifacts";
import type { ResultDocument, StepTraceDocument } from "./artifacts";
import type { TestScenario } from "../scenario";
import type { StepHandlerMap } from "../runner";

function makeScenario(id: string, steps: readonly string[]): TestScenario {
  return {
    id,
    title: id,
    summary: id,
    surface: "editor",
    tags: ["smoke"],
    steps: steps.map((stepId) => ({ id: stepId, title: stepId, kind: "action" }))
  };
}

function makeIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: (line: string) => void out.push(line),
      stderr: (line: string) => void err.push(line)
    }
  };
}

function captureWriter() {
  const captured: { root?: string; result?: ResultDocument; trace?: StepTraceDocument } = {};
  const writer = (
    root: string,
    result: ResultDocument,
    trace: StepTraceDocument
  ): WrittenArtifacts => {
    captured.root = root;
    captured.result = result;
    captured.trace = trace;
    return {
      runDir: `${root}/run`,
      resultPath: `${root}/run/result.json`,
      stepTracePath: `${root}/run/step-trace.json`
    };
  };
  return { captured, writer };
}

describe("runCli", () => {
  it("exits 4 with usage hint when --id is missing", async () => {
    const { io, err } = makeIo();
    const outcome = await runCli({
      argv: [],
      cwd: "/tmp",
      io,
      registry: createScenarioRegistry()
    });
    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.configError);
    expect(err.join("\n")).toMatch(/--id/);
  });

  it("exits 4 when scenario id is not in the registry", async () => {
    const { io, err } = makeIo();
    const registry = createScenarioRegistry([makeScenario("known", ["a"])]);
    const outcome = await runCli({
      argv: ["--id", "missing", "--no-artifacts"],
      cwd: "/tmp",
      io,
      registry
    });
    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.configError);
    expect(err.join("\n")).toMatch(/Unknown scenario/);
  });

  it("exits 0 and writes artifacts when every step passes", async () => {
    const { io } = makeIo();
    const scenario = makeScenario("pass-one", ["a", "b"]);
    const registry = createScenarioRegistry([scenario]);
    const handlers: StepHandlerMap = { a: () => {}, b: () => {} };
    const { captured, writer } = captureWriter();

    const outcome = await runCli({
      argv: ["--id", "pass-one", "--out-dir", "out"],
      cwd: "/tmp",
      io,
      registry,
      buildHandlers: () => handlers,
      writeArtifacts: writer,
      ensureDir: () => {}
    });

    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.passed);
    expect(outcome.result?.status).toBe("passed");
    expect(captured.result?.protocolVersion).toBe(2);
    expect(captured.result?.status).toBe("passed");
    expect(captured.trace?.events.length).toBeGreaterThan(0);
    expect(captured.trace?.events[0]?.type).toBe("scenario-start");
  });

  it("exits 1 on failure and records the failing step", async () => {
    const { io, err } = makeIo();
    const scenario = makeScenario("fail-mid", ["a", "b"]);
    const registry = createScenarioRegistry([scenario]);
    const handlers: StepHandlerMap = {
      a: () => {},
      b: () => {
        throw new Error("boom");
      }
    };
    const { captured, writer } = captureWriter();

    const outcome = await runCli({
      argv: ["--id", "fail-mid"],
      cwd: "/tmp",
      io,
      registry,
      buildHandlers: () => handlers,
      writeArtifacts: writer,
      ensureDir: () => {}
    });

    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.failed);
    expect(outcome.result?.error?.stepId).toBe("b");
    expect(captured.result?.error?.stepId).toBe("b");
    expect(err.join("\n")).toMatch(/boom/);
  });

  it("exits 2 when a step times out", async () => {
    const { io } = makeIo();
    const scenario = makeScenario("slow", ["a"]);
    const registry = createScenarioRegistry([scenario]);
    const handlers: StepHandlerMap = {
      a: ({ signal }) =>
        new Promise<void>((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true
          });
        })
    };

    const outcome = await runCli({
      argv: ["--id", "slow", "--step-timeout", "5", "--no-artifacts"],
      cwd: "/tmp",
      io,
      registry,
      buildHandlers: () => handlers
    });

    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.timedOut);
    expect(outcome.result?.status).toBe("timed-out");
  });

  it("exits 3 when the external signal aborts", async () => {
    const { io } = makeIo();
    const scenario = makeScenario("interruptible", ["a"]);
    const registry = createScenarioRegistry([scenario]);
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));

    const outcome = await runCli({
      argv: ["--id", "interruptible", "--no-artifacts"],
      cwd: "/tmp",
      io,
      registry,
      buildHandlers: () => ({ a: () => {} }),
      signal: controller.signal
    });

    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.interrupted);
    expect(outcome.result?.status).toBe("interrupted");
  });

  it("wires visual scenarios through the visual api and records observations", async () => {
    const { io } = makeIo();
    const scenario = makeScenario("visual-ok", ["snap"]);
    const registry = createScenarioRegistry([scenario]);

    const outcome = await runCli({
      argv: ["--id", "visual-ok", "--no-artifacts"],
      cwd: "/tmp",
      io,
      registry,
      ensureDir: () => {},
      createVisualApi: ({ onObservation }) => ({
        check: (request) => {
          const observation = {
            scenarioId: request.scenarioId,
            stepId: request.stepId,
            verdict: "match" as const,
            width: request.width,
            height: request.height,
            mismatchedPixels: 0,
            mismatchRatio: 0,
            baselinePath: "/fake/baseline.png"
          };
          onObservation(observation);
          return observation;
        }
      }),
      buildHandlers: ({ visualApi }) => ({
        snap: () => {
          visualApi.check({
            scenarioId: "visual-ok",
            stepId: "snap",
            width: 2,
            height: 2,
            actualRgba: new Uint8Array(16)
          });
        }
      })
    });

    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.passed);
    expect(outcome.visualResults).toHaveLength(1);
    expect(outcome.visualResults?.[0]?.verdict).toBe("match");
  });

  it("exits 1 with visual diff paths when the visual api returns mismatch", async () => {
    const { io } = makeIo();
    const scenario = makeScenario("visual-fail", ["snap"]);
    const registry = createScenarioRegistry([scenario]);
    const { captured, writer } = captureWriter();

    const outcome = await runCli({
      argv: ["--id", "visual-fail"],
      cwd: "/tmp",
      io,
      registry,
      ensureDir: () => {},
      writeArtifacts: writer,
      createVisualApi: ({ onObservation }) => ({
        check: (request) => {
          const observation = {
            scenarioId: request.scenarioId,
            stepId: request.stepId,
            verdict: "mismatch" as const,
            width: request.width,
            height: request.height,
            mismatchedPixels: 4,
            mismatchRatio: 1,
            baselinePath: "/fake/baseline.png",
            actualPath: "/fake/actual.png",
            expectedPath: "/fake/expected.png",
            diffPath: "/fake/diff.png",
            message: "Visual mismatch: 4 of 4 pixels differ."
          };
          onObservation(observation);
          return observation;
        }
      }),
      buildHandlers: ({ visualApi }) => ({
        snap: () => {
          const obs = visualApi.check({
            scenarioId: "visual-fail",
            stepId: "snap",
            width: 2,
            height: 2,
            actualRgba: new Uint8Array(16)
          });
          if (obs.verdict === "mismatch") {
            throw new Error(obs.message ?? "visual mismatch");
          }
        }
      })
    });

    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.failed);
    expect(outcome.visualResults?.[0]?.verdict).toBe("mismatch");
    expect(captured.result?.visualResults?.[0]?.diffPath).toBe("/fake/diff.png");
  });

  it("prints help without executing anything", async () => {
    const { io, out } = makeIo();
    const outcome = await runCli({
      argv: ["--help"],
      cwd: "/tmp",
      io,
      registry: createScenarioRegistry()
    });
    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.passed);
    expect(out.join("\n")).toMatch(/Usage:/);
    expect(outcome.result).toBeUndefined();
  });
});
