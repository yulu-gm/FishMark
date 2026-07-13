/**
 * Stable fixture entry point for RF-001 editor behavior contracts.
 *
 * The executable source lives with the test-harness scenario so the browser-safe
 * renderer and CommonJS CLI consume one compiled module. This fixture facade is
 * the repository-facing import path for tests and future editor-model packages.
 */
export {
  createRepresentativeDepthCases,
  createRecursiveParityMatrixCases,
  editorBehaviorCases,
  filterEditorBehaviorCases,
  formatContainerPath,
  representativeDepthCases,
  recursiveParityMatrixCases,
  requiredEditorBehaviorContainerPaths
} from "../../packages/test-harness/src/scenarios/editor-behavior-matrix";

export type {
  EditorBehaviorCase,
  EditorBehaviorCaseQuery,
  EditorBehaviorClassification,
  EditorBehaviorCommand,
  EditorBehaviorContainer,
  EditorBehaviorContainerPath,
  EditorBehaviorResult,
  SourceSelection,
  VisiblePhysicalLineExpectation,
  VisiblePhysicalLineRole
} from "../../packages/test-harness/src/scenarios/editor-behavior-matrix";
