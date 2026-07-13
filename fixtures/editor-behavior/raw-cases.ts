import { assertFishMarkProbeCaseBindings } from "./fishmark-probe-catalog";
import {
  focusedRecursiveCases,
  recursiveParityMatrixCases,
  representativeDepthCases
} from "./nested-containers";
import {
  capturedOracleAndProbeCases,
  namedFishMarkProbeCases
} from "./probe-cases";
import type { EditorBehaviorCase } from "./model";

export const rawEditorBehaviorCases = assertFishMarkProbeCaseBindings([
  ...capturedOracleAndProbeCases,
  ...namedFishMarkProbeCases,
  ...focusedRecursiveCases,
  ...recursiveParityMatrixCases,
  ...representativeDepthCases
] satisfies readonly EditorBehaviorCase[]);
