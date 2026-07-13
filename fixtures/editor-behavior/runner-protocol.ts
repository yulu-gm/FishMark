import type {
  EditorBehaviorAspect,
  EditorBehaviorCheckpointId,
  EditorBehaviorContainerPath,
  EditorBehaviorCase,
  EditorBehaviorAction,
  EditorViewMode,
  PhysicalLineGeometryObservation,
  SourceSelection,
  VisiblePhysicalLineRole
} from "./model";
import {
  editorBehaviorAspects,
  statusForEvidence,
  type EditorBehaviorEvidence,
  type EditorBehaviorEvidenceState
} from "./model";
import { createExecutionPlan } from "./execution-plan";

export type EditorBehaviorActionTrace = {
  readonly action: EditorBehaviorAction;
  readonly phase: "checkpoint" | "replay";
  readonly handled: boolean;
  readonly defaultPrevented: boolean;
  readonly before: EditorBehaviorStateTrace;
  readonly after: EditorBehaviorStateTrace;
};

export type EditorBehaviorStateTrace = {
  readonly sourceHash: string;
  readonly selection: SourceSelection;
  readonly undoDepth: number;
};

export type EditorBehaviorLineDomMapping = {
  readonly line: number;
  readonly kind:
    | "source-line"
    | "table-widget"
    | "math-widget"
    | "mermaid-widget"
    | "missing";
  readonly display: string | null;
  readonly visibility: string | null;
  readonly opacity: string | null;
  readonly rect: {
    readonly width: number | null;
    readonly height: number | null;
  };
};

export type EditorBehaviorCheckpointObservation = {
  readonly runId: string;
  readonly manifestHash: string;
  readonly contractHash: string;
  readonly caseId: string;
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly commandPlan: readonly EditorBehaviorAction[];
  readonly semanticPath: EditorBehaviorContainerPath;
  readonly rawSemanticPath: readonly string[];
  readonly source: string;
  readonly selection: SourceSelection;
  readonly visibleLineRoles: readonly VisiblePhysicalLineRole[];
  readonly physicalGeometry: readonly PhysicalLineGeometryObservation[];
  readonly lineDomMappings: readonly EditorBehaviorLineDomMapping[];
  readonly viewMode: EditorViewMode;
  readonly trace: readonly EditorBehaviorActionTrace[];
};

export type EditorBehaviorVerdictStatus =
  | "verified-existing"
  | "verified-runner"
  | "known-defect-observed"
  | "unexpected-mismatch"
  | "not-run";

export type EditorBehaviorTargetVerdict = {
  readonly caseId: string;
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: EditorBehaviorAspect;
  readonly status: EditorBehaviorVerdictStatus;
  readonly expected: unknown;
  readonly actual?: unknown;
  readonly runnerProvenance?: {
    readonly kind: "electron-manifest-runner";
    readonly caseId: string;
    readonly checkpoint: EditorBehaviorCheckpointId;
    readonly aspect: EditorBehaviorAspect;
    readonly manifestHash: string;
    readonly contractHash: string;
    readonly runId: string;
  };
};

export type EditorBehaviorKnownDefectObservation = {
  readonly caseId: string;
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: EditorBehaviorAspect;
  readonly observed: unknown;
  readonly reason: string;
};

export type EditorBehaviorComparison = {
  readonly verdicts: readonly EditorBehaviorTargetVerdict[];
  readonly counts: Readonly<Record<EditorBehaviorVerdictStatus, number>>;
  readonly pass: boolean;
};

export type EditorBehaviorRunReport = {
  readonly protocolVersion: 1;
  readonly runId: string;
  readonly manifestHash: string;
  readonly contractHash: string;
  readonly filters: {
    readonly caseId: string | null;
    readonly command: string | null;
    readonly containerPath: string | null;
  };
  readonly environment: {
    readonly appVersion: string;
    readonly platform: string;
    readonly userAgent: string;
  };
  readonly timing: {
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly durationMs: number;
    readonly cases: readonly {
      readonly caseId: string;
      readonly durationMs: number;
    }[];
  };
  readonly execution: {
    readonly selectedCases: number;
    readonly completedCases: number;
    readonly observations: number;
    readonly windowCount: 1;
    readonly viewCount: 1;
  };
  readonly observations: readonly EditorBehaviorCheckpointObservation[];
  readonly comparison: EditorBehaviorComparison;
  readonly pass: boolean;
};

