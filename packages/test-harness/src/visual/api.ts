/**
 * Platform-neutral visual-check contract (TASK-030).
 *
 * The CLI and the workbench both drive the same test handler code, but the
 * visual backing stores are different:
 *
 *   - CLI: PNG baselines on disk, artifact PNGs under the run directory.
 *   - Workbench: everything in-memory, rendered into <canvas> elements.
 *
 * Handlers call `visualApi.check(...)` without caring which backing store
 * is in use; each runtime wires its own `VisualApi` implementation into the
 * handler factory.
 */

import type { VisualVerdict } from "./check";

export type VisualCheckRequest = {
  readonly scenarioId: string;
  readonly stepId: string;
  readonly width: number;
  readonly height: number;
  readonly actualRgba: Uint8Array;
};

/**
 * Observation collected after a visual check finishes. File paths are only
 * populated for node-backed runs; pixel buffers are only populated for
 * in-memory runs. `verdict` is authoritative either way.
 */
export type VisualObservation = {
  readonly scenarioId: string;
  readonly stepId: string;
  readonly verdict: VisualVerdict;
  readonly width: number;
  readonly height: number;
  readonly mismatchedPixels: number;
  readonly mismatchRatio: number;
  readonly message?: string;

  // CLI / node
  readonly baselinePath?: string;
  readonly actualPath?: string;
  readonly expectedPath?: string;
  readonly diffPath?: string;

  // Workbench / in-memory
  readonly actualRgba?: Uint8Array;
  readonly expectedRgba?: Uint8Array;
  readonly diffRgba?: Uint8Array;
};

export type VisualApi = {
  check(request: VisualCheckRequest): VisualObservation;
};

export function isVisualFailure(observation: VisualObservation): boolean {
  return observation.verdict === "mismatch";
}
