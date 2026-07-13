import {
  editorBehaviorCases,
  filterEditorBehaviorCases,
  formatContainerPath,
  type EditorBehaviorCaseQuery
} from "./editor-behavior/manifest";
import type { TestScenario } from "../scenario";

export function createEditorBehaviorMatrixScenario(
  query: EditorBehaviorCaseQuery = {}
): TestScenario {
  const selectedCases = filterEditorBehaviorCases(query);
  const filters = [
    query.command ? `command=${query.command}` : null,
    query.containerPath ? `containerPath=${formatContainerPath(query.containerPath)}` : null
  ].filter((value): value is string => value !== null);

  return {
    id: "editor-behavior-matrix",
    title: "Editor behavior contract matrix",
    summary:
      filters.length > 0
        ? `Describes ${selectedCases.length} typed behavior contracts filtered by ${filters.join(", ")}.`
        : `Describes all ${selectedCases.length} typed source, selection, geometry, repeat, undo, and evidence contracts.`,
    surface: "editor",
    tags: ["editor", "rendering"],
    preconditions: [
      "Typed behavior manifest is the contract source; generated screenshots and runtime artifacts remain external.",
      "Coverage-gap evidence is not an executed pass; a later RF-001 runner slice must replace it with verified evidence."
    ],
    steps: selectedCases.map((behaviorCase) => ({
      id: behaviorCase.id,
      title: behaviorCase.title,
      kind: "assertion" as const,
      description: [
        `command=${behaviorCase.command}`,
        `containerPath=${formatContainerPath(behaviorCase.containerPath)}`,
        `classification=${behaviorCase.classification.kind}`
      ].join("; ")
    }))
  };
}

export const editorBehaviorMatrixScenario = createEditorBehaviorMatrixScenario();

export { editorBehaviorCases, filterEditorBehaviorCases };
export type { EditorBehaviorCaseQuery };
