import type { DiskVersion } from "./disk-version";
import type { DocumentRevision } from "./document-revision";
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

export interface CloseWorkspaceTabInput {
  readonly tabId: string;
  readonly expectedWindowId: string;
  readonly expectedRevision: DocumentRevision;
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
  readonly getTabPath: (tabId: string | null) => string | null;
  readonly createUntitledTab: (windowId: string) => WorkspaceWindowProjection;
  readonly openDocument: (
    windowId: string,
    document: WorkspaceDocumentData
  ) => WorkspaceWindowProjection;
  readonly activateTab: (
    windowId: string,
    tabId: string
  ) => WorkspaceWindowProjection;
  readonly updateTabDraft: (
    tabId: string,
    content: string
  ) => WorkspaceWindowProjection;
  readonly saveTabDocument: (
    input: CommitWorkspaceDocumentInput
  ) => WorkspaceMutationResult;
  readonly replaceTabDocument: (
    input: ReplaceWorkspaceDocumentInput
  ) => WorkspaceMutationResult;
  readonly closeTab: (input: CloseWorkspaceTabInput) => WorkspaceMutationResult;
  readonly reorderTab: (
    tabId: string,
    targetIndex: number
  ) => WorkspaceWindowProjection;
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

  getTabPath(tabId: string | null): string | null {
    return tabId === null ? null : this.getTab(tabId).path;
  }

  createUntitledTab(windowId: string): WorkspaceWindowProjection {
    return this.appendDocument(windowId, {
      path: null,
      name: UNTITLED_DOCUMENT_NAME,
      content: "",
      encoding: "utf-8"
    });
  }

  openDocument(
    windowId: string,
    document: WorkspaceDocumentData
  ): WorkspaceWindowProjection {
    return this.appendDocument(windowId, document);
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

  updateTabDraft(tabId: string, content: string): WorkspaceWindowProjection {
    const context = this.getTabContext(tabId);
    const nextSession = replaceDocumentText(context.session, content);
    this.tabs.set(tabId, nextSession);
    return this.getWindowProjection(context.windowId);
  }

  saveTabDocument({
    tabId,
    expectedWindowId,
    capturedRevision,
    document,
    diskVersion
  }: CommitWorkspaceDocumentInput): WorkspaceMutationResult {
    const resolved = this.resolveExpectedTabOwner(tabId, expectedWindowId);
    if (resolved.kind === "stale") {
      return this.createStaleMutationResult(expectedWindowId, resolved.reason);
    }
    const { context } = resolved;
    const nextSession = commitSavedDocument(context.session, {
      capturedRevision,
      document,
      diskVersion
    });
    this.tabs.set(tabId, nextSession);
    return createAppliedMutationResult(this.getWindowProjection(context.windowId));
  }

  replaceTabDocument({
    tabId,
    expectedWindowId,
    expectedRevision,
    document
  }: ReplaceWorkspaceDocumentInput): WorkspaceMutationResult {
    const resolved = this.resolveExpectedTabCheckpoint(
      tabId,
      expectedWindowId,
      expectedRevision
    );
    if (resolved.kind === "stale") {
      return this.createStaleMutationResult(expectedWindowId, resolved.reason);
    }
    const { context } = resolved;
    const nextSession = replaceDocumentFromDisk(context.session, document, null);
    this.tabs.set(tabId, nextSession);
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

  reorderTab(tabId: string, targetIndex: number): WorkspaceWindowProjection {
    const context = this.getTabContext(tabId);
    validateTargetIndex(targetIndex);
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
      const sourceWindowSnapshot = this.reorderTab(
        input.tabId,
        input.targetIndex ?? source.index
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
        const sourceWindowSnapshot = this.reorderTab(
          input.tabId,
          input.targetIndex ?? source.index
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
