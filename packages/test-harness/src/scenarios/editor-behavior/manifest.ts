import {
  focusedRecursiveCases,
  recursiveParityMatrixCases,
  representativeDepthCases
} from "./nested-containers";
import {
  capturedOracleAndProbeCases,
  namedFishMarkProbeCases
} from "./probe-cases";
import {
  formatContainerPath,
  type EditorBehaviorCase,
  type EditorBehaviorCaseQuery
} from "./model";

export * from "./fishmark-probe-catalog";
export * from "./model";
export {
  createRecursiveParityMatrixCases,
  createRepresentativeDepthCases,
  focusedRecursiveCases,
  recursiveParityMatrixCases,
  representativeDepthCases,
  requiredEditorBehaviorContainerPaths
} from "./nested-containers";
export { capturedOracleAndProbeCases, namedFishMarkProbeCases } from "./probe-cases";

export const editorBehaviorCases: readonly EditorBehaviorCase[] = [
  ...capturedOracleAndProbeCases,
  ...namedFishMarkProbeCases,
  ...focusedRecursiveCases,
  ...recursiveParityMatrixCases,
  ...representativeDepthCases
];

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
