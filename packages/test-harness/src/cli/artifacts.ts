/**
 * Artifact protocol for the agent CLI (TASK-029).
 *
 * A run produces a stable directory under `--out-dir`:
 *
 *   <out-dir>/<timestamp>-<scenario-id>/
 *     result.json       -- high-level scenario outcome + metadata
 *     step-trace.json   -- ordered list of RunnerEvent objects
 *
 * The shapes here are the versioned agent contract. Bump `PROTOCOL_VERSION`
 * on any breaking change so consumers can detect drift.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { RunnerEvent, ScenarioResult } from "../runner";
import type { VisualObservation } from "../visual/api";

export const PROTOCOL_VERSION = 2;

export type VisualResultSummary = {
  readonly scenarioId: string;
  readonly stepId: string;
  readonly verdict: VisualObservation["verdict"];
  readonly width: number;
  readonly height: number;
  readonly mismatchedPixels: number;
  readonly mismatchRatio: number;
  readonly baselinePath?: string;
  readonly actualPath?: string;
  readonly expectedPath?: string;
  readonly diffPath?: string;
  readonly message?: string;
};

export type ResultDocument = {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly scenarioId: string;
  readonly status: ScenarioResult["status"];
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly steps: ScenarioResult["steps"];
  readonly error?: ScenarioResult["error"];
  readonly visualResults?: readonly VisualResultSummary[];
  readonly meta: {
    readonly startedAtIso: string;
    readonly finishedAtIso: string;
    readonly stepTimeoutMs: number;
    readonly cliVersion: string;
  };
};

export type StepTraceDocument = {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly scenarioId: string;
  readonly events: readonly RunnerEvent[];
};

export function buildResultDocument(
  result: ScenarioResult,
  meta: {
    readonly stepTimeoutMs: number;
    readonly cliVersion: string;
    readonly visualResults?: readonly VisualResultSummary[];
  }
): ResultDocument {
  return {
    protocolVersion: PROTOCOL_VERSION,
    scenarioId: result.scenarioId,
    status: result.status,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    steps: result.steps,
    error: result.error,
    visualResults:
      meta.visualResults && meta.visualResults.length > 0 ? meta.visualResults : undefined,
    meta: {
      startedAtIso: new Date(result.startedAt).toISOString(),
      finishedAtIso: new Date(result.finishedAt).toISOString(),
      stepTimeoutMs: meta.stepTimeoutMs,
      cliVersion: meta.cliVersion
    }
  };
}

export function toVisualResultSummary(observation: VisualObservation): VisualResultSummary {
  return {
    scenarioId: observation.scenarioId,
    stepId: observation.stepId,
    verdict: observation.verdict,
    width: observation.width,
    height: observation.height,
    mismatchedPixels: observation.mismatchedPixels,
    mismatchRatio: observation.mismatchRatio,
    baselinePath: observation.baselinePath,
    actualPath: observation.actualPath,
    expectedPath: observation.expectedPath,
    diffPath: observation.diffPath,
    message: observation.message
  };
}

export function buildStepTraceDocument(
  scenarioId: string,
  events: readonly RunnerEvent[]
): StepTraceDocument {
  return {
    protocolVersion: PROTOCOL_VERSION,
    scenarioId,
    events
  };
}

/**
 * Compute the per-run artifact directory name. Exposed for tests so we can
 * pin the timestamp rather than relying on wall-clock.
 */
export function runDirName(scenarioId: string, startedAt: number): string {
  const iso = new Date(startedAt)
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/[:]/g, "-");
  return `${iso}-${scenarioId}`;
}

export type WrittenArtifacts = {
  readonly runDir: string;
  readonly resultPath: string;
  readonly stepTracePath: string;
};

export function writeRunArtifacts(
  outRoot: string,
  result: ResultDocument,
  trace: StepTraceDocument,
  opts: { readonly runDir?: string } = {}
): WrittenArtifacts {
  const runDir =
    opts.runDir ?? join(outRoot, runDirName(result.scenarioId, result.startedAt));
  mkdirSync(runDir, { recursive: true });
  const resultPath = join(runDir, "result.json");
  const stepTracePath = join(runDir, "step-trace.json");
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  writeFileSync(stepTracePath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  return { runDir, resultPath, stepTracePath };
}