export function compareEditorBehaviorObservations(
  cases: readonly EditorBehaviorCase[],
  observations: readonly EditorBehaviorCheckpointObservation[],
  knownDefects: readonly EditorBehaviorKnownDefectObservation[] = []
): EditorBehaviorComparison {
  const plan = createExecutionPlan(cases);
  const { manifestHash, contractHash } = plan;
  const caseById = new Map(cases.map((behaviorCase) => [behaviorCase.id, behaviorCase]));
  const observationsByTarget = new Map<string, EditorBehaviorCheckpointObservation>();
  let runId: string | null = null;

  for (const observation of observations) {
    if (!caseById.has(observation.caseId)) {
      throw new Error(`Observation references unknown case ${observation.caseId}.`);
    }
    if (observation.manifestHash !== manifestHash) {
      throw new Error(
        `Observation manifest hash ${observation.manifestHash} does not match ${manifestHash}.`
      );
    }
    if (observation.contractHash !== contractHash) {
      throw new Error(
        `Observation contract hash ${observation.contractHash} does not match ${contractHash}.`
      );
    }
    if (observation.runId.trim() === "") {
      throw new Error("Observation run id must not be empty.");
    }
    if (runId !== null && observation.runId !== runId) {
      throw new Error("All observations must belong to one runner run id.");
    }
    runId = observation.runId;
    const key = checkpointKey(observation.caseId, observation.checkpoint);
    if (observationsByTarget.has(key)) {
      throw new Error(`Duplicate observation ${key}.`);
    }
    observationsByTarget.set(key, observation);
  }

  const defectByTarget = new Map<string, EditorBehaviorKnownDefectObservation>();
  for (const defect of knownDefects) {
    if (defect.reason.trim() === "") {
      throw new Error(`Known defect ${targetKey(defect)} needs a reason.`);
    }
    const key = targetKey(defect);
    if (defectByTarget.has(key)) {
      throw new Error(`Duplicate known-defect target ${key}.`);
    }
    defectByTarget.set(key, defect);
  }

  const verdicts: EditorBehaviorTargetVerdict[] = [];
  for (const behaviorCase of cases) {
    for (const checkpoint of behaviorCase.checkpoints) {
      const observation = observationsByTarget.get(
        checkpointKey(behaviorCase.id, checkpoint.id)
      );
      for (const aspect of editorBehaviorAspects) {
        const expected = expectedAspect(checkpoint, aspect);
        if (!observation) {
          verdicts.push({
            caseId: behaviorCase.id,
            checkpoint: checkpoint.id,
            aspect,
            status: "not-run",
            expected
          });
          continue;
        }

        const actual = observedAspect(observation, aspect);
        const provenance = {
          kind: "electron-manifest-runner" as const,
          caseId: behaviorCase.id,
          checkpoint: checkpoint.id,
          aspect,
          manifestHash,
          contractHash,
          runId: observation.runId
        };
        if (sameValue(actual, expected)) {
          const evidence = behaviorCase.classification.evidence[checkpoint.id][aspect];
          const isPreexistingEvidence =
            evidence.status === "verified" &&
            evidence.provenance.kind !== "electron-manifest-runner";
          verdicts.push({
            caseId: behaviorCase.id,
            checkpoint: checkpoint.id,
            aspect,
            status: isPreexistingEvidence ? "verified-existing" : "verified-runner",
            expected,
            actual,
            runnerProvenance: provenance
          });
          continue;
        }

        const defect = defectByTarget.get(
          targetKey({ caseId: behaviorCase.id, checkpoint: checkpoint.id, aspect })
        );
        verdicts.push({
          caseId: behaviorCase.id,
          checkpoint: checkpoint.id,
          aspect,
          status:
            defect && sameValue(actual, defect.observed)
              ? "known-defect-observed"
              : "unexpected-mismatch",
          expected,
          actual,
          runnerProvenance: provenance
        });
      }
    }
  }

  const statuses: readonly EditorBehaviorVerdictStatus[] = [
    "verified-existing",
    "verified-runner",
    "known-defect-observed",
    "unexpected-mismatch",
    "not-run"
  ];
  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      verdicts.filter((verdict) => verdict.status === status).length
    ])
  ) as Record<EditorBehaviorVerdictStatus, number>;

  return {
    verdicts,
    counts,
    pass: counts["unexpected-mismatch"] === 0 && counts["not-run"] === 0
  };
}

