import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { ActiveBlockState } from "@yulora/editor-core";
import { CodeEditorView, type CodeEditorHandle } from "../code-editor-view";
import { createEditorTestDriver } from "../editor-test-driver";
import {
  type AppState,
  applyEditorContentChanged,
  applyOpenMarkdownResult,
  applySaveMarkdownResult,
  createInitialAppState,
  startOpeningMarkdownFile,
  startAutosavingDocument,
  startManualSavingDocument
} from "../document-state";

const AUTOSAVE_IDLE_MS = 1000;
const AUTOSAVE_FAILED_MESSAGE = "Autosave failed. Changes are still in memory.";

export default function EditorApp() {
  const yulora = window.yulora;

  if (!yulora) {
    return <BridgeUnavailableApp />;
  }

  return <EditorShell yulora={yulora} />;
}

function EditorShell({ yulora }: { yulora: Window["yulora"] }) {
  const [state, setState] = useState(createInitialAppState);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const editorContentRef = useRef("");
  const activeBlockStateRef = useRef<ActiveBlockState | null>(null);
  const startupOpenPathRef = useRef(yulora.startupOpenPath);
  const stateRef = useRef(state);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutosaveReplayRef = useRef(false);
  const inFlightSaveOriginRef = useRef<"manual" | "autosave" | null>(null);

  function applyState(updater: (current: AppState) => AppState): void {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }

  function getEditorContent(): string {
    return editorRef.current?.getContent() ?? editorContentRef.current;
  }

  function clearAutosaveTimer(): void {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }

  function resetAutosaveRuntime(): void {
    clearAutosaveTimer();
    pendingAutosaveReplayRef.current = false;
    inFlightSaveOriginRef.current = null;
  }

  async function runAutosave(): Promise<void> {
    clearAutosaveTimer();

    const snapshot = stateRef.current;

    if (!snapshot.currentDocument || !snapshot.isDirty || inFlightSaveOriginRef.current) {
      return;
    }

    inFlightSaveOriginRef.current = "autosave";
    pendingAutosaveReplayRef.current = false;
    applyState((current) => startAutosavingDocument(current));

    const result = await yulora.saveMarkdownFile({
      path: snapshot.currentDocument.path,
      content: getEditorContent()
    });

    const effectiveResult =
      result.status === "error"
        ? {
            ...result,
            error: {
              ...result.error,
              message: AUTOSAVE_FAILED_MESSAGE
            }
          }
        : result;

    const currentEditorContent = getEditorContent();

    applyState((current) => {
      const savedState = applySaveMarkdownResult(current, effectiveResult);

      return effectiveResult.status === "success"
        ? applyEditorContentChanged(savedState, currentEditorContent)
        : savedState;
    });
    inFlightSaveOriginRef.current = null;

    if (pendingAutosaveReplayRef.current) {
      pendingAutosaveReplayRef.current = false;
      void runAutosave();
    }
  }

  function scheduleAutosave(nextState: AppState): void {
    clearAutosaveTimer();

    if (!nextState.currentDocument || !nextState.isDirty) {
      pendingAutosaveReplayRef.current = false;
      return;
    }

    if (inFlightSaveOriginRef.current) {
      pendingAutosaveReplayRef.current = true;
      return;
    }

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosave();
    }, AUTOSAVE_IDLE_MS);
  }

  async function runManualSave(
    request: () => ReturnType<typeof window.yulora.saveMarkdownFile>
  ): Promise<void> {
    const snapshot = stateRef.current;

    if (!snapshot.currentDocument || inFlightSaveOriginRef.current) {
      return;
    }

    clearAutosaveTimer();
    inFlightSaveOriginRef.current = "manual";
    pendingAutosaveReplayRef.current = false;
    applyState((current) => startManualSavingDocument(current));

    const result = await request();

    const currentEditorContent = getEditorContent();

    applyState((current) => {
      const savedState = applySaveMarkdownResult(current, result);

      return result.status === "success"
        ? applyEditorContentChanged(savedState, currentEditorContent)
        : savedState;
    });
    inFlightSaveOriginRef.current = null;

    if (pendingAutosaveReplayRef.current) {
      pendingAutosaveReplayRef.current = false;
      scheduleAutosave(stateRef.current);
    }
  }

  const handleOpenMarkdown = useEffectEvent(async (): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));

    const result = await yulora.openMarkdownFile();

    resetAutosaveRuntime();

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
    }

    applyState((current) => applyOpenMarkdownResult(current, result));
  });

  const handleOpenMarkdownFromPath = useEffectEvent(async (targetPath: string): Promise<void> => {
    applyState((current) => startOpeningMarkdownFile(current));

    const result = await yulora.openMarkdownFileFromPath(targetPath);

    resetAutosaveRuntime();

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
    }

    applyState((current) => applyOpenMarkdownResult(current, result));
  });

  const handleSaveMarkdown = useEffectEvent(async (): Promise<void> => {
    const currentDocument = state.currentDocument;

    if (!currentDocument) {
      return;
    }

    await runManualSave(() =>
      yulora.saveMarkdownFile({
        path: currentDocument.path,
        content: getEditorContent()
      })
    );
  });

  const handleSaveMarkdownAs = useEffectEvent(async (): Promise<void> => {
    const currentDocument = state.currentDocument;

    if (!currentDocument) {
      return;
    }

    await runManualSave(() =>
      yulora.saveMarkdownFileAs({
        currentPath: currentDocument.path,
        content: getEditorContent()
      })
    );
  });

  const handleEditorTestCommand = useEffectEvent(async (payload: {
    sessionId: string;
    commandId: string;
    command: Parameters<ReturnType<typeof createEditorTestDriver>["run"]>[0];
  }): Promise<void> => {
    const driver = createEditorTestDriver({
      getState: () => stateRef.current,
      applyState,
      resetAutosaveRuntime,
      editor: {
        getContent: getEditorContent,
        setContent: (content: string) => {
          editorRef.current?.setContent(content);
        },
        insertText: (text: string) => {
          editorRef.current?.insertText(text);
        },
        setSelection: (anchor: number, head?: number) => {
          editorRef.current?.setSelection(anchor, head);
        },
        pressEnter: () => {
          editorRef.current?.pressEnter();
        }
      },
      setEditorContentSnapshot: (content: string) => {
        editorContentRef.current = content;
      },
      openMarkdownFileFromPath: (targetPath: string) => yulora.openMarkdownFileFromPath(targetPath),
      saveMarkdownFile: (input) => yulora.saveMarkdownFile(input)
    });

    try {
      const result = await driver.run(payload.command);
      await yulora.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await yulora.completeEditorTestCommand({
        sessionId: payload.sessionId,
        commandId: payload.commandId,
        result: {
          ok: false,
          message
        }
      });
    }
  });

  useEffect(() => {
    return yulora.onMenuCommand((command) => {
      if (command === "open-markdown-file") {
        void handleOpenMarkdown();
        return;
      }

      if (command === "save-markdown-file") {
        void handleSaveMarkdown();
        return;
      }

      void handleSaveMarkdownAs();
    });
  }, [yulora]);

  useEffect(() => {
    return yulora.onEditorTestCommand((payload) => {
      void handleEditorTestCommand(payload);
    });
  }, [yulora]);

  useEffect(() => {
    const startupOpenPath = startupOpenPathRef.current;

    if (!startupOpenPath) {
      return;
    }

    startupOpenPathRef.current = null;
    void handleOpenMarkdownFromPath(startupOpenPath);
  }, []);

  useEffect(() => () => clearAutosaveTimer(), []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <p className="app-name">Yulora</p>
          <p className="app-subtitle">Local-first Markdown writing workspace</p>
        </div>
        <p className="app-hint">
          {state.openState === "opening"
            ? "Opening document..."
            : state.currentDocument
              ? "Use File to open, save, or save as."
              : "Use File > Open... to load a Markdown document."}
        </p>
      </header>

      {state.errorMessage ? (
        <p
          className="error-banner"
          role="alert"
        >
          {state.errorMessage}
        </p>
      ) : null}

      {state.currentDocument ? (
        <section className="workspace-shell">
          <div className="document-bar">
            <div className="document-meta">
              <h1>{state.currentDocument.name}</h1>
              <p className="document-path">{state.currentDocument.path}</p>
            </div>
            <div className="document-status-row">
              <p className={`save-status ${state.isDirty ? "is-dirty" : "is-clean"}`}>
                {state.saveState === "manual-saving"
                  ? "Saving changes..."
                  : state.saveState === "autosaving"
                    ? "Autosaving..."
                    : state.isDirty
                      ? "Unsaved changes"
                      : "All changes saved"}
              </p>
              <p className="document-platform">Bridge: {yulora.platform}</p>
            </div>
          </div>
          <CodeEditorView
            ref={editorRef}
            initialContent={state.currentDocument.content}
            loadRevision={state.editorLoadRevision}
            onActiveBlockChange={(nextActiveBlockState) => {
              activeBlockStateRef.current = nextActiveBlockState;
            }}
            onChange={(nextContent) => {
              editorContentRef.current = nextContent;
              let nextState: AppState = stateRef.current;

              applyState((current) => {
                nextState = applyEditorContentChanged(current, nextContent);
                return nextState;
              });

              scheduleAutosave(nextState);
            }}
            onBlur={() => {
              void runAutosave();
            }}
          />
        </section>
      ) : (
        <section className="empty-workspace">
          <div className="empty-inner">
            <p className="empty-kicker">Ready</p>
            <h1>Open a Markdown document from the File menu.</h1>
            <p className="empty-copy">
              Yulora keeps Markdown text as the source of truth and writes it back without
              reformatting the whole document.
            </p>
            <p className="empty-meta">Shortcut: Ctrl/Cmd+O</p>
          </div>
        </section>
      )}
    </main>
  );
}

function BridgeUnavailableApp() {
  return (
    <main className="app-shell">
      <p
        className="error-banner"
        role="alert"
      >
        Yulora bridge unavailable. Reload the window or restart the dev shell.
      </p>
    </main>
  );
}
