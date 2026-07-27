import type { DiskVersion } from "./disk-version";
import type { DocumentRevision } from "./document-revision";
import {
  sameFileIdentity,
  type FileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity
} from "./file-identity";
import {
  commitSavedDocument,
  createDocumentSession,
  moveDocumentSession,
  projectDocumentSession,
  replaceDocumentFromDisk,
  replaceDocumentText,
  type DocumentSaveState,
  type DocumentSessionProjection,
  type DocumentSessionState,
  type WorkspaceDocumentData
} from "./document-session";

const UNTITLED_DOCUMENT_NAME = "Untitled.md";

export interface WorkspaceTabProjection {
  readonly tabId: string;
  readonly path: string | null;
  readonly name: string;
  readonly isDirty: boolean;
  readonly saveState: DocumentSaveState;
}

export interface WorkspaceDocumentProjection {
  readonly tabId: string;
  readonly path: string | null;
  readonly name: string;
  readonly content: string;
  readonly encoding: "utf-8";
  readonly isDirty: boolean;
  readonly saveState: DocumentSaveState;
}

export interface WorkspaceWindowProjection {
  readonly windowId: string;
  readonly activeTabId: string | null;
  readonly tabs: readonly WorkspaceTabProjection[];
  readonly activeDocument: WorkspaceDocumentProjection | null;
}

export interface WorkspaceMoveProjection {
  readonly sourceWindowSnapshot: WorkspaceWindowProjection;
  readonly targetWindowSnapshot: WorkspaceWindowProjection;
}

export interface CommitWorkspaceDocumentInput {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly capturedRevision: DocumentRevision;
  readonly document: WorkspaceDocumentData;
  readonly diskVersion: DiskVersion | null;
}

export interface ReplaceWorkspaceDocumentInput {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly expectedRevision: DocumentRevision;
  readonly document: WorkspaceDocumentData;
}

export interface UpdateWorkspaceTabDraftInput {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly content: string;
}

export interface CloseWorkspaceTabInput {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly expectedRevision: DocumentRevision;
}

export interface ReorderWorkspaceTabInput {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly targetIndex: number;
}

export type WorkspaceMutationStaleReason =
  | "tab-missing"
  | "window-missing"
  | "window-changed"
  | "revision-changed";

export type WorkspaceMutationResult =
  | {
      readonly kind: "applied";
      readonly projection: WorkspaceWindowProjection;
    }
  | {
      readonly kind: "stale";
      readonly reason: WorkspaceMutationStaleReason;
      readonly projection: WorkspaceWindowProjection | null;
    };

export type WorkspaceSaveMutationResult =
  | WorkspaceMutationResult
  | {
      readonly kind: "file-identity-conflict";
      readonly projection: WorkspaceWindowProjection;
    };

export type OpenWorkspaceDocumentResult =
  | { readonly kind: "opened"; readonly projection: WorkspaceWindowProjection }
  | {
      readonly kind: "activated-existing";
      readonly projection: WorkspaceWindowProjection;
    }
  | {
      readonly kind: "owned-by-other-window";
      readonly ownerWindowId: string;
    };

export interface WorkspaceFileOwner {
  readonly tabId: string;
  readonly windowId: string;
}

export interface MoveWorkspaceTabInput {
  readonly tabId: string;
  readonly targetWindowId: string;
  readonly targetIndex?: number;
}

export interface DetachWorkspaceTabInput {
  readonly tabId: string;
  readonly targetWindowId: string;
  readonly targetIndex?: number;
}

