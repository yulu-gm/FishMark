// Composition (IME) ownership for the semantic adapter, expressed as pure state so the adapter
// keeps no hidden mutable state. Browser composition is an input-layer concern: while a
// composition is active the document text keeps changing, but any semantic refresh derived from
// the composed range is provisional. The state therefore freezes geometry-changing refresh for
// the duration and asks for exactly one recomputation from the final text when composition ends.

export const COMPOSITION_GEOMETRY_REFRESH_REASON =
  "composed-range-may-change-structure" as const;

export type CompositionState = {
  readonly active: boolean;
  readonly dataRevision: number;
  readonly geometryEventCount: number;
};

export type CompositionStatus =
  | { readonly kind: "idle" }
  | {
      readonly kind: "composing";
      readonly dataRevision: number;
      readonly geometryEventCount: number;
    };

export type CompositionFinishReceipt = {
  readonly state: CompositionState;
  readonly kind: "composition-finished";
  readonly dataRevision: number;
  readonly geometryEventCount: number;
  readonly requiresStructureRefresh: boolean;
  readonly reason:
    | typeof COMPOSITION_GEOMETRY_REFRESH_REASON
    | "no-geometry-work";
};

export const IDLE_COMPOSITION_STATE: CompositionState = Object.freeze({
  active: false,
  dataRevision: 0,
  geometryEventCount: 0
});

export function isComposing(state: CompositionState): boolean {
  return state.active;
}

export function readCompositionStatus(state: CompositionState): CompositionStatus {
  return state.active
    ? Object.freeze({
        kind: "composing" as const,
        dataRevision: state.dataRevision,
        geometryEventCount: state.geometryEventCount
      })
    : Object.freeze({ kind: "idle" as const });
}

export function beginComposition(dataRevision: number): CompositionState {
  assertRevision(dataRevision, "dataRevision");
  return Object.freeze({ active: true, dataRevision, geometryEventCount: 0 });
}

export function noteCompositionGeometryEvent(
  state: CompositionState,
  dataRevision: number
): CompositionState {
  if (!state.active) return state;
  assertRevision(dataRevision, "dataRevision");
  return Object.freeze({
    active: true,
    dataRevision,
    geometryEventCount: state.geometryEventCount + 1
  });
}

export function noteCompositionDataChange(
  state: CompositionState,
  dataRevision: number
): CompositionState {
  if (!state.active) return state;
  assertRevision(dataRevision, "dataRevision");
  return Object.freeze({ ...state, dataRevision });
}

// Exactly one final recomputation is requested per composition, from the text that is current
// when composition ends. Re-entrant bookkeeping cannot inflate that count.
export function finishComposition(state: CompositionState): CompositionFinishReceipt {
  const requiresStructureRefresh = state.geometryEventCount > 0;
  return Object.freeze({
    state: IDLE_COMPOSITION_STATE,
    kind: "composition-finished" as const,
    dataRevision: state.dataRevision,
    geometryEventCount: state.geometryEventCount,
    requiresStructureRefresh,
    reason: requiresStructureRefresh
      ? COMPOSITION_GEOMETRY_REFRESH_REASON
      : ("no-geometry-work" as const)
  });
}

function assertRevision(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
