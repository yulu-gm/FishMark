import { isolateHistory } from "@codemirror/commands";
import {
  StateEffect,
  Facet,
  StateField,
  type EditorState,
  type Extension,
  type Transaction,
  type TransactionSpec
} from "@codemirror/state";
import {
  createEditorDerivedSnapshotFromCache,
  type EditTransactionPlan,
  type EditorSemanticContext
} from "@fishmark/editor-model";
import {
  applyIncrementalEdit,
  createDocumentStructureCache,
  createDocumentStructureCacheFromTree,
  type DocumentStructureCache
} from "@fishmark/markdown-engine";
import type { MarkdownParseInstrumentation, IncrementalParseStats } from "@fishmark/markdown-engine";

import {
  IDLE_COMPOSITION_STATE,
  beginComposition,
  finishComposition,
  isComposing,
  noteCompositionDataChange,
  noteCompositionGeometryEvent,
  readCompositionStatus,
  type CompositionFinishReceipt,
  type CompositionState,
  type CompositionStatus
} from "./composition-controller";
import {
  checkPlanRevision,
  createEditorLocalRevision,
  createSelectionMapper,
  type EditorLocalRevision,
  type PlanRevisionCheck
} from "./selection-mapper";

// The CodeMirror side of the semantic engine. This package converts browser transactions to and
// from `@fishmark/editor-model` plans and owns the one piece that is not a pure function: the
// document structure cache that follows the editor document. Markdown rules stay in
// `@fishmark/editor-model`; transport stays in the renderer's existing pending queue and edit
// client, reached through `EditorChangeFramePort`. No edit rule lives here.

export type AdapterTextChange = {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
};

export type EditorChangeFrame = {
  readonly baseText: string;
  readonly resultingText: string;
  readonly changes: readonly AdapterTextChange[];
};

export type FrameAdmission =
  | { readonly kind: "admitted"; readonly sequence: number }
  | { readonly kind: "stale" }
  | { readonly kind: "invalid-frame"; readonly reason: string }
  | { readonly kind: "unavailable" };

// Narrow port onto the existing renderer owners. The adapter never keeps its own queue,
// sequence, or transport state.
export interface EditorChangeFramePort {
  admitFrame(frame: EditorChangeFrame): FrameAdmission;
}

export type EditorAdapterSession = {
  readonly tabId: string;
  readonly generation: number;
  readonly revision: number;
  // The last revision main confirmed for this client's own edits.
  readonly acknowledgedRevision: number | null;
  // The last canonical revision observed from a workspace projection, which may be ahead of what
  // this client confirmed. The two are deliberately distinct owners.
  readonly observedRevision: number | null;
};

export type EditorPreparedCommand =
  | {
      readonly kind: "applied";
      readonly plan: EditTransactionPlan;
      readonly transaction: TransactionSpec;
      readonly frame: EditorChangeFrame;
      // The cache revision the transaction will produce. `recordEditorDispatch` compares it after
      // dispatch, so a frame is only ever enqueued for the text it was computed from.
      readonly baseRevision: number;
      readonly session: EditorAdapterSession;
    }
  | {
      readonly kind: "unchanged";
      readonly plan: EditTransactionPlan;
      readonly transaction: TransactionSpec;
      readonly session: EditorAdapterSession;
    }
  | { readonly kind: "unhandled"; readonly session: EditorAdapterSession | null }
  | {
      readonly kind: "frozen";
      readonly reason: "composition-active";
      readonly session: EditorAdapterSession;
    }
  | {
      readonly kind: "stale";
      readonly check: PlanRevisionCheck;
      readonly session: EditorAdapterSession;
    };

export type EditorDispatchOutcome =
  | { readonly kind: "noted" }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "stale" }
  | { readonly kind: "no-session" };

export type EditorPlanSession = {
  readonly generation: number;
  readonly revision: number;
};

