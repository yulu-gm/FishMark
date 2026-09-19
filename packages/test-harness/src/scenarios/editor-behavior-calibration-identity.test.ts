import { describe, expect, it } from "vitest";

import { createExecutionPlan } from "../../../../fixtures/editor-behavior/execution-plan";
import { recursiveParityMatrixCases } from "../../../../fixtures/editor-behavior/nested-containers";
import { editorBehaviorAspects } from "../../../../fixtures/editor-behavior/model";
import {
  composeEditorBehaviorRunnerEvidence,
  createCalibrationHash,
  type EditorBehaviorRunnerCalibration
} from "../../../../fixtures/editor-behavior/runner-protocol";

describe("editor behavior calibration identity", () => {
  const behaviorCase = recursiveParityMatrixCases[0]!;
  const plan = createExecutionPlan([behaviorCase]);
  const targets = behaviorCase.checkpoints.flatMap((checkpoint) =>
    editorBehaviorAspects.map((aspect) => ({
      caseId: behaviorCase.id,
      checkpoint: checkpoint.id,
      aspect
    }))
  );
  const calibration = {
    manifestHash: plan.manifestHash,
    contractHash: plan.contractHash,
    runId: "calibration-identity-test",
    calibrationHash: "fnv1a32-53bcecc6"
  } satisfies EditorBehaviorRunnerCalibration;

  it("accepts the exact deterministic calibration identity", () => {
    expect(() =>
      composeEditorBehaviorRunnerEvidence([behaviorCase], targets, [], calibration)
    ).not.toThrow();
  });

  it("rejects an arbitrary calibration hash", () => {
    expect(() =>
      composeEditorBehaviorRunnerEvidence(
        [behaviorCase],
        targets,
        [],
        { ...calibration, calibrationHash: "fnv1a32-forged" }
      )
    ).toThrow(/calibration hash/u);
  });

  it("rejects an arbitrary run id even when the other baseline fields are reused", () => {
    expect(() =>
      composeEditorBehaviorRunnerEvidence(
        [behaviorCase],
        targets,
        [],
        { ...calibration, runId: "forged-run" }
      )
    ).toThrow(/calibration hash/u);
  });

  it("still rejects a stale desired contract before composition", () => {
    expect(() =>
      composeEditorBehaviorRunnerEvidence(
        [behaviorCase],
        targets,
        [],
        { ...calibration, contractHash: "fnv1a32-stale" }
      )
    ).toThrow(/contract hash/u);
  });

  it("allows only explicitly hashed pending targets and never reuses their old evidence", () => {
    const pending = targets[0]!;
    const retained = targets.slice(1);
    const migration = { ...calibration, runId: "explicit-contract-migration", pendingTargets: [pending] };
    const signed = { ...migration, calibrationHash: createCalibrationHash(migration, retained, []) };
    const [composed] = composeEditorBehaviorRunnerEvidence([behaviorCase], retained, [], signed);
    expect(composed!.classification.evidence[pending.checkpoint][pending.aspect].status).toBe("gap");
    expect(() => composeEditorBehaviorRunnerEvidence([behaviorCase], targets, [], signed)).toThrow(/cannot reuse verified/u);
    expect(() => composeEditorBehaviorRunnerEvidence([behaviorCase], retained, [{ ...pending, aspect: "command-plan", observed: [], reason: "old value" }], signed)).toThrow(/cannot reuse known-defect/u);
    expect(() => composeEditorBehaviorRunnerEvidence([behaviorCase], retained.slice(1), [], signed)).toThrow(/covers/u);
    expect(() => composeEditorBehaviorRunnerEvidence([behaviorCase], retained, [], { ...signed, pendingTargets: [pending, pending] })).toThrow(/duplicates a pending/u);
    expect(() => composeEditorBehaviorRunnerEvidence([behaviorCase], retained, [], { ...signed, pendingTargets: [{ ...pending, caseId: "unknown" }] })).toThrow(/must exist/u);
    expect(() => composeEditorBehaviorRunnerEvidence([behaviorCase], targets.slice(2), [], { ...signed, pendingTargets: targets.slice(0, 2) })).toThrow(/calibration hash/u);
  });
});
