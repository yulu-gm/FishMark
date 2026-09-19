import { describe, expect, it } from "vitest";

import { createExecutionPlan } from "../../../../fixtures/editor-behavior/execution-plan";
import { editorBehaviorKnownDefectObservations as historicalDefects } from "../../../../fixtures/editor-behavior/current-observations";
import {
  capturedOracleAndProbeCases,
  editorBehaviorCases,
  editorBehaviorKnownDefectObservations,
  editorBehaviorRunnerCalibration,
  editorBehaviorRunnerVerifiedTargets,
  recursiveParityMatrixCases
} from "../../../../fixtures/editor-behavior/manifest";
import {
  compareEditorBehaviorObservations,
  composeEditorBehaviorRunnerEvidence,
  type EditorBehaviorCheckpointObservation,
  type EditorBehaviorKnownDefectObservation
} from "../../../../fixtures/editor-behavior/runner-protocol";
import {
  editorBehaviorAspects,
  type EditorBehaviorCase
} from "../../../../fixtures/editor-behavior/model";

function observationsFor(
  behaviorCase: EditorBehaviorCase,
  plan: { readonly manifestHash: string; readonly contractHash: string },
  runId = "run-1"
): EditorBehaviorCheckpointObservation[] {
  return behaviorCase.checkpoints.map((checkpoint) => ({
    runId,
    manifestHash: plan.manifestHash,
    contractHash: plan.contractHash,
    caseId: behaviorCase.id,
    checkpoint: checkpoint.id,
    commandPlan: checkpoint.actions,
    semanticPath: checkpoint.result.semanticPath,
    rawSemanticPath: checkpoint.result.semanticPath,
    source: checkpoint.result.source,
    selection: checkpoint.result.selection,
    visibleLineRoles: checkpoint.result.visibleLines.map(({ role }) => role),
    physicalGeometry: checkpoint.result.visibleLines.map(
      ({ line, sourceText, geometry }) => ({ line, sourceText, geometry })
    ),
    lineDomMappings: [],
    viewMode: checkpoint.result.viewMode,
    trace: []
  }));
}

