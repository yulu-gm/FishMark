/**
 * Unified test scenario runner (TASK-027).
 *
 * Consumes a {@link TestScenario} metadata object plus a handler map and
 * drives the scenario through a deterministic state machine:
 *
 *   scenario:  idle -> running -> (passed | failed | timed-out | interrupted)
 *   step:      pending -> running -> (passed | failed | timed-out | skipped)
 *
 * The runner is the single entry point used by both the workbench UI
 * (TASK-028) and the agent-facing CLI (TASK-029). Execution is strictly
 * sequential: on the first non-passing step the scenario stops, remaining
 * steps are marked skipped, and a matching scenario terminal state is emitted.
 */

import type { TestScenario, TestStep } from "./scenario";

export type StepStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "timed-out"
  | "skipped";

export type ScenarioStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "timed-out"
  | "interrupted";

export type RunErrorInfo = {
  readonly message: string;
  readonly stack?: string;
  /** Set when the cause is a missing / invalid handler rather than the step body. */
  readonly kind?: "config" | "step" | "timeout" | "abort";
};

export type StepResult = {
  readonly id: string;
  readonly status: StepStatus;
  readonly startedAt?: number;
  readonly finishedAt?: number;
  readonly durationMs?: number;
  readonly error?: RunErrorInfo;
};

export type ScenarioResult = {
  readonly scenarioId: string;
  readonly status: ScenarioStatus;
  readonly steps: readonly StepResult[];
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
  /** First terminal error that stopped the scenario, if any. */
  readonly error?: RunErrorInfo & { readonly stepId?: string };
};

export type RunContext = {
  readonly scenarioId: string;
  readonly step: TestStep;
  readonly signal: AbortSignal;
};

export type StepHandler = (ctx: RunContext) => void | Promise<void>;
export type StepHandlerMap = Readonly<Record<string, StepHandler>>;

export type RunnerEvent =
  | { readonly type: "scenario-start"; readonly scenarioId: string; readonly at: number }
  | {
      readonly type: "step-start";
      readonly scenarioId: string;
      readonly stepId: string;
      readonly at: number;
    }
  | {
      readonly type: "step-end";
      readonly scenarioId: string;
      readonly stepId: string;
      readonly status: StepStatus;
      readonly at: number;
      readonly durationMs: number;
      readonly error?: RunErrorInfo;
    }
  | {
      readonly type: "scenario-end";
      readonly scenarioId: string;
      readonly status: ScenarioStatus;
      readonly at: number;
      readonly error?: RunErrorInfo & { readonly stepId?: string };
    };

export type RunScenarioOptions = {
  readonly handlers: StepHandlerMap;
  /** Per-step wall-clock budget. 0 / undefined disables the timeout. */
  readonly stepTimeoutMs?: number;
  /** External interrupt signal. Aborting before or during a step stops the run. */
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: RunnerEvent) => void;
  /** Injection seam for tests. Defaults to {@link Date.now}. */
  readonly now?: () => number;
  /** Finite grace period for aborted-handler cleanup. */
  readonly abortCleanupTimeoutMs?: number;
};

type TerminalStop =
  | { readonly kind: "failed"; readonly stepId: string; readonly error: RunErrorInfo }
  | { readonly kind: "timed-out"; readonly stepId: string; readonly error: RunErrorInfo }
  | { readonly kind: "interrupted"; readonly stepId?: string; readonly error: RunErrorInfo };

