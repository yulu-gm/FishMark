import type {
  WorkspaceDocumentSnapshot,
  WorkspaceWindowSnapshot
} from "../../shared/workspace";

export type OpenState = "idle" | "opening";

export type ExternalMarkdownFileState =
  | { status: "idle" }
  | {
      status: "pending" | "keeping-memory";
      path: string;
      kind: "modified" | "deleted";
    };

export type EditorShellState = {
  workspaceSnapshot: WorkspaceWindowSnapshot | null;
  editorLoadRevision: number;
  openState: OpenState;
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

export function getActiveTabId(state: EditorShellState): string | null {
  return state.workspaceSnapshot?.activeTabId ?? null;
}

export function applyWorkspaceSnapshot(
  currentState: EditorShellState,
  snapshot: WorkspaceWindowSnapshot
): EditorShellState {
  const currentActiveDocument = getActiveDocument(currentState);
  const nextActiveDocument = snapshot.activeDocument;
  const activeDocumentChanged =
    currentActiveDocument?.tabId !== nextActiveDocument?.tabId ||
    currentActiveDocument?.content !== nextActiveDocument?.content;

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
