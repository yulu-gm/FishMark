/**
 * Pure-ish CLI entry used by both the executable (`bin.ts`) and the tests.
 *
 * The caller supplies every side-effect seam so unit tests can drive the
 * CLI without spawning a subprocess: the scenario registry, the handler
 * factory, the artifact writer, stdout / stderr sinks, and a now() clock.
 *
 * TASK-030 extended the entry to compute the run-artifact directory up
 * front so the visual API can write actual / expected / diff PNGs into it
 * during the run, and to include any collected visual observations in the
 * final `result.json` / summary.
 */

import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  buildResultDocument,
  buildStepTraceDocument,
  runDirName,
  toVisualResultSummary,
  writeRunArtifacts,
  type VisualResultSummary,
  type WrittenArtifacts
} from "./artifacts";
import { parseCliArgs, type CliOptions } from "./args";
import { CLI_EXIT_CODES, exitCodeForStatus, type CliExitCode } from "./exit-codes";
import { createHeadlessStepHandlers, type HeadlessHandlerDeps } from "../handlers/headless";
import type { ScenarioRegistry } from "../registry";
import { defaultScenarioRegistry } from "../index";
import {
  runScenario,
  type RunnerEvent,
  type ScenarioResult,
  type StepHandlerMap
} from "../runner";
import type { TestScenario } from "../scenario";
import type { VisualApi, VisualObservation } from "../visual/api";
import { createNodeVisualApi } from "../visual/node-api";

export const CLI_VERSION = "0.2.0";

export type CliIo = {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
};

export type CliHandlerBuildArgs = {
  readonly scenario: TestScenario;
  readonly visualApi: VisualApi;
  readonly forceVisualDrift: boolean;
};

export type CliRunDeps = {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly io: CliIo;
  readonly registry?: ScenarioRegistry;
  readonly buildHandlers?: (args: CliHandlerBuildArgs) => StepHandlerMap;
  readonly createVisualApi?: (deps: {
    readonly baselineRoot: string;
    readonly artifactDir: string;
    readonly onObservation: (observation: VisualObservation) => void;
  }) => VisualApi;
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
  readonly visualResults?: readonly VisualResultSummary[];
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
  const baselineRoot = isAbsolute(options.baselineRoot)
    ? options.baselineRoot
    : resolve(deps.cwd, options.baselineRoot);

  // Pre-compute the run artifact directory so the visual api can write
  // actual / expected / diff PNGs directly into it during the run.
  const runStartedAt = now();
  const runArtifactDir = resolve(
    outRoot,
    runDirName(scenario.id, runStartedAt)
  );
  if (options.writeArtifacts) {
    ensureDir(runArtifactDir);
  }

  const visualObservations: VisualObservation[] = [];
  const createVisualApi =
    deps.createVisualApi ??
    ((apiDeps) =>
      createNodeVisualApi({
        baselineRoot: apiDeps.baselineRoot,
        artifactDir: apiDeps.artifactDir,
        onObservation: apiDeps.onObservation
      }));
  const visualApi = createVisualApi({
    baselineRoot,
    artifactDir: runArtifactDir,
    onObservation: (observation) => visualObservations.push(observation)
  });

  const buildHandlers: (args: CliHandlerBuildArgs) => StepHandlerMap =
    deps.buildHandlers ??
    (({ scenario: s, visualApi: api, forceVisualDrift }) => {
      const depsForHeadless: HeadlessHandlerDeps = {
        visualApi: api,
        forceVisualDrift
      };
      return createHeadlessStepHandlers(s, depsForHeadless);
    });
  const handlers = buildHandlers({
    scenario,
    visualApi,
    forceVisualDrift: options.forceVisualDrift
  });

  const events: RunnerEvent[] = [];
  const result = await runScenario(scenario, {
    handlers,
    stepTimeoutMs: options.stepTimeoutMs,
    signal: deps.signal,
    now: deps.now,
    onEvent: (event) => events.push(event)
  });

  const visualResults = visualObservations.map(toVisualResultSummary);

  let artifacts: WrittenArtifacts | undefined;
  if (options.writeArtifacts) {
    const resultDoc = buildResultDocument(result, {
      stepTimeoutMs: options.stepTimeoutMs,
      cliVersion: CLI_VERSION,
      visualResults
    });
    const traceDoc = buildStepTraceDocument(scenario.id, events);
    const writer = deps.writeArtifacts ?? writeRunArtifacts;
    artifacts = writer(outRoot, resultDoc, traceDoc, { runDir: runArtifactDir });
  }

  const summary = formatSummary(result, artifacts, visualResults);
  deps.io.stdout(summary);

  if (result.status !== "passed" && result.error) {
    const stepLabel = result.error.stepId ? ` at step ${result.error.stepId}` : "";
    deps.io.stderr(`scenario ${result.status}${stepLabel}: ${result.error.message}`);
  }

  return {
    exitCode: exitCodeForStatus(result.status),
    result,
    artifacts,
    options,
    visualResults
  };
}

function formatSummary(
  result: ScenarioResult,
  artifacts: WrittenArtifacts | undefined,
  visualResults: readonly VisualResultSummary[]
): string {
  const lines: string[] = [];
  lines.push(`scenario ${result.scenarioId} ${result.status} in ${result.durationMs}ms`);
  for (const step of result.steps) {
    const duration = step.durationMs !== undefined ? ` (${step.durationMs}ms)` : "";
    lines.push(`  - ${step.id}: ${step.status}${duration}`);
  }
  if (visualResults.length > 0) {
    lines.push("visual:");
    for (const visual of visualResults) {
      const pct = (visual.mismatchRatio * 100).toFixed(2);
      lines.push(
        `  - ${visual.stepId}: ${visual.verdict} (${visual.mismatchedPixels} px / ${pct}%)`
      );
      if (visual.actualPath) lines.push(`      actual:   ${visual.actualPath}`);
      if (visual.expectedPath) lines.push(`      expected: ${visual.expectedPath}`);
      if (visual.diffPath) lines.push(`      diff:     ${visual.diffPath}`);
    }
  }
  if (artifacts) {
    lines.push(`artifacts: ${artifacts.runDir}`);
    lines.push(`  result:     ${artifacts.resultPath}`);
    lines.push(`  step-trace: ${artifacts.stepTracePath}`);
  }
  return lines.join("\n");
}
