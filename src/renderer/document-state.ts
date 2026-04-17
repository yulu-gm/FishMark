import type {
  OpenMarkdownDocument,
  OpenMarkdownFileResult
} from "../shared/open-markdown-file";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";

export type OpenState = "idle" | "opening";
export type SaveState = "idle" | "manual-saving" | "autosaving";
const UNTITLED_DOCUMENT_NAME = "Untitled.md";

export type AppState = {
  currentDocument: OpenMarkdownDocument | null;
  editorLoadRevision: number;
  openState: OpenState;
  saveState: SaveState;
  isDirty: boolean;
  errorMessage: string | null;
  lastSavedContent: string | null;
};

export function createInitialAppState(): AppState {
  return {
    currentDocument: null,
    editorLoadRevision: 0,
    openState: "idle",
    saveState: "idle",
    isDirty: false,
    errorMessage: null,
    lastSavedContent: null
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
    errorMessage: null,
    lastSavedContent: ""
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
      errorMessage: null,
      lastSavedContent: result.document.content
    };
  }

  if (result.status === "cancelled") {
    return {
      ...currentState,
      openState: "idle",
      errorMessage: null
    };
  }

  return {
    ...currentState,
    openState: "idle",
    errorMessage: result.error.message
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
      errorMessage: null,
      lastSavedContent: result.document.content
    };
  }

  if (result.status === "cancelled") {
    return {
      ...currentState,
      saveState: "idle",
      errorMessage: null
    };
  }

  return {
    ...currentState,
    saveState: "idle",
    errorMessage: result.error.message
  };
}
