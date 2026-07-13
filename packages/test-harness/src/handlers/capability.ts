import type { StepHandlerMap } from "../runner";
import type { TestScenario } from "../scenario";
import { createHeadlessStepHandlers } from "./headless";

export type CapabilityHandlerAdapters = {
  readonly buildElectronBatch?: (scenario: TestScenario) => StepHandlerMap;
};

export function createCapabilityStepHandlers(
  scenario: TestScenario,
  adapters: CapabilityHandlerAdapters = {}
): StepHandlerMap {
  switch (scenario.execution.kind) {
    case "electron-batch":
      return adapters.buildElectronBatch?.(scenario) ?? createHeadlessStepHandlers(scenario);
    case "headless":
    case "metadata-only":
      return createHeadlessStepHandlers(scenario);
  }
}
