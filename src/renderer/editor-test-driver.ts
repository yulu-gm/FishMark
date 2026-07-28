import type { EditorTestCommand, EditorTestCommandResult } from "../shared/editor-test-command";
import { getActiveDocument } from "./editor/editor-shell-state";
import type { WorkspaceRendererTestAdapter } from "./editor/workspace-renderer-application";

type EditorHandle = {
  getContent: () => string;
  setContent: (content: string) => void;
  insertText: (text: string) => void;
  getSelection: () => { anchor: number; head: number };
  setSelection: (anchor: number, head?: number) => void;
  pressEnter: () => void;
  pressBackspace: () => void;
  pressTab: (shiftKey?: boolean) => void;
  pressArrowUp: () => void;
  pressArrowDown: () => void;
};

export function createEditorTestDriver(input: {
  workspace: WorkspaceRendererTestAdapter;
  resetAutosaveRuntime: () => void;
  editor: EditorHandle;
}) {
  type ActiveDocument = NonNullable<ReturnType<typeof getActiveDocument>>;

  function ok(message?: string, details?: Record<string, unknown>): EditorTestCommandResult {
    return { ok: true, message, details };
  }

  function fail(message: string, details?: Record<string, unknown>): EditorTestCommandResult {
    return { ok: false, message, details };
  }

  function getRequiredActiveDocument(
    message: string,
    details?: Record<string, unknown>
  ): ActiveDocument | EditorTestCommandResult {
    const activeDocument = getActiveDocument(input.workspace.readState());
    return activeDocument ?? fail(message, details);
  }

  async function commitEditorGesture(successMessage: string): Promise<EditorTestCommandResult> {
    const outcome = await input.workspace.commitDraft();
    if (outcome.kind === "committed") {
      return ok(successMessage);
    }
    const message = outcome.kind === "failed" ||
      outcome.kind === "failed-reconciled" ||
      outcome.kind === "canonical-unavailable"
      ? outcome.error instanceof Error
        ? outcome.error.message
        : String(outcome.error)
      : `Editor draft commit ended with ${outcome.kind}.`;
    return fail(message);
  }

  return {
    async run(command: EditorTestCommand): Promise<EditorTestCommandResult> {
      if (command.type === "wait-for-editor-ready") {
        return ok("Editor renderer ready.");
      }

      if (command.type === "open-fixture-file") {
        const outcome = await input.workspace.openFixture(command.fixturePath);
        if (outcome.kind !== "committed") {
          const message = outcome.kind === "failed" ||
            outcome.kind === "failed-reconciled" ||
            outcome.kind === "canonical-unavailable"
            ? outcome.error instanceof Error
              ? outcome.error.message
              : String(outcome.error)
            : `Fixture open ended with ${outcome.kind}.`;
          return fail(message, { path: command.fixturePath });
        }
        const activeDocument = getActiveDocument(input.workspace.readState());
        if (activeDocument === null) {
          return fail(`Workspace state for '${command.fixturePath}' is missing an active document.`);
        }
        input.resetAutosaveRuntime();
        return ok("Fixture file opened.", { path: activeDocument.path });
      }

      if (command.type === "set-editor-content") {
        const activeDocument = getRequiredActiveDocument("No open document to replace.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        input.editor.setContent(command.content);
        return commitEditorGesture("Editor content replaced.");
      }

      if (command.type === "insert-editor-text") {
        const activeDocument = getRequiredActiveDocument("No open document to edit.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        input.editor.insertText(command.text);
        return commitEditorGesture("Editor text inserted.");
      }

      if (command.type === "set-editor-selection") {
        const activeDocument = getRequiredActiveDocument("No open document to select.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        input.editor.setSelection(command.anchor, command.head ?? command.anchor);
        return ok("Editor selection updated.");
      }

      if (command.type === "press-editor-enter") {
        const activeDocument = getRequiredActiveDocument("No open document to edit.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        input.editor.pressEnter();
        return commitEditorGesture("Editor Enter executed.");
      }

      if (command.type === "press-editor-backspace") {
        const activeDocument = getRequiredActiveDocument("No open document to edit.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        input.editor.pressBackspace();
        return commitEditorGesture("Editor Backspace executed.");
      }

      if (command.type === "press-editor-tab") {
        const activeDocument = getRequiredActiveDocument("No open document to edit.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        input.editor.pressTab(command.shiftKey);
        return commitEditorGesture(
          command.shiftKey ? "Editor Shift-Tab executed." : "Editor Tab executed."
        );
      }

      if (command.type === "press-editor-arrow-up") {
        const activeDocument = getRequiredActiveDocument("No open document to navigate.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        input.editor.pressArrowUp();
        return ok("Editor ArrowUp executed.");
      }

      if (command.type === "press-editor-arrow-down") {
        const activeDocument = getRequiredActiveDocument("No open document to navigate.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        input.editor.pressArrowDown();
        return ok("Editor ArrowDown executed.");
      }

      if (command.type === "save-document") {
        const activeDocument = getRequiredActiveDocument("No open document to save.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }
        if (!activeDocument.path) {
          return fail("No persisted document path to save.", { path: activeDocument.path });
        }
        const outcome = await input.workspace.saveDocument();
        if (outcome.kind !== "committed") {
          return fail(`Workspace save ended with ${outcome.kind}.`, {
            path: activeDocument.path
          });
        }
        if (outcome.value.status !== "success") {
          return fail(
            outcome.value.status === "error"
              ? outcome.value.error.message
              : "Save was cancelled.",
            { status: outcome.value.status, path: activeDocument.path }
          );
        }
        return ok("Document saved.");
      }

      if (command.type === "assert-document-path") {
        const actualPath = getActiveDocument(input.workspace.readState())?.path ?? null;
        return actualPath === command.expectedPath
          ? ok("Document path matched.", { actualPath })
          : fail("Document path mismatch.", {
              expectedPath: command.expectedPath,
              actualPath
            });
      }

      if (command.type === "assert-editor-content") {
        const actualContent = input.editor.getContent();
        return actualContent === command.expectedContent
          ? ok("Editor content matched.")
          : fail("Editor content mismatch.", {
              expectedContent: command.expectedContent,
              actualContent
            });
      }

      if (command.type === "assert-editor-selection") {
        const actualSelection = input.editor.getSelection();
        const expectedHead = command.expectedHead ?? command.expectedAnchor;
        return actualSelection.anchor === command.expectedAnchor &&
          actualSelection.head === expectedHead
          ? ok("Editor selection matched.")
          : fail("Editor selection mismatch.", {
              expectedAnchor: command.expectedAnchor,
              expectedHead,
              actualAnchor: actualSelection.anchor,
              actualHead: actualSelection.head
            });
      }

      if (command.type === "assert-dirty-state") {
        const actualDirty = getActiveDocument(input.workspace.readState())?.isDirty ?? false;
        return actualDirty === command.expectedDirty
          ? ok("Dirty state matched.", { actualDirty })
          : fail("Dirty state mismatch.", {
              expectedDirty: command.expectedDirty,
              actualDirty
            });
      }

      if (command.type === "assert-empty-workspace") {
        const activeDocument = getActiveDocument(input.workspace.readState());
        return activeDocument
          ? fail("Workspace is not empty.", { documentPath: activeDocument.path })
          : ok("Workspace is empty.");
      }

      return fail("Unsupported editor test command.");
    }
  };
}