export interface WorkspaceState {
  readonly registerWindow: (windowId: string) => WorkspaceWindowProjection;
  readonly unregisterWindow: (windowId: string) => void;
  readonly focusWindow: (windowId: string) => void;
  readonly getLastFocusedWindowId: () => string | null;
  readonly getWindowProjection: (windowId: string) => WorkspaceWindowProjection;
  readonly getWindowProjectionOrNull: (
    windowId: string
  ) => WorkspaceWindowProjection | null;
  readonly getWindowTabIds: (windowId: string) => readonly string[];
  readonly getTabSession: (tabId: string) => DocumentSessionProjection;
  readonly getFileOwner: (fileIdentity: FileIdentity) => WorkspaceFileOwner | null;
  readonly createUntitledTab: (windowId: string) => WorkspaceWindowProjection;
  readonly openDocument: (
    windowId: string,
    document: WorkspaceDocumentData
  ) => OpenWorkspaceDocumentResult;
  readonly activateTab: (
    windowId: string,
    tabId: string
  ) => WorkspaceWindowProjection;
  readonly updateTabDraft: (
    input: UpdateWorkspaceTabDraftInput
  ) => WorkspaceMutationResult;
  readonly saveTabDocument: (
    input: CommitWorkspaceDocumentInput
  ) => WorkspaceSaveMutationResult;
  readonly replaceTabDocument: (
    input: ReplaceWorkspaceDocumentInput
  ) => WorkspaceSaveMutationResult;
  readonly closeTab: (input: CloseWorkspaceTabInput) => WorkspaceMutationResult;
  readonly reorderTab: (
    input: ReorderWorkspaceTabInput
  ) => WorkspaceMutationResult;
  readonly moveTabToWindow: (input: MoveWorkspaceTabInput) => WorkspaceMoveProjection;
  readonly detachTabToWindow: (
    input: DetachWorkspaceTabInput
  ) => WorkspaceMoveProjection;
}

interface WindowSession {
  readonly windowId: string;
  readonly tabIds: string[];
  activeTabId: string | null;
}

interface TabContext {
  readonly session: DocumentSessionState;
  readonly windowId: string;
  readonly window: WindowSession;
  readonly index: number;
}

class CanonicalWorkspaceState implements WorkspaceState {
  private readonly windows = new Map<string, WindowSession>();
  private readonly tabs = new Map<string, DocumentSessionState>();
  private readonly tabToWindowId = new Map<string, string>();
  private readonly fileLocationToTabId = new Map<FileLocationIdentity, string>();
  private readonly fileObjectToTabId = new Map<FileObjectIdentity, string>();
  private nextTabId = 1;
  private lastFocusedWindowId: string | null = null;

  registerWindow(windowId: string): WorkspaceWindowProjection {
    if (!this.windows.has(windowId)) {
      this.windows.set(windowId, createWindowSession(windowId));
    }

    this.lastFocusedWindowId = windowId;
    return this.getWindowProjection(windowId);
  }

  unregisterWindow(windowId: string): void {
    const window = this.windows.get(windowId);
    if (window === undefined) {
      return;
    }

    for (const tabId of window.tabIds) {
      const identity = this.tabs.get(tabId)?.fileIdentity;
      if (identity !== null && identity !== undefined) {
        this.releaseFileIdentity(identity);
      }
      this.tabs.delete(tabId);
      this.tabToWindowId.delete(tabId);
    }
    this.windows.delete(windowId);

    if (this.lastFocusedWindowId === windowId) {
      this.lastFocusedWindowId = this.windows.keys().next().value ?? null;
    }
  }

  focusWindow(windowId: string): void {
    this.getWindow(windowId);
    this.lastFocusedWindowId = windowId;
  }

  getLastFocusedWindowId(): string | null {
    return this.lastFocusedWindowId;
  }

  getWindowProjection(windowId: string): WorkspaceWindowProjection {
    const window = this.getWindow(windowId);
    const tabs = freezeArray(
      window.tabIds.map((tabId) => createTabProjection(this.getTab(tabId)))
    );
    const activeDocument =
      window.activeTabId === null
        ? null
        : createDocumentProjection(this.getTab(window.activeTabId));

    return Object.freeze({
      windowId: window.windowId,
      activeTabId: window.activeTabId,
      tabs,
      activeDocument
    });
  }

  getWindowProjectionOrNull(windowId: string): WorkspaceWindowProjection | null {
    return this.windows.has(windowId)
      ? this.getWindowProjection(windowId)
      : null;
  }

  getWindowTabIds(windowId: string): readonly string[] {
    return Object.freeze([...this.getWindow(windowId).tabIds]);
  }

  getTabSession(tabId: string): DocumentSessionProjection {
    return projectDocumentSession(this.getTab(tabId));
  }

