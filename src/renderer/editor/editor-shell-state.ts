import type { ExternalMarkdownFileChangedEvent } from "../../shared/external-file-change";
import type {
  WorkspaceDocumentSnapshot,
  WorkspaceTabStripItem,
  WorkspaceWindowSnapshot
} from "../../shared/workspace";

export type OpenState = "idle" | "opening";

export type ExternalMarkdownFileState =
  | { status: "idle" }
  | {
      status: "pending" | "keeping-memory";
      path: string;
      kind: ExternalMarkdownFileChangedEvent["kind"];
    };

export type EditorShellState = {
  workspaceSnapshot: WorkspaceWindowSnapshot | null;
  editorLoadRevision: number;
  openState: OpenState;
};

type ApplyWorkspaceSnapshotOptions = {
  currentEditorContent?: string;
};

export function createInitialEditorShellState(): EditorShellState {
  return {
    workspaceSnapshot: null,
    editorLoadRevision: 0,
    openState: "idle"
  };
}

export function getActiveDocument(state: EditorShellState): WorkspaceDocumentSnapshot | null {
  return state.workspaceSnapshot?.activeDocument ?? null;
}

export function getWorkspaceTabs(state: EditorShellState): WorkspaceTabStripItem[] {
  return state.workspaceSnapshot?.tabs ?? [];
}

export function getActiveTabId(state: EditorShellState): string | null {
  return state.workspaceSnapshot?.activeTabId ?? null;
}

export function applyWorkspaceSnapshot(
  currentState: EditorShellState,
  snapshot: WorkspaceWindowSnapshot,
  options: ApplyWorkspaceSnapshotOptions = {}
): EditorShellState {
  const currentActiveDocument = getActiveDocument(currentState);
  const nextActiveDocument = snapshot.activeDocument;
  const activeDocumentChanged =
    currentActiveDocument?.tabId !== nextActiveDocument?.tabId ||
    shouldReloadActiveDocumentFromSnapshot({
      currentActiveDocument,
      nextActiveDocument,
      currentEditorContent: options.currentEditorContent
    });

  return {
    workspaceSnapshot: snapshot,
    editorLoadRevision: activeDocumentChanged
      ? currentState.editorLoadRevision + 1
      : currentState.editorLoadRevision,
    openState: currentState.openState
  };
}

export function setOpenState(currentState: EditorShellState, openState: OpenState): EditorShellState {
  if (currentState.openState === openState) {
    return currentState;
  }

  return {
    ...currentState,
    openState
  };
}

export function applyExternalMarkdownFileChanged(
  currentState: ExternalMarkdownFileState,
  activeDocument: WorkspaceDocumentSnapshot | null,
  event: ExternalMarkdownFileChangedEvent
): ExternalMarkdownFileState {
  if (!activeDocument?.path || activeDocument.path !== event.path) {
    return currentState;
  }

  return {
    status: "pending",
    path: event.path,
    kind: event.kind
  };
}

export function keepExternalMarkdownMemoryVersion(
  currentState: ExternalMarkdownFileState
): ExternalMarkdownFileState {
  if (currentState.status !== "pending") {
    return currentState;
  }

  return {
    ...currentState,
    status: "keeping-memory"
  };
}

export function clearExternalMarkdownFileState(): ExternalMarkdownFileState {
  return { status: "idle" };
}

function shouldReloadActiveDocumentFromSnapshot(input: {
  currentActiveDocument: WorkspaceDocumentSnapshot | null;
  nextActiveDocument: WorkspaceDocumentSnapshot | null;
  currentEditorContent: string | undefined;
}): boolean {
  if (input.currentActiveDocument?.content === input.nextActiveDocument?.content) {
    return false;
  }

  if (
    input.currentEditorContent !== undefined &&
    input.currentActiveDocument?.tabId === input.nextActiveDocument?.tabId &&
    input.currentEditorContent !== input.currentActiveDocument?.content
  ) {
    return false;
  }

  return true;
}