export type EditorBehaviorRunnerCalibration = {
  readonly manifestHash: string;
  readonly contractHash: string;
  readonly runId: string;
};

export type EditorBehaviorRunnerVerifiedTarget = {
  readonly caseId: string;
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: EditorBehaviorAspect;
};

/**
 * Persists complete runner coverage into the canonical manifest while keeping exact
 * current mismatches separate from the desired contract. Every target plus the
 * execution and desired-contract hashes are validated before composition.
 */
export function composeEditorBehaviorRunnerEvidence(
  cases: readonly EditorBehaviorCase[],
  verifiedTargets: readonly EditorBehaviorRunnerVerifiedTarget[],
  knownDefects: readonly EditorBehaviorKnownDefectObservation[],
  calibration: EditorBehaviorRunnerCalibration
): readonly EditorBehaviorCase[] {
  const { manifestHash, contractHash } = createExecutionPlan(cases);
  if (calibration.manifestHash !== manifestHash) {
    throw new Error(
      `Runner calibration manifest hash ${calibration.manifestHash} does not match ${manifestHash}.`
    );
  }
  if (calibration.contractHash !== contractHash) {
    throw new Error(
      `Runner calibration contract hash ${calibration.contractHash} does not match ${contractHash}.`
    );
  }
  if (calibration.runId.trim() === "") {
    throw new Error("Runner calibration run id must not be empty.");
  }

  const expectedTargets = new Map(
    cases.flatMap((behaviorCase) =>
      behaviorCase.checkpoints.flatMap((checkpoint) =>
        editorBehaviorAspects.map((aspect) => {
          const key = targetKey({ caseId: behaviorCase.id, checkpoint: checkpoint.id, aspect });
          return [key, behaviorCase.classification.evidence[checkpoint.id][aspect]] as const;
        })
      )
    )
  );
  const expectedTargetCount = cases.reduce(
    (count, behaviorCase) => count + behaviorCase.checkpoints.length * editorBehaviorAspects.length,
    0
  );
  if (expectedTargets.size !== expectedTargetCount) {
    throw new Error("Runner evidence composition requires globally unique case targets.");
  }
  const verifiedTargetKeys = new Set<string>();
  for (const target of verifiedTargets) {
    const key = targetKey(target);
    if (!expectedTargets.has(key)) {
      throw new Error(`Verified runner calibration references unknown target ${key}.`);
    }
    if (verifiedTargetKeys.has(key)) {
      throw new Error(`Verified runner calibration duplicates target ${key}.`);
    }
    if (expectedTargets.get(key)?.status === "known-defect-observed") {
      throw new Error(`Verified runner calibration contradicts defect evidence at ${key}.`);
    }
    verifiedTargetKeys.add(key);
  }
  const defectTargets = new Set<string>();
  for (const defect of knownDefects) {
    const key = targetKey(defect);
    if (!expectedTargets.has(key)) {
      throw new Error(`Known-defect baseline references unknown target ${key}.`);
    }
    if (defectTargets.has(key)) {
      throw new Error(`Known-defect baseline duplicates target ${key}.`);
    }
    if (verifiedTargetKeys.has(key)) {
      throw new Error(`Runner calibration assigns two outcomes to target ${key}.`);
    }
    if (defect.reason.trim() === "") {
      throw new Error(`Known-defect baseline target ${key} needs a reason.`);
    }
    if (defect.observed === undefined) {
      throw new Error(`Known-defect baseline target ${key} omits its exact observation.`);
    }
    if (expectedTargets.get(key)?.status !== "gap") {
      throw new Error(`Known-defect baseline target ${key} contradicts verified evidence.`);
    }
    defectTargets.add(key);
  }
  if (verifiedTargetKeys.size + defectTargets.size !== expectedTargets.size) {
    throw new Error(
      `Runner calibration covers ${verifiedTargetKeys.size + defectTargets.size}/${expectedTargets.size} targets.`
    );
  }

  return cases.map((behaviorCase) => {
    const evidence = Object.fromEntries(
      behaviorCase.checkpoints.map((checkpoint) => [
        checkpoint.id,
        Object.fromEntries(
          editorBehaviorAspects.map((aspect) => {
            const state = behaviorCase.classification.evidence[checkpoint.id][aspect];
            if (state.status !== "gap") {
              return [aspect, state];
            }
            const provenance = {
              kind: "electron-manifest-runner" as const,
              caseId: behaviorCase.id,
              checkpoint: checkpoint.id,
              aspect,
              manifestHash,
              contractHash,
              runId: calibration.runId
            };
            const key = targetKey({ caseId: behaviorCase.id, checkpoint: checkpoint.id, aspect });
            let status: EditorBehaviorEvidenceState;
            if (verifiedTargetKeys.has(key)) {
              status = { status: "verified", provenance };
            } else if (defectTargets.has(key)) {
              status = { status: "known-defect-observed", provenance };
            } else {
              throw new Error(`Runner calibration omits target ${key}.`);
            }
            return [aspect, status];
          })
        )
      ])
    ) as EditorBehaviorEvidence;

    if (
      behaviorCase.checkpoints.some((checkpoint) =>
        editorBehaviorAspects.some(
          (aspect) => evidence[checkpoint.id][aspect].status === "gap"
        )
      )
    ) {
      throw new Error(`Runner evidence composition left a gap in ${behaviorCase.id}.`);
    }

    return {
      ...behaviorCase,
      classification: {
        ...behaviorCase.classification,
        evidence,
        currentStatus: statusForEvidence(evidence)
      }
    };
  });
}