  getFileOwner(fileIdentity: FileIdentity): WorkspaceFileOwner | null {
    const tabId = this.findIdentityOwnerTabId(fileIdentity);
    if (tabId === undefined) {
      return null;
    }
    const windowId = this.tabToWindowId.get(tabId);
    if (windowId === undefined) {
      throw new Error("File identity has no workspace owner.");
    }
    return Object.freeze({ tabId, windowId });
  }

  createUntitledTab(windowId: string): WorkspaceWindowProjection {
    return this.appendDocument(windowId, {
      fileIdentity: null,
      path: null,
      name: UNTITLED_DOCUMENT_NAME,
      content: "",
      encoding: "utf-8"
    });
  }

  openDocument(
    windowId: string,
    document: WorkspaceDocumentData
  ): OpenWorkspaceDocumentResult {
    if (document.fileIdentity === null) {
      throw new TypeError("Opened files require a physical file identity.");
    }
    const owner = this.getFileOwner(document.fileIdentity);
    if (owner !== null) {
      if (owner.windowId !== windowId) {
        return Object.freeze({
          kind: "owned-by-other-window",
          ownerWindowId: owner.windowId
        });
      }
      return Object.freeze({
        kind: "activated-existing",
        projection: this.activateTab(windowId, owner.tabId)
      });
    }
    return Object.freeze({
      kind: "opened",
      projection: this.appendDocument(windowId, document)
    });
  }

  activateTab(windowId: string, tabId: string): WorkspaceWindowProjection {
    const window = this.getWindow(windowId);
    if (!window.tabIds.includes(tabId)) {
      throw new Error(`Unknown tab '${tabId}' for window '${windowId}'.`);
    }

    window.activeTabId = tabId;
    this.lastFocusedWindowId = windowId;
    return this.getWindowProjection(windowId);
  }

  updateTabDraft({
    tabId,
    expectedWindowId,
    content
  }: UpdateWorkspaceTabDraftInput): WorkspaceMutationResult {
    const resolved = this.resolveExpectedTabOwner(tabId, expectedWindowId);
    if (resolved.kind === "stale") {
      return this.createStaleMutationResult(expectedWindowId, resolved.reason);
    }
    const { context } = resolved;
    const nextSession = replaceDocumentText(context.session, content);
    this.tabs.set(tabId, nextSession);
    return createAppliedMutationResult(this.getWindowProjection(context.windowId));
  }

  saveTabDocument({
    tabId,
    expectedWindowId,
    capturedRevision,
    document,
    diskVersion
  }: CommitWorkspaceDocumentInput): WorkspaceSaveMutationResult {
    const resolved = this.resolveExpectedTabOwner(tabId, expectedWindowId);
    if (resolved.kind === "stale") {
      return this.createStaleMutationResult(expectedWindowId, resolved.reason);
    }
    const { context } = resolved;
    const nextIdentity = document.fileIdentity;
    const currentIdentity = context.session.fileIdentity;
    if (nextIdentity !== null && !sameFileIdentity(nextIdentity, currentIdentity)) {
      const existingTabId = this.findIdentityOwnerTabId(nextIdentity);
      if (existingTabId !== undefined && existingTabId !== tabId) {
        return Object.freeze({
          kind: "file-identity-conflict",
          projection: this.getWindowProjection(context.windowId)
        });
      }
    }
    const nextSession = commitSavedDocument(context.session, {
      capturedRevision,
      document,
      diskVersion
    });
    this.tabs.set(tabId, nextSession);
    if (!sameFileIdentity(currentIdentity, nextIdentity)) {
      if (currentIdentity !== null) {
        this.releaseFileIdentity(currentIdentity);
      }
      if (nextIdentity !== null) {
        this.claimFileIdentity(nextIdentity, tabId);
      }
    }
    return createAppliedMutationResult(this.getWindowProjection(context.windowId));
  }

