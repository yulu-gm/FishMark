import { describe, expect, it } from "vitest";

import type { ExternalMarkdownFileChangedEvent } from "../shared/external-file-change";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import {
  applyExternalMarkdownFileChanged,
  applyEditorContentChanged,
  applySaveMarkdownResult,
  applyOpenMarkdownResult,
  clearExternalMarkdownFileState,
  createNewMarkdownDocumentState,
  createInitialAppState,
  keepExternalMarkdownMemoryVersion,
  startAutosavingDocument,
  startManualSavingDocument,
  type AppState
} from "./document-state";

describe("applyOpenMarkdownResult", () => {
  it("loads the returned document on success", () => {
    const nextState = applyOpenMarkdownResult(createInitialAppState(), {
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      }
    });

    expect(nextState.currentDocument?.name).toBe("today.md");
    expect(nextState.currentDocument?.content).toBe("# Today\n");
    expect(nextState.openState).toBe("idle");
  });

  it("keeps the current document on cancelled results", () => {
    const initialState: AppState = {
      currentDocument: {
        path: "C:/notes/existing.md",
        name: "existing.md",
        content: "draft",
        encoding: "utf-8"
      },
      editorLoadRevision: 0,
      openState: "opening",
      saveState: "idle",
      isDirty: false,
      lastSavedContent: "draft",
      externalFileState: { status: "idle" }
    };

    const nextState = applyOpenMarkdownResult(initialState, { status: "cancelled" });

    expect(nextState.currentDocument?.name).toBe("existing.md");
    expect(nextState.openState).toBe("idle");
  });

  it("keeps the current document when opening fails", () => {
    const nextState = applyOpenMarkdownResult(createInitialAppState(), {
      status: "error",
      error: {
        code: "read-failed",
        message: "The Markdown file could not be read."
      }
    });

    expect(nextState.currentDocument).toBeNull();
    expect(nextState.openState).toBe("idle");
  });
});

describe("applyEditorContentChanged", () => {
  it("marks a new untitled document clean on creation", () => {
    const nextState = createNewMarkdownDocumentState(createInitialAppState());

    expect(nextState.currentDocument).toEqual({
      path: null,
      name: "Untitled.md",
      content: "",
      encoding: "utf-8"
    });
    expect(nextState.isDirty).toBe(false);
    expect(nextState.editorLoadRevision).toBe(1);
  });

  it("marks the document dirty when editor content diverges from the persisted snapshot", () => {
    const state: AppState = {
      currentDocument: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      },
      editorLoadRevision: 1,
      openState: "idle",
      saveState: "idle",
      isDirty: false,
      lastSavedContent: "# Today\n",
      externalFileState: { status: "idle" }
    };

    const nextState = applyEditorContentChanged(state, "# Updated\n");

    expect(nextState.currentDocument?.content).toBe("# Today\n");
    expect(nextState.isDirty).toBe(true);
  });
});