describe("compareEditorBehaviorObservations", () => {
  it("persists complete canonical runner coverage with exact defect targets", () => {
    const defectKeys = new Set(
      editorBehaviorKnownDefectObservations.map(
        ({ caseId, checkpoint, aspect }) => `${caseId}:${checkpoint}:${aspect}`
      )
    );
    expect(editorBehaviorKnownDefectObservations).toHaveLength(107);
    expect(editorBehaviorRunnerVerifiedTargets).toHaveLength(2_434);
    expect(editorBehaviorRunnerCalibration).not.toHaveProperty("pendingTargets");
    expect(editorBehaviorRunnerCalibration.runId).toBe("d46d7078-8ac3-4cf3-9a0f-0ac89953a320");
    for (const retained of editorBehaviorKnownDefectObservations) {
      const historical = historicalDefects.find((entry) => entry.caseId === retained.caseId && entry.checkpoint === retained.checkpoint && entry.aspect === retained.aspect);
      expect(retained).toBe(historical);
    }
    expect(defectKeys.size).toBe(editorBehaviorKnownDefectObservations.length);

    let gaps = 0;
    let observedDefects = 0;
    for (const behaviorCase of editorBehaviorCases) {
      for (const checkpoint of behaviorCase.checkpoints) {
        for (const [aspect, evidence] of Object.entries(
          behaviorCase.classification.evidence[checkpoint.id]
        )) {
          if (evidence.status === "gap") {
            gaps += 1;
            continue;
          }
          const key = `${behaviorCase.id}:${checkpoint.id}:${aspect}`;
          if (evidence.status === "known-defect-observed") {
            observedDefects += 1;
            expect(defectKeys.has(key), key).toBe(true);
          }
          if (evidence.provenance.kind === "electron-manifest-runner") {
            expect(evidence.provenance.manifestHash).toBe(
              editorBehaviorRunnerCalibration.manifestHash
            );
            expect(evidence.provenance.runId).toBe(editorBehaviorRunnerCalibration.runId);
            expect(evidence.provenance.contractHash).toBe(
              editorBehaviorRunnerCalibration.contractHash
            );
          }
        }
      }
    }

    expect(gaps).toBe(0);
    expect(observedDefects).toBe(107);
  });

  it("accounts for all 2,541 full-manifest targets", () => {
    const plan = createExecutionPlan(editorBehaviorCases);
    const observations = editorBehaviorCases.flatMap((behaviorCase) =>
      observationsFor(behaviorCase, plan)
    );
    const comparison = compareEditorBehaviorObservations(
      editorBehaviorCases,
      observations
    );

    expect(comparison.verdicts).toHaveLength(2_541);
    expect(Object.values(comparison.counts).reduce((sum, count) => sum + count, 0)).toBe(
      2_541
    );
    expect(comparison.counts["not-run"]).toBe(0);
  });

  it("emits one verified verdict for every checkpoint/aspect target", () => {
    const behaviorCase = recursiveParityMatrixCases[0]!;
    const plan = createExecutionPlan([behaviorCase]);
    const comparison = compareEditorBehaviorObservations(
      [behaviorCase],
      observationsFor(behaviorCase, plan)
    );

    expect(comparison.verdicts).toHaveLength(21);
    expect(comparison.counts["verified-runner"]).toBe(21);
    expect(comparison.counts["not-run"]).toBe(0);
    expect(comparison.counts["unexpected-mismatch"]).toBe(0);
    expect(comparison.pass).toBe(true);
  });

  it("re-verifies existing evidence instead of trusting it", () => {
    const behaviorCase = capturedOracleAndProbeCases.find(
      (candidate) => candidate.classification.currentStatus === "partially-verified"
    )!;
    const plan = createExecutionPlan([behaviorCase]);
    const observations = observationsFor(behaviorCase, plan);
    const comparison = compareEditorBehaviorObservations([behaviorCase], observations);
    const existingTargets = behaviorCase.checkpoints.flatMap((checkpoint) =>
      Object.entries(behaviorCase.classification.evidence[checkpoint.id])
        .filter(([, evidence]) => evidence.status === "verified")
        .map(([aspect]) => `${checkpoint.id}:${aspect}`)
    );

    expect(comparison.counts["verified-existing"]).toBe(existingTargets.length);
    expect(comparison.verdicts).toHaveLength(21);

    const forged = observations.map((observation, index) =>
      index === 0 ? { ...observation, source: `${observation.source} forged` } : observation
    );
    const failed = compareEditorBehaviorObservations([behaviorCase], forged);
    expect(failed.counts["unexpected-mismatch"]).toBe(1);
    expect(failed.pass).toBe(false);
  });

  it("reports missing targets and rejects duplicate or forged observations atomically", () => {
    const behaviorCase = recursiveParityMatrixCases[0]!;
    const plan = createExecutionPlan([behaviorCase]);
    const observations = observationsFor(behaviorCase, plan);
    const missing = compareEditorBehaviorObservations([behaviorCase], observations.slice(0, 2));

    expect(missing.counts["not-run"]).toBe(7);
    expect(missing.pass).toBe(false);
    expect(() =>
      compareEditorBehaviorObservations([behaviorCase], [
        ...observations,
        observations[0]!
      ])
    ).toThrow(/duplicate observation/i);
    expect(() =>
      compareEditorBehaviorObservations(
        [behaviorCase],
        observations.map((observation) => ({
          ...observation,
          manifestHash: "fnv1a32-forged"
        }))
      )
    ).toThrow(/manifest hash/i);
  });

  it("allows only an exact per-target known-defect observation", () => {
    const behaviorCase = recursiveParityMatrixCases[0]!;
    const plan = createExecutionPlan([behaviorCase]);
    const observations = observationsFor(behaviorCase, plan);
    const actualSource = `${observations[0]!.source} current`;
    const mismatched = observations.map((observation, index) =>
      index === 0 ? { ...observation, source: actualSource } : observation
    );
    const baseline: EditorBehaviorKnownDefectObservation = {
      caseId: behaviorCase.id,
      checkpoint: "primary",
      aspect: "source",
      observed: actualSource,
      reason: "Current product source differs from the desired RF-001 contract."
    };

    const known = compareEditorBehaviorObservations(
      [behaviorCase],
      mismatched,
      [baseline]
    );
    expect(known.counts["known-defect-observed"]).toBe(1);
    expect(known.counts["unexpected-mismatch"]).toBe(0);
    expect(known.pass).toBe(true);

    const wrongAspect = compareEditorBehaviorObservations(
      [behaviorCase],
      mismatched,
      [{ ...baseline, aspect: "semantic-path", observed: behaviorCase.containerPath }]
    );
    expect(wrongAspect.counts["known-defect-observed"]).toBe(0);
    expect(wrongAspect.counts["unexpected-mismatch"]).toBe(1);
  });

  it("atomically composes gap-free static runner evidence", () => {
    const behaviorCase = recursiveParityMatrixCases[0]!;
    const plan = createExecutionPlan([behaviorCase]);
    const calibration = {
      manifestHash: plan.manifestHash,
      contractHash: plan.contractHash,
      runId: "calibration-run",
      calibrationHash: "fnv1a32-37c614c6"
    };
    const allTargets = behaviorCase.checkpoints.flatMap((checkpoint) =>
      editorBehaviorAspects.map((aspect) => ({
        caseId: behaviorCase.id,
        checkpoint: checkpoint.id,
        aspect
      }))
    );
    const [updated] = composeEditorBehaviorRunnerEvidence(
      [behaviorCase],
      allTargets,
      [],
      calibration
    );
    expect(updated).not.toBe(behaviorCase);
    expect(updated!.classification.currentStatus).toBe("verified");
    for (const checkpoint of updated!.checkpoints) {
      for (const evidence of Object.values(
        updated!.classification.evidence[checkpoint.id]
      )) {
        expect(evidence).toMatchObject({
          status: "verified",
          provenance: { kind: "electron-manifest-runner" }
        });
      }
    }

    const defectCalibration = {
      ...calibration,
      calibrationHash: "fnv1a32-d18451f4"
    };
    const [withDefect] = composeEditorBehaviorRunnerEvidence(
      [behaviorCase],
      allTargets.filter(
        ({ checkpoint, aspect }) => checkpoint !== "primary" || aspect !== "source"
      ),
      [{
        caseId: behaviorCase.id,
        checkpoint: "primary",
        aspect: "source",
        observed: "current product source",
        reason: "Exact current source differs from the desired RF-001 contract."
      }],
      defectCalibration
    );
    expect(withDefect!.classification.evidence.primary.source).toMatchObject({
      status: "known-defect-observed",
      provenance: { kind: "electron-manifest-runner", runId: "calibration-run" }
    });
    expect(withDefect!.classification.currentStatus).toBe("partially-verified");

    expect(() =>
      composeEditorBehaviorRunnerEvidence([behaviorCase], allTargets, [], {
        ...calibration,
        manifestHash: "fnv1a32-forged"
      })
    ).toThrow(/manifest hash/i);
    expect(() =>
      composeEditorBehaviorRunnerEvidence(
        [behaviorCase],
        allTargets.filter(
          ({ checkpoint, aspect }) => checkpoint !== "primary" || aspect !== "source"
        ),
        [{
          caseId: behaviorCase.id,
          checkpoint: "primary",
          aspect: "source",
          observed: "first",
          reason: "First exact observation."
        }, {
          caseId: behaviorCase.id,
          checkpoint: "primary",
          aspect: "source",
          observed: "second",
          reason: "Duplicate exact observation."
        }],
        calibration
      )
    ).toThrow(/duplicates target/i);
    expect(() =>
      composeEditorBehaviorRunnerEvidence(
        [behaviorCase],
        allTargets.slice(1),
        [],
        calibration
      )
    ).toThrow(/covers 20\/21 targets/i);
    expect(() =>
      composeEditorBehaviorRunnerEvidence([behaviorCase], allTargets, [], {
        ...calibration,
        contractHash: "fnv1a32-stale"
      })
    ).toThrow(/contract hash/i);
    expect(behaviorCase.classification.currentStatus).toBe("unverified");
  });
});