// A plan does not carry its origin session, so the adapter records the session that produced it.
// The record is per adapter, so a plan from another view is never found and therefore never
// silently accepted.
export class EditorPlanSessions {
  readonly #sessions = new WeakMap<EditTransactionPlan, EditorPlanSession>();

  remember(plan: EditTransactionPlan, session: EditorPlanSession): void {
    this.#sessions.set(plan, Object.freeze({ ...session }));
  }

  forget(plan: EditTransactionPlan): void {
    this.#sessions.delete(plan);
  }

  read(plan: EditTransactionPlan): EditorPlanSession | null {
    return this.#sessions.get(plan) ?? null;
  }
}

export type EditorStructureCacheReader = (state: EditorState) => DocumentStructureCache;

export type CreateEditorTransactionAdapterOptions = {
  readonly readCache: EditorStructureCacheReader;
  // Omit when the host's update listener already observes every editor transaction.
  readonly frames?: EditorChangeFramePort;
  readonly readAcknowledgedRevision?: () => number | null;
  readonly readObservedRevision?: () => number | null;
};

export interface EditorTransactionAdapter {
  extension(): Extension;
  onDocumentChange(listener: (revision: number) => void): () => void;
  rebindSession(tabId: string, state: EditorState): EditorAdapterSession;
  releaseSession(): void;
  readSession(state: EditorState): EditorAdapterSession | null;
  readLocalRevision(state: EditorState): EditorLocalRevision | null;
  readSemanticContext(state: EditorState): EditorSemanticContext;
  prepareCommand(
    state: EditorState,
    planner: (context: EditorSemanticContext) => EditTransactionPlan | null
  ): EditorPreparedCommand;
  preparePlan(state: EditorState, plan: EditTransactionPlan | null): EditorPreparedCommand;
  recordEditorDispatch(state: EditorState, prepared: EditorPreparedCommand): EditorDispatchOutcome;
  startComposition(state: EditorState): StateEffect<unknown>[];
  finishComposition(state: EditorState): {
    readonly effects: readonly StateEffect<unknown>[];
    readonly receipt: CompositionFinishReceipt | null;
  };
  // The host reports a plan that was refused because composition text is provisional, so the end
  // of composition asks for exactly one refresh.
  noteFrozenPlan(state: EditorState): StateEffect<unknown> | null;
  resetComposition(): StateEffect<unknown>[];
  compositionStatus(state: EditorState): CompositionStatus;
}

// The document structure cache is one state field per view. A single-range edit goes through the
// incremental cache; anything else reparses. The revision advances by exactly one per changed
// transaction, so it stays monotonic through incremental, multi-range, and fallback paths.
export type EditorStructureObserver = {
  readonly instrumentation?: MarkdownParseInstrumentation;
  readonly onUpdate?: (stats: IncrementalParseStats | null) => void;
};

// Per-view instrumentation observes actual parser calls and cache updates, including candidate
// transactions evaluated by filters. It does not infer parse work from dispatched edit counts.
export const editorStructureObserver = Facet.define<EditorStructureObserver>();

function parseOptions(state: EditorState) {
  const observers = state.facet(editorStructureObserver);
  return observers.length === 0 ? {} : {
    instrumentation: {
      onFullDocumentParse: (event: Parameters<MarkdownParseInstrumentation["onFullDocumentParse"]>[0]) => {
        for (const observer of observers) observer.instrumentation?.onFullDocumentParse(event);
      }
    }
  };
}

export const editorStructureCacheField = StateField.define<DocumentStructureCache>({
  create: (state) => createDocumentStructureCache(state.doc.toString(), parseOptions(state)),
  update: (cache, transaction) => nextCache(cache, transaction)
});

