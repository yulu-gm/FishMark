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

export type EditorBehaviorAspectValueMap = {
  readonly "command-plan": readonly EditorBehaviorAction[];
  readonly "semantic-path": EditorBehaviorContainerPath;
  readonly source: string;
  readonly selection: SourceSelection;
  readonly "visible-line-roles": readonly VisiblePhysicalLineRole[];
  readonly "physical-geometry": readonly PhysicalLineGeometryObservation[];
  readonly "view-mode": EditorViewMode;
};

type EditorBehaviorRunnerProvenance<A extends EditorBehaviorAspect> = {
  readonly kind: "electron-manifest-runner";
  readonly caseId: string;
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: A;
  readonly manifestHash: string;
  readonly contractHash: string;
  readonly runId: string;
};

export type EditorBehaviorTargetVerdict<
  A extends EditorBehaviorAspect = EditorBehaviorAspect
> = {
  [K in A]: {
    readonly caseId: string;
    readonly checkpoint: EditorBehaviorCheckpointId;
    readonly aspect: K;
    readonly status: EditorBehaviorVerdictStatus;
    readonly expected: EditorBehaviorAspectValueMap[K];
    readonly actual?: EditorBehaviorAspectValueMap[K];
    readonly runnerProvenance?: EditorBehaviorRunnerProvenance<K>;
  }
}[A];

export type EditorBehaviorKnownDefectObservation<
  A extends EditorBehaviorAspect = EditorBehaviorAspect
