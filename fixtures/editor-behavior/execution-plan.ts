import type {
  EditorBehaviorAction,
  EditorBehaviorCase,
  EditorBehaviorCheckpointId,
  EditorViewMode,
  SourceSelection
} from "./model";

export type EditorBehaviorExecutionCheckpoint = {
  readonly id: EditorBehaviorCheckpointId;
  readonly from: "initial" | "primary" | "repeat";
  readonly actions: readonly EditorBehaviorAction[];
};

export type EditorBehaviorExecutionCase = {
  readonly id: string;
  readonly initial: {
    readonly source: string;
    readonly selection: SourceSelection;
    readonly viewMode: EditorViewMode;
  };
  readonly checkpoints: readonly EditorBehaviorExecutionCheckpoint[];
};

export type EditorBehaviorExecutionPlan = {
  readonly manifestHash: string;
  readonly contractHash: string;
  readonly cases: readonly EditorBehaviorExecutionCase[];
};

export function createExecutionPlan(
  cases: readonly EditorBehaviorCase[]
): EditorBehaviorExecutionPlan {
  const executableCases = cases.map((behaviorCase) => ({
    id: behaviorCase.id,
    initial: {
      source: behaviorCase.initial.source,
      selection: { ...behaviorCase.initial.selection },
      viewMode: behaviorCase.initial.viewMode
    },
    checkpoints: behaviorCase.checkpoints.map(({ id, from, actions }) => ({
      id,
      from,
      actions: actions.map((action) =>
        action.kind === "set-selection"
          ? { ...action, target: { ...action.target } }
          : { ...action }
      )
    }))
  }));
  const serialized = JSON.stringify(executableCases);
  const contract = cases.map((behaviorCase) => ({
    id: behaviorCase.id,
    initial: behaviorCase.initial,
    checkpoints: behaviorCase.checkpoints.map(({ id, from, actions, result }) => ({
      id,
      from,
      actions,
      result
    }))
  }));

  return {
    manifestHash: `fnv1a32-${fnv1a32(serialized)}`,
    contractHash: `fnv1a32-${fnv1a32(JSON.stringify(contract))}`,
    cases: executableCases
  };
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