  replaceTabDocument({
    tabId,
    expectedWindowId,
    expectedRevision,
    document
  }: ReplaceWorkspaceDocumentInput): WorkspaceSaveMutationResult {
    const resolved = this.resolveExpectedTabCheckpoint(
      tabId,
      expectedWindowId,
      expectedRevision
    );
    if (resolved.kind === "stale") {
      return this.createStaleMutationResult(expectedWindowId, resolved.reason);
    }
    const { context } = resolved;
    const currentIdentity = context.session.fileIdentity;
    const nextIdentity = document.fileIdentity;
    if (currentIdentity === null || nextIdentity === null) {
      throw new Error("Reload requires a physical file identity.");
    }
    if (nextIdentity.location !== currentIdentity.location) {
      throw new Error("Reload cannot change the canonical file location.");
    }
    if (!sameFileIdentity(nextIdentity, currentIdentity)) {
      const existingTabId = this.findIdentityOwnerTabId(nextIdentity);
      if (existingTabId !== undefined && existingTabId !== tabId) {
        return Object.freeze({
          kind: "file-identity-conflict",
          projection: this.getWindowProjection(context.windowId)
        });
      }
    }
    const nextSession = replaceDocumentFromDisk(context.session, document, null);
    this.tabs.set(tabId, nextSession);
    if (!sameFileIdentity(nextIdentity, currentIdentity)) {
      this.releaseFileIdentity(currentIdentity);
      this.claimFileIdentity(nextIdentity, tabId);
    }
    return createAppliedMutationResult(this.getWindowProjection(context.windowId));
  }

  closeTab({
    tabId,
    expectedWindowId,
    expectedRevision
  }: CloseWorkspaceTabInput): WorkspaceMutationResult {
    const resolved = this.resolveExpectedTabCheckpoint(
      tabId,
      expectedWindowId,
      expectedRevision
    );
    if (resolved.kind === "stale") {
      return this.createStaleMutationResult(expectedWindowId, resolved.reason);
    }
    const { context } = resolved;

    if (context.session.fileIdentity !== null) {
      this.releaseFileIdentity(context.session.fileIdentity);
    }

    context.window.tabIds.splice(context.index, 1);
    this.tabs.delete(tabId);
    this.tabToWindowId.delete(tabId);

    if (context.window.activeTabId === tabId) {
      context.window.activeTabId =
        context.window.tabIds.length === 0
          ? null
          : (context.window.tabIds[
              Math.min(context.index, context.window.tabIds.length - 1)
            ] ?? null);
    }

    return createAppliedMutationResult(this.getWindowProjection(context.windowId));
  }

  reorderTab({
    tabId,
    expectedWindowId,
    targetIndex
  }: ReorderWorkspaceTabInput): WorkspaceMutationResult {
    const resolved = this.resolveExpectedTabOwner(tabId, expectedWindowId);
    if (resolved.kind === "stale") {
      return this.createStaleMutationResult(expectedWindowId, resolved.reason);
    }
    const { context } = resolved;
    validateTargetIndex(targetIndex);
    return createAppliedMutationResult(
      this.reorderWithinWindow(tabId, targetIndex, context)
    );
  }

  private reorderWithinWindow(
    tabId: string,
    targetIndex: number,
    context: TabContext
  ): WorkspaceWindowProjection {
    const clampedIndex = clampIndex(targetIndex, context.window.tabIds.length - 1);

    if (context.index !== clampedIndex) {
      context.window.tabIds.splice(context.index, 1);
      context.window.tabIds.splice(clampedIndex, 0, tabId);
    }

    return this.getWindowProjection(context.windowId);
  }

  moveTabToWindow(input: MoveWorkspaceTabInput): WorkspaceMoveProjection {
    const source = this.getTabContext(input.tabId);
    const targetWindow = this.getWindow(input.targetWindowId);
    validateOptionalTargetIndex(input.targetIndex);

    if (source.windowId === input.targetWindowId) {
      const sourceWindowSnapshot = this.reorderWithinWindow(
        input.tabId,
        input.targetIndex ?? source.index,
        source
      );
      return Object.freeze({
        sourceWindowSnapshot,
        targetWindowSnapshot: this.getWindowProjection(input.targetWindowId)
      });
    }

    return this.moveAcrossWindows(input, source, targetWindow);
  }

