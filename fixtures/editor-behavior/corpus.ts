import {
  editorBehaviorKnownDefectObservations,
  editorBehaviorRunnerCalibration,
  editorBehaviorRunnerVerifiedTargets
} from "./current-observations";
import type { EditorBehaviorCase } from "./model";
import { rawEditorBehaviorCases } from "./raw-cases";
import {
  composeEditorBehaviorRunnerEvidence,
  type EditorBehaviorKnownDefectObservation,
  type EditorBehaviorRunnerCalibration,
  type EditorBehaviorRunnerVerifiedTarget
} from "./runner-protocol";

export type EditorBehaviorCorpusSource = {
  readonly cases: readonly EditorBehaviorCase[];
  readonly verifiedTargets: readonly EditorBehaviorRunnerVerifiedTarget[];
  readonly knownDefects: readonly EditorBehaviorKnownDefectObservation[];
  readonly calibration: EditorBehaviorRunnerCalibration;
};

export const canonicalEditorBehaviorCorpusSource = {
  cases: rawEditorBehaviorCases,
  verifiedTargets: editorBehaviorRunnerVerifiedTargets,
  knownDefects: editorBehaviorKnownDefectObservations,
  calibration: editorBehaviorRunnerCalibration
} as const satisfies EditorBehaviorCorpusSource;

/**
 * The corpus owner performs fail-closed calibration composition before any
 * execution projection is exposed to the Electron formal runner.
 */
export function composeEditorBehaviorCorpus(
  source: EditorBehaviorCorpusSource = canonicalEditorBehaviorCorpusSource
): readonly EditorBehaviorCase[] {
  return composeEditorBehaviorRunnerEvidence(
    source.cases,
    source.verifiedTargets,
    source.knownDefects,
    source.calibration
  );
}
