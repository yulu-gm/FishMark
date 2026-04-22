import type {
  OpenMarkdownDocument,
  OpenMarkdownFileResult
} from "../shared/open-markdown-file";
import type { ExternalMarkdownFileChangedEvent } from "../shared/external-file-change";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";

export type OpenState = "idle" | "opening";
export type SaveState = "idle" | "manual-saving" | "autosaving";
const UNTITLED_DOCUMENT_NAME = "Untitled.md";

export type ExternalMarkdownFileState =
  | { status: "idle" }
  | {
      status: "pending" | "keeping-memory";
      path: string;
      kind: ExternalMarkdownFileChangedEvent["kind"];
    };

export type AppState = {
  currentDocument: OpenMarkdownDocument | null;
  editorLoadRevision: number;
  openState: OpenState;
  saveState: SaveState;
  isDirty: boolean;
  lastSavedContent: string | null;
  externalFileState: ExternalMarkdownFileState;
};

export function createInitialAppState(): AppState {
  return {
    currentDocument: null,
    editorLoadRevision: 0,
    openState: "idle",
    saveState: "idle",
    isDirty: false,
    lastSavedContent: null,
    externalFileState: { status: "idle" }
  };
}

export function createNewMarkdownDocumentState(currentState: AppState): AppState {
  return {
    currentDocument: {
      path: null,
      name: UNTITLED_DOCUMENT_NAME,
      content: "",
      encoding: "utf-8"
    },
    editorLoadRevision: currentState.editorLoadRevision + 1,
    openState: "idle",
    saveState: "idle",
    isDirty: false,
    lastSavedContent: "",
    externalFileState: { status: "idle" }
  };
}

export function startOpeningMarkdownFile(currentState: AppState): AppState {
  return {
    ...currentState,
    openState: "opening"
  };
}

export function applyOpenMarkdownResult(
  currentState: AppState,
  result: OpenMarkdownFileResult
): AppState {
  if (result.status === "success") {
    return {
      currentDocument: result.document,
      editorLoadRevision: currentState.editorLoadRevision + 1,
      openState: "idle",
      saveState: "idle",
      isDirty: false,
      lastSavedContent: result.document.content,
      externalFileState: { status: "idle" }
    };
  }

  return {
    ...currentState,
    openState: "idle"
  };
}

export function applyEditorContentChanged(currentState: AppState, nextContent: string): AppState {
  if (!currentState.currentDocument) {
    return currentState;
  }

  return {
    ...currentState,
    isDirty: nextContent !== currentState.lastSavedContent
  };
}

export function startManualSavingDocument(currentState: AppState): AppState {
  return {
    ...currentState,
    saveState: "manual-saving"
  };
}

export function startAutosavingDocument(currentState: AppState): AppState {
  return {
    ...currentState,
    saveState: "autosaving"
  };
}

export function applySaveMarkdownResult(
  currentState: AppState,
  result: SaveMarkdownFileResult
): AppState {
  if (result.status === "success") {
    return {
      ...currentState,
      currentDocument: result.document,
      saveState: "idle",
      isDirty: false,
      lastSavedContent: result.document.content,
      externalFileState: { status: "idle" }
    };
  }

  return {
    ...currentState,
    saveState: "idle"
  };
}

export function applyExternalMarkdownFileChanged(
  currentState: AppState,
  event: ExternalMarkdownFileChangedEvent
): AppState {
  if (!currentState.currentDocument?.path || currentState.currentDocument.path !== event.path) {
    return currentState;
  }

  return {
    ...currentState,
    externalFileState: {
      status: "pending",
      path: event.path,
      kind: event.kind
    }
  };
}

export function keepExternalMarkdownMemoryVersion(currentState: AppState): AppState {
  if (currentState.externalFileState.status !== "pending") {
    return currentState;
  }

  return {
    ...currentState,
    externalFileState: {
      ...currentState.externalFileState,
      status: "keeping-memory"
    }
  };
}

export function clearExternalMarkdownFileState(currentState: AppState): AppState {
  if (currentState.externalFileState.status === "idle") {
    return currentState;
  }

  return {
    ...currentState,
    externalFileState: { status: "idle" }
  };
}
