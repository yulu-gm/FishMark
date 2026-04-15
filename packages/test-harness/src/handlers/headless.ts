/**
 * Headless handler map for the agent CLI (TASK-029 / TASK-030).
 *
 * The real editor surface is driven by Electron, which the CLI intentionally
 * does not spin up. For the MVP the CLI exercises the runner, the artifact
 * protocol, and the exit-code contract with deterministic stand-in handlers:
 *
 *   - `app-shell-startup`          -> every step passes
 *   - `open-markdown-file-basic`   -> fails on `select-fixture`
 *   - `visual-smoke-gradient`      -> renders a gradient, diffs it against
 *                                     the baseline through the injected
 *                                     {@link VisualApi}
 *
 * Later tasks will replace these with real automation drivers once the CLI
 * learns how to spawn an Electron test window.
 */

import type { StepHandlerMap } from "../runner";
import type { TestScenario } from "../scenario";
import type { VisualApi } from "../visual/api";
import {
  VISUAL_SMOKE_HEIGHT,
  VISUAL_SMOKE_WIDTH,
  renderSmokeGradient
} from "../visual/gradient";

export type HeadlessHandlerDeps = {
  readonly visualApi?: VisualApi;
  /**
   * Set to true to deliberately shift the gradient so the visual compare
   * produces a mismatch. The CLI wires this to `YULORA_VISUAL_DRIFT=1`.
   */
  readonly forceVisualDrift?: boolean;
};

export function createHeadlessStepHandlers(
  scenario: TestScenario,
  deps: HeadlessHandlerDeps = {}
): StepHandlerMap {
  // Shared between the render and the compare step of the visual scenario.
  let capturedGradient: Uint8Array | null = null;

  const entries = scenario.steps.map((step) => {
    const handler = () => {
      if (
        scenario.id === "open-markdown-file-basic" &&
        step.id === "select-fixture"
      ) {
        throw new Error(
          "Fixture picker automation is not implemented in the headless CLI yet."
        );
      }

      if (scenario.id === "visual-smoke-gradient") {
        if (step.id === "render-gradient") {
          capturedGradient = renderSmokeGradient({ drift: deps.forceVisualDrift === true });
          return;
        }

        if (step.id === "compare-gradient") {
          if (!capturedGradient) {
            throw new Error(
              "render-gradient did not capture a gradient; cannot run compare-gradient."
            );
          }
          if (!deps.visualApi) {
            throw new Error(
              "visual-smoke-gradient requires a VisualApi; none was provided to the headless handler factory."
            );
          }
          const observation = deps.visualApi.check({
            scenarioId: scenario.id,
            stepId: step.id,
            width: VISUAL_SMOKE_WIDTH,
            height: VISUAL_SMOKE_HEIGHT,
            actualRgba: capturedGradient
          });
          if (observation.verdict === "mismatch") {
            throw new Error(
              observation.message ?? `Visual mismatch in step ${step.id}.`
            );
          }
          return;
        }
      }
    };
    return [step.id, handler] as const;
  });

  return Object.fromEntries(entries) as StepHandlerMap;
}
