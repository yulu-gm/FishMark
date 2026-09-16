import type { EditorSelection } from "../context/selection-context";
import type { EditorSemanticContext } from "../context/editor-semantic-context";

// The single edit contract every semantic command returns. A plan is data: the adapter applies
// the text edits and the resulting selection in one CodeMirror transaction, so no command owns
// dispatch, history, or view state.
export interface TextEditOperation {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface EditTransactionPlan {
  readonly revision: number;
  readonly commandId: string;
  readonly edits: readonly TextEditOperation[];
  readonly selection: EditorSelection;
  readonly intent: "edit" | "structural" | "navigation";
}

export type EditorCommandId =
  | "enter"
  | "backspace"
  | "delete"
  | "indent"
  | "outdent"
  | "format-inline"
  | "table-edit"
  | "fence-edit";

export interface EditorCommand<TContext = EditorSemanticContext> {
  readonly id: EditorCommandId;
  readonly intent: EditTransactionPlan["intent"];
  run(context: TContext): EditTransactionPlan | null;
}

export interface EditorCommandRegistry<TContext = EditorSemanticContext> {
  get(id: EditorCommandId): EditorCommand<TContext> | null;
  list(): readonly EditorCommand<TContext>[];
}

export function createEditorCommandRegistry<TContext = EditorSemanticContext>(
  commands: readonly EditorCommand<TContext>[]
): EditorCommandRegistry<TContext> {
  const byId = new Map<EditorCommandId, EditorCommand<TContext>>();

  for (const command of commands) {
    if (byId.has(command.id)) {
      throw new Error(`Duplicate editor command id '${command.id}'.`);
    }

    byId.set(command.id, command);
  }

  return Object.freeze({
    get: (id: EditorCommandId) => byId.get(id) ?? null,
    list: () => Object.freeze([...byId.values()])
  });
}

export function createEditTransactionPlan(input: {
  readonly context: EditorSemanticContext;
  readonly commandId: EditorCommandId;
  readonly intent: EditTransactionPlan["intent"];
  readonly edits: readonly TextEditOperation[];
  readonly selection?: EditorSelection;
}): EditTransactionPlan {
  assertPlanEdits(input.edits);

  return Object.freeze({
    revision: input.context.revision,
    commandId: input.commandId,
    intent: input.intent,
    edits: Object.freeze(input.edits.map((edit) => Object.freeze({ ...edit }))),
    selection: Object.freeze(
      input.selection ?? {
        anchor: input.context.selectionContext.selection.anchor,
        head: input.context.selectionContext.selection.head
      }
    )
  });
}

// A plan built against an older revision must never be applied to a newer document.
export function assertPlanAppliesToRevision(plan: EditTransactionPlan, revision: number): void {
  if (plan.revision !== revision) {
    throw new Error(
      `Edit transaction plan for revision ${plan.revision} cannot apply to revision ${revision}.`
    );
  }
}

function assertPlanEdits(edits: readonly TextEditOperation[]): void {
  let previousTo = -1;

  for (const edit of edits) {
    if (!Number.isSafeInteger(edit.from) || !Number.isSafeInteger(edit.to)) {
      throw new TypeError("Edit offsets must be safe integers.");
    }

    if (edit.from < 0 || edit.to < edit.from) {
      throw new RangeError("Edit range must be non-negative and ordered.");
    }

    if (edit.from < previousTo) {
      throw new RangeError("Edit operations must be ordered and non-overlapping.");
    }

    previousTo = edit.to;
  }
}
