/**
 * Headless handler map for the agent CLI (TASK-029).
 *
 * The real editor surface is driven by Electron, which the CLI intentionally
 * does not spin up. For the MVP the CLI exercises the runner, the artifact
 * protocol, and the exit-code contract with deterministic stand-in handlers.
 *
 * Later tasks will replace these with real automation drivers once the CLI
 * learns how to spawn an Electron test window.
 */

import type { StepHandlerMap } from "../runner";
import type { TestScenario } from "../scenario";

export function createHeadlessStepHandlers(
  scenario: TestScenario
): StepHandlerMap {
  const entries = scenario.steps.map((step) => {
    const handler = () => {
      if (scenario.execution.kind === "metadata-only") {
        throw new Error(`Scenario is metadata-only: ${scenario.execution.reason}`);
      }

      const unsupportedReason = scenario.execution.unsupportedSteps?.[step.id];
      if (unsupportedReason) {
        throw new Error(unsupportedReason);
      }
    };
    return [step.id, handler] as const;
  });

  return Object.fromEntries(entries) as StepHandlerMap;
}
