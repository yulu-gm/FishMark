import {
  createEditorSemanticContext,
  type EditorDerivedSnapshot,
  type EditorSemanticContext,
  type EditorSelection
} from "@fishmark/editor-model";

// Selection ownership for the adapter. A cursor move is not a document change: the parsed
// document snapshot is reused untouched, and only the selection-derived part is recomputed.
// This module is pure: it never dispatches, parses, or reads browser state.

export type EditorLocalRevision = {
  readonly generation: number;
  readonly revision: number;
};

export type PlanRevisionCheck =
  | { readonly kind: "current"; readonly revision: number }
  | { readonly kind: "unknown-origin" }
  | {
      readonly kind: "stale";
      readonly planRevision: number;
      readonly currentRevision: number;
    }
  | {
      readonly kind: "foreign-session";
      readonly planGeneration: number;
      readonly currentGeneration: number;
    };

export function createEditorLocalRevision(
  generation: number,
  revision: number
): EditorLocalRevision {
  assertPositiveInteger(generation, "generation");
  assertNonNegativeInteger(revision, "revision");
  return Object.freeze({ generation, revision });
}

export function sameEditorSelection(left: EditorSelection, right: EditorSelection): boolean {
  return left.anchor === right.anchor && left.head === right.head;
}

// A selection change alone must not invalidate a document-derived snapshot; a document change
// must, because the snapshot is keyed by revision.
export function requiresStructureRefresh(docChanged: boolean): boolean {
  return docChanged;
}

export function checkPlanRevision(input: {
  readonly planRevision: number;
  readonly planGeneration: number;
  readonly current: EditorLocalRevision;
}): PlanRevisionCheck {
  if (input.planGeneration !== input.current.generation) {
    return Object.freeze({
      kind: "foreign-session" as const,
      planGeneration: input.planGeneration,
      currentGeneration: input.current.generation
    });
  }
  if (input.planRevision !== input.current.revision) {
    return Object.freeze({
      kind: "stale" as const,
      planRevision: input.planRevision,
      currentRevision: input.current.revision
    });
  }
  return Object.freeze({ kind: "current" as const, revision: input.current.revision });
}

// One semantic context per (snapshot, selection). Selection-only reads reuse the same
// document-derived snapshot, so a cursor move cannot trigger a reparse or a rebuild.
export class SelectionMapper {
  readonly #contexts = new WeakMap<EditorDerivedSnapshot, Map<string, EditorSemanticContext>>();

  contextFor(input: {
    readonly snapshot: EditorDerivedSnapshot;
    readonly selection: EditorSelection;
  }): EditorSemanticContext {
    assertSelection(input.selection);
    let bySelection = this.#contexts.get(input.snapshot);
    if (bySelection === undefined) {
      bySelection = new Map<string, EditorSemanticContext>();
      this.#contexts.set(input.snapshot, bySelection);
    }
    const key = `${input.selection.anchor}:${input.selection.head}`;
    let context = bySelection.get(key);
    if (context === undefined) {
      context = createEditorSemanticContext({
        snapshot: input.snapshot,
        selection: Object.freeze({ anchor: input.selection.anchor, head: input.selection.head })
      });
      bySelection.set(key, context);
    }
    return context;
  }
}

export function createSelectionMapper(): SelectionMapper {
  return new SelectionMapper();
}

export function assertPlanRevisionCurrent(
  check: PlanRevisionCheck
): asserts check is Extract<PlanRevisionCheck, { kind: "current" }> {
  if (check.kind === "unknown-origin") {
    throw new Error("Edit transaction plan was not prepared by this adapter.");
  }
  if (check.kind === "stale") {
    throw new Error(
      `Edit transaction plan for revision ${check.planRevision} cannot apply to revision ${check.currentRevision}.`
    );
  }
  if (check.kind === "foreign-session") {
    throw new Error(
      `Edit transaction plan from session generation ${check.planGeneration} cannot apply to generation ${check.currentGeneration}.`
    );
  }
}

function assertSelection(selection: EditorSelection): void {
  assertNonNegativeInteger(selection.anchor, "selection.anchor");
  assertNonNegativeInteger(selection.head, "selection.head");
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