export const compositionStateField = StateField.define<CompositionState>({
  create: () => IDLE_COMPOSITION_STATE,
  update: (value, transaction) => {
    let state = value;
    for (const effect of transaction.effects) {
      if (effect.is(beginCompositionEffect)) {
        state = beginComposition(effect.value);
      } else if (effect.is(finishCompositionEffect)) {
        state = IDLE_COMPOSITION_STATE;
      } else if (effect.is(resetCompositionEffect)) {
        state = IDLE_COMPOSITION_STATE;
      } else if (effect.is(noteCompositionGeometryEffect)) {
        state = noteCompositionGeometryEvent(state, effect.value);
      }
    }
    if (transaction.docChanged && state.active) {
      state = noteCompositionDataChange(state, state.dataRevision + 1);
    }
    return state;
  }
});

export const beginCompositionEffect = StateEffect.define<number>();
export const finishCompositionEffect = StateEffect.define<null>();
export const resetCompositionEffect = StateEffect.define<null>();
export const noteCompositionGeometryEffect = StateEffect.define<number>();

export function readEditorStructureCache(state: EditorState): DocumentStructureCache {
  return state.field(editorStructureCacheField, false) ?? createDocumentStructureCache(state.doc.toString());
}

export function readCompositionState(state: EditorState): CompositionState {
  return state.field(compositionStateField, false) ?? IDLE_COMPOSITION_STATE;
}

