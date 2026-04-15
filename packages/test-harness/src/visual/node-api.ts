/**
 * Node-backed {@link VisualApi} implementation for the agent CLI (TASK-030).
 *
 * Wraps {@link runVisualCheck} so handlers do not need to know where the
 * baselines or artifacts live — the CLI decides once and injects the ready
 * api into the handler factory.
 */

import type { VisualApi, VisualCheckRequest, VisualObservation } from "./api";
import { runVisualCheck } from "./check";
import type { CompareOptions } from "./compare";

export type NodeVisualApiOptions = {
  readonly baselineRoot: string;
  readonly artifactDir: string;
  readonly compare?: CompareOptions;
  readonly onObservation?: (observation: VisualObservation) => void;
};

export function createNodeVisualApi(options: NodeVisualApiOptions): VisualApi {
  return {
    check(request: VisualCheckRequest): VisualObservation {
      const result = runVisualCheck({
        scenarioId: request.scenarioId,
        stepId: request.stepId,
        width: request.width,
        height: request.height,
        actualRgba: request.actualRgba,
        baselineRoot: options.baselineRoot,
        artifactDir: options.artifactDir,
        compare: options.compare
      });

      const observation: VisualObservation = {
        scenarioId: result.scenarioId,
        stepId: result.stepId,
        verdict: result.verdict,
        width: result.width,
        height: result.height,
        mismatchedPixels: result.mismatchedPixels,
        mismatchRatio: result.mismatchRatio,
        message: result.message,
        baselinePath: result.baselinePath,
        actualPath: result.actualPath,
        expectedPath: result.expectedPath,
        diffPath: result.diffPath
      };

      options.onObservation?.(observation);
      return observation;
    }
  };
}
