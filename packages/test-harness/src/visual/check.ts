/**
 * Node-backed visual check used by the agent CLI (TASK-030).
 *
 * Given an actual RGBA buffer, this module:
 *
 *   1. Locates the baseline at `<baselineRoot>/<scenarioId>/<stepId>.png`.
 *      If it does not exist, the current actual is written as the new
 *      baseline and the verdict is `baseline-created`. Treat this as a
 *      (non-terminal) pass — the first run of a visual scenario should not
 *      fail just because no one has captured a baseline yet.
 *
 *   2. Otherwise decodes the baseline, compares via {@link compareRgba},
 *      and writes `actual.png`, `expected.png`, `diff.png` into
 *      `<artifactDir>/visual/<stepId>/`. The verdict is `match` or
 *      `mismatch` depending on the compare result.
 *
 * All writes are synchronous; a visual check is not on any hot path and
 * synchronous I/O keeps the CLI control flow easy to reason about.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { compareRgba, type CompareOptions, type CompareResult } from "./compare";
import { decodePng, encodePng } from "./png";

export type VisualVerdict = "match" | "mismatch" | "baseline-created";

export type VisualCheckInput = {
  readonly scenarioId: string;
  readonly stepId: string;
  readonly width: number;
  readonly height: number;
  readonly actualRgba: Uint8Array;
  readonly baselineRoot: string;
  readonly artifactDir: string;
  readonly compare?: CompareOptions;
};

export type VisualCheckResult = {
  readonly scenarioId: string;
  readonly stepId: string;
  readonly verdict: VisualVerdict;
  readonly width: number;
  readonly height: number;
  readonly mismatchedPixels: number;
  readonly mismatchRatio: number;
  readonly baselinePath: string;
  readonly actualPath?: string;
  readonly expectedPath?: string;
  readonly diffPath?: string;
  readonly message?: string;
};

export function runVisualCheck(input: VisualCheckInput): VisualCheckResult {
  const baselinePath = join(
    input.baselineRoot,
    input.scenarioId,
    `${input.stepId}.png`
  );
  const stepArtifactDir = join(input.artifactDir, "visual", input.stepId);

  if (!existsSync(baselinePath)) {
    mkdirSync(dirname(baselinePath), { recursive: true });
    const baselineBytes = encodePng(input.actualRgba, input.width, input.height);
    writeFileSync(baselinePath, baselineBytes);

    mkdirSync(stepArtifactDir, { recursive: true });
    const actualPath = join(stepArtifactDir, "actual.png");
    writeFileSync(actualPath, baselineBytes);

    return {
      scenarioId: input.scenarioId,
      stepId: input.stepId,
      verdict: "baseline-created",
      width: input.width,
      height: input.height,
      mismatchedPixels: 0,
      mismatchRatio: 0,
      baselinePath,
      actualPath,
      message: `Baseline created at ${toPosix(relative(process.cwd(), baselinePath))}.`
    };
  }

  const baselinePngBytes = readFileSync(baselinePath);
  const expected = decodePng(new Uint8Array(baselinePngBytes));

  if (expected.width !== input.width || expected.height !== input.height) {
    mkdirSync(stepArtifactDir, { recursive: true });
    const actualPath = join(stepArtifactDir, "actual.png");
    const expectedPath = join(stepArtifactDir, "expected.png");
    writeFileSync(actualPath, encodePng(input.actualRgba, input.width, input.height));
    writeFileSync(expectedPath, new Uint8Array(baselinePngBytes));
    return {
      scenarioId: input.scenarioId,
      stepId: input.stepId,
      verdict: "mismatch",
      width: input.width,
      height: input.height,
      mismatchedPixels: input.width * input.height,
      mismatchRatio: 1,
      baselinePath,
      actualPath,
      expectedPath,
      message: `Size drift: actual ${input.width}x${input.height}, expected ${expected.width}x${expected.height}.`
    };
  }

  const compareResult: CompareResult = compareRgba(
    input.actualRgba,
    expected.rgba,
    input.width,
    input.height,
    input.compare
  );

  if (compareResult.matched) {
    return {
      scenarioId: input.scenarioId,
      stepId: input.stepId,
      verdict: "match",
      width: input.width,
      height: input.height,
      mismatchedPixels: compareResult.mismatchedPixels,
      mismatchRatio: compareResult.mismatchRatio,
      baselinePath
    };
  }

  mkdirSync(stepArtifactDir, { recursive: true });
  const actualPath = join(stepArtifactDir, "actual.png");
  const expectedPath = join(stepArtifactDir, "expected.png");
  const diffPath = join(stepArtifactDir, "diff.png");
  writeFileSync(actualPath, encodePng(input.actualRgba, input.width, input.height));
  writeFileSync(expectedPath, new Uint8Array(baselinePngBytes));
  writeFileSync(
    diffPath,
    encodePng(compareResult.diffRgba, input.width, input.height)
  );

  return {
    scenarioId: input.scenarioId,
    stepId: input.stepId,
    verdict: "mismatch",
    width: input.width,
    height: input.height,
    mismatchedPixels: compareResult.mismatchedPixels,
    mismatchRatio: compareResult.mismatchRatio,
    baselinePath,
    actualPath,
    expectedPath,
    diffPath,
    message: `Visual mismatch: ${compareResult.mismatchedPixels} of ${compareResult.totalPixels} pixels differ (${(compareResult.mismatchRatio * 100).toFixed(2)}%).`
  };
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}