  detachTabToWindow(input: DetachWorkspaceTabInput): WorkspaceMoveProjection {
    const source = this.getTabContext(input.tabId);
    validateOptionalTargetIndex(input.targetIndex);
    const existingTarget = this.windows.get(input.targetWindowId);

    if (existingTarget !== undefined) {
      if (source.windowId === input.targetWindowId) {
        const sourceWindowSnapshot = this.reorderWithinWindow(
          input.tabId,
          input.targetIndex ?? source.index,
          source
        );
        return Object.freeze({
          sourceWindowSnapshot,
          targetWindowSnapshot: this.getWindowProjection(input.targetWindowId)
        });
      }
      return this.moveAcrossWindows(input, source, existingTarget);
    }

    const targetWindow = createWindowSession(input.targetWindowId);
    const movedSession = moveDocumentSession(source.session, input.targetWindowId);
    const insertionIndex = clampIndex(input.targetIndex ?? 0, 0);

    source.window.tabIds.splice(source.index, 1);
    this.selectNeighborAfterMove(source);
    targetWindow.tabIds.splice(insertionIndex, 0, input.tabId);
    targetWindow.activeTabId = input.tabId;
    this.tabs.set(input.tabId, movedSession);
    this.tabToWindowId.set(input.tabId, input.targetWindowId);
    this.windows.set(input.targetWindowId, targetWindow);
    this.lastFocusedWindowId = input.targetWindowId;

    return Object.freeze({
      sourceWindowSnapshot: this.getWindowProjection(source.windowId),
      targetWindowSnapshot: this.getWindowProjection(input.targetWindowId)
    });
  }

  private appendDocument(
    windowId: string,
    document: WorkspaceDocumentData
  ): WorkspaceWindowProjection {
    const window = this.getWindow(windowId);
    const tabId = `tab-${this.nextTabId}`;
    const session = createDocumentSession({ tabId, windowId, document });

    this.nextTabId += 1;
    this.tabs.set(tabId, session);
    if (session.fileIdentity !== null) {
      this.claimFileIdentity(session.fileIdentity, tabId);
    }
    this.tabToWindowId.set(tabId, windowId);
    window.tabIds.push(tabId);
    window.activeTabId = tabId;
    return this.getWindowProjection(windowId);
  }

  private moveAcrossWindows(
    input: MoveWorkspaceTabInput | DetachWorkspaceTabInput,
    source: TabContext,
    targetWindow: WindowSession
  ): WorkspaceMoveProjection {
    const insertionIndex = clampIndex(
      input.targetIndex ?? targetWindow.tabIds.length,
      targetWindow.tabIds.length
    );
    const movedSession = moveDocumentSession(source.session, input.targetWindowId);

    source.window.tabIds.splice(source.index, 1);
    this.selectNeighborAfterMove(source);
    targetWindow.tabIds.splice(insertionIndex, 0, input.tabId);
    targetWindow.activeTabId = input.tabId;
    this.tabs.set(input.tabId, movedSession);
    this.tabToWindowId.set(input.tabId, input.targetWindowId);
    this.lastFocusedWindowId = input.targetWindowId;

    return Object.freeze({
      sourceWindowSnapshot: this.getWindowProjection(source.windowId),
      targetWindowSnapshot: this.getWindowProjection(input.targetWindowId)
    });
  }

  private findIdentityOwnerTabId(identity: FileIdentity): string | undefined {
    return this.fileLocationToTabId.get(identity.location) ??
      this.fileObjectToTabId.get(identity.object);
  }

  private claimFileIdentity(identity: FileIdentity, tabId: string): void {
    this.fileLocationToTabId.set(identity.location, tabId);
    this.fileObjectToTabId.set(identity.object, tabId);
  }

  private releaseFileIdentity(identity: FileIdentity): void {
    this.fileLocationToTabId.delete(identity.location);
    this.fileObjectToTabId.delete(identity.object);
  }

  private selectNeighborAfterMove(source: TabContext): void {
    if (source.window.activeTabId !== source.session.tabId) {
      return;
    }

    source.window.activeTabId =
      source.window.tabIds.length === 0
        ? null
        : (source.window.tabIds[
            Math.min(source.index, source.window.tabIds.length - 1)
          ] ?? null);
  }

