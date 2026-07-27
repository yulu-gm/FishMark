import type { SaveMarkdownFileResult } from "../../shared/save-markdown-file";
import type {
  ReloadWorkspaceTabFromPathError,
  WorkspaceWindowSnapshot
} from "../../shared/workspace";
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
  | "updateWorkspaceTabDraft"
>;

export type WorkspaceRendererApplicationState = EditorShellState & Readonly<{
  editorEpoch: number;
  editorTransition: "idle" | "reloading";
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

type CanonicalWorkspaceState =
  | Readonly<{ kind: "known"; snapshot: WorkspaceWindowSnapshot }>
  | Readonly<{
      kind: "unknown";
      lastKnown: WorkspaceWindowSnapshot | null;
      cause: unknown;
    }>;

type MutationFailureKind = "failed-reconciled" | "canonical-unavailable";

class WorkspaceMutationFailure extends Error {
  constructor(
    readonly kind: MutationFailureKind,
    readonly causeValue: unknown
  ) {
    super(causeValue instanceof Error ? causeValue.message : String(causeValue));
  }
}

export class WorkspaceRendererApplication {
  private readonly bridge: WorkspaceRendererBridge;
  private readonly readEditorContent: () => string;
  private readonly coordinator = new WorkspaceMutationCoordinator();
  private readonly outbox = new WorkspaceDraftOutbox();
  private readonly listeners = new Set<() => void>();
  private state: WorkspaceRendererApplicationState;
  private canonical: CanonicalWorkspaceState;
  private editorBinding: EditorLoadIdentity | null = null;
  private pendingEditorLoadIdentity: EditorLoadIdentity | null;
  private activationGeneration = 0;
  private disposed = false;
  private pendingOperationKind: string | null = null;

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
      editorTransition: "idle"
    };
    this.canonical = input.initialSnapshot
      ? { kind: "known", snapshot: input.initialSnapshot }
      : { kind: "unknown", lastKnown: null, cause: new Error("Workspace not loaded.") };
    this.pendingEditorLoadIdentity = this.createCurrentEditorLoadIdentity();
  }

  getState = (): WorkspaceRendererApplicationState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  dispose(): void {
    this.disposed = true;
    this.activationGeneration += 1;
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
    this.pendingEditorLoadIdentity = null;
    return true;
  }

  recordEditorChange(input: {
    identity: EditorLoadIdentity;
    content: string;
  }): boolean {
    if (
      this.state.editorTransition !== "idle" ||
      this.editorBinding === null ||
      !isSameEditorLoadIdentity(this.editorBinding, input.identity)
    ) {
      return false;
    }

    this.outbox.set(input.identity.tabId, input.content);
    this.updateState(applyRendererLocalWorkspaceDraft(
      this.state,
      input.identity.tabId,
      input.content
    ));
    return true;
  }

  replaceViewState(updater: (current: EditorShellState) => EditorShellState): void {
    const next = updater(this.state);
    this.updateState({
      ...next,
      editorEpoch: this.state.editorEpoch,
      editorTransition: this.state.editorTransition
    });
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
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      const cutoff = this.outbox.peek(tabId)?.generation ?? 0;
      this.startEditorTransition("reloading");

      try {
        const result = await this.bridge.reloadWorkspaceTabFromPath({ tabId });
        if (result.kind === "revision-stale") {
          this.finishEditorTransitionWithoutReplacement();
          return { kind: "revision-stale" };
        }
        if (result.kind === "error") {
          this.finishEditorTransitionWithoutReplacement();
          return { kind: "reload-error", error: result.error };
        }

        this.outbox.discardThrough(tabId, cutoff);
        const retainedNewerDraft = this.outbox.has(tabId);
        this.recordCanonicalSnapshot(result.snapshot, { forceEditorReload: true });
        return {
          kind: "committed",
          value: { retainedNewerDraft }
        };
      } catch (error) {
        this.markCanonicalUnknown(error);
        try {
          const snapshot = await this.bridge.getWorkspaceSnapshot();
          this.recordCanonicalSnapshot(snapshot, { forceEditorReload: true });
          return { kind: "failed-reconciled", error };
        } catch (reconcileError) {
          this.markCanonicalUnknown(reconcileError);
          this.finishEditorTransitionWithoutReplacement();
          return { kind: "canonical-unavailable", error: reconcileError };
        }
      }
    });
  }

  confirmWorkspaceWindowClose(
    requestId: string
  ): Promise<WorkspaceApplicationOutcome<boolean>> {
    return this.enqueue("window-close", async () => {
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      try {
        this.captureCurrentEditorContent();
        await this.drainAllDrafts();
        const value = await this.bridge.confirmWorkspaceWindowClose({ requestId });
        return { kind: "committed", value };
      } catch (error) {
        if (error instanceof WorkspaceMutationFailure) {
          return this.outcomeFromError(error);
        }
        return this.recoverMutationOutcome(error);
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
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      try {
        await this.drainTab(tabId);
        const shouldSaveAs = input.forceSaveAs ||
          capturedDocument.path === null ||
          input.hasExternalConflict;
        const value = shouldSaveAs
          ? await this.bridge.saveMarkdownFileAs({ tabId })
          : await this.bridge.saveMarkdownFile({ tabId });

        if (value.status === "success") {
          await this.drainTab(tabId);
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

  private async ensureCanonicalKnown(): Promise<
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "canonical-unavailable" }>
    | null
  > {
    if (this.canonical.kind === "known") {
      return null;
    }

    try {
      const snapshot = await this.bridge.getWorkspaceSnapshot();
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
      const known = await this.ensureCanonicalKnown();
      if (known !== null) {
        return known;
      }
      try {
        if (getActiveTabId(this.state) === tabId) {
          this.captureCurrentEditorContent();
        }
        await this.drainTab(tabId);
        const snapshot = await operation();
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
        return this.recoverMutationOutcome(error);
      }
    });
  }

  private captureCurrentEditorContent(): void {
    if (
      this.state.editorTransition !== "idle" ||
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
      this.outbox.acknowledge(entry);
      this.recordCanonicalSnapshot(snapshot);
    } catch (error) {
      const outcome = await this.recoverMutationOutcome(error);
      throw new WorkspaceMutationFailure(
        outcome.kind === "canonical-unavailable" ? "canonical-unavailable" : "failed-reconciled",
        error
      );
    }
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
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "failed-reconciled" }>
    | Extract<WorkspaceApplicationOutcome<never>, { kind: "canonical-unavailable" }>
  > {
    if (error instanceof WorkspaceMutationFailure) {
      return error.kind === "canonical-unavailable"
        ? { kind: "canonical-unavailable", error: error.causeValue }
        : { kind: "failed-reconciled", error: error.causeValue };
    }
    this.markCanonicalUnknown(error);
    try {
      const snapshot = await this.bridge.getWorkspaceSnapshot();
      this.recordCanonicalSnapshot(snapshot);
      return { kind: "failed-reconciled", error };
    } catch (reconcileError) {
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
    const nextDocument = getActiveDocument(shellState);
    const canonicalReplacement =
      previousDocument?.tabId !== nextDocument?.tabId ||
      previousDocument?.content !== nextDocument?.content ||
      (options.forceEditorReload ?? false);
    if (
      (options.forceEditorReload ?? false) &&
      shellState.editorLoadRevision === previousState.editorLoadRevision
    ) {
      shellState = {
        ...shellState,
        editorLoadRevision: shellState.editorLoadRevision + 1
      };
    }

    const activeTabId = getActiveTabId(shellState);
    const pendingContent = activeTabId === null ? undefined : this.outbox.get(activeTabId);
    if (activeTabId !== null && pendingContent !== undefined) {
      shellState = applyRendererLocalWorkspaceDraft(shellState, activeTabId, pendingContent);
    }

    if (canonicalReplacement) {
      this.editorBinding = null;
      this.state = {
        ...shellState,
        editorEpoch: previousState.editorEpoch + 1,
        editorTransition: "idle"
      };
      this.pendingEditorLoadIdentity = this.createCurrentEditorLoadIdentity();
    } else {
      this.state = {
        ...shellState,
        editorEpoch: previousState.editorEpoch,
        editorTransition: "idle"
      };
    }
    this.emit();
  }

  private startEditorTransition(transition: "reloading"): void {
    this.editorBinding = null;
    this.pendingEditorLoadIdentity = null;
    this.updateState({
      ...this.state,
      editorTransition: transition
    });
  }

  private finishEditorTransitionWithoutReplacement(): void {
    this.state = {
      ...this.state,
      editorEpoch: this.state.editorEpoch + 1,
      editorTransition: "idle"
    };
    this.editorBinding = null;
    this.pendingEditorLoadIdentity = this.createCurrentEditorLoadIdentity();
    this.emit();
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
