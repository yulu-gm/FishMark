/**
 * Metadata model for the test workbench / agent CLI.
 *
 * The model is intentionally minimal: it captures only what the workbench UI
 * and the agent's CLI need to list, filter, and describe a scenario.
 * Runtime execution state lives elsewhere (TASK-027).
 */

export type TestStepKind = "setup" | "action" | "assertion" | "teardown";

export type TestStep = {
  /** Stable step id, unique within its scenario. kebab-case. */
  readonly id: string;
  readonly title: string;
  readonly kind: TestStepKind;
  /** Optional long-form description shown in the workbench detail view. */
  readonly description?: string;
};

/**
 * Target surface a scenario exercises. The workbench uses this to decide
 * where to open the test window for the scenario.
 */
export type ScenarioSurface = "editor" | "workbench" | "main-process";

/**
 * Tag vocabulary. Kept as a closed union so typos become type errors and the
 * UI can render a stable filter list.
 */
export type ScenarioTag =
  | "smoke"
  | "editor"
  | "file-io"
  | "autosave"
  | "ime"
  | "rendering"
  | "visual"
  | "workbench";

export type ScenarioExecutionCapability =
  | {
      readonly kind: "headless";
      /** Explicit CLI gaps keyed by step id; avoids scenario-id branches in the handler. */
      readonly unsupportedSteps?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "metadata-only"; readonly reason: string };

export type TestScenario = {
  /** Stable unique id across the whole registry. kebab-case. */
  readonly id: string;
  readonly title: string;
  /** One-sentence summary shown in the list view. */
  readonly summary: string;
  readonly surface: ScenarioSurface;
  readonly tags: readonly ScenarioTag[];
  readonly execution: ScenarioExecutionCapability;
  /** Preconditions a human tester should satisfy before running. */
  readonly preconditions?: readonly string[];
  readonly steps: readonly TestStep[];
};

const SCENARIO_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidScenarioId(id: string): boolean {
  return SCENARIO_ID_PATTERN.test(id);
}

export function assertValidScenario(scenario: TestScenario): void {
  if (!isValidScenarioId(scenario.id)) {
    throw new Error(`Invalid scenario id: ${JSON.stringify(scenario.id)}. Use kebab-case.`);
  }

  if (scenario.steps.length === 0) {
    throw new Error(`Scenario ${scenario.id} must declare at least one step.`);
  }

  if (scenario.execution.kind === "metadata-only" && scenario.execution.reason.trim() === "") {
    throw new Error(`Scenario ${scenario.id} metadata-only reason must not be empty.`);
  }

  const seenStepIds = new Set<string>();
  for (const step of scenario.steps) {
    if (!isValidScenarioId(step.id)) {
      throw new Error(
        `Invalid step id ${JSON.stringify(step.id)} in scenario ${scenario.id}. Use kebab-case.`
      );
    }

    if (seenStepIds.has(step.id)) {
      throw new Error(`Duplicate step id ${JSON.stringify(step.id)} in scenario ${scenario.id}.`);
    }

    seenStepIds.add(step.id);
  }

  if (scenario.execution.kind === "headless") {
    for (const [stepId, reason] of Object.entries(scenario.execution.unsupportedSteps ?? {})) {
      if (!seenStepIds.has(stepId)) {
        throw new Error(`Scenario ${scenario.id} declares an unsupported unknown step ${stepId}.`);
      }
      if (reason.trim() === "") {
        throw new Error(`Scenario ${scenario.id} unsupported step ${stepId} needs a reason.`);
      }
    }
  }
}
