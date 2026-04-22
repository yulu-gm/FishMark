import type { EditorTestCommand, EditorTestCommandResult } from "../shared/editor-test-command";
import type { SaveMarkdownFileResult } from "../shared/save-markdown-file";
import type { WorkspaceWindowSnapshot } from "../shared/workspace";
import {
  applyEditorContentChanged,
  applySaveMarkdownResult,
  applyWorkspaceSnapshot,
  getActiveDocument,
  type AppState
} from "./document-state";

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
  getState: () => AppState;
  applyState: (updater: (current: AppState) => AppState) => void;
  resetAutosaveRuntime: () => void;
  editor: EditorHandle;
  setEditorContentSnapshot: (content: string) => void;
  openWorkspaceFileFromPath: (targetPath: string) => Promise<WorkspaceWindowSnapshot>;
  saveMarkdownFile: (args: { tabId: string; path: string; content: string }) => Promise<SaveMarkdownFileResult>;
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
    const activeDocument = getActiveDocument(input.getState());

    if (!activeDocument) {
      return fail(message, details);
    }

    return activeDocument;
  }

  return {
    async run(command: EditorTestCommand): Promise<EditorTestCommandResult> {
      if (command.type === "wait-for-editor-ready") {
        return ok("Editor renderer ready.");
      }

      if (command.type === "open-fixture-file") {
        const snapshot = await input.openWorkspaceFileFromPath(command.fixturePath);
        const activeDocument =
          snapshot.activeDocument ??
          (() => {
            throw new Error(`Workspace snapshot for '${command.fixturePath}' is missing an active document.`);
          })();

        input.resetAutosaveRuntime();
        input.setEditorContentSnapshot(activeDocument.content);
        input.applyState((current) => applyWorkspaceSnapshot(current, snapshot));

        return ok("Fixture file opened.", {
          path: activeDocument.path
        });
      }

      if (command.type === "set-editor-content") {
        const activeDocument = getRequiredActiveDocument("No open document to replace.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }

        input.editor.setContent(command.content);
        input.setEditorContentSnapshot(command.content);
        input.applyState((current) => applyEditorContentChanged(current, command.content));
        return ok("Editor content replaced.");
      }

      if (command.type === "insert-editor-text") {
        const activeDocument = getRequiredActiveDocument("No open document to edit.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }

        input.editor.insertText(command.text);
        const nextContent = input.editor.getContent();
        input.setEditorContentSnapshot(nextContent);
        input.applyState((current) => applyEditorContentChanged(current, nextContent));
        return ok("Editor text inserted.");
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
        const nextContent = input.editor.getContent();
        input.setEditorContentSnapshot(nextContent);
        input.applyState((current) => applyEditorContentChanged(current, nextContent));
        return ok("Editor Enter executed.");
      }

      if (command.type === "press-editor-backspace") {
        const activeDocument = getRequiredActiveDocument("No open document to edit.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }

        input.editor.pressBackspace();
        const nextContent = input.editor.getContent();
        input.setEditorContentSnapshot(nextContent);
        input.applyState((current) => applyEditorContentChanged(current, nextContent));
        return ok("Editor Backspace executed.");
      }

      if (command.type === "press-editor-tab") {
        const activeDocument = getRequiredActiveDocument("No open document to edit.");
        if ("ok" in activeDocument) {
          return activeDocument;
        }

        input.editor.pressTab(command.shiftKey);
        const nextContent = input.editor.getContent();
        input.setEditorContentSnapshot(nextContent);
        input.applyState((current) => applyEditorContentChanged(current, nextContent));
        return ok(command.shiftKey ? "Editor Shift-Tab executed." : "Editor Tab executed.");
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
          return fail("No persisted document path to save.", {
            path: activeDocument.path
          });
        }

        const content = input.editor.getContent();
        const result = await input.saveMarkdownFile({
          tabId: activeDocument.tabId,
          path: activeDocument.path,
          content
        });
        input.applyState((current) => applySaveMarkdownResult(current, result));

        if (result.status !== "success") {
          return fail(result.status === "error" ? result.error.message : "Save was cancelled.", {
            status: result.status,
            path: activeDocument.path
          });
        }

        input.setEditorContentSnapshot(content);
        input.applyState((current) => applyEditorContentChanged(current, content));
        return ok("Document saved.");
      }

      if (command.type === "assert-document-path") {
        const actualPath = getActiveDocument(input.getState())?.path ?? null;
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

        return actualSelection.anchor === command.expectedAnchor && actualSelection.head === expectedHead
          ? ok("Editor selection matched.")
          : fail("Editor selection mismatch.", {
              expectedAnchor: command.expectedAnchor,
              expectedHead,
              actualAnchor: actualSelection.anchor,
              actualHead: actualSelection.head
            });
      }

      if (command.type === "assert-dirty-state") {
        const actualDirty = getActiveDocument(input.getState())?.isDirty ?? false;
        return actualDirty === command.expectedDirty
          ? ok("Dirty state matched.", { actualDirty })
          : fail("Dirty state mismatch.", {
              expectedDirty: command.expectedDirty,
              actualDirty
            });
      }

      if (command.type === "assert-empty-workspace") {
        const activeDocument = getActiveDocument(input.getState());
        return activeDocument
          ? fail("Workspace is not empty.", {
              documentPath: activeDocument.path
            })
          : ok("Workspace is empty.");
      }

      return fail("Unsupported editor test command.");
    }
  };
}