export function createEditorTransactionAdapter(
  options: CreateEditorTransactionAdapterOptions
): EditorTransactionAdapter {
  const selections = createSelectionMapper();
  const planSessions = new EditorPlanSessions();
  const listeners = new Set<(revision: number) => void>();
  let session: SessionState | null = null;
  let nextGeneration = 1;

  function readSession(state: EditorState): EditorAdapterSession | null {
    if (session === null) return null;
    return Object.freeze({
      tabId: session.tabId,
      generation: session.generation,
      revision: options.readCache(state).revision,
      // The queue is the only owner of what main has confirmed; the adapter only reports it.
      acknowledgedRevision: options.readAcknowledgedRevision?.() ?? null,
      observedRevision: options.readObservedRevision?.() ?? null
    });
  }

  function requireSession(state: EditorState): EditorAdapterSession {
    const current = readSession(state);
    if (current === null) {
      throw new Error("Editor transaction adapter has no bound session.");
    }
    return current;
  }

  const adapter: EditorTransactionAdapter = {
    extension(): Extension {
      return [editorStructureCacheField, compositionStateField];
    },
    onDocumentChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    rebindSession(tabId, state) {
      if (typeof tabId !== "string" || tabId.length === 0) {
        throw new Error("Editor session tab ID must not be empty.");
      }
      session = {
        tabId,
        generation: nextGeneration
      };
      nextGeneration += 1;
      const rebound = requireSession(state);
      for (const listener of listeners) listener(rebound.revision);
      return rebound;
    },
    releaseSession() {
      session = null;
    },
    readSession,
    readLocalRevision(state) {
      return session === null
        ? null
        : createEditorLocalRevision(session.generation, options.readCache(state).revision);
    },
    readSemanticContext(state) {
      const cache = options.readCache(state);
      const selection = state.selection.main;
      return selections.contextFor({
        snapshot: createEditorDerivedSnapshotFromCache(cache),
        selection: { anchor: selection.anchor, head: selection.head }
      });
    },
    prepareCommand(state, planner) {
      if (session === null) return Object.freeze({ kind: "unhandled" as const, session: null });
      const plan = planner(adapter.readSemanticContext(state));
      if (plan === null) {
        return Object.freeze({ kind: "unhandled" as const, session: readSession(state) });
      }
      planSessions.remember(plan, { generation: session.generation, revision: plan.revision });
      return adapter.preparePlan(state, plan);
    },
    preparePlan(state, plan) {
      if (session === null || plan === null) {
        return Object.freeze({ kind: "unhandled" as const, session: readSession(state) });
      }
      // The live cache revision is the only current revision; the session snapshot is a report,
      // not a version owner, so a plan cannot ride in on a stale binding.
      const current = createEditorLocalRevision(
        session.generation,
        options.readCache(state).revision
      );
      // Revision numbers are local to a view: equal numbers cannot establish plan provenance.
      const origin = planSessions.read(plan);
      if (origin === null) {
        return Object.freeze({
          kind: "stale" as const,
          check: Object.freeze({ kind: "unknown-origin" as const }),
          session: requireSession(state)
        });
      }
      const check = checkPlanRevision({
        planRevision: plan.revision,
        planGeneration: origin.generation,
        current
      });
      if (check.kind !== "current") {
        return Object.freeze({ kind: "stale" as const, check, session: requireSession(state) });
      }
      if (isComposing(readCompositionState(state)) && !isPlainInputPlan(plan)) {
        // Composition text is provisional; a structure decision read from it would be wrong.
        return Object.freeze({
          kind: "frozen" as const,
          reason: "composition-active" as const,
          session: requireSession(state)
        });
      }
      const transaction = buildTransactionSpec(plan);
      if (plan.edits.length === 0) {
        return Object.freeze({
          kind: "unchanged" as const,
          plan,
          transaction,
          session: requireSession(state)
        });
      }
      return Object.freeze({
        kind: "applied" as const,
        plan,
        transaction,
        // The frame must describe exactly what CodeMirror holds, so it is read from the document
        // rather than from a cache that may still carry pre-normalization text.
        frame: buildFrame(plan, state.doc.toString()),
        baseRevision: current.revision + 1,
        session: requireSession(state)
      });
    },
    recordEditorDispatch(state, prepared) {
      if (session === null) return Object.freeze({ kind: "no-session" as const });
      if (prepared.kind === "stale") return Object.freeze({ kind: "stale" as const });
      if (prepared.kind !== "applied") {
        return Object.freeze({ kind: "rejected" as const, reason: prepared.kind });
      }
      if (options.frames === undefined) {
        return Object.freeze({ kind: "rejected" as const, reason: "host-observed" });
      }
      const origin = planSessions.read(prepared.plan);
      if (
        origin === null ||
        origin.generation !== session.generation ||
        prepared.session.generation !== session.generation ||
        prepared.session.tabId !== session.tabId
      ) {
        return Object.freeze({ kind: "stale" as const });
      }
      const cache = options.readCache(state);
      if (cache.revision !== prepared.baseRevision || state.doc.toString() !== prepared.frame.resultingText) {
        // The view moved between preparation and dispatch: never enqueue a frame for other text.
        return Object.freeze({ kind: "stale" as const });
      }
      // Consume before calling the transport so a re-entrant or repeated record cannot admit twice.
      planSessions.forget(prepared.plan);
      const admission = options.frames.admitFrame(prepared.frame);
      if (admission.kind !== "admitted") {
        return Object.freeze({ kind: "rejected" as const, reason: admission.kind });
      }
      return Object.freeze({ kind: "noted" as const });
    },
    startComposition(state) {
      if (session === null) return [];
      const dataRevision = options.readCache(state).revision;
      return [beginCompositionEffect.of(dataRevision)];
    },
    finishComposition(state) {
      const current = readCompositionState(state);
      if (!current.active) {
        return Object.freeze({ effects: Object.freeze([finishCompositionEffect.of(null)]), receipt: null });
      }
      const receipt = finishComposition(current);
      return Object.freeze({
        effects: Object.freeze([finishCompositionEffect.of(null)]),
        receipt
      });
    },
    resetComposition() {
      return [resetCompositionEffect.of(null)];
    },
    noteFrozenPlan(state) {
      const composition = readCompositionState(state);
      if (!composition.active) return null;
      return noteCompositionGeometryEffect.of(options.readCache(state).revision);
    },
    compositionStatus(state) {
      return readCompositionStatus(readCompositionState(state));
    }
  };

  return adapter;
}

