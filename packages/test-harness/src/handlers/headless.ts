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
      if (
        scenario.id === "open-markdown-file-basic" &&
        step.id === "select-fixture"
      ) {
        throw new Error(
          "Fixture picker automation is not implemented in the headless CLI yet."
        );
      }
    };
    return [step.id, handler] as const;
  });

  return Object.fromEntries(entries) as StepHandlerMap;
}
