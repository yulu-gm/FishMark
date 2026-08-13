import type { SaveMarkdownFileResult } from "../../shared/save-markdown-file";
import type { DocumentTextChange } from "../../shared/document-edit";
import type {
  ReloadWorkspaceTabFromPathError,
  WorkspaceWindowSnapshot
} from "../../shared/workspace";
import type {
  CodeEditorDiscardedDocumentText,
  CodeEditorDocumentChangeFrame,
  CodeEditorRemotePatchResult
} from "../code-editor";
import {
  WorkspaceEditClient,
  type WorkspaceEditBarrierLease,
  type WorkspaceEditClientStateChange,
  type WorkspaceEditConflictClaim,
  type WorkspaceEditTabBinding
} from "../application/workspace-edit-client";
import { isPendingEditQueueDirty } from "../application/pending-edit-queue";
import {
  applyWorkspaceSnapshot,
  createInitialEditorShellState,
  getActiveDocument,
  getActiveTabId,
  setOpenState,
  type EditorShellState
} from "./editor-shell-state";
import {
  WorkspaceDraftOutbox,
  type WorkspaceDraftEntry
} from "./workspace-draft-outbox";
import { WorkspaceMutationCoordinator } from "./workspace-mutation-coordinator";
import {
  isSameEditorLoadIdentity,
  type EditorLoadIdentity
} from "./editor-load-identity";

export type { EditorLoadIdentity } from "./editor-load-identity";

const DRAFT_DRAIN_LIMIT = 16;

export type EditorTransitionReason =
  | "reloading"
  | "recovering"
  | "closing-tab"
  | "detaching-tab"
  | "closing-window";

export type EditorTransition = Readonly<{
  token: number;
  phase: "sealing" | "sealed" | "releasing";
  reason: EditorTransitionReason;
  readOnly: boolean;
}>;

export type WorkspaceRendererBridge = Pick<
  Window["fishmark"],
  | "activateWorkspaceTab"
  | "closeWorkspaceTab"
  | "confirmWorkspaceWindowClose"
  | "createWorkspaceTab"
  | "detachWorkspaceTabToNewWindow"
  | "getWorkspaceSnapshot"
  | "openWorkspaceFile"
  | "openWorkspaceFileFromPath"
  | "reloadWorkspaceTabFromPath"
  | "reorderWorkspaceTab"
  | "saveMarkdownFile"
  | "saveMarkdownFileAs"
  | "applyDocumentEdits"
  | "flushDocumentEdits"
  | "onDocumentProjection"
  | "updateWorkspaceTabDraft"
>;

export type WorkspaceRendererApplicationState = EditorShellState & Readonly<{
  editorEpoch: number;
  editorTransition: EditorTransition | null;
}>;

export type WorkspaceApplicationOutcome<T> =
  | Readonly<{ kind: "committed"; value: T }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "superseded" }>
  | Readonly<{ kind: "no-document" }>
  | Readonly<{ kind: "failed"; error: unknown }>
  | Readonly<{ kind: "failed-reconciled"; error: unknown }>
  | Readonly<{ kind: "canonical-unavailable"; error: unknown }>;

export type WorkspaceOpenOutcome = WorkspaceApplicationOutcome<"opened">;

export type WorkspaceReloadOutcome =
  | WorkspaceApplicationOutcome<{ retainedNewerDraft: boolean }>
  | Readonly<{ kind: "revision-stale" }>
  | Readonly<{ kind: "reload-error"; error: ReloadWorkspaceTabFromPathError }>;

export type WorkspaceSaveOutcome =
  | Readonly<{
      kind: "committed";
      tabId: string;
      value: SaveMarkdownFileResult;
    }>
  | Exclude<WorkspaceApplicationOutcome<never>, { kind: "committed" }>;

export type WorkspaceRendererTestAdapter = Readonly<{
  readState: () => WorkspaceRendererApplicationState;
  openFixture: (targetPath: string) => Promise<WorkspaceOpenOutcome>;
  commitDraft: () => Promise<WorkspaceApplicationOutcome<void>>;
  saveDocument: () => Promise<WorkspaceSaveOutcome>;
}>;

type EditorBarrierSnapshot = Readonly<{
  text: string;
  identity: EditorLoadIdentity | null;
}>;

type AcquiredEditBarrier = Readonly<{
  lease: WorkspaceEditBarrierLease | null;
  sealedText: string | null;
}>;

type EditorRemotePatch = (input: {
  readonly identity: EditorLoadIdentity;
  readonly expectedBefore: string;
  readonly expectedAfter: string;
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}) => Promise<CodeEditorRemotePatchResult>;

type EditorCanonicalRestore = (input: {
  readonly identity: EditorLoadIdentity;
  readonly expectedBefore: string;
  readonly canonicalText: string;
}) => Promise<{ readonly kind: "restored" | "stale-identity" | "text-mismatch" | "disposed" }>;

type RecoveryRecord = Readonly<{
  readonly sourceBinding: WorkspaceEditTabBinding;
  readonly localText: string;
  readonly canonicalText?: string;
  readonly canonicalRevision: number;
  readonly sourceRestored: boolean;
  readonly phase: "captured" | "creating" | "applying" | "blocked";
  readonly recoverySnapshot?: WorkspaceWindowSnapshot;
  readonly recoveryBinding?: WorkspaceEditTabBinding;
}>;

type CanonicalWorkspaceState =
  | Readonly<{ kind: "known"; snapshot: WorkspaceWindowSnapshot }>
  | Readonly<{
      kind: "unknown";
      lastKnown: WorkspaceWindowSnapshot | null;
      cause: unknown;
    }>;

type MutationFailureKind = "failed-reconciled" | "canonical-unavailable";

type PendingEditorTransitionBarrier = Readonly<{
  token: number;
  readOnly: boolean;
  promise: Promise<boolean>;
  resolve: (applied: boolean) => void;
}>;

type ReloadDraftCheckpoint = Readonly<{
  content: string;
  cutoffGeneration: number;
}>;

class WorkspaceMutationFailure extends Error {
  constructor(
    readonly kind: MutationFailureKind,
    readonly causeValue: unknown
  ) {
    super(causeValue instanceof Error ? causeValue.message : String(causeValue));
  }
}

class WorkspaceRendererApplicationDisposedError extends Error {
  constructor() {
    super("Workspace renderer application is disposed.");
  }
}

class WorkspaceRecoveryPendingError extends Error {
  constructor() { super("A local recovery payload must be preserved before this operation can proceed."); }
}

export class WorkspaceRendererApplication {
  private readonly bridge: WorkspaceRendererBridge;
  private readonly readEditorContent: () => string;
  private readonly coordinator = new WorkspaceMutationCoordinator();
  private readonly outbox = new WorkspaceDraftOutbox();
  private readonly listeners = new Set<() => void>();
  private readonly editClient: WorkspaceEditClient;
  private readonly editBindings = new Map<string, {
    identity: EditorLoadIdentity;
    readonly binding: WorkspaceEditTabBinding;
  }>();
  private readonly recoveryByTab = new Map<string, RecoveryRecord>();
  private state: WorkspaceRendererApplicationState;
  private canonical: CanonicalWorkspaceState;
  private editorBinding: EditorLoadIdentity | null = null;
  private pendingEditorLoadIdentity: EditorLoadIdentity | null;
  private activationGeneration = 0;
  private editorTransitionSequence = 0;
  private pendingEditorTransitionBarrier: PendingEditorTransitionBarrier | null = null;
  private adapterFramePendingIdentity: EditorLoadIdentity | null = null;
  private disposed = false;
  private lifecycleEpoch = 0;
  private pendingOperationKind: string | null = null;
  // The legacy outbox stays available only for old non-CodeMirror callers. A real adapter marks
  // this before its RAF frame is emitted, preventing a workflow from dual-sending that edit.
  private incrementalEditingActive = false;
  private editorBarrier: (() => Promise<EditorBarrierSnapshot>) | null = null;
  private editorRemotePatch: EditorRemotePatch | null = null;
  private editorCanonicalRestore: EditorCanonicalRestore | null = null;
  private conflictDrainScheduled = false;
  private readonly recoveryMaterializationScheduled = new Set<string>();
  private readonly pendingConflictClaims = new Map<number, {
    readonly binding: WorkspaceEditTabBinding;
    readonly claim: WorkspaceEditConflictClaim;
  }>();
  // Client metadata observation is synchronous and may publish.  Snapshot application must
  // publish its canonical+local dirty overlay atomically instead of exposing an intermediate
  // per-tab dirty state to subscribers.
  private applyingCanonicalSnapshot = false;