> = {
  [K in A]: {
    readonly caseId: string;
    readonly checkpoint: EditorBehaviorCheckpointId;
    readonly aspect: K;
    readonly observed: EditorBehaviorAspectValueMap[K];
    readonly reason: string;
  }
}[A];

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
    assertAspectValue(defect.aspect, defect.observed, `Known defect ${targetKey(defect)}`);
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
          verdicts.push(createTargetVerdict({
            caseId: behaviorCase.id,
            checkpoint: checkpoint.id,
            aspect,
            status: "not-run",
            expected
          }));
          continue;
        }

        const actual = observedAspect(observation, aspect);
        assertAspectValue(
          aspect,
          actual,
          `Observation ${behaviorCase.id}:${checkpoint.id}:${aspect}`
        );
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
          verdicts.push(createTargetVerdict({
            caseId: behaviorCase.id,
            checkpoint: checkpoint.id,
            aspect,
            status: isPreexistingEvidence ? "verified-existing" : "verified-runner",
            expected,
            actual,
            runnerProvenance: provenance
          }));
          continue;
        }

        const defect = defectByTarget.get(
          targetKey({ caseId: behaviorCase.id, checkpoint: checkpoint.id, aspect })
        );
        verdicts.push(createTargetVerdict({
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
        }));
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
  readonly calibrationHash: string;
  /** Explicit contract migrations awaiting fresh exact runner evidence. */
  readonly pendingTargets?: readonly EditorBehaviorRunnerVerifiedTarget[];
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
  const pendingTargets = new Set((calibration.pendingTargets ?? []).map(targetKey));
  if (pendingTargets.size !== (calibration.pendingTargets?.length ?? 0)) {
    throw new Error("Runner calibration duplicates a pending target.");
  }
  for (const key of pendingTargets) {
    if (expectedTargets.get(key)?.status !== "gap") {
      throw new Error(`Pending calibration target ${key} must exist and be unverified.`);
    }
  }
  if (expectedTargets.size !== expectedTargetCount) {
    throw new Error("Runner evidence composition requires globally unique case targets.");
  }
  const verifiedTargetKeys = new Set<string>();
  for (const target of verifiedTargets) {
    if (pendingTargets.has(targetKey(target))) throw new Error(`Pending target ${targetKey(target)} cannot reuse verified calibration.`);
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
    if (pendingTargets.has(targetKey(defect))) throw new Error(`Pending target ${targetKey(defect)} cannot reuse known-defect calibration.`);
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
    assertAspectValue(defect.aspect, defect.observed, `Known-defect baseline target ${key}`);
    if (expectedTargets.get(key)?.status !== "gap") {
      throw new Error(`Known-defect baseline target ${key} contradicts verified evidence.`);
    }
    defectTargets.add(key);
  }
  if (verifiedTargetKeys.size + defectTargets.size + pendingTargets.size !== expectedTargets.size) {
    throw new Error(
      `Runner calibration covers ${verifiedTargetKeys.size + defectTargets.size}/${expectedTargets.size} targets.`
    );
  }
  const expectedCalibrationHash = createCalibrationHash(
    calibration,
    verifiedTargets,
    knownDefects
  );
  if (calibration.calibrationHash !== expectedCalibrationHash) {
    throw new Error(
      `Runner calibration hash ${calibration.calibrationHash} does not match ${expectedCalibrationHash}.`
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
            if (pendingTargets.has(key)) return [aspect, state];
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
          (aspect) => evidence[checkpoint.id][aspect].status === "gap" &&
            !pendingTargets.has(targetKey({ caseId: behaviorCase.id, checkpoint: checkpoint.id, aspect }))
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

function createTargetVerdict<A extends EditorBehaviorAspect>(input: {
  readonly caseId: string;
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: A;
  readonly status: EditorBehaviorVerdictStatus;
  readonly expected: EditorBehaviorAspectValueMap[A];
  readonly actual?: EditorBehaviorAspectValueMap[A];
  readonly runnerProvenance?: EditorBehaviorRunnerProvenance<A>;
}): EditorBehaviorTargetVerdict<A> {
  return input as EditorBehaviorTargetVerdict<A>;
}

function expectedAspect<A extends EditorBehaviorAspect>(
  checkpoint: EditorBehaviorCase["checkpoints"][number],
  aspect: A
): EditorBehaviorAspectValueMap[A] {
  switch (aspect) {
    case "command-plan":
      return checkpoint.actions as EditorBehaviorAspectValueMap[A];
    case "semantic-path":
      return checkpoint.result.semanticPath as EditorBehaviorAspectValueMap[A];
    case "source":
      return checkpoint.result.source as EditorBehaviorAspectValueMap[A];
    case "selection":
      return checkpoint.result.selection as EditorBehaviorAspectValueMap[A];
    case "visible-line-roles":
      return checkpoint.result.visibleLines.map(
        ({ role }) => role
      ) as unknown as EditorBehaviorAspectValueMap[A];
    case "physical-geometry":
      return checkpoint.result.visibleLines.map(({ line, sourceText, geometry }) => ({
        line,
        sourceText,
        geometry
      })) as unknown as EditorBehaviorAspectValueMap[A];
    case "view-mode":
      return checkpoint.result.viewMode as EditorBehaviorAspectValueMap[A];
  }
}

function observedAspect<A extends EditorBehaviorAspect>(
  observation: EditorBehaviorCheckpointObservation,
  aspect: A
): EditorBehaviorAspectValueMap[A] {
  switch (aspect) {
    case "command-plan":
      return observation.commandPlan as EditorBehaviorAspectValueMap[A];
    case "semantic-path":
      return observation.semanticPath as EditorBehaviorAspectValueMap[A];
    case "source":
      return observation.source as EditorBehaviorAspectValueMap[A];
    case "selection":
      return observation.selection as EditorBehaviorAspectValueMap[A];
    case "visible-line-roles":
      return observation.visibleLineRoles as EditorBehaviorAspectValueMap[A];
    case "physical-geometry":
      return observation.physicalGeometry as EditorBehaviorAspectValueMap[A];
    case "view-mode":
      return observation.viewMode as EditorBehaviorAspectValueMap[A];
  }
}

function sameValue<T>(left: T, right: T): boolean {
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
      left.every((value, index) => sameValue<unknown>(value, right[index]))
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
        key === rightKeys[index] && sameValue<unknown>(leftRecord[key], rightRecord[key])
    )
  );
}

