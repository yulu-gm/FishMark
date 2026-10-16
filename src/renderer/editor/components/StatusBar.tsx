import type { WorkspaceShellProps } from "../workspace-shell-props";

export function StatusBar({
  isDocumentOpen,
  appUpdateStatusLabel,
  saveStatusLabel,
  currentDocumentMetrics,
  editorViewMode,
  onEditorViewModeChange,
  appVersionLabel,
  isDirty
}: Pick<WorkspaceShellProps, "isDocumentOpen" | "appUpdateStatusLabel" | "saveStatusLabel" | "currentDocumentMetrics" | "editorViewMode" | "onEditorViewModeChange" | "appVersionLabel"> & {
  isDirty: boolean;
}) {
  const nextEditorViewMode = editorViewMode === "source" ? "wysiwym" : "source";
  return (
    <footer
      className="app-status-bar"
      data-fishmark-region="app-status-bar"
      data-visibility="visible"
    >
      <div data-fishmark-region="status-strip">
        {!isDocumentOpen ? <p className="app-version-label">{appVersionLabel}</p> : null}
        {appUpdateStatusLabel ? <p className="app-update-status">{appUpdateStatusLabel}</p> : null}
        {isDocumentOpen ? (
          <p className={`save-status ${isDirty ? "is-dirty" : "is-clean"}`}>{saveStatusLabel}</p>
        ) : null}
        <p className="document-word-count">
          字数 {currentDocumentMetrics?.meaningfulCharacterCount ?? 0}
        </p>
        {isDocumentOpen ? (
            <button
              type="button"
              className="editor-view-mode-toggle"
              aria-label={
                editorViewMode === "source"
                  ? "Switch to WYSIWYM mode"
                  : "Switch to source mode"
              }
              aria-pressed={editorViewMode === "source"}
              title={
                editorViewMode === "source"
                  ? "Switch to WYSIWYM mode"
                  : "Switch to source mode"
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onEditorViewModeChange(nextEditorViewMode)}
            >
              &lt;/&gt;
            </button>
        ) : null}
      </div>
    </footer>
  );
}
