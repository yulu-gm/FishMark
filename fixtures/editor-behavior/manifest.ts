import {
  formatContainerPath,
  type EditorBehaviorCase,
  type EditorBehaviorCaseQuery
} from "./model";
import { composeEditorBehaviorCorpus } from "./corpus";

export * from "./fishmark-probe-catalog";
export * from "./model";
export * from "./execution-plan";
export * from "./runner-protocol";
export { rawEditorBehaviorCases } from "./raw-cases";
export {
  editorBehaviorKnownDefectObservations,
  editorBehaviorRunnerCalibration,
  editorBehaviorRunnerVerifiedTargets
} from "./current-observations";
export {
  createRecursiveParityMatrixCases,
  createRepresentativeDepthCases,
  focusedRecursiveCases,
  recursiveParityMatrixCases,
  representativeDepthCases,
  requiredEditorBehaviorContainerPaths
} from "./nested-containers";
export { capturedOracleAndProbeCases, namedFishMarkProbeCases } from "./probe-cases";

export const editorBehaviorCases = composeEditorBehaviorCorpus();

export function filterEditorBehaviorCases(
  query: EditorBehaviorCaseQuery = {}
): readonly EditorBehaviorCase[] {
  const requestedPath = query.containerPath ? formatContainerPath(query.containerPath) : null;
  return editorBehaviorCases.filter((behaviorCase) => {
    if (query.command && behaviorCase.command !== query.command) {
      return false;
    }
    if (requestedPath && formatContainerPath(behaviorCase.containerPath) !== requestedPath) {
      return false;
    }
    return true;
  });
}
