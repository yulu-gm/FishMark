import { createScenarioRegistry } from "./registry";
import { seedScenarios } from "./scenarios";

export type {
  ScenarioSurface,
  ScenarioTag,
  TestScenario,
  TestStep,
  TestStepKind
} from "./scenario";
export { assertValidScenario, isValidScenarioId } from "./scenario";

export type { ScenarioQuery, ScenarioRegistry } from "./registry";
export { createScenarioRegistry } from "./registry";

export type {
  DebugEventEntry,
  DebugRunState,
  DebugRunStep,
  DebugRunTerminal,
} from "./debug-run-state";
export {
  applyRunnerEventToDebugState,
  applyScenarioRunTerminalToDebugState,
  createIdleDebugRunState,
  formatRunStatus
} from "./debug-run-state";

export type {
  RunContext,
  RunErrorInfo,
  RunScenarioOptions,
  RunnerEvent,
  ScenarioResult,
  ScenarioStatus,
  StepHandler,
  StepHandlerMap,
  StepResult,
  StepStatus
} from "./runner";
export { runScenario } from "./runner";

export { seedScenarios } from "./scenarios";

export { createHeadlessStepHandlers } from "./handlers/headless";

// Browser-safe visual primitives only. The PNG codec, `runVisualCheck`, and
// the node-backed visual api live under `./node` so importing this barrel
// from the renderer does not pull `node:zlib` / `node:fs` into Vite's browser
// bundle (TASK-030 / TASK-029).
export type { VisualApi, VisualCheckRequest, VisualObservation } from "./visual/api";
export { isVisualFailure } from "./visual/api";
export { compareRgba } from "./visual/compare";
export type { CompareOptions, CompareResult } from "./visual/compare";

/**
 * Default module-level registry seeded with the first-party scenarios.
 * The workbench UI and the agent CLI must both consume this registry so
 * they see the same scenario list without free-form scripts.
 */
export const defaultScenarioRegistry = createScenarioRegistry(seedScenarios);
