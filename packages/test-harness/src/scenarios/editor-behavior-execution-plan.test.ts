import { describe, expect, it } from "vitest";

import { createExecutionPlan } from "../../../../fixtures/editor-behavior/execution-plan";
import {
  capturedOracleAndProbeCases,
  editorBehaviorCases,
  editorBehaviorRunnerCalibration,
  focusedRecursiveCases,
  namedFishMarkProbeCases,
  recursiveParityMatrixCases,
  representativeDepthCases
} from "../../../../fixtures/editor-behavior/manifest";

describe("createExecutionPlan", () => {
  it("copies only executable initial state, ancestry, and actions", () => {
    const behaviorCase = editorBehaviorCases[0]!;
    const plan = createExecutionPlan([behaviorCase]);

    expect(plan.cases).toHaveLength(1);
    expect(plan.cases[0]).toEqual({
      id: behaviorCase.id,
      initial: {
        source: behaviorCase.initial.source,
        selection: behaviorCase.initial.selection,
        viewMode: behaviorCase.initial.viewMode
      },
      checkpoints: behaviorCase.checkpoints.map(({ id, from, actions }) => ({
        id,
        from,
        actions
      }))
    });

    const serialized = JSON.stringify(plan);
    expect(serialized).not.toMatch(/"result"|"classification"|"expected"|"containerPath"/u);
  });

  it("has a stable content hash that changes with executable input", () => {
    const behaviorCase = editorBehaviorCases[0]!;
    const first = createExecutionPlan([behaviorCase]);
    const second = createExecutionPlan([behaviorCase]);
    const changed = createExecutionPlan([
      {
        ...behaviorCase,
        initial: {
          ...behaviorCase.initial,
          source: `${behaviorCase.initial.source}x`
        }
      }
    ]);

    expect(first.manifestHash).toMatch(/^fnv1a32-[0-9a-f]{8}$/u);
    expect(first.contractHash).toMatch(/^fnv1a32-[0-9a-f]{8}$/u);
    expect(first.manifestHash).toBe(second.manifestHash);
    expect(first.contractHash).toBe(second.contractHash);
    expect(changed.manifestHash).not.toBe(first.manifestHash);
    expect(changed.contractHash).not.toBe(first.contractHash);
  });

  it("changes only the contract hash when a desired result changes", () => {
    const behaviorCase = editorBehaviorCases[0]!;
    const first = createExecutionPlan([behaviorCase]);
    const changed = createExecutionPlan([
      {
        ...behaviorCase,
        checkpoints: [
          {
            ...behaviorCase.checkpoints[0],
            result: {
              ...behaviorCase.checkpoints[0].result,
              source: `${behaviorCase.checkpoints[0].result.source} changed`
            }
          },
          behaviorCase.checkpoints[1],
          behaviorCase.checkpoints[2]
        ]
      }
    ]);

    expect(changed.manifestHash).toBe(first.manifestHash);
    expect(changed.contractHash).not.toBe(first.contractHash);
  });

  it("keeps the execution hash independent of static evidence and baselines", () => {
    const rawCases = [
      ...capturedOracleAndProbeCases,
      ...namedFishMarkProbeCases,
      ...focusedRecursiveCases,
      ...recursiveParityMatrixCases,
      ...representativeDepthCases
    ];
    const rawPlan = createExecutionPlan(rawCases);
    const composedPlan = createExecutionPlan(editorBehaviorCases);

    expect(composedPlan.manifestHash).toBe(rawPlan.manifestHash);
    expect(composedPlan.contractHash).toBe(rawPlan.contractHash);
    expect(composedPlan.cases).toEqual(rawPlan.cases);
    expect(editorBehaviorRunnerCalibration.manifestHash).toBe(rawPlan.manifestHash);
    expect(editorBehaviorRunnerCalibration.contractHash).toBe(rawPlan.contractHash);
  });
});