  constructor(input: {
    bridge: WorkspaceRendererBridge;
    initialSnapshot?: WorkspaceWindowSnapshot | null;
    readEditorContent: () => string;
  }) {
    this.bridge = input.bridge;
    this.readEditorContent = input.readEditorContent;
    const shellState = input.initialSnapshot
      ? applyWorkspaceSnapshot(createInitialEditorShellState(), input.initialSnapshot)
      : createInitialEditorShellState();
    this.state = {
      ...shellState,
      editorEpoch: 1,
      editorTransition: null
    };
    this.canonical = input.initialSnapshot
      ? { kind: "known", snapshot: input.initialSnapshot }
      : { kind: "unknown", lastKnown: null, cause: new Error("Workspace not loaded.") };
    this.editClient = new WorkspaceEditClient({
      windowId: input.initialSnapshot?.windowId ?? null,
      ports: {
        createClientId: createRendererEditClientId,
        applyDocumentEdits: (request) => this.bridge.applyDocumentEdits(request),
        flushDocumentEdits: (request) => this.bridge.flushDocumentEdits(request),
        subscribeDocumentProjection: (listener) =>
          this.bridge.onDocumentProjection?.(listener) ?? (() => {}),
        notifyState: (change) => this.observeEditClientState(change)
      }
    });
    this.pendingEditorLoadIdentity = this.createCurrentEditorLoadIdentity();
  }

  getState = (): WorkspaceRendererApplicationState => this.state;

  getEditorViewSnapshot = (): WorkspaceWindowSnapshot | null => {
    const snapshot = this.state.workspaceSnapshot;
    const document = snapshot?.activeDocument;
    if (snapshot === null || document === null || document === undefined) return snapshot;
    const queue = this.editClient.getTabState(document.tabId);
    if (
      queue === null ||
      queue.optimisticText === document.content ||
      (queue.batches.length === 0 &&
        queue.status !== "recovering" &&
        !this.hasPendingAdapterFrame(document.tabId) &&
        queue.acknowledgedTextRevision <= document.revision)
    ) return snapshot;
    return {
      ...snapshot,
      activeDocument: { ...document, content: queue.optimisticText }
    };
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): void {
    if (this.disposed) return;
    this.lifecycleEpoch += 1;
    this.editClient.start();
  }

  scheduleDispose(): void {
    const epoch = ++this.lifecycleEpoch;
    queueMicrotask(() => {
      if (this.lifecycleEpoch === epoch) this.dispose();
    });
  }

  registerEditorBarrier(barrier: (() => Promise<EditorBarrierSnapshot>) | null): void {
    this.editorBarrier = barrier;
  }

  registerEditorRemotePatch(patch: EditorRemotePatch | null): void {
    this.editorRemotePatch = patch;
  }

  registerEditorCanonicalRestore(restore: EditorCanonicalRestore | null): void {
    this.editorCanonicalRestore = restore;
  }

  dispose(): void {
    this.disposed = true;
    this.lifecycleEpoch += 1;
    this.activationGeneration += 1;
    this.pendingEditorTransitionBarrier?.resolve(false);
    this.pendingEditorTransitionBarrier = null;
    this.pendingConflictClaims.clear();
    this.conflictDrainScheduled = false;
    this.recoveryMaterializationScheduled.clear();
    this.editClient.dispose();
    this.editBindings.clear();
    this.listeners.clear();
  }

  getCanonicalStatus(): CanonicalWorkspaceState["kind"] {
    return this.canonical.kind;
  }

  getPendingOperationKind(): string | null {
    return this.pendingOperationKind;
  }

  getPendingEditorLoadIdentity(): EditorLoadIdentity | null {
    return this.pendingEditorLoadIdentity;
  }

  getEditorBinding(): EditorLoadIdentity | null {
    return this.editorBinding;
  }

  retryRecovery(tabId: string): Promise<boolean> {
    const recovery = this.recoveryByTab.get(tabId);
    if (recovery === undefined || this.disposed) return Promise.resolve(false);
    return this.enqueue("edit-conflict", async () => {
      const current = this.recoveryByTab.get(tabId);
      if (current === undefined || current !== recovery || this.disposed) return false;
      if (current.recoveryBinding !== undefined) {
        const retry = this.editClient.retryRetainedTransport(current.recoveryBinding);
        if (retry.kind === "not-retryable") {
          // A recovery apply can already be acknowledged while only its main flush checkpoint
          // failed. In that case its queue is empty and retrying means re-flushing the same
          // recovery tab; a retained batch is a typed/server failure and must stay blocked.
          const state = this.editClient.getTabState(current.recoveryBinding.tabId);
          if (state === null || state.batches.length > 0) return false;
        } else if (retry.kind !== "resumed") {
          return false;
        }
        await this.finishRecoveryApply(tabId, current);
        return !this.recoveryByTab.has(tabId);
      }
      this.recoveryByTab.set(tabId, { ...current, phase: "captured" });
      await this.runRecoveryOnlyCreate(tabId);
      return !this.recoveryByTab.has(tabId);
    });
  }

  getEditorTestAdapter(): WorkspaceRendererTestAdapter {
    return {
      readState: this.getState,
      openFixture: (targetPath) => this.openMarkdownFromPath(targetPath),
      commitDraft: () => this.flushActiveWorkspaceDraft(),
      saveDocument: () => this.runSaveTransaction({
        forceSaveAs: false,
        hasExternalConflict: false
      })
    };
  }

  acknowledgeEditorLoad(identity: EditorLoadIdentity): boolean {
    if (
      this.pendingEditorLoadIdentity === null ||
      !isSameEditorLoadIdentity(this.pendingEditorLoadIdentity, identity) ||
      identity.tabId !== getActiveTabId(this.state) ||
      identity.epoch !== this.state.editorEpoch ||
      identity.loadRevision !== this.state.editorLoadRevision
    ) {
      return false;
    }

    this.editorBinding = identity;
    if (!this.outbox.has(identity.tabId)) {
      this.ensureEditorEditBinding(identity);
    }
    this.pendingEditorLoadIdentity = null;
    return true;
  }

  acknowledgeEditorTransition(input: { token: number; readOnly: boolean }): boolean {
    const transition = this.state.editorTransition;
    const barrier = this.pendingEditorTransitionBarrier;
    if (
      transition === null ||
      barrier === null ||
      transition.token !== input.token ||
      barrier.token !== input.token ||
      transition.readOnly !== input.readOnly ||
      barrier.readOnly !== input.readOnly
    ) {
      return false;
    }

    this.pendingEditorTransitionBarrier = null;
    if (input.readOnly) {
      this.captureCurrentEditorContent();
      this.editorBinding = null;
      this.pendingEditorLoadIdentity = null;
      this.state = {
        ...this.state,
        editorTransition: {
          ...transition,
          phase: "sealed"
        }
      };
      this.emit();
    } else {
      this.completeEditorRelease();
    }
    barrier.resolve(true);
    return true;
  }

  recordEditorChange(input: {
    identity: EditorLoadIdentity;
    content: string;
  }): boolean {
    if (
      (this.state.editorTransition !== null &&
        this.state.editorTransition.phase !== "sealing") ||
      this.editorBinding === null ||
      !isSameEditorLoadIdentity(this.editorBinding, input.identity)
    ) {
      return false;
    }

    if (this.incrementalEditingActive) return false;
    this.outbox.set(input.identity.tabId, input.content);
    this.updateState(applyRendererLocalWorkspaceDraft(
      this.state,
      input.identity.tabId,
      input.content
    ));
    return true;
  }

  recordEditorDocumentChangeFrame(frame: CodeEditorDocumentChangeFrame): boolean {
    if (
      frame.identity === null ||
      this.editorBinding === null ||
      !isSameEditorLoadIdentity(this.editorBinding, frame.identity)
    ) {
      return false;
    }
    this.incrementalEditingActive = true;
    const entry = this.editBindings.get(frame.identity.tabId);
    if (entry === undefined || !isSameEditorLoadIdentity(entry.identity, frame.identity)) return false;
    const admission = this.editClient.admitFrame({ ...frame, binding: entry.binding });
    if (admission.kind === "admitted") {
      return true;
    }
    if (admission.kind !== "stale") {
      this.editClient.retainAdapterDiscard(entry.binding, frame.resultingText);
      return true;
    }
    return false;
  }

  recordEditorFramePending(input: {
    hasPending: boolean;
    identity: EditorLoadIdentity | null;
  }): void {
    if (
      input.identity === null ||
      this.editorBinding === null ||
      !isSameEditorLoadIdentity(this.editorBinding, input.identity)
    ) {
      return;
    }
    const isPending = input.hasPending;
    const wasPending = this.adapterFramePendingIdentity !== null &&
      isSameEditorLoadIdentity(this.adapterFramePendingIdentity, input.identity);
    if (isPending === wasPending) return;
    if (isPending) this.incrementalEditingActive = true;
    this.adapterFramePendingIdentity = isPending ? input.identity : null;
    this.applyDisposableDirtyState(input.identity.tabId);
  }