export async function runScenario(
  scenario: TestScenario,
  options: RunScenarioOptions
): Promise<ScenarioResult> {
  const now = options.now ?? Date.now;
  const emit = (event: RunnerEvent) => options.onEvent?.(event);

  const stepResults: StepResult[] = scenario.steps.map((step) => ({
    id: step.id,
    status: "pending"
  }));

  const startedAt = now();
  emit({ type: "scenario-start", scenarioId: scenario.id, at: startedAt });

  // External signal already aborted before any step ran.
  if (options.signal?.aborted) {
    const stop: TerminalStop = {
      kind: "interrupted",
      error: { message: "Run interrupted before start.", kind: "abort" }
    };
    return finalize(scenario, stepResults, startedAt, now, stop, emit);
  }

  let stop: TerminalStop | null = null;

  for (let i = 0; i < scenario.steps.length; i += 1) {
    const step = scenario.steps[i]!;
    const stepStartedAt = now();
    stepResults[i] = { id: step.id, status: "running", startedAt: stepStartedAt };

    emit({
      type: "step-start",
      scenarioId: scenario.id,
      stepId: step.id,
      at: stepStartedAt
    });

    const outcome = await executeStep(scenario.id, step, options, stepStartedAt, now);
    stepResults[i] = outcome.result;

    emit({
      type: "step-end",
      scenarioId: scenario.id,
      stepId: step.id,
      status: outcome.result.status,
      at: outcome.result.finishedAt ?? now(),
      durationMs: outcome.result.durationMs ?? 0,
      error: outcome.result.error
    });

    if (outcome.stop) {
      stop = outcome.stop;
      // Mark every later step as skipped.
      for (let j = i + 1; j < scenario.steps.length; j += 1) {
        stepResults[j] = { id: scenario.steps[j]!.id, status: "skipped" };
      }
      break;
    }
  }

  return finalize(scenario, stepResults, startedAt, now, stop, emit);
}

type StepOutcome = {
  readonly result: StepResult;
  readonly stop: TerminalStop | null;
};

async function executeStep(
  scenarioId: string,
  step: TestStep,
  options: RunScenarioOptions,
  stepStartedAt: number,
  now: () => number
): Promise<StepOutcome> {
  const handler = options.handlers[step.id];
  if (typeof handler !== "function") {
    const error: RunErrorInfo = {
      message: `No handler registered for step ${JSON.stringify(step.id)} in scenario ${JSON.stringify(scenarioId)}.`,
      kind: "config"
    };
    const finishedAt = now();
    return {
      result: {
        id: step.id,
        status: "failed",
        startedAt: stepStartedAt,
        finishedAt,
        durationMs: finishedAt - stepStartedAt,
        error
      },
      stop: { kind: "failed", stepId: step.id, error }
    };
  }

  const controller = new AbortController();
  const external = options.signal;
  let onExternalAbort: (() => void) | undefined;
  let externalAbortPromise: Promise<never> | undefined;
  if (external) {
    externalAbortPromise = new Promise((_, reject) => {
      onExternalAbort = () => {
        controller.abort(external.reason);
        reject(new StepAbortError(step.id, external.reason));
      };
      if (external.aborted) {
        onExternalAbort();
      } else {
        external.addEventListener("abort", onExternalAbort, { once: true });
        if (external.aborted) onExternalAbort();
      }
    });
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const handlerPromise = Promise.resolve().then(() =>
    handler({ scenarioId, step, signal: controller.signal })
  );

  try {
    const racers: Promise<unknown>[] = [handlerPromise];

    const budget = options.stepTimeoutMs;
    if (budget && budget > 0) {
      racers.push(
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error(`Step ${step.id} timed out after ${budget}ms.`));
            reject(new StepTimeoutError(step.id, budget));
          }, budget);
        })
      );
    }

    if (externalAbortPromise) racers.push(externalAbortPromise);

    await Promise.race(racers);

    const finishedAt = now();
    return {
      result: {
        id: step.id,
        status: "passed",
        startedAt: stepStartedAt,
        finishedAt,
        durationMs: finishedAt - stepStartedAt
      },
      stop: null
    };
  } catch (raw) {
    if (raw instanceof StepTimeoutError || timedOut) {
      const cleanup = await waitForHandlerCleanup(
        handlerPromise,
        options.abortCleanupTimeoutMs
      );
      const finishedAt = now();
      const error: RunErrorInfo = {
        message: withHandlerCleanupResult(
          raw instanceof Error ? raw.message : `Step ${step.id} timed out.`,
          cleanup
        ),
        kind: "timeout"
      };
      return {
        result: {
          id: step.id,
          status: "timed-out",
          startedAt: stepStartedAt,
          finishedAt,
          durationMs: finishedAt - stepStartedAt,
          error
        },
        stop: { kind: "timed-out", stepId: step.id, error }
      };
    }

    if (raw instanceof StepAbortError || external?.aborted) {
      const cleanup = await waitForHandlerCleanup(
        handlerPromise,
        options.abortCleanupTimeoutMs
      );
      const finishedAt = now();
      const error: RunErrorInfo = {
        message: withHandlerCleanupResult(
          raw instanceof Error
            ? raw.message
            : `Step ${step.id} aborted by external signal.`,
          cleanup
        ),
        kind: "abort"
      };
      return {
        result: {
          id: step.id,
          status: "skipped",
          startedAt: stepStartedAt,
          finishedAt,
          durationMs: finishedAt - stepStartedAt,
          error
        },
        stop: { kind: "interrupted", stepId: step.id, error }
      };
    }

    const err = raw instanceof Error ? raw : new Error(String(raw));
    const finishedAt = now();
    const error: RunErrorInfo = {
      message: err.message,
      stack: err.stack,
      kind: "step"
    };
    return {
      result: {
        id: step.id,
        status: "failed",
        startedAt: stepStartedAt,
        finishedAt,
        durationMs: finishedAt - stepStartedAt,
        error
      },
      stop: { kind: "failed", stepId: step.id, error }
    };
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    if (external && onExternalAbort) {
      external.removeEventListener("abort", onExternalAbort);
    }
  }
}

