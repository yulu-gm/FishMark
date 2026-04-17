import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { EditorTestCommand, EditorTestCommandResult } from "../shared/editor-test-command";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import {
  applyEditorContentChanged,
  applyOpenMarkdownResult,
  applySaveMarkdownResult,
  type AppState
} from "./document-state";

type EditorHandle = {
  getContent: () => string;
  setContent: (content: string) => void;
  insertText: (text: string) => void;
  setSelection: (anchor: number, head?: number) => void;
  pressEnter: () => void;
};

export function createEditorTestDriver(input: {
  getState: () => AppState;
  applyState: (updater: (current: AppState) => AppState) => void;
  resetAutosaveRuntime: () => void;
  editor: EditorHandle;
  setEditorContentSnapshot: (content: string) => void;
  openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
  saveMarkdownFile: (args: { path: string; content: string }) => Promise<SaveMarkdownFileResult>;
}) {
  function ok(message?: string, details?: Record<string, unknown>): EditorTestCommandResult {
    return { ok: true, message, details };
  }

  function fail(message: string, details?: Record<string, unknown>): EditorTestCommandResult {
    return { ok: false, message, details };
  }

  return {
    async run(command: EditorTestCommand): Promise<EditorTestCommandResult> {
      if (command.type === "wait-for-editor-ready") {
        return ok("Editor renderer ready.");
      }

      if (command.type === "open-fixture-file") {
        const result = await input.openMarkdownFileFromPath(command.fixturePath);
        input.resetAutosaveRuntime();

        if (result.status !== "success") {
          return fail(
            result.status === "error" ? result.error.message : "Fixture file open was cancelled.",
            { status: result.status, fixturePath: command.fixturePath }
          );
        }

        input.setEditorContentSnapshot(result.document.content);
        input.applyState((current) => applyOpenMarkdownResult(current, result));

        return ok("Fixture file opened.", {
          path: result.document.path
        });
      }

      if (command.type === "set-editor-content") {
        const currentDocument = input.getState().currentDocument;
        if (!currentDocument) {
          return fail("No open document to replace.");
        }

        input.editor.setContent(command.content);
        input.setEditorContentSnapshot(command.content);
        input.applyState((current) => applyEditorContentChanged(current, command.content));
        return ok("Editor content replaced.");
      }

      if (command.type === "insert-editor-text") {
        const currentDocument = input.getState().currentDocument;
        if (!currentDocument) {
          return fail("No open document to edit.");
        }

        input.editor.insertText(command.text);
        const nextContent = input.editor.getContent();
        input.setEditorContentSnapshot(nextContent);
        input.applyState((current) => applyEditorContentChanged(current, nextContent));
        return ok("Editor text inserted.");
      }

      if (command.type === "set-editor-selection") {
        const currentDocument = input.getState().currentDocument;
        if (!currentDocument) {
          return fail("No open document to select.");
        }

        input.editor.setSelection(command.anchor, command.head ?? command.anchor);
        return ok("Editor selection updated.");
      }

      if (command.type === "press-editor-enter") {
        const currentDocument = input.getState().currentDocument;
        if (!currentDocument) {
          return fail("No open document to edit.");
        }

        input.editor.pressEnter();
        const nextContent = input.editor.getContent();
        input.setEditorContentSnapshot(nextContent);
        input.applyState((current) => applyEditorContentChanged(current, nextContent));
        return ok("Editor Enter executed.");
      }

      if (command.type === "save-document") {
        const currentDocument = input.getState().currentDocument;
        if (!currentDocument) {
          return fail("No open document to save.");
        }
        if (!currentDocument.path) {
          return fail("No persisted document path to save.", {
            path: currentDocument.path
          });
        }

        const content = input.editor.getContent();
        const result = await input.saveMarkdownFile({
          path: currentDocument.path,
          content
        });
        input.applyState((current) => applySaveMarkdownResult(current, result));

        if (result.status !== "success") {
          return fail(result.status === "error" ? result.error.message : "Save was cancelled.", {
            status: result.status,
            path: currentDocument.path
          });
        }

        input.setEditorContentSnapshot(content);
        input.applyState((current) => applyEditorContentChanged(current, content));
        return ok("Document saved.");
      }

      if (command.type === "assert-document-path") {
        const actualPath = input.getState().currentDocument?.path ?? null;
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

      if (command.type === "assert-dirty-state") {
        const actualDirty = input.getState().isDirty;
        return actualDirty === command.expectedDirty
          ? ok("Dirty state matched.", { actualDirty })
          : fail("Dirty state mismatch.", {
              expectedDirty: command.expectedDirty,
              actualDirty
            });
      }

      if (command.type === "assert-empty-workspace") {
        const hasDocument = Boolean(input.getState().currentDocument);
        return hasDocument
          ? fail("Workspace is not empty.", {
              documentPath: input.getState().currentDocument?.path ?? null
            })
          : ok("Workspace is empty.");
      }

      return fail("Unsupported editor test command.");
    }
  };
}