function checkpointKey(caseId: string, checkpoint: EditorBehaviorCheckpointId): string {
  return `${caseId}:${checkpoint}`;
}

function targetKey(input: {
  readonly caseId: string;
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: EditorBehaviorAspect;
}): string {
  return `${input.caseId}:${input.checkpoint}:${input.aspect}`;
}

function expectedAspect(
  checkpoint: EditorBehaviorCase["checkpoints"][number],
  aspect: EditorBehaviorAspect
): unknown {
  switch (aspect) {
    case "command-plan":
      return checkpoint.actions;
    case "semantic-path":
      return checkpoint.result.semanticPath;
    case "source":
      return checkpoint.result.source;
    case "selection":
      return checkpoint.result.selection;
    case "visible-line-roles":
      return checkpoint.result.visibleLines.map(({ role }) => role);
    case "physical-geometry":
      return checkpoint.result.visibleLines.map(({ line, sourceText, geometry }) => ({
        line,
        sourceText,
        geometry
      }));
    case "view-mode":
      return checkpoint.result.viewMode;
  }
}

function observedAspect(
  observation: EditorBehaviorCheckpointObservation,
  aspect: EditorBehaviorAspect
): unknown {
  switch (aspect) {
    case "command-plan":
      return observation.commandPlan;
    case "semantic-path":
      return observation.semanticPath;
    case "source":
      return observation.source;
    case "selection":
      return observation.selection;
    case "visible-line-roles":
      return observation.visibleLineRoles;
    case "physical-geometry":
      return observation.physicalGeometry;
    case "view-mode":
      return observation.viewMode;
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key])
    )
  );
}