  private getWindow(windowId: string): WindowSession {
    const window = this.windows.get(windowId);
    if (window === undefined) {
      throw new Error(`Unknown workspace window '${windowId}'.`);
    }
    return window;
  }

  private getTab(tabId: string): DocumentSessionState {
    const tab = this.tabs.get(tabId);
    if (tab === undefined) {
      throw new Error(`Unknown workspace tab '${tabId}'.`);
    }
    return tab;
  }

  private getTabContext(tabId: string): TabContext {
    const session = this.getTab(tabId);
    const windowId = this.tabToWindowId.get(tabId);
    if (windowId === undefined) {
      throw new Error(`Workspace tab '${tabId}' is not attached to a window.`);
    }
    const window = this.getWindow(windowId);
    const index = window.tabIds.indexOf(tabId);
    if (index < 0) {
      throw new Error(`Unknown tab '${tabId}' for window '${windowId}'.`);
    }
    return { session, windowId, window, index };
  }

  private resolveExpectedTabOwner(
    tabId: string,
    expectedWindowId: string
  ):
    | { readonly kind: "current"; readonly context: TabContext }
    | { readonly kind: "stale"; readonly reason: WorkspaceMutationStaleReason } {
    if (!this.tabs.has(tabId)) {
      return { kind: "stale", reason: "tab-missing" };
    }

    if (this.tabToWindowId.get(tabId) !== expectedWindowId) {
      return { kind: "stale", reason: "window-changed" };
    }

    return { kind: "current", context: this.getTabContext(tabId) };
  }

  private resolveExpectedTabCheckpoint(
    tabId: string,
    expectedWindowId: string,
    expectedRevision: DocumentRevision
  ):
    | { readonly kind: "current"; readonly context: TabContext }
    | { readonly kind: "stale"; readonly reason: WorkspaceMutationStaleReason } {
    const resolved = this.resolveExpectedTabOwner(tabId, expectedWindowId);
    if (resolved.kind === "stale") {
      return resolved;
    }

    return resolved.context.session.revision === expectedRevision
      ? resolved
      : { kind: "stale", reason: "revision-changed" };
  }

  private createStaleMutationResult(
    expectedWindowId: string,
    reason: WorkspaceMutationStaleReason
  ): WorkspaceMutationResult {
    const projection = this.getWindowProjectionOrNull(expectedWindowId);
    if (projection === null) {
      return Object.freeze({
        kind: "stale",
        reason: "window-missing",
        projection: null
      });
    }

    return Object.freeze({
      kind: "stale",
      reason,
      projection
    });
  }
}

export function createWorkspaceState(): WorkspaceState {
  return new CanonicalWorkspaceState();
}

function createWindowSession(windowId: string): WindowSession {
  return { windowId, tabIds: [], activeTabId: null };
}

function createTabProjection(session: DocumentSessionState): WorkspaceTabProjection {
  const projection = projectDocumentSession(session);
  return Object.freeze({
    tabId: projection.tabId,
    path: projection.path,
    name: projection.name,
    isDirty: projection.isDirty,
    saveState: projection.saveState
  });
}

function createDocumentProjection(
  session: DocumentSessionState
): WorkspaceDocumentProjection {
  const projection = projectDocumentSession(session);
  return Object.freeze({
    tabId: projection.tabId,
    path: projection.path,
    name: projection.name,
    content: projection.content,
    encoding: projection.encoding,
    isDirty: projection.isDirty,
    saveState: projection.saveState
  });
}

function validateOptionalTargetIndex(targetIndex: number | undefined): void {
  if (targetIndex !== undefined) {
    validateTargetIndex(targetIndex);
  }
}

function validateTargetIndex(targetIndex: number): void {
  if (!Number.isFinite(targetIndex) || !Number.isInteger(targetIndex)) {
    throw new RangeError("Workspace tab index must be a finite integer.");
  }
}

function clampIndex(targetIndex: number, maximum: number): number {
  return Math.max(0, Math.min(targetIndex, maximum));
}

function freezeArray<T>(values: T[]): readonly T[] {
  return Object.freeze(values);
}

function createAppliedMutationResult(
  projection: WorkspaceWindowProjection
): WorkspaceMutationResult {
  return Object.freeze({ kind: "applied", projection });
}