const editorBehaviorContainers = new Set([
  "Document",
  "Paragraph",
  "List",
  "ListItem",
  "Blockquote",
  "CodeFence",
  "BlockMath"
]);
const visiblePhysicalLineRoles = new Set<VisiblePhysicalLineRole>([
  "content",
  "empty-editing-line",
  "whitespace-only",
  "structural-separator",
  "code-fence-delimiter",
  "code-fence-content",
  "block-math-delimiter",
  "block-math-content"
]);

function assertAspectValue<A extends EditorBehaviorAspect>(
  aspect: A,
  value: unknown,
  label: string
): asserts value is EditorBehaviorAspectValueMap[A] {
  let valid = false;
  switch (aspect) {
    case "command-plan":
      valid = Array.isArray(value) && value.every(isEditorBehaviorAction);
      break;
    case "semantic-path":
      valid =
        Array.isArray(value) &&
        value.every(
          (container) =>
            typeof container === "string" && editorBehaviorContainers.has(container)
        );
      break;
    case "source":
      valid = typeof value === "string";
      break;
    case "selection":
      valid = isSourceSelection(value);
      break;
    case "visible-line-roles":
      valid =
        Array.isArray(value) &&
        value.every(
          (role) =>
            typeof role === "string" &&
            visiblePhysicalLineRoles.has(role as VisiblePhysicalLineRole)
        );
      break;
    case "physical-geometry":
      valid = Array.isArray(value) && value.every(isPhysicalLineGeometry);
      break;
    case "view-mode":
      valid = value === "source" || value === "wysiwym";
      break;
  }
  if (!valid) {
    throw new Error(`${label} has an invalid ${aspect} value.`);
  }
}

function isEditorBehaviorAction(value: unknown): value is EditorBehaviorAction {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "press-key":
      return (
        ["Enter", "Backspace", "Tab", "ArrowUp", "ArrowDown"].includes(
          String(value.key)
        ) &&
        (value.shift === undefined || value.shift === true)
      );
    case "insert-text":
      return typeof value.text === "string";
    case "set-selection":
      return isSourceSelection(value.target);
    case "undo":
      return true;
    default:
      return false;
  }
}

function isSourceSelection(value: unknown): value is SourceSelection {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.anchor) &&
    Number.isSafeInteger(value.head)
  );
}

function isPhysicalLineGeometry(
  value: unknown
): value is PhysicalLineGeometryObservation {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.line) ||
    typeof value.sourceText !== "string" ||
    !isRecord(value.geometry)
  ) {
    return false;
  }
  const geometry = value.geometry;
  return (
    Number.isSafeInteger(geometry.semanticDepth) &&
    Number.isSafeInteger(geometry.contentColumn) &&
    (geometry.markerColumn === null || Number.isSafeInteger(geometry.markerColumn)) &&
    (geometry.visibility === "visible" || geometry.visibility === "collapsed")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createCalibrationHash(
  calibration: Pick<
    EditorBehaviorRunnerCalibration,
    "manifestHash" | "contractHash" | "runId" | "pendingTargets"
  >,
  verifiedTargets: readonly EditorBehaviorRunnerVerifiedTarget[],
  knownDefects: readonly EditorBehaviorKnownDefectObservation[]
): string {
  const verified = verifiedTargets
    .map((target) => ({ target: targetKey(target), outcome: "verified" as const }))
    .sort((left, right) => left.target.localeCompare(right.target));
  const defects = knownDefects
    .map((defect) => ({
      target: targetKey(defect),
      outcome: "known-defect-observed" as const,
      observed: defect.observed,
      reason: defect.reason
    }))
    .sort((left, right) => left.target.localeCompare(right.target));
  const serialized = stableStringify({
    schemaVersion: 1,
    manifestHash: calibration.manifestHash,
    contractHash: calibration.contractHash,
    runId: calibration.runId,
    ...(calibration.pendingTargets === undefined ? {} : { pendingTargets: calibration.pendingTargets.map(targetKey).sort() }),
    verified,
    defects
  });
  return `fnv1a32-${fnv1a32(serialized)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Calibration identity cannot serialize undefined values.");
  }
  return serialized;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
