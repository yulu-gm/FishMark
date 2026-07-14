import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runCli } from "../cli/run";
import { createScenarioRegistry } from "../registry";
import type { TestScenario } from "../scenario";
import {
  createEditorBehaviorBatchStepHandlers,
  runBatchProcess
} from "./editor-behavior-batch";

const scenario: TestScenario = {
  id: "editor-batch-test",
  title: "editor batch test",
  summary: "editor batch test",
  surface: "editor",
  tags: ["editor"],
  execution: { kind: "electron-batch", runner: "editor-behavior-manifest" },
  steps: [
    { id: "first", title: "first", kind: "assertion" },
    { id: "second", title: "second", kind: "assertion" }
  ]
};

describe("createEditorBehaviorBatchStepHandlers", () => {
  it("executes the complete Electron batch once for every scenario step", async () => {
    const runBatch = vi.fn(async () => undefined);
    const handlers = createEditorBehaviorBatchStepHandlers(scenario, "D:/workspace", runBatch);
    const signal = new AbortController().signal;

    await handlers.first!({ scenarioId: scenario.id, step: scenario.steps[0]!, signal });
    await handlers.second!({ scenarioId: scenario.id, step: scenario.steps[1]!, signal });

    expect(runBatch).toHaveBeenCalledOnce();
    expect(runBatch).toHaveBeenCalledWith({ cwd: "D:/workspace", signal });
  });

  it("shares a rejected atomic result instead of rerunning later steps", async () => {
    const failure = new Error("formal gate failed");
    const runBatch = vi.fn(async () => {
      throw failure;
    });
    const handlers = createEditorBehaviorBatchStepHandlers(scenario, "D:/workspace", runBatch);
    const signal = new AbortController().signal;

    await expect(
      handlers.first!({ scenarioId: scenario.id, step: scenario.steps[0]!, signal })
    ).rejects.toBe(failure);
    await expect(
      handlers.second!({ scenarioId: scenario.id, step: scenario.steps[1]!, signal })
    ).rejects.toBe(failure);
    expect(runBatch).toHaveBeenCalledOnce();
  });
});

describe("runBatchProcess", () => {
  it("does not start an already-aborted batch", async () => {
    const controller = new AbortController();
    controller.abort(new Error("pre-aborted"));

    await expect(
      runBatchProcess({
        command: process.execPath,
        args: ["-e", "process.exit(0)"],
        cwd: process.cwd(),
        signal: controller.signal,
        stdio: "ignore"
      })
    ).rejects.toThrow("pre-aborted");
  });

  it("terminates a real running child process tree when the batch is aborted", async () => {
    const controller = new AbortController();
    const processTree = startRealProcessTree(controller.signal);

    try {
      await waitUntil(() => existsSync(processTree.descendantPidPath), 3_000);
      const descendantPid = processTree.descendantPid();
      expect(isProcessAlive(descendantPid)).toBe(true);

      controller.abort(new Error("mid-run abort"));
      const error = await processTree.outcome;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("mid-run abort");
      await waitUntil(() => !isProcessAlive(descendantPid), 3_000);
    } finally {
      controller.abort(new Error("test cleanup"));
      await processTree.outcome;
      processTree.remove();
    }
  }, 10_000);

});

describe("public CLI batch cleanup", () => {
  it("does not return from abort until the real descendant tree and handler cleanup settle", async () => {
    const controller = new AbortController();
    let processTree: ReturnType<typeof startRealProcessTree> | undefined;
    let handlerCleanupFinished = false;
    const handlers = createEditorBehaviorBatchStepHandlers(
      scenario,
      process.cwd(),
      async ({ signal }) => {
        processTree = startRealProcessTree(signal);
        try {
          const error = await processTree.outcome;
          if (error instanceof Error) throw error;
        } finally {
          await new Promise((resolveCleanup) => setTimeout(resolveCleanup, 75));
          handlerCleanupFinished = true;
        }
      }
    );
    const cliRun = runCli({
      argv: ["--id", scenario.id, "--no-artifacts"],
      cwd: process.cwd(),
      io: { stdout: () => undefined, stderr: () => undefined },
      registry: createScenarioRegistry([scenario]),
      buildHandlers: () => handlers,
      signal: controller.signal
    });

    try {
      await waitUntil(
        () => processTree !== undefined && existsSync(processTree.descendantPidPath),
        3_000
      );
      const descendantPid = processTree!.descendantPid();
      expect(isProcessAlive(descendantPid)).toBe(true);

      controller.abort(new Error("CLI abort"));
      const outcome = await cliRun;
      expect(outcome.result?.status).toBe("interrupted");
      expect(handlerCleanupFinished).toBe(true);
      expect(isProcessAlive(descendantPid)).toBe(false);
    } finally {
      controller.abort(new Error("test cleanup"));
      await cliRun;
      processTree?.remove();
    }
  }, 10_000);

  it("does not return from timeout while a real descendant is still cleaning up", async () => {
    const delayedAbort = new AbortController();
    let processTree: ReturnType<typeof startRealProcessTree> | undefined;
    let handlerCleanupFinished = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    const handlers = createEditorBehaviorBatchStepHandlers(
      scenario,
      process.cwd(),
      async ({ signal }) => {
        processTree = startRealProcessTree(delayedAbort.signal);
        signal.addEventListener(
          "abort",
          () => {
            cleanupTimer = setTimeout(
              () => delayedAbort.abort(new Error("delayed timeout cleanup")),
              150
            );
          },
          { once: true }
        );
        try {
          const error = await processTree.outcome;
          if (error instanceof Error) throw error;
        } finally {
          handlerCleanupFinished = true;
        }
      }
    );
    const cliRun = runCli({
      argv: ["--id", scenario.id, "--step-timeout", "100", "--no-artifacts"],
      cwd: process.cwd(),
      io: { stdout: () => undefined, stderr: () => undefined },
      registry: createScenarioRegistry([scenario]),
      buildHandlers: () => handlers,
      abortCleanupTimeoutMs: 2_000
    });

    try {
      await waitUntil(
        () => processTree !== undefined && existsSync(processTree.descendantPidPath),
        3_000
      );
      const descendantPid = processTree!.descendantPid();
      const outcome = await cliRun;
      expect(outcome.result?.status).toBe("timed-out");
      expect(handlerCleanupFinished).toBe(true);
      expect(isProcessAlive(descendantPid)).toBe(false);
    } finally {
      if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
      delayedAbort.abort(new Error("test cleanup"));
      await cliRun;
      processTree?.remove();
    }
  }, 5_000);
});

function startRealProcessTree(signal: AbortSignal) {
  const tempDirectory = mkdtempSync(join(tmpdir(), "fishmark-batch-abort-"));
  const descendantPidPath = join(tempDirectory, "descendant.pid");
  const wrapperSource = [
    'const { spawn } = require("node:child_process");',
    'const { writeFileSync } = require("node:fs");',
    'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
    "writeFileSync(process.argv[1], String(child.pid));",
    "setInterval(() => {}, 1000);"
  ].join("");
  const outcome = runBatchProcess({
    command: process.execPath,
    args: ["-e", wrapperSource, descendantPidPath],
    cwd: process.cwd(),
    signal,
    stdio: "ignore"
  }).then(
    () => null,
    (error: unknown) => error
  );

  return {
    descendantPidPath,
    outcome,
    descendantPid: () => Number(readFileSync(descendantPidPath, "utf8")),
    remove: () => rmSync(tempDirectory, { recursive: true, force: true })
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Condition was not met within ${timeoutMs}ms.`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
