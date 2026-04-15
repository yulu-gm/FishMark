/**
 * Pure-ish CLI entry used by both the executable (`bin.ts`) and the tests.
 *
 * The caller supplies every side-effect seam so unit tests can drive the
 * CLI without spawning a subprocess: the scenario registry, the handler
 * factory, the artifact writer, stdout / stderr sinks, and a now() clock.
 */

import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  buildResultDocument,
  buildStepTraceDocument,
  runDirName,
  writeRunArtifacts,
  type WrittenArtifacts
} from "./artifacts";
import { parseCliArgs, type CliOptions } from "./args";
import { CLI_EXIT_CODES, exitCodeForStatus, type CliExitCode } from "./exit-codes";
import { createHeadlessStepHandlers } from "../handlers/headless";
import type { ScenarioRegistry } from "../registry";
import { defaultScenarioRegistry } from "../index";
import {
  runScenario,
  type RunnerEvent,
  type ScenarioResult,
  type StepHandlerMap
} from "../runner";
import type { TestScenario } from "../scenario";

export const CLI_VERSION = "0.2.0";

export type CliIo = {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
};

export type CliHandlerBuildArgs = {
  readonly scenario: TestScenario;
  readonly cwd: string;
};

export type CliRunDeps = {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly io: CliIo;
  readonly registry?: ScenarioRegistry;
  readonly buildHandlers?: (args: CliHandlerBuildArgs) => StepHandlerMap;
  readonly onEvent?: (event: RunnerEvent) => void;
  readonly signal?: AbortSignal;
  readonly writeArtifacts?: (
    outRoot: string,
    result: ReturnType<typeof buildResultDocument>,
    trace: ReturnType<typeof buildStepTraceDocument>,
    opts: { readonly runDir: string }
  ) => WrittenArtifacts;
  readonly now?: () => number;
  readonly ensureDir?: (path: string) => void;
};

export type CliRunOutcome = {
  readonly exitCode: CliExitCode;
  readonly result?: ScenarioResult;
  readonly artifacts?: WrittenArtifacts;
  readonly options?: CliOptions;
};

export async function runCli(deps: CliRunDeps): Promise<CliRunOutcome> {
  const parsed = parseCliArgs(deps.argv);

  if (parsed.kind === "help") {
    deps.io.stdout(parsed.message);
    return { exitCode: CLI_EXIT_CODES.passed };
  }

  if (parsed.kind === "error") {
    deps.io.stderr(parsed.message);
    deps.io.stderr("Run with --help for usage.");
    return { exitCode: CLI_EXIT_CODES.configError };
  }

  const options = parsed.options;
  const registry = deps.registry ?? defaultScenarioRegistry;
  const scenario = registry.get(options.scenarioId);
  if (!scenario) {
    deps.io.stderr(
      `Unknown scenario id ${JSON.stringify(options.scenarioId)}. ` +
        `Known ids: ${registry
          .list()
          .map((s) => s.id)
          .join(", ") || "<none>"}.`
    );
    return { exitCode: CLI_EXIT_CODES.configError, options };
  }

  const now = deps.now ?? Date.now;
  const ensureDir = deps.ensureDir ?? ((path: string) => mkdirSync(path, { recursive: true }));

  const outRoot = isAbsolute(options.outDir)
    ? options.outDir
    : resolve(deps.cwd, options.outDir);
  const runStartedAt = now();
  const runArtifactDir = resolve(
    outRoot,
    runDirName(scenario.id, runStartedAt)
  );
  if (options.writeArtifacts) {
    ensureDir(runArtifactDir);
  }

  const buildHandlers: (args: CliHandlerBuildArgs) => StepHandlerMap =
    deps.buildHandlers ??
    (({ scenario: s }) => createHeadlessStepHandlers(s));
  const handlers = buildHandlers({
    scenario,
    cwd: deps.cwd
  });

  const events: RunnerEvent[] = [];
  const result = await runScenario(scenario, {
    handlers,
    stepTimeoutMs: options.stepTimeoutMs,
    signal: deps.signal,
    now: deps.now,
    onEvent: (event) => {
      events.push(event);
      deps.onEvent?.(event);
    }
  });

  let artifacts: WrittenArtifacts | undefined;
  if (options.writeArtifacts) {
    const resultDoc = buildResultDocument(result, {
      stepTimeoutMs: options.stepTimeoutMs,
      cliVersion: CLI_VERSION
    });
    const traceDoc = buildStepTraceDocument(scenario.id, events);
    const writer = deps.writeArtifacts ?? writeRunArtifacts;
    artifacts = writer(outRoot, resultDoc, traceDoc, { runDir: runArtifactDir });
  }

  const summary = formatSummary(result, artifacts);
  deps.io.stdout(summary);

  if (result.status !== "passed" && result.error) {
    const stepLabel = result.error.stepId ? ` at step ${result.error.stepId}` : "";
    deps.io.stderr(`scenario ${result.status}${stepLabel}: ${result.error.message}`);
  }

  return {
    exitCode: exitCodeForStatus(result.status),
    result,
    artifacts,
    options
  };
}

function formatSummary(
  result: ScenarioResult,
  artifacts: WrittenArtifacts | undefined
): string {
  const lines: string[] = [];
  lines.push(`scenario ${result.scenarioId} ${result.status} in ${result.durationMs}ms`);
  for (const step of result.steps) {
    const duration = step.durationMs !== undefined ? ` (${step.durationMs}ms)` : "";
    lines.push(`  - ${step.id}: ${step.status}${duration}`);
  }
  if (artifacts) {
    lines.push(`artifacts: ${artifacts.runDir}`);
    lines.push(`  result:     ${artifacts.resultPath}`);
    lines.push(`  step-trace: ${artifacts.stepTracePath}`);
  }
  return lines.join("\n");
}