describe("save document state", () => {
  it("marks a newly opened document as clean", () => {
    const nextState = applyOpenMarkdownResult(createInitialAppState(), {
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      }
    });

    expect(nextState.isDirty).toBe(false);
    expect(nextState.saveState).toBe("idle");
    expect(nextState.editorLoadRevision).toBe(1);
  });

  it("marks the document as manual-saving when a manual save starts", () => {
    const initialState = applyOpenMarkdownResult(createInitialAppState(), {
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      }
    });

    const nextState = startManualSavingDocument(initialState);

    expect(nextState.saveState).toBe("manual-saving");
  });

  it("marks the document as autosaving when autosave starts", () => {
    const initialState = applyOpenMarkdownResult(createInitialAppState(), {
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      }
    });

    const nextState = startAutosavingDocument(initialState);

    expect(nextState.saveState).toBe("autosaving");
  });

  it("clears dirty state after a successful save", () => {
    const initialState = applyEditorContentChanged(
      applyOpenMarkdownResult(createInitialAppState(), {
        status: "success",
        document: {
          path: "C:/notes/today.md",
          name: "today.md",
          content: "# Today\n",
          encoding: "utf-8"
        }
      }),
      "# Updated\n"
    );

    const nextState = applySaveMarkdownResult(initialState, createSaveResult("success"));

    expect(nextState.currentDocument?.content).toBe("# Updated\n");
    expect(nextState.isDirty).toBe(false);
    expect(nextState.saveState).toBe("idle");
  });

  it("resets save state when save fails", () => {
    const initialState = applyEditorContentChanged(
      applyOpenMarkdownResult(createInitialAppState(), {
        status: "success",
        document: {
          path: "C:/notes/today.md",
          name: "today.md",
          content: "# Today\n",
          encoding: "utf-8"
        }
      }),
      "# Updated\n"
    );

    const nextState = applySaveMarkdownResult(initialState, {
      status: "error",
      error: {
        code: "write-failed",
        message: "The Markdown file could not be saved."
      }
    });

    expect(nextState.isDirty).toBe(true);
    expect(nextState.saveState).toBe("idle");
  });

  it("updates the current path after save as succeeds", () => {
    const initialState = applyEditorContentChanged(
      createNewMarkdownDocumentState(createInitialAppState()),
      "# Updated\n"
    );

    const nextState = applySaveMarkdownResult(initialState, {
      status: "success",
      document: {
        path: "C:/archive/renamed.md",
        name: "renamed.md",
        content: "# Updated\n",
        encoding: "utf-8"
      }
    });

    expect(nextState.currentDocument?.path).toBe("C:/archive/renamed.md");
    expect(nextState.currentDocument?.name).toBe("renamed.md");
    expect(nextState.currentDocument?.content).toBe("# Updated\n");
    expect(nextState.isDirty).toBe(false);
    expect(nextState.editorLoadRevision).toBe(1);
  });

  it("keeps the current document when save as is cancelled", () => {
    const initialState = applyEditorContentChanged(
      applyOpenMarkdownResult(createInitialAppState(), {
        status: "success",
        document: {
          path: "C:/notes/today.md",
          name: "today.md",
          content: "# Today\n",
          encoding: "utf-8"
        }
      }),
      "# Updated\n"
    );

    const nextState = applySaveMarkdownResult(initialState, { status: "cancelled" });

    expect(nextState.currentDocument?.path).toBe("C:/notes/today.md");
    expect(nextState.currentDocument?.content).toBe("# Today\n");
    expect(nextState.isDirty).toBe(true);
    expect(nextState.saveState).toBe("idle");
  });

  it("clears external file conflict state after a successful save as", () => {
    const initialState = keepExternalMarkdownMemoryVersion(
      applyExternalMarkdownFileChanged(
        applyEditorContentChanged(
          applyOpenMarkdownResult(createInitialAppState(), {
            status: "success",
            document: {
              path: "C:/notes/today.md",
              name: "today.md",
              content: "# Today\n",
              encoding: "utf-8"
            }
          }),
          "# Updated\n"
        ),
        createExternalFileEvent("modified")
      )
    );

    const nextState = applySaveMarkdownResult(initialState, {
      status: "success",
      document: {
        path: "C:/archive/conflict-copy.md",
        name: "conflict-copy.md",
        content: "# Updated\n",
        encoding: "utf-8"
      }
    });

    expect(nextState.externalFileState).toEqual({ status: "idle" });
    expect(nextState.currentDocument?.path).toBe("C:/archive/conflict-copy.md");
    expect(nextState.isDirty).toBe(false);
  });
});

describe("external markdown file state", () => {
  it("enters a pending conflict state when the current file changes externally", () => {
    const initialState = applyOpenMarkdownResult(createInitialAppState(), {
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      }
    });

    const nextState = applyExternalMarkdownFileChanged(
      initialState,
      createExternalFileEvent("modified")
    );

    expect(nextState.externalFileState).toEqual({
      status: "pending",
      path: "C:/notes/today.md",
      kind: "modified"
    });
  });

  it("keeps the conflict state idle when the changed path is not the current document", () => {
    const initialState = applyOpenMarkdownResult(createInitialAppState(), {
      status: "success",
      document: {
        path: "C:/notes/today.md",
        name: "today.md",
        content: "# Today\n",
        encoding: "utf-8"
      }
    });

    const nextState = applyExternalMarkdownFileChanged(initialState, {
      path: "C:/notes/other.md",
      kind: "modified"
    });

    expect(nextState.externalFileState).toEqual({ status: "idle" });
  });

  it("keeps the in-memory version when the user chooses to preserve current edits", () => {
    const initialState = applyExternalMarkdownFileChanged(
      applyOpenMarkdownResult(createInitialAppState(), {
        status: "success",
        document: {
          path: "C:/notes/today.md",
          name: "today.md",
          content: "# Today\n",
          encoding: "utf-8"
        }
      }),
      createExternalFileEvent("deleted")
    );

    const nextState = keepExternalMarkdownMemoryVersion(initialState);

    expect(nextState.externalFileState).toEqual({
      status: "keeping-memory",
      path: "C:/notes/today.md",
      kind: "deleted"
    });
  });

  it("clears the conflict state when explicitly dismissed", () => {
    const initialState = keepExternalMarkdownMemoryVersion(
      applyExternalMarkdownFileChanged(
        applyOpenMarkdownResult(createInitialAppState(), {
          status: "success",
          document: {
            path: "C:/notes/today.md",
            name: "today.md",
            content: "# Today\n",
            encoding: "utf-8"
          }
        }),
        createExternalFileEvent("modified")
      )
    );

    const nextState = clearExternalMarkdownFileState(initialState);

    expect(nextState.externalFileState).toEqual({ status: "idle" });
  });
});

function createSaveResult(status: "success"): SaveMarkdownFileResult {
  return {
    status,
    document: {
      path: "C:/notes/today.md",
      name: "today.md",
      content: "# Updated\n",
      encoding: "utf-8"
    }
  };
}

function createExternalFileEvent(
  kind: ExternalMarkdownFileChangedEvent["kind"]
): ExternalMarkdownFileChangedEvent {
  return {
    path: "C:/notes/today.md",
    kind
  };
}
