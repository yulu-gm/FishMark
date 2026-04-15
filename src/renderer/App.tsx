import { useEffect, useEffectEvent, useRef, useState } from "react";

import { CodeEditorView, type CodeEditorHandle } from "./code-editor-view";
import {
  applyEditorContentChanged,
  applyOpenMarkdownResult,
  applySaveMarkdownResult,
  createInitialAppState,
  startOpeningMarkdownFile,
  startSavingDocument
} from "./document-state";

export default function App() {
  const [state, setState] = useState(createInitialAppState);
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const editorContentRef = useRef("");

  function getEditorContent(): string {
    return editorRef.current?.getContent() ?? editorContentRef.current;
  }

  const handleOpenMarkdown = useEffectEvent(async (): Promise<void> => {
    setState((current) => startOpeningMarkdownFile(current));

    const result = await window.yulora.openMarkdownFile();

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
    }

    setState((current) => applyOpenMarkdownResult(current, result));
  });

  const handleSaveMarkdown = useEffectEvent(async (): Promise<void> => {
    if (!state.currentDocument) {
      return;
    }

    setState((current) => startSavingDocument(current));

    const result = await window.yulora.saveMarkdownFile({
      path: state.currentDocument.path,
      content: getEditorContent()
    });

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
    }

    setState((current) => applySaveMarkdownResult(current, result));
  });

  const handleSaveMarkdownAs = useEffectEvent(async (): Promise<void> => {
    if (!state.currentDocument) {
      return;
    }

    setState((current) => startSavingDocument(current));

    const result = await window.yulora.saveMarkdownFileAs({
      currentPath: state.currentDocument.path,
      content: getEditorContent()
    });

    if (result.status === "success") {
      editorContentRef.current = result.document.content;
    }

    setState((current) => applySaveMarkdownResult(current, result));
  });

  useEffect(() => {
    return window.yulora.onMenuCommand((command) => {
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
  }, []);

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
                {state.saveState === "saving"
                  ? "Saving changes..."
                  : state.isDirty
                    ? "Unsaved changes"
                    : "All changes saved"}
              </p>
              <p className="document-platform">Bridge: {window.yulora.platform}</p>
            </div>
          </div>
          <CodeEditorView
            ref={editorRef}
            initialContent={state.currentDocument.content}
            loadRevision={state.editorLoadRevision}
            onChange={(nextContent) => {
              editorContentRef.current = nextContent;
              setState((current) => applyEditorContentChanged(current, nextContent));
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