type SessionState = {
  readonly tabId: string;
  readonly generation: number;
};

function isPlainInputPlan(plan: EditTransactionPlan): boolean {
  // Plain typing is the only plan safe to run against provisional composition text; anything
  // that decides structure (including automatic completion) must wait for the final text.
  return plan.intent === "edit" && plan.commandId === "insert-text";
}

export function historyAnnotationFor(plan: EditTransactionPlan): {
  readonly userEvent: string;
  readonly annotations?: readonly unknown[];
} {
  // A decision that names its own history event keeps it, whichever intent it carries: the legacy
  // vocabulary (`input.list-exit`) is an external contract, not a spelling of the command id.
  const named = plan.userEventName;

  if (named !== undefined) {
    return plan.intent === "structural"
      ? { userEvent: named, annotations: [isolateHistory.of("before")] }
      : { userEvent: named };
  }
  if (plan.intent === "navigation") {
    return { userEvent: "select" };
  }
  if (plan.intent === "structural") {
    // A structure decision is its own history event, so it is never merged into the typing that
    // triggered it.
    return { userEvent: `input.${plan.commandId}`, annotations: [isolateHistory.of("before")] };
  }
  // Plain text insertion keeps CodeMirror's own typing group, which is what makes consecutive
  // keystrokes a single undo step. A distinct event name per command would silently split them.
  if (plan.commandId === "insert-text") {
    return { userEvent: "input.type" };
  }
  return { userEvent: `input.${plan.commandId}` };
}

export function buildTransactionSpec(plan: EditTransactionPlan): TransactionSpec {
  const history = historyAnnotationFor(plan);
  return {
    changes: plan.edits.map((edit) => ({ from: edit.from, to: edit.to, insert: edit.insert })),
    selection: { anchor: plan.selection.anchor, head: plan.selection.head },
    userEvent: history.userEvent,
    ...(history.annotations === undefined ? {} : { annotations: history.annotations })
  } as TransactionSpec;
}

export function buildFrame(plan: EditTransactionPlan, source: string): EditorChangeFrame {
  let cursor = 0;
  let resultingText = "";
  for (const edit of plan.edits) {
    resultingText += source.slice(cursor, edit.from);
    resultingText += edit.insert;
    cursor = edit.to;
  }
  resultingText += source.slice(cursor);
  return Object.freeze({
    baseText: source,
    resultingText,
    changes: Object.freeze(plan.edits.map((edit) => Object.freeze({
      from: edit.from,
      to: edit.to,
      insert: edit.insert
    })))
  });
}

function nextCache(
  cache: DocumentStructureCache,
  transaction: Transaction
): DocumentStructureCache {
  const observers = transaction.startState.facet(editorStructureObserver);
  if (!transaction.docChanged) {
    for (const observer of observers) observer.onUpdate?.(null);
    return cache;
  }

  const changes: Array<{ from: number; to: number; insert: string }> = [];
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changes.push({ from: fromA, to: toA, insert: inserted.toString() });
  });

  if (changes.length === 1) {
    const change = changes[0]!;
    // The incremental parser owns the newest source, tree, and revision.
    const result = applyIncrementalEdit(cache, {
      fromOffset: change.from,
      toOffset: change.to,
      insertedText: change.insert
    }, parseOptions(transaction.startState));
    for (const observer of observers) observer.onUpdate?.(result.stats);
    return result.cache;
  }

  const rebuilt = createDocumentStructureCache(transaction.newDoc.toString(), parseOptions(transaction.startState));
  for (const observer of observers) observer.onUpdate?.({ fullParseCount: 1, parsedSourceLength: rebuilt.source.length,
    reusedNodes: 0, reparsedNodes: rebuilt.tree.root.children.length, window: null, fallbackReason: "multiple-changes" });
  return createDocumentStructureCacheFromTree(cache.revision + 1, rebuilt.source, rebuilt.tree);
}