  recordDiscardedEditorDocumentText(input: CodeEditorDiscardedDocumentText): boolean {
    if (input.identity === null) return false;
    this.incrementalEditingActive = true;
    const entry = this.editBindings.get(input.identity.tabId);
    if (entry === undefined || !isSameEditorLoadIdentity(entry.identity, input.identity)) return false;
    return this.editClient.retainAdapterDiscard(entry.binding, input.text).kind === "recovery-required";
  }

  private setOpenState(openState: "idle" | "opening"): void {
    this.updateState({
      ...setOpenState(this.state, openState),
      editorEpoch: this.state.editorEpoch,
      editorTransition: this.state.editorTransition
    });
  }

  flushActiveWorkspaceDraft(): Promise<WorkspaceApplicationOutcome<void>> {
    return this.enqueue("draft-flush", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      try {
        await this.captureAndDrainActiveDraft();
        return { kind: "committed", value: undefined };
      } catch (error) {
        return this.outcomeFromError(error);
      }
    });
  }

  runWithActiveEditBarrier<T>(
    operation: (
      document: NonNullable<WorkspaceWindowSnapshot["activeDocument"]>,
      sealedText: string
    ) => Promise<T>
  ): Promise<WorkspaceApplicationOutcome<T>> {
    return this.enqueue("edit-barrier", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const known = await this.ensureCanonicalKnown();
      if (known !== null) return known;
      const tabId = getActiveTabId(this.state);
      const document = getActiveDocument(this.state);
      if (tabId === null || document === null) return { kind: "no-document" };
      let acquired: AcquiredEditBarrier = { lease: null, sealedText: null };
      try {
        acquired = this.incrementalEditingActive
          ? await this.acquireEditBarrier(tabId)
          : (await this.drainTab(tabId), { lease: null, sealedText: null });
      } catch (error) {
        return this.recoverMutationOutcome(error);
      }
      try {
        return {
          kind: "committed",
          value: await operation(document, acquired.sealedText ?? document.content)
        };
      } catch (error) {
        return { kind: "failed", error };
      } finally {
        acquired.lease?.release();
      }
    });
  }

  refreshWorkspaceSnapshot(): Promise<WorkspaceApplicationOutcome<WorkspaceWindowSnapshot>> {
    return this.enqueue("refresh", async () => {
      try {
        const snapshot = await this.bridge.getWorkspaceSnapshot();
        this.recordCanonicalSnapshot(snapshot);
        return { kind: "committed", value: snapshot };
      } catch (error) {
        if (this.canonical.kind === "unknown") {
          return { kind: "canonical-unavailable", error };
        }
        return { kind: "failed", error };
      }
    });
  }

  openMarkdown(): Promise<WorkspaceOpenOutcome> {
    return this.enqueue("open", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }

      try {
        await this.captureAndDrainActiveDraft();
        this.setOpenState("opening");
        const result = await this.bridge.openWorkspaceFile();
        if (result.kind === "cancelled") {
          this.setOpenState("idle");
          return { kind: "cancelled" };
        }
        if (result.kind === "error") {
          this.setOpenState("idle");
          return { kind: "failed", error: new Error(result.error.message) };
        }
        if (result.kind === "focused-existing") {
          this.setOpenState("idle");
          return { kind: "committed", value: "opened" };
        }
        this.recordCanonicalSnapshot(result.snapshot);
        return { kind: "committed", value: "opened" };
      } catch (error) {
        this.setOpenState("idle");
        return this.recoverMutationOutcome(error);
      }
    });
  }

  openMarkdownFromPath(targetPath: string): Promise<WorkspaceOpenOutcome> {
    return this.enqueue("open", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }

      try {
        await this.captureAndDrainActiveDraft();
        this.setOpenState("opening");
        const result = await this.bridge.openWorkspaceFileFromPath(targetPath);
        if (result.kind === "error") {
          this.setOpenState("idle");
          return { kind: "failed", error: new Error(result.error.message) };
        }
        if (result.kind === "focused-existing") {
          this.setOpenState("idle");
          return { kind: "committed", value: "opened" };
        }
        this.recordCanonicalSnapshot(result.snapshot);
        return { kind: "committed", value: "opened" };
      } catch (error) {
        this.setOpenState("idle");
        return this.recoverMutationOutcome(error);
      }
    });
  }

  openMarkdownFromPaths(targetPaths: readonly string[]): Promise<WorkspaceOpenOutcome> {
    return this.enqueue("open", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      if (targetPaths.length === 0) {
        return { kind: "cancelled" };
      }
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }

      try {
        await this.captureAndDrainActiveDraft();
        this.setOpenState("opening");
        for (const targetPath of targetPaths) {
          const result = await this.bridge.openWorkspaceFileFromPath(targetPath);
          if (result.kind === "error") {
            this.setOpenState("idle");
            return { kind: "failed", error: new Error(result.error.message) };
          }
          if (result.kind === "success") {
            this.recordCanonicalSnapshot(result.snapshot);
          }
        }
        this.setOpenState("idle");
        return { kind: "committed", value: "opened" };
      } catch (error) {
        this.setOpenState("idle");
        return this.recoverMutationOutcome(error);
      }
    });
  }

  createUntitledMarkdown(): Promise<WorkspaceApplicationOutcome<void>> {
    return this.enqueue("create", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      try {
        await this.captureAndDrainActiveDraft();
        const snapshot = await this.bridge.createWorkspaceTab({ kind: "untitled" });
        this.recordCanonicalSnapshot(snapshot);
        return { kind: "committed", value: undefined };
      } catch (error) {
        return this.recoverMutationOutcome(error);
      }
    });
  }

  activateWorkspaceTab(tabId: string): Promise<WorkspaceApplicationOutcome<void>> {
    this.captureCurrentEditorContent();
    const sourceTabId = getActiveTabId(this.state);
    const generation = ++this.activationGeneration;

    return this.enqueue("activation", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      if (generation !== this.activationGeneration) {
        return { kind: "superseded" };
      }

      try {
        if (sourceTabId !== null) {
          await this.drainTab(sourceTabId);
        }
        if (this.canonical.kind !== "known") {
          return { kind: "canonical-unavailable", error: this.canonical.cause };
        }
        if (this.canonical.snapshot.activeTabId !== tabId) {
          const snapshot = await this.bridge.activateWorkspaceTab({ tabId });
          this.recordCanonicalSnapshot(snapshot);
        } else {
          this.applyCanonicalSnapshot(this.canonical.snapshot);
        }
        if (generation !== this.activationGeneration) {
          return { kind: "superseded" };
        }
        if (sourceTabId !== null) {
          await this.drainTab(sourceTabId);
        }
        await this.drainTab(tabId);
        return getActiveTabId(this.state) === tabId
          ? { kind: "committed", value: undefined }
          : { kind: "failed", error: new Error("Activated tab is not canonical active tab.") };
      } catch (error) {
        return this.recoverMutationOutcome(error);
      }
    });
  }

  closeWorkspaceTab(tabId: string): Promise<WorkspaceApplicationOutcome<void>> {
    return this.removeTabMutation("close", tabId, () =>
      this.bridge.closeWorkspaceTab({ tabId })
    );
  }

  detachWorkspaceTab(tabId: string): Promise<WorkspaceApplicationOutcome<void>> {
    return this.removeTabMutation("detach", tabId, () =>
      this.bridge.detachWorkspaceTabToNewWindow({ tabId })
    );
  }

  reorderWorkspaceTab(
    tabId: string,
    toIndex: number
  ): Promise<WorkspaceApplicationOutcome<void>> {
    return this.enqueue("reorder", async () => {
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      try {
        const snapshot = await this.bridge.reorderWorkspaceTab({ tabId, toIndex });
        this.recordCanonicalSnapshot(snapshot);
        return { kind: "committed", value: undefined };
      } catch (error) {
        return this.recoverMutationOutcome(error);
      }
    });
  }

  reloadWorkspaceTabFromPath(tabId: string): Promise<WorkspaceReloadOutcome> {
    return this.enqueue("reload", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const disposed = this.getDisposedOutcome();
      if (disposed !== null) {
        return disposed;
      }
      const known = await this.ensureCanonicalKnown();
      const disposedAfterReconciliation = this.getDisposedOutcome();
      if (disposedAfterReconciliation !== null) {
        return disposedAfterReconciliation;
      }
      if (known !== null) {
        return known;
      }
      const sealsActiveEditor = getActiveTabId(this.state) === tabId;
      let checkpoint: ReloadDraftCheckpoint | undefined;

      try {
        if (sealsActiveEditor) {
          await this.sealEditor("reloading");
        }
        checkpoint = this.captureReloadDraftCheckpoint(tabId);
        await this.drainTab(tabId);
        this.assertActive();
        const result = await this.bridge.reloadWorkspaceTabFromPath({ tabId });
        this.assertActive();
        if (result.kind === "revision-stale") {
          return { kind: "revision-stale" };
        }
        if (result.kind === "error") {
          return { kind: "reload-error", error: result.error };
        }

        this.outbox.discardThrough(tabId, checkpoint?.cutoffGeneration ?? 0);
        const retainedNewerDraft = this.outbox.has(tabId);
        this.recordCanonicalSnapshot(result.snapshot, {
          forceEditorReload: sealsActiveEditor
        });
        return {
          kind: "committed",
          value: { retainedNewerDraft }
        };
      } catch (error) {
        if (this.disposed || error instanceof WorkspaceRendererApplicationDisposedError) {
          return { kind: "failed", error: new WorkspaceRendererApplicationDisposedError() };
        }
        this.markCanonicalUnknown(error);
        this.restoreReloadDraftCheckpoint(tabId, checkpoint);
        try {
          const snapshot = await this.bridge.getWorkspaceSnapshot();
          this.assertActive();
          if (!snapshot.tabs.some((tab) => tab.tabId === tabId)) {
            this.outbox.remove(tabId);
          }
          this.recordCanonicalSnapshot(snapshot);
          return { kind: "failed-reconciled", error };
        } catch (reconcileError) {
          if (this.disposed || reconcileError instanceof WorkspaceRendererApplicationDisposedError) {
            return { kind: "failed", error: new WorkspaceRendererApplicationDisposedError() };
          }
          this.markCanonicalUnknown(reconcileError);
          return { kind: "canonical-unavailable", error: reconcileError };
        }
      } finally {
        if (sealsActiveEditor && this.state.editorTransition !== null) {
          await this.releaseEditor();
        }
      }
    });
  }

  confirmWorkspaceWindowClose(
    requestId: string
  ): Promise<WorkspaceApplicationOutcome<boolean>> {
    return this.enqueue("window-close", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const disposed = this.getDisposedOutcome();
      if (disposed !== null) {
        return disposed;
      }
      const known = await this.ensureCanonicalKnown();
      const disposedAfterReconciliation = this.getDisposedOutcome();
      if (disposedAfterReconciliation !== null) {
        return disposedAfterReconciliation;
      }
      if (known !== null) {
        return known;
      }
      let shouldReleaseEditor = getActiveDocument(this.state) !== null;
      try {
        if (shouldReleaseEditor) {
          await this.sealEditor("closing-window");
        }
        await this.drainAllDrafts();
        this.assertActive();
        const result = await this.bridge.confirmWorkspaceWindowClose({ requestId });
        this.assertActive();
        if (result.status === "error") {
          shouldReleaseEditor = true;
          return { kind: "failed", error: result.error };
        }
        const value = result.status === "confirmed";
        shouldReleaseEditor = !value;
        return { kind: "committed", value };
      } catch (error) {
        shouldReleaseEditor = true;
        if (this.disposed || error instanceof WorkspaceRendererApplicationDisposedError) {
          return { kind: "failed", error: new WorkspaceRendererApplicationDisposedError() };
        }
        if (error instanceof WorkspaceMutationFailure) {
          return this.outcomeFromError(error);
        }
        return this.recoverMutationOutcome(error);
      } finally {
        if (shouldReleaseEditor && this.state.editorTransition !== null) {
          await this.releaseEditor();
        }
      }
    });
  }

  runSaveTransaction(input: {
    forceSaveAs: boolean;
    hasExternalConflict: boolean;
  }): Promise<WorkspaceSaveOutcome> {
    const capturedDocument = getActiveDocument(this.state);
    this.captureCurrentEditorContent();
    if (capturedDocument === null) {
      return Promise.resolve({ kind: "no-document" });
    }
    const tabId = capturedDocument.tabId;

    return this.enqueue("save", async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      let editLease: WorkspaceEditBarrierLease | null = null;
      try {
        if (this.incrementalEditingActive) {
          editLease = (await this.acquireEditBarrier(tabId)).lease;
        } else {
          await this.drainTab(tabId);
        }
        const shouldSaveAs = input.forceSaveAs ||
          capturedDocument.path === null ||
          input.hasExternalConflict;
        const value = shouldSaveAs
          ? await this.bridge.saveMarkdownFileAs({ tabId })
          : await this.bridge.saveMarkdownFile({ tabId });

        if (value.status === "success") {
          if (!this.incrementalEditingActive) await this.drainTab(tabId);
          try {
            const snapshot = await this.bridge.getWorkspaceSnapshot();
            this.recordCanonicalSnapshot(snapshot);
          } catch (error) {
            this.markCanonicalUnknown(error);
            return { kind: "canonical-unavailable", error };
          }
        }

        return { kind: "committed", tabId, value };
      } catch (error) {
        return this.recoverMutationOutcome(error);
      } finally {
        editLease?.release();
      }
    });
  }

  private enqueue<T>(kind: string, operation: () => Promise<T>): Promise<T> {
    return this.coordinator.enqueue(async () => {
      this.pendingOperationKind = kind;
      try {
        return await operation();
      } finally {
        this.pendingOperationKind = null;
      }
    });
  }

  private getRecoveryPendingOutcome(): Extract<WorkspaceApplicationOutcome<never>, { kind: "failed" }> | null {
    return this.recoveryByTab.size === 0
      ? null
      : { kind: "failed", error: new WorkspaceRecoveryPendingError() };
  }

  private async ensureCanonicalKnown(): Promise<
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "canonical-unavailable" }>
    | null
  > {
    if (this.canonical.kind === "known") {
      return null;
    }

    try {
      const snapshot = await this.bridge.getWorkspaceSnapshot();
      if (this.disposed) {
        return {
          kind: "canonical-unavailable",
          error: new WorkspaceRendererApplicationDisposedError()
        };
      }
      this.recordCanonicalSnapshot(snapshot);
      return null;
    } catch (error) {
      this.markCanonicalUnknown(error);
      return { kind: "canonical-unavailable", error };
    }
  }

  private async removeTabMutation(
    kind: "close" | "detach",
    tabId: string,
    operation: () => Promise<WorkspaceWindowSnapshot>
  ): Promise<WorkspaceApplicationOutcome<void>> {
    return this.enqueue(kind, async () => {
      const recovery = this.getRecoveryPendingOutcome();
      if (recovery !== null) return recovery;
      const disposed = this.getDisposedOutcome();
      if (disposed !== null) {
        return disposed;
      }
      const known = await this.ensureCanonicalKnown();
      const disposedAfterReconciliation = this.getDisposedOutcome();
      if (disposedAfterReconciliation !== null) {
        return disposedAfterReconciliation;
      }
      if (known !== null) {
        return known;
      }
      const sealsActiveEditor = getActiveTabId(this.state) === tabId;
      try {
        if (sealsActiveEditor) {
          await this.sealEditor(kind === "close" ? "closing-tab" : "detaching-tab");
        }
        await this.drainTab(tabId);
        this.assertActive();
        const snapshot = await operation();
        this.assertActive();
        this.recordCanonicalSnapshot(snapshot);
        if (snapshot.tabs.some((tab) => tab.tabId === tabId)) {
          return {
            kind: "failed",
            error: new Error(`${kind} response retained target tab.`)
          };
        }
        this.outbox.remove(tabId);
        return { kind: "committed", value: undefined };
      } catch (error) {
        if (this.disposed || error instanceof WorkspaceRendererApplicationDisposedError) {
          return { kind: "failed", error: new WorkspaceRendererApplicationDisposedError() };
        }
        return this.recoverMutationOutcome(error);
      } finally {
        if (sealsActiveEditor && this.state.editorTransition !== null) {
          await this.releaseEditor();
        }
      }
    });
  }

  private captureCurrentEditorContent(): void {
    if (this.incrementalEditingActive) return;
    if (
      (this.state.editorTransition !== null &&
        this.state.editorTransition.phase !== "sealing") ||
      this.editorBinding === null ||
      this.editorBinding.tabId !== getActiveTabId(this.state)
    ) {
      return;
    }
    const document = getActiveDocument(this.state);
    if (document === null) {
      return;
    }
    const content = this.readEditorContent();
    if (content !== document.content || this.outbox.has(document.tabId)) {
      this.outbox.set(document.tabId, content);
      this.updateState(applyRendererLocalWorkspaceDraft(this.state, document.tabId, content));
    }
  }

  private async captureAndDrainActiveDraft(): Promise<void> {
    this.captureCurrentEditorContent();
    const tabId = getActiveTabId(this.state);
    if (tabId !== null) {
      await this.drainTab(tabId);
    }
  }

  private async drainTab(tabId: string): Promise<void> {
    if (this.incrementalEditingActive) {
      const barrier = await this.acquireEditBarrier(tabId);
      barrier.lease?.release();
      return;
    }
    for (let pass = 0; pass < DRAFT_DRAIN_LIMIT; pass += 1) {
      const entry = this.outbox.peek(tabId);
      if (entry === undefined) {
        return;
      }
      await this.syncDraftEntry(entry);
    }

    if (this.outbox.has(tabId)) {
      throw new Error("Workspace draft drain did not settle.");
    }
  }

  private async drainAllDrafts(): Promise<void> {
    if (this.incrementalEditingActive) {
      if (this.editorBarrier !== null) await this.editorBarrier();
      const barrier = await this.editClient.acquireAllFlushBarriers();
      if (barrier.kind !== "acquired") {
        throw new WorkspaceMutationFailure("failed-reconciled", new Error(
          `Document edit barrier did not settle: ${barrier.kind}.`
        ));
      }
      barrier.lease.release();
      return;
    }
    for (let pass = 0; pass < DRAFT_DRAIN_LIMIT; pass += 1) {
      const entries = this.outbox.entries();
      if (entries.length === 0) {
        return;
      }
      for (const entry of entries) {
        await this.syncDraftEntry(entry);
      }
    }

    if (this.outbox.entries().length > 0) {
      throw new Error("Workspace draft drain did not settle.");
    }
  }

  private async syncDraftEntry(entry: WorkspaceDraftEntry): Promise<void> {
    try {
      const snapshot = await this.bridge.updateWorkspaceTabDraft({
        tabId: entry.tabId,
        content: entry.content
      });
      this.assertActive();
      this.outbox.acknowledge(entry);
      this.recordCanonicalSnapshot(snapshot);
    } catch (error) {
      if (this.disposed) {
        throw new WorkspaceRendererApplicationDisposedError();
      }
      const outcome = await this.recoverMutationOutcome(error);
      throw new WorkspaceMutationFailure(
        outcome.kind === "canonical-unavailable" ? "canonical-unavailable" : "failed-reconciled",
        error
      );
    }
  }

  private async acquireEditBarrier(tabId: string): Promise<AcquiredEditBarrier> {
    const entry = this.editBindings.get(tabId);
    if (entry === undefined) return { lease: null, sealedText: null };
    let sealedText: string | null = null;
    if (
      tabId === getActiveTabId(this.state) &&
      this.editorBinding !== null &&
      this.editorBinding.tabId === tabId &&
      this.editBindings.get(tabId)?.binding === entry.binding &&
      this.editorBarrier !== null
    ) {
      const snapshot = await this.editorBarrier();
      if (
        snapshot.identity === null ||
        !isSameEditorLoadIdentity(snapshot.identity, this.editorBinding)
      ) {
        throw new WorkspaceMutationFailure("failed-reconciled", new Error(
          "Editor barrier snapshot did not match the active editor identity."
        ));
      }
      sealedText = snapshot.text;
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const barrier = await this.editClient.acquireFlushBarrier(tabId);
      if (barrier.kind === "acquired") {
        return { lease: barrier.lease, sealedText };
      }
      if (barrier.kind === "conflict" && attempt === 0) {
        await this.resolveEditConflict(entry.binding, undefined, true);
        if (this.recoveryByTab.has(tabId)) break;
        continue;
      }
      if (barrier.kind === "recovery-required") {
        this.captureRecovery(entry.binding, barrier.recovery);
      }
      break;
    }
    throw new WorkspaceMutationFailure("failed-reconciled", new Error(
      "Document edit barrier did not settle after conflict resolution."
    ));
  }

  private markCanonicalUnknown(cause: unknown): void {
    this.canonical = {
      kind: "unknown",
      lastKnown: this.canonical.kind === "known"
        ? this.canonical.snapshot
        : this.canonical.lastKnown,
      cause
    };
  }

  private async recoverMutationOutcome(
    error: unknown
  ): Promise<
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "failed" }>
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "failed-reconciled" }>
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "canonical-unavailable" }>
  > {
    const disposed = this.getDisposedOutcome();
    if (disposed !== null) {
      return disposed;
    }
    if (error instanceof WorkspaceMutationFailure) {
      return error.kind === "canonical-unavailable"
        ? { kind: "canonical-unavailable", error: error.causeValue }
        : { kind: "failed-reconciled", error: error.causeValue };
    }
    this.markCanonicalUnknown(error);
    try {
      const snapshot = await this.bridge.getWorkspaceSnapshot();
      if (this.disposed) {
        return { kind: "failed", error: new WorkspaceRendererApplicationDisposedError() };
      }
      this.recordCanonicalSnapshot(snapshot);
      return { kind: "failed-reconciled", error };
    } catch (reconcileError) {
      if (this.disposed) {
        return { kind: "failed", error: new WorkspaceRendererApplicationDisposedError() };
      }
      this.markCanonicalUnknown(reconcileError);
      return { kind: "canonical-unavailable", error: reconcileError };
    }
  }

  private outcomeFromError(
    error: unknown
  ):
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "failed" }>
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "failed-reconciled" }>
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "canonical-unavailable" }> {
    if (error instanceof WorkspaceMutationFailure) {
      return error.kind === "canonical-unavailable"
        ? { kind: "canonical-unavailable", error: error.causeValue }
        : { kind: "failed-reconciled", error: error.causeValue };
    }
    return { kind: "failed", error };
  }

  private recordCanonicalSnapshot(
    snapshot: WorkspaceWindowSnapshot,
    options: { forceEditorReload?: boolean } = {}
  ): void {
    this.editClient.bindWindow(snapshot.windowId);
    const liveTabs = new Set(snapshot.tabs.map((tab) => tab.tabId));
    for (const [tabId, entry] of this.editBindings) {
      if (!liveTabs.has(tabId)) {
        this.editBindings.delete(tabId);
        this.editClient.retireTab(entry.binding);
      }
    }
    this.canonical = { kind: "known", snapshot };
    this.applyCanonicalSnapshot(snapshot, options);
  }

  private applyCanonicalSnapshot(
    snapshot: WorkspaceWindowSnapshot,
    options: { forceEditorReload?: boolean } = {}
  ): void {
    const previousState = this.state;
    const previousDocument = getActiveDocument(previousState);
    let shellState = applyWorkspaceSnapshot(previousState, snapshot);
    const activeTabId = getActiveTabId(shellState);
    const pendingContent = this.incrementalEditingActive || activeTabId === null
      ? undefined
      : this.outbox.get(activeTabId);
    if (activeTabId !== null && pendingContent !== undefined) {
      shellState = applyRendererLocalWorkspaceDraft(shellState, activeTabId, pendingContent);
    }
    const nextDocument = getActiveDocument(shellState);
    if (nextDocument !== null) {
      const entry = this.editBindings.get(nextDocument.tabId);
      if (entry !== undefined) {
        this.applyingCanonicalSnapshot = true;
        try {
          this.editClient.observeCanonicalMetadata(entry.binding, {
            revision: nextDocument.revision,
            savedRevision: nextDocument.savedRevision,
            isDirty: nextDocument.isDirty
          });
        } finally {
          this.applyingCanonicalSnapshot = false;
        }
      }
    }
    let canonicalReplacement =
      previousDocument?.tabId !== nextDocument?.tabId ||
      previousDocument?.content !== nextDocument?.content ||
      (options.forceEditorReload ?? false);
    const retainedQueue = nextDocument === null
      ? null
      : this.editClient.getTabState(nextDocument.tabId);
    if (
      !(options.forceEditorReload ?? false) &&
      canonicalReplacement &&
      previousDocument?.tabId === nextDocument?.tabId &&
      retainedQueue !== null &&
      (
        retainedQueue.optimisticText === nextDocument!.content ||
        retainedQueue.batches.length > 0 ||
        retainedQueue.status === "recovering" ||
        this.hasPendingAdapterFrame(nextDocument!.tabId) ||
        retainedQueue.acknowledgedTextRevision > nextDocument!.revision
      )
    ) {
      canonicalReplacement = false;
    }
    if (
      (options.forceEditorReload ?? false) &&
      shellState.editorLoadRevision === previousState.editorLoadRevision
    ) {
      shellState = {
        ...shellState,
        editorLoadRevision: previousState.editorLoadRevision + 1
      };
    }
    if (!canonicalReplacement && shellState.editorLoadRevision !== previousState.editorLoadRevision) {
      shellState = {
        ...shellState,
        editorLoadRevision: previousState.editorLoadRevision
      };
    }

    if (canonicalReplacement) {
      if (previousDocument !== null && previousDocument.tabId === nextDocument?.tabId) {
        const previousBinding = this.editBindings.get(previousDocument.tabId);
        const pendingState = previousBinding === undefined
          ? null
          : this.editClient.getTabState(previousDocument.tabId);
        if (
          previousBinding !== undefined &&
          (pendingState === null ||
            (pendingState.batches.length === 0 && pendingState.status !== "recovering"))
        ) {
          this.editBindings.delete(previousDocument.tabId);
          this.editClient.retireTab(previousBinding.binding);
        }
      }
      this.editorBinding = null;
      this.state = {
        ...shellState,
        editorEpoch: previousState.editorTransition === null
          ? previousState.editorEpoch + 1
          : previousState.editorEpoch,
        editorTransition: previousState.editorTransition
      };
      this.pendingEditorLoadIdentity = previousState.editorTransition === null
        ? this.createCurrentEditorLoadIdentity()
        : null;
    } else {
      this.state = {
        ...shellState,
        editorEpoch: previousState.editorEpoch,
        editorTransition: previousState.editorTransition
      };
    }
    this.state = {
      ...this.state,
      workspaceSnapshot: this.deriveDisposableDirtySnapshot(this.state.workspaceSnapshot)
    };
    this.emit();
  }

  private ensureEditorEditBinding(identity: EditorLoadIdentity): WorkspaceEditTabBinding | null {
    const document = getActiveDocument(this.state);
    if (document === null || document.tabId !== identity.tabId) return null;
    const existing = this.editBindings.get(identity.tabId);
    if (existing !== undefined) {
      const queue = this.editClient.getTabState(identity.tabId);
      if (
        queue !== null &&
        queue.batches.length === 0 &&
        queue.status !== "recovering" &&
        (queue.acknowledgedText !== document.content ||
          queue.acknowledgedTextRevision !== document.revision)
      ) {
        this.editBindings.delete(identity.tabId);
        this.editClient.retireTab(existing.binding);
      } else {
        existing.identity = identity;
        return existing.binding;
      }
    }
    const binding = this.editClient.hydrateTab({
      tabId: document.tabId,
      text: document.content,
      revision: document.revision,
      savedRevision: document.savedRevision,
      isDirty: document.isDirty
    });
    this.editBindings.set(identity.tabId, { identity, binding });
    this.applyDisposableDirtyState(identity.tabId);
    return binding;
  }

  private observeEditClientState(change: WorkspaceEditClientStateChange): void {
    if (this.editBindings.get(change.binding.tabId)?.binding !== change.binding) return;
    if (this.applyingCanonicalSnapshot) return;
    if (change.outcome?.kind === "conflict") {
      this.scheduleConflictResolution(change.binding, change.outcome.claim);
    } else if (change.outcome?.kind === "recovery-required") {
      this.captureRecovery(change.binding, change.outcome.recovery);
      this.scheduleRecoveryMaterialization(change.binding.tabId);
    }
    this.applyDisposableDirtyState(change.binding.tabId, change.isDirty);
  }

  private scheduleConflictResolution(
    binding: WorkspaceEditTabBinding,
    claim: WorkspaceEditConflictClaim
  ): void {
    if (this.disposed || this.pendingConflictClaims.has(claim.id)) return;
    this.pendingConflictClaims.set(claim.id, { binding, claim });
    if (this.conflictDrainScheduled) return;
    this.conflictDrainScheduled = true;
    void this.enqueue("edit-conflict", async () => {
      try {
        while (this.pendingConflictClaims.size > 0 && !this.disposed) {
          const next = this.pendingConflictClaims.values().next().value as
            | { readonly binding: WorkspaceEditTabBinding; readonly claim: WorkspaceEditConflictClaim }
            | undefined;
          if (next === undefined) break;
          this.pendingConflictClaims.delete(next.claim.id);
          await this.resolveEditConflict(next.binding, next.claim);
        }
      } finally {
        this.conflictDrainScheduled = false;
      }
    }).catch(() => {
      // Conflict resolution is a background coordinator task. All protocol failures are retained
      // as queue/recovery state; an observer or callback rejection must never escape unhandled.
    });
  }

  private scheduleRecoveryMaterialization(sourceTabId: string): void {
    if (this.disposed || this.recoveryMaterializationScheduled.has(sourceTabId)) return;
    this.recoveryMaterializationScheduled.add(sourceTabId);
    void this.enqueue("edit-conflict", async () => {
      try {
        const current = this.recoveryByTab.get(sourceTabId);
        if (
          current === undefined ||
          current.phase === "creating" ||
          current.phase === "applying" ||
          current.phase === "blocked"
        ) {
          return;
        }
        await this.runRecoveryOnlyCreate(sourceTabId);
      } finally {
        this.recoveryMaterializationScheduled.delete(sourceTabId);
      }
    }).catch(() => {
      // Recovery materialization is a background coordinator task; a rejected observer or
      // protocol failure must never escape as an unhandled rejection. The recovery record
      // remains durable and retryable via retryRecovery.
    });
  }

  private async resolveEditConflict(
    binding: WorkspaceEditTabBinding,
    claim?: WorkspaceEditConflictClaim,
    editorAlreadySealed = false
  ): Promise<void> {
    if (this.disposed || this.editBindings.get(binding.tabId)?.binding !== binding) return;
    const identity = this.editBindings.get(binding.tabId)?.identity;
    if (
      identity !== undefined &&
      this.editorBinding !== null &&
      isSameEditorLoadIdentity(this.editorBinding, identity) &&
      this.editorBarrier !== null &&
      !editorAlreadySealed
    ) {
      const sealed = await this.editorBarrier();
      if (
        this.disposed ||
        this.editBindings.get(binding.tabId)?.binding !== binding ||
        sealed.identity === null ||
        !isSameEditorLoadIdentity(sealed.identity, identity)
      ) return;
      const queue = this.editClient.getTabState(binding.tabId);
      if (queue === null || sealed.text !== queue.optimisticText) {
        const retained = this.editClient.retainAdapterDiscard(binding, sealed.text);
        if (retained.kind === "recovery-required") {
          this.captureRecovery(binding, retained.recovery);
        }
        return;
      }
    }
    const prepared = this.editClient.prepareConflictResolution(binding, claim);
    if (prepared.kind === "recovery-required") {
      this.captureRecovery(binding, prepared.recovery);
      await this.runRecoveryOnlyCreate(binding.tabId);
      return;
    }
    if (prepared.kind !== "rebased") return;
    if (
      identity === undefined ||
      this.editorBinding === null ||
      !isSameEditorLoadIdentity(this.editorBinding, identity) ||
      this.editorRemotePatch === null
    ) return;
    const patch = prepared.remoteOnOptimistic;
    if (patch !== null) {
      let applied: CodeEditorRemotePatchResult;
      try {
        applied = await this.editorRemotePatch({
          identity,
          expectedBefore: prepared.expectedOptimisticText,
          expectedAfter: prepared.rebasedText,
          from: patch.from,
          to: patch.to,
          insert: patch.insert
        });
      } catch {
        applied = { kind: "disposed" };
      }
      if (applied.kind !== "applied") {
        const recovery = this.editClient.abortConflictResolution(binding, prepared.resolution);
        if (recovery.kind === "recovery-required") {
          this.captureRecovery(binding, recovery.recovery);
          await this.runRecoveryOnlyCreate(binding.tabId);
        }
        return;
      }
    }
    const committed = this.editClient.commitConflictResolution(binding, prepared.resolution);
    if (committed.kind === "stale") {
      this.captureRecovery(binding, {
        localText: prepared.rebasedText,
        canonicalText: prepared.canonicalText,
        canonicalRevision: prepared.canonicalRevision
      });
    }
  }

  private captureRecovery(
    binding: WorkspaceEditTabBinding,
    recovery: { readonly localText: string; readonly canonicalText?: string; readonly canonicalRevision: number }
  ): void {
    const existing = this.recoveryByTab.get(binding.tabId);
    if (existing !== undefined) {
      if (existing.sourceBinding !== binding || existing.localText === recovery.localText) return;
      if (existing.recoveryBinding === undefined) {
        this.recoveryByTab.set(binding.tabId, Object.freeze({
          ...existing,
          localText: recovery.localText,
          canonicalText: recovery.canonicalText ?? existing.canonicalText,
          canonicalRevision: Math.max(existing.canonicalRevision, recovery.canonicalRevision),
          phase: "captured"
        }));
      }
      return;
    }
    this.recoveryByTab.set(binding.tabId, Object.freeze({
      sourceBinding: binding,
      localText: recovery.localText,
      ...(recovery.canonicalText === undefined ? {} : { canonicalText: recovery.canonicalText }),
      canonicalRevision: recovery.canonicalRevision,
      sourceRestored: false,
      phase: "captured"
    }));
  }

  private async runRecoveryOnlyCreate(sourceTabId: string): Promise<void> {
    const captured = this.recoveryByTab.get(sourceTabId);
    if (captured === undefined || !this.isRecoveryCurrent(sourceTabId, captured)) return;
    let working = captured;
    if (working.canonicalText === undefined) {
      try {
        const authoritative = await this.bridge.getWorkspaceSnapshot();
        const document = authoritative.activeDocument;
        if (
          authoritative.windowId !== this.state.workspaceSnapshot?.windowId ||
          document === null ||
          document.tabId !== sourceTabId ||
          document.revision < working.canonicalRevision
        ) throw new Error("Authoritative recovery snapshot does not own the source tab.");
        if (!this.isRecoveryCurrent(sourceTabId, working)) return;
        working = Object.freeze({
          ...working,
          canonicalText: document.content,
          canonicalRevision: document.revision
        });
        this.recoveryByTab.set(sourceTabId, working);
      } catch {
        if (this.isRecoveryCurrent(sourceTabId, working)) {
          this.recoveryByTab.set(sourceTabId, { ...working, phase: "blocked" });
        }
        return;
      }
    }
    const canonicalText = working.canonicalText;
    if (canonicalText === undefined) return;
    const source = this.editBindings.get(sourceTabId);
    if (
      source !== undefined &&
      this.editorBinding !== null &&
      isSameEditorLoadIdentity(source.identity, this.editorBinding) &&
      this.state.editorTransition?.readOnly !== true
    ) {
      try {
        if (this.editorBarrier !== null) {
          const sealed = await this.editorBarrier();
          if (
            sealed.identity === null ||
            !isSameEditorLoadIdentity(sealed.identity, source.identity)
          ) throw new Error("Recovery seal identity changed.");
          const queue = this.editClient.getTabState(sourceTabId);
          if (queue === null || sealed.text !== queue.optimisticText) {
            const late = this.editClient.retainAdapterDiscard(source.binding, sealed.text);
            if (late.kind === "recovery-required") this.captureRecovery(source.binding, late.recovery);
          }
        }
        await this.sealEditor("recovering");
      } catch {
        if (this.isRecoveryCurrent(sourceTabId, working)) {
          this.recoveryByTab.set(sourceTabId, { ...working, phase: "blocked" });
        }
        return;
      }
      const latest = this.recoveryByTab.get(sourceTabId);
      if (latest === undefined || !this.isRecoveryCurrent(sourceTabId, latest)) return;
      working = latest;
    }
    if (
      !working.sourceRestored &&
      source !== undefined &&
      (
        (this.editorBinding !== null && isSameEditorLoadIdentity(source.identity, this.editorBinding)) ||
        (this.state.editorTransition?.reason === "recovering" &&
          this.state.editorTransition.phase === "sealed")
      )
    ) {
      if (this.editorCanonicalRestore === null) {
        this.recoveryByTab.set(sourceTabId, { ...working, phase: "blocked" });
        return;
      }
      let restored: Awaited<ReturnType<EditorCanonicalRestore>>;
      try {
        restored = await this.editorCanonicalRestore({
          identity: source.identity,
          expectedBefore: working.localText,
          canonicalText
        });
      } catch {
        if (this.isRecoveryCurrent(sourceTabId, working)) {
          this.recoveryByTab.set(sourceTabId, { ...working, phase: "blocked" });
        }
        return;
      }
      if (!this.isRecoveryCurrent(sourceTabId, working)) return;
      if (restored.kind !== "restored") {
        this.recoveryByTab.set(sourceTabId, { ...working, phase: "blocked" });
        return;
      }
      working = Object.freeze({ ...working, sourceRestored: true, phase: "captured" as const });
      this.recoveryByTab.set(sourceTabId, working);
    }
    working = Object.freeze({ ...working, phase: "creating" as const });
    this.recoveryByTab.set(sourceTabId, working);
    let snapshot = working.recoverySnapshot;
    if (snapshot === undefined) try {
      // This is intentionally not createUntitledMarkdown(): the source queue is frozen and cannot
      // be flushed by a coordinator operation that is itself resolving that frozen queue.
      snapshot = await this.bridge.createWorkspaceTab({ kind: "untitled" });
    } catch {
      if (this.recoveryByTab.get(sourceTabId) === working) {
        this.recoveryByTab.set(sourceTabId, { ...working, phase: "blocked" });
      }
      return;
    }
    if (!this.isRecoveryCurrent(sourceTabId, working)) {
      return;
    }
    const document = snapshot.activeDocument;
    if (document === null || document === undefined) {
      if (this.recoveryByTab.get(sourceTabId) === working) {
        this.recoveryByTab.set(sourceTabId, { ...working, phase: "blocked" });
      }
      return;
    }
    working = Object.freeze({ ...working, recoverySnapshot: snapshot, phase: "applying" as const });
    this.recoveryByTab.set(sourceTabId, working);
    const binding = this.editClient.hydrateTab({
      tabId: document.tabId,
      text: document.content,
      revision: document.revision,
      savedRevision: document.savedRevision,
      isDirty: document.isDirty
    });
    const applying = this.recoveryByTab.get(sourceTabId);
    if (applying === undefined || applying !== working || !this.isRecoveryCurrent(sourceTabId, working)) {
      this.editClient.retireTab(binding);
      return;
    }
    const boundRecovery = Object.freeze({
      ...working,
      recoverySnapshot: snapshot,
      recoveryBinding: binding,
      phase: "applying" as const
    });
    this.recoveryByTab.set(sourceTabId, boundRecovery);
    const changes: readonly DocumentTextChange[] = Object.freeze([Object.freeze({
      from: 0,
      to: document.content.length,
      insert: working.localText
    })]);
    const admitted = this.editClient.admitFrame({
      binding,
      baseText: document.content,
      resultingText: working.localText,
      changes
    });
    if (admitted.kind !== "admitted") {
      this.recoveryByTab.set(sourceTabId, { ...this.recoveryByTab.get(sourceTabId)!, phase: "blocked" });
      return;
    }
    await this.finishRecoveryApply(sourceTabId, boundRecovery);
  }

  private async finishRecoveryApply(sourceTabId: string, recovery: RecoveryRecord): Promise<void> {
    const binding = recovery.recoveryBinding;
    const snapshot = recovery.recoverySnapshot;
    if (binding === undefined || snapshot === undefined || !this.isRecoveryCurrent(sourceTabId, recovery)) return;
    const current = this.recoveryByTab.get(sourceTabId);
    if (current !== recovery) return;
    const barrier = await this.editClient.acquireFlushBarrier(binding.tabId);
    if (
      barrier.kind !== "acquired" ||
      !this.isRecoveryCurrent(sourceTabId, recovery)
    ) {
      if (!this.disposed && this.recoveryByTab.get(sourceTabId) === recovery) {
        this.recoveryByTab.set(sourceTabId, { ...recovery, phase: "blocked" });
      }
      return;
    }
    barrier.lease.release();
    if (!this.isRecoveryCurrent(sourceTabId, recovery)) return;
    const recoveryQueue = this.editClient.getTabState(binding.tabId);
    const recoveryDocument = snapshot.activeDocument;
    if (
      recoveryQueue === null ||
      recoveryDocument === null ||
      recoveryDocument.tabId !== binding.tabId ||
      recoveryQueue.batches.length > 0
    ) {
      this.recoveryByTab.set(sourceTabId, { ...recovery, phase: "blocked" });
      return;
    }
    const exactSnapshot: WorkspaceWindowSnapshot = {
      ...snapshot,
      tabs: snapshot.tabs.map((tab) => tab.tabId === binding.tabId
        ? { ...tab, isDirty: isPendingEditQueueDirty(recoveryQueue) }
        : tab),
      activeDocument: {
        ...recoveryDocument,
        content: recoveryQueue.acknowledgedText,
        revision: recoveryQueue.acknowledgedTextRevision,
        savedRevision: recoveryQueue.observedSavedRevision,
        isDirty: isPendingEditQueueDirty(recoveryQueue)
      }
    };
    // The original tab remains in the recovery-create snapshot, but its renderer transport
    // incarnation is no longer valid once the exact recovery checkpoint succeeded. Remove the
    // application lookup before retiring it so a late source event cannot resurrect the queue.
    this.editBindings.delete(sourceTabId);
    this.editClient.retireTab(recovery.sourceBinding);
    this.recoveryByTab.delete(sourceTabId);
    this.pendingEditorTransitionBarrier = null;
    this.editorBinding = null;
    this.state = { ...this.state, editorTransition: null };
    this.recordCanonicalSnapshot(exactSnapshot);
    const recoveryIdentity = this.pendingEditorLoadIdentity ?? this.editorBinding;
    if (recoveryIdentity !== null && recoveryIdentity.tabId === binding.tabId) {
      this.editBindings.set(binding.tabId, { identity: recoveryIdentity, binding });
    }
  }

  private isRecoveryCurrent(sourceTabId: string, recovery: RecoveryRecord): boolean {
    return !this.disposed &&
      this.recoveryByTab.get(sourceTabId) === recovery &&
      this.editBindings.get(sourceTabId)?.binding === recovery.sourceBinding;
  }

  private applyDisposableDirtyState(tabId: string, clientDirty?: boolean): void {
    const snapshot = this.state.workspaceSnapshot;
    if (snapshot === null) return;
    const dirty = (clientDirty ?? (() => {
      const state = this.editClient.getTabState(tabId);
      return state === null ? false : isPendingEditQueueDirty(state);
    })()) || this.hasPendingAdapterFrame(tabId);
    const tab = snapshot.tabs.find((candidate) => candidate.tabId === tabId);
    const document = snapshot.activeDocument?.tabId === tabId ? snapshot.activeDocument : null;
    if (tab?.isDirty === dirty && (document === null || document.isDirty === dirty)) return;
    this.updateState({
      ...this.state,
      workspaceSnapshot: {
        ...snapshot,
        tabs: snapshot.tabs.map((candidate) => candidate.tabId === tabId
          ? { ...candidate, isDirty: dirty }
          : candidate),
        activeDocument: document === null
          ? snapshot.activeDocument
          : { ...document, isDirty: dirty }
      }
    });
  }

  private deriveDisposableDirtySnapshot(
    snapshot: WorkspaceWindowSnapshot | null
  ): WorkspaceWindowSnapshot | null {
    if (snapshot === null) return null;
    const dirtyByTab = new Map<string, boolean>();
    for (const tab of snapshot.tabs) {
      const queue = this.editClient.getTabState(tab.tabId);
      const activeDocument = snapshot.activeDocument?.tabId === tab.tabId
        ? snapshot.activeDocument
        : null;
      const localStateOutrunsCanonical = queue !== null &&
        activeDocument !== null &&
        queue.observedRevision > activeDocument.revision;
      dirtyByTab.set(
        tab.tabId,
        queue === null
          ? tab.isDirty
          : queue.batches.length > 0 ||
            queue.status === "recovering" ||
            this.hasPendingAdapterFrame(tab.tabId) ||
            (localStateOutrunsCanonical && isPendingEditQueueDirty(queue)) ||
            tab.isDirty
      );
    }
    return {
      ...snapshot,
      tabs: snapshot.tabs.map((tab) => {
        const dirty = dirtyByTab.get(tab.tabId) ?? tab.isDirty;
        return tab.isDirty === dirty ? tab : { ...tab, isDirty: dirty };
      }),
      activeDocument: snapshot.activeDocument === null
        ? null
        : (() => {
            const dirty = dirtyByTab.get(snapshot.activeDocument.tabId) ??
              snapshot.activeDocument.isDirty;
            return snapshot.activeDocument.isDirty === dirty
              ? snapshot.activeDocument
              : { ...snapshot.activeDocument, isDirty: dirty };
          })()
    };
  }

  private hasPendingAdapterFrame(tabId: string): boolean {
    return this.adapterFramePendingIdentity !== null &&
      this.adapterFramePendingIdentity.tabId === tabId &&
      this.editBindings.get(tabId) !== undefined &&
      isSameEditorLoadIdentity(
        this.adapterFramePendingIdentity,
        this.editBindings.get(tabId)!.identity
      );
  }

  private async sealEditor(reason: EditorTransitionReason): Promise<void> {
    if (this.disposed) {
      throw new WorkspaceRendererApplicationDisposedError();
    }
    const token = ++this.editorTransitionSequence;
    const barrier = createEditorTransitionBarrier(token, true);
    this.pendingEditorTransitionBarrier = barrier;
    this.updateState({
      ...this.state,
      editorTransition: {
        token,
        phase: "sealing",
        reason,
        readOnly: true
      }
    });
    if (!await barrier.promise) {
      if (this.disposed) {
        throw new WorkspaceRendererApplicationDisposedError();
      }
      throw new Error("Editor read-only transition was not applied.");
    }
    this.assertActive();
  }

  private async releaseEditor(): Promise<void> {
    const current = this.state.editorTransition;
    if (current === null) {
      return;
    }
    if (this.disposed || getActiveDocument(this.state) === null) {
      this.completeEditorRelease();
      return;
    }
    const token = ++this.editorTransitionSequence;
    const barrier = createEditorTransitionBarrier(token, false);
    this.pendingEditorTransitionBarrier = barrier;
    this.editorBinding = null;
    const nextState: WorkspaceRendererApplicationState = {
      ...this.state,
      editorEpoch: this.state.editorEpoch + 1,
      editorTransition: {
        token,
        phase: "releasing",
        reason: current.reason,
        readOnly: false
      }
    };
    this.pendingEditorLoadIdentity = {
      tabId: getActiveTabId(nextState)!,
      epoch: nextState.editorEpoch,
      loadRevision: nextState.editorLoadRevision
    };
    this.updateState(nextState);
    if (!await barrier.promise) {
      this.completeEditorRelease();
    }
  }

  private completeEditorRelease(): void {
    this.pendingEditorTransitionBarrier = null;
    const hasActiveEditor = getActiveDocument(this.state) !== null;
    this.state = {
      ...this.state,
      editorTransition: null
    };
    if (!hasActiveEditor) {
      this.editorBinding = null;
      this.pendingEditorLoadIdentity = null;
    } else if (this.editorBinding === null && this.pendingEditorLoadIdentity === null) {
      this.pendingEditorLoadIdentity = this.createCurrentEditorLoadIdentity();
    }
    this.emit();
  }

  private captureReloadDraftCheckpoint(tabId: string): ReloadDraftCheckpoint | undefined {
    if (this.incrementalEditingActive) return undefined;
    const entry = this.outbox.peek(tabId);
    const activeDocument = getActiveDocument(this.state);
    if (activeDocument?.tabId === tabId) {
      return {
        content: activeDocument.content,
        cutoffGeneration: entry?.generation ?? 0
      };
    }
    return entry === undefined
      ? undefined
      : {
          content: entry.content,
          cutoffGeneration: entry.generation
        };
  }

  private restoreReloadDraftCheckpoint(
    tabId: string,
    checkpoint: ReloadDraftCheckpoint | undefined
  ): void {
    if (this.incrementalEditingActive) return;
    if (checkpoint === undefined || this.outbox.has(tabId)) {
      return;
    }
    this.outbox.set(tabId, checkpoint.content);
  }

  private getDisposedOutcome():
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "failed" }>
    | null {
    return this.disposed
      ? { kind: "failed", error: new WorkspaceRendererApplicationDisposedError() }
      : null;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new WorkspaceRendererApplicationDisposedError();
    }
  }

  private createCurrentEditorLoadIdentity(): EditorLoadIdentity | null {
    const tabId = getActiveTabId(this.state);
    return tabId === null
      ? null
      : {
          tabId,
          epoch: this.state.editorEpoch,
          loadRevision: this.state.editorLoadRevision
        };
  }

  private updateState(next: WorkspaceRendererApplicationState): void {
    if (next === this.state) {
      return;
    }
    this.state = next;
    this.emit();
  }

  private emit(): void {
    if (this.disposed) {
      return;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function applyRendererLocalWorkspaceDraft<TState extends EditorShellState>(
  current: TState,
  tabId: string,
  content: string
): TState {
  const snapshot = current.workspaceSnapshot;
  const activeDocument = snapshot?.activeDocument;
  if (!snapshot || !activeDocument || activeDocument.tabId !== tabId) {
    return current;
  }

  return {
    ...current,
    workspaceSnapshot: {
      ...snapshot,
      tabs: snapshot.tabs.map((tab) => tab.tabId === tabId
        ? { ...tab, isDirty: true }
        : tab),
      activeDocument: {
        ...activeDocument,
        content,
        isDirty: true
      }
    }
  };
}

function createEditorTransitionBarrier(
  token: number,
  readOnly: boolean
): PendingEditorTransitionBarrier {
  let resolve!: (applied: boolean) => void;
  const promise = new Promise<boolean>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { token, readOnly, promise, resolve };
}

function createRendererEditClientId(): string {
  return `renderer-${globalThis.crypto.randomUUID()}`;
}
