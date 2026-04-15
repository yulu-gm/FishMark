/**
 * In-memory {@link VisualApi} used by the workbench UI (TASK-030).
 *
 * The workbench renders visual artifacts in `<canvas>` elements straight
 * from the RGBA buffers produced by the handler — there is no filesystem
 * round-trip. The baseline is supplied by the caller (usually as a second
 * call to the same deterministic render function) so a drift toggle can
 * exercise the mismatch path end-to-end.
 */

import type { VisualApi, VisualCheckRequest, VisualObservation } from "./api";
import { compareRgba, type CompareOptions } from "./compare";

export type MemoryBaselineResolver = (request: {
  readonly scenarioId: string;
  readonly stepId: string;
  readonly width: number;
  readonly height: number;
}) => Uint8Array | null;

export type MemoryVisualApiOptions = {
  readonly resolveBaseline: MemoryBaselineResolver;
  readonly compare?: CompareOptions;
  readonly onObservation?: (observation: VisualObservation) => void;
};

export function createMemoryVisualApi(options: MemoryVisualApiOptions): VisualApi {
  return {
    check(request: VisualCheckRequest): VisualObservation {
      const expected = options.resolveBaseline({
        scenarioId: request.scenarioId,
        stepId: request.stepId,
        width: request.width,
        height: request.height
      });

      if (!expected) {
        const observation: VisualObservation = {
          scenarioId: request.scenarioId,
          stepId: request.stepId,
          verdict: "baseline-created",
          width: request.width,
          height: request.height,
          mismatchedPixels: 0,
          mismatchRatio: 0,
          actualRgba: request.actualRgba,
          message: "No baseline supplied; captured actual as the in-memory baseline."
        };
        options.onObservation?.(observation);
        return observation;
      }

      const compareResult = compareRgba(
        request.actualRgba,
        expected,
        request.width,
        request.height,
        options.compare
      );

      const verdict = compareResult.matched ? "match" : "mismatch";
      const observation: VisualObservation = {
        scenarioId: request.scenarioId,
        stepId: request.stepId,
        verdict,
        width: request.width,
        height: request.height,
        mismatchedPixels: compareResult.mismatchedPixels,
        mismatchRatio: compareResult.mismatchRatio,
        actualRgba: request.actualRgba,
        expectedRgba: expected,
        diffRgba: compareResult.diffRgba,
        message: compareResult.matched
          ? undefined
          : `Visual mismatch: ${compareResult.mismatchedPixels} of ${compareResult.totalPixels} pixels differ.`
      };
      options.onObservation?.(observation);
      return observation;
    }
  };
}
