import {
  canonicalEditorBehaviorCorpusSource,
  composeEditorBehaviorCorpus,
  type EditorBehaviorCorpusSource
} from "./corpus";
import {
  createExecutionPlan,
  type EditorBehaviorExecutionPlan
} from "./execution-plan";
import { formatContainerPath, type EditorBehaviorCase } from "./model";
import {
  compareEditorBehaviorObservations,
  type EditorBehaviorCheckpointObservation,
  type EditorBehaviorComparison
} from "./runner-protocol";

export type EditorBehaviorFormalRun = {
  readonly executionPlan: EditorBehaviorExecutionPlan;
  readonly compare: (
    observations: readonly EditorBehaviorCheckpointObservation[]
  ) => EditorBehaviorComparison;
};

/**
 * Narrow test-only boundary consumed by the formal renderer. Canonical corpus
 * identity is composed first; the renderer receives only executable data and
 * an owner-supplied comparison closure, never desired results or oracle data.
 */
export function createEditorBehaviorFormalRun(
  search: URLSearchParams,
  source?: EditorBehaviorCorpusSource
): EditorBehaviorFormalRun {
  const canonicalCases = composeEditorBehaviorCorpus(source);
  const selectedCases = selectCases(canonicalCases, search);
  const executionPlan = createExecutionPlan(selectedCases);
  const selectedCaseIds = new Set(selectedCases.map(({ id }) => id));
  const knownDefects = source?.knownDefects ?? canonicalEditorBehaviorCorpusSource.knownDefects;

  return {
    executionPlan,
    compare: (observations) =>
      compareEditorBehaviorObservations(
        selectedCases,
        observations,
        knownDefects.filter(({ caseId }) =>
          selectedCaseIds.has(caseId)
        )
      )
  };
}

function selectCases(
  cases: readonly EditorBehaviorCase[],
  search: URLSearchParams
): readonly EditorBehaviorCase[] {
  const requestedCase = search.get("case");
  const requestedCommand = search.get("command");
  const requestedPath = search.get("containerPath");
  const commandValues = new Set(cases.map(({ command }) => command));

  if (requestedCommand && !commandValues.has(requestedCommand as EditorBehaviorCase["command"])) {
    throw new Error(`Unknown command ${requestedCommand}.`);
  }

  let selected = cases.filter(
    ({ command }) => !requestedCommand || command === requestedCommand
  );
  if (requestedPath) {
    selected = selected.filter(
      ({ containerPath }) => formatContainerPath(containerPath) === requestedPath
    );
  }
  if (requestedCase) {
    if (!cases.some(({ id }) => id === requestedCase)) {
      throw new Error(`Unknown editor behavior case ${requestedCase}.`);
    }
    selected = selected.filter(({ id }) => id === requestedCase);
  }
  if (selected.length === 0) {
    throw new Error("Editor behavior filters selected no cases.");
  }
  return selected;
}
