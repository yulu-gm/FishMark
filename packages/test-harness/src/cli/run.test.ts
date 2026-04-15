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

  it("forwards runner events to the optional onEvent callback", async () => {
    const { io } = makeIo();
    const scenario = makeScenario("emit-events", ["a"]);
    const registry = createScenarioRegistry([scenario]);
    const forwarded: string[] = [];

    const outcome = await runCli({
      argv: ["--id", "emit-events", "--no-artifacts"],
      cwd: "/tmp",
      io,
      registry,
      buildHandlers: () => ({ a: () => {} }),
      onEvent: (event) => forwarded.push(event.type)
    });

    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.passed);
    expect(forwarded).toEqual(["scenario-start", "step-start", "step-end", "scenario-end"]);
  });

  it("passes cwd through to the handler factory for repo-relative fixtures", async () => {
    const { io } = makeIo();
    const scenario = makeScenario("cwd-aware", ["a"]);
    const registry = createScenarioRegistry([scenario]);
    let receivedCwd: string | null = null;

    const outcome = await runCli({
      argv: ["--id", "cwd-aware", "--no-artifacts"],
      cwd: "D:/MyAgent/Yulora/Yulora",
      io,
      registry,
      buildHandlers: ({ cwd }) => {
        receivedCwd = cwd;
        return { a: () => {} };
      }
    });

    expect(outcome.exitCode).toBe(CLI_EXIT_CODES.passed);
    expect(receivedCwd).toBe("D:/MyAgent/Yulora/Yulora");
  });
});
