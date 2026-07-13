import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
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

type TrackedProcess = {
  readonly child: ChildProcess;
  readonly terminate: () => Promise<void>;
  readonly verifyStopped: () => Promise<void>;
};

type ProcessTreeModule = {
  readonly spawnTrackedProcess: (
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly stdio: "ignore" | "inherit";
      readonly windowsHide: boolean;
    }
  ) => TrackedProcess;
};

const loadModule = createRequire(resolve(process.cwd(), "package.json"));

export async function runBatchProcess(input: BatchProcessInput): Promise<void> {
  if (input.signal.aborted) {
    throw input.signal.reason ?? new Error("Editor behavior batch was aborted before start.");
  }

  await new Promise<void>((resolveRun, rejectRun) => {
    const processTree = loadProcessTreeModule(input.cwd).spawnTrackedProcess(
      input.command,
      [...input.args],
      {
        cwd: input.cwd,
        stdio: input.stdio ?? "inherit",
        windowsHide: true
      }
    );
    const { child } = processTree;
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
      void processTree.terminate().then(
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
      if (aborting) return;
      void processTree.terminate().then(
        () => settle(error),
        (cleanupError: unknown) => settle(withCleanupFailure(error, cleanupError))
      );
    });
    child.once("exit", (code, signal) => {
      if (aborting) return;
      if (code === 0) {
        void processTree.verifyStopped().then(
          () => settle(),
          (cleanupError: unknown) =>
            processTree.terminate().then(
              () => settle(cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError))),
              (terminateError: unknown) =>
                settle(withCleanupFailure(cleanupError, terminateError))
            )
        );
        return;
      }
      const exitError = new Error(
        `Editor behavior batch exited with ${
          signal ? `signal ${signal}` : `code ${code ?? "unknown"}`
        }.`
      );
      void processTree.terminate().then(
        () => settle(exitError),
        (cleanupError: unknown) => settle(withCleanupFailure(exitError, cleanupError))
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

function loadProcessTreeModule(cwd: string): ProcessTreeModule {
  return loadModule(resolve(cwd, "scripts", "process-tree.cjs")) as ProcessTreeModule;
}

function withCleanupFailure(error: unknown, cleanupError: unknown): Error {
  const primary = error instanceof Error ? error.message : String(error);
  const cleanup = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
  return new Error(`${primary} Process-tree cleanup failed: ${cleanup}`);
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
