import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import type { RunContext, StepHandlerMap } from "../runner";
import type { TestScenario } from "../scenario";

export type RunEditorBehaviorBatch = (input: {
  readonly cwd: string;
  readonly signal: AbortSignal;
}) => Promise<void>;

export type BatchProcessInput = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly signal: AbortSignal;
  readonly stdio?: "ignore" | "inherit";
};

export async function runBatchProcess(input: BatchProcessInput): Promise<void> {
  if (input.signal.aborted) {
    throw input.signal.reason ?? new Error("Editor behavior batch was aborted before start.");
  }

  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(
      input.command,
      [...input.args],
      {
        cwd: input.cwd,
        detached: process.platform !== "win32",
        stdio: input.stdio ?? "inherit",
        windowsHide: true
      }
    );
    let settled = false;
    let aborting = false;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener("abort", onAbort);
      if (error) rejectRun(error);
      else resolveRun();
    };
    const onAbort = () => {
      aborting = true;
      const abortError =
        input.signal.reason instanceof Error
          ? input.signal.reason
          : new Error("Editor behavior batch was aborted.");
      void terminateProcessTree(child).then(
        () => settle(abortError),
        (cleanupError: unknown) =>
          settle(
            new Error(
              `${abortError.message} Process-tree cleanup failed: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              }`
            )
          )
      );
    };

    input.signal.addEventListener("abort", onAbort, { once: true });
    if (input.signal.aborted) {
      onAbort();
    }
    child.once("error", (error) => {
      if (!aborting) settle(error);
    });
    child.once("exit", (code, signal) => {
      if (aborting) return;
      if (code === 0) {
        settle();
        return;
      }
      settle(
        new Error(
          `Editor behavior batch exited with ${
            signal ? `signal ${signal}` : `code ${code ?? "unknown"}`
          }.`
        )
      );
    });
  });
}

export async function runEditorBehaviorBatch(input: {
  readonly cwd: string;
  readonly signal: AbortSignal;
}): Promise<void> {
  await runBatchProcess({
    command: process.execPath,
    args: [resolve(input.cwd, "scripts/probe-editor-behavior.mjs")],
    cwd: input.cwd,
    signal: input.signal,
    stdio: "inherit"
  });
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolveTermination, rejectTermination) => {
      const terminator = spawn(
        "taskkill",
        ["/pid", String(pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true }
      );
      terminator.once("error", rejectTermination);
      terminator.once("exit", (code) => {
        if (code === 0 || child.exitCode !== null || child.signalCode !== null) {
          resolveTermination();
        } else {
          rejectTermination(new Error(`taskkill exited with code ${code ?? "unknown"}.`));
        }
      });
    });
    return;
  }

  await terminatePosixProcessGroup(child, pid);
}

async function terminatePosixProcessGroup(child: ChildProcess, pid: number): Promise<void> {
  signalProcessGroup(child, pid, "SIGTERM");
  if (await waitForExit(child, 2_000)) return;
  signalProcessGroup(child, pid, "SIGKILL");
  if (!(await waitForExit(child, 2_000))) {
    throw new Error(`Process group ${pid} did not exit after SIGKILL.`);
  }
}

function signalProcessGroup(
  child: ChildProcess,
  pid: number,
  signal: NodeJS.Signals
): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    if (!child.kill(signal)) throw error;
  }
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise<boolean>((resolveWait) => {
    const timeout = setTimeout(() => {
      child.removeListener("exit", onExit);
      resolveWait(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolveWait(true);
    };
    child.once("exit", onExit);
  });
}

/**
 * The manifest runner executes the complete scenario atomically. The first
 * scenario step starts it; every later step observes the same settled result.
 */
export function createEditorBehaviorBatchStepHandlers(
  scenario: TestScenario,
  cwd: string,
  runBatch: RunEditorBehaviorBatch = runEditorBehaviorBatch
): StepHandlerMap {
  if (
    scenario.execution.kind !== "electron-batch" ||
    scenario.execution.runner !== "editor-behavior-manifest"
  ) {
    throw new Error(`Scenario ${scenario.id} is not an editor behavior batch.`);
  }

  let batchRun: Promise<void> | undefined;
  return Object.fromEntries(
    scenario.steps.map((step) => [
      step.id,
      ({ signal }: RunContext) => {
        batchRun ??= runBatch({ cwd, signal });
        return batchRun;
      }
    ])
  ) as StepHandlerMap;
}