type HandlerCleanupResult =
  | { readonly status: "settled"; readonly error?: unknown }
  | { readonly status: "timed-out"; readonly timeoutMs: number };

async function waitForHandlerCleanup(
  handlerPromise: Promise<void>,
  timeoutMs: number | undefined
): Promise<HandlerCleanupResult> {
  timeoutMs ??= 100;
  if (timeoutMs <= 0) return { status: "timed-out", timeoutMs };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      handlerPromise.then(
        (): HandlerCleanupResult => ({ status: "settled" }),
        (error: unknown): HandlerCleanupResult => ({ status: "settled", error })
      ),
      new Promise<HandlerCleanupResult>((resolveCleanup) => {
        timeout = setTimeout(
          () => resolveCleanup({ status: "timed-out", timeoutMs }),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function withHandlerCleanupResult(
  primaryMessage: string,
  cleanup: HandlerCleanupResult
): string {
  if (cleanup.status === "timed-out") {
    return `${primaryMessage} Handler cleanup did not settle within ${cleanup.timeoutMs}ms.`;
  }
  if (
    cleanup.error instanceof Error &&
    /process-tree cleanup failed/iu.test(cleanup.error.message)
  ) {
    return `${primaryMessage} ${cleanup.error.message}`;
  }
  return primaryMessage;
}

function finalize(
  scenario: TestScenario,
  steps: readonly StepResult[],
  startedAt: number,
  now: () => number,
  stop: TerminalStop | null,
  emit: (event: RunnerEvent) => void
): ScenarioResult {
  const finishedAt = now();
  let status: ScenarioStatus;
  let error: (RunErrorInfo & { stepId?: string }) | undefined;

  if (!stop) {
    status = "passed";
  } else if (stop.kind === "failed") {
    status = "failed";
    error = { ...stop.error, stepId: stop.stepId };
  } else if (stop.kind === "timed-out") {
    status = "timed-out";
    error = { ...stop.error, stepId: stop.stepId };
  } else {
    status = "interrupted";
    error = stop.stepId ? { ...stop.error, stepId: stop.stepId } : { ...stop.error };
  }

  emit({
    type: "scenario-end",
    scenarioId: scenario.id,
    status,
    at: finishedAt,
    error
  });

  return {
    scenarioId: scenario.id,
    status,
    steps,
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    error
  };
}

class StepTimeoutError extends Error {
  constructor(stepId: string, budgetMs: number) {
    super(`Step ${stepId} timed out after ${budgetMs}ms.`);
    this.name = "StepTimeoutError";
  }
}

class StepAbortError extends Error {
  constructor(stepId: string, reason: unknown) {
    super(
      reason instanceof Error
        ? `Step ${stepId} aborted: ${reason.message}`
        : `Step ${stepId} aborted by external signal.`
    );
    this.name = "StepAbortError";
  }
}
