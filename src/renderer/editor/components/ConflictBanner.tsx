import type { WorkspaceShellProps } from "../workspace-shell-props";

export function ConflictBanner({
  externalFileState,
  externalFileConflictMessage,
  onReloadExternalFile,
  onKeepMemoryVersion,
  onSaveAs,
  onDismissExternalFileConflict
}: Pick<WorkspaceShellProps, "externalFileState" | "externalFileConflictMessage" | "onReloadExternalFile" | "onKeepMemoryVersion" | "onSaveAs" | "onDismissExternalFileConflict">) {

  return (
    externalFileState.status !== "idle" ? (
      <section
        className="external-file-conflict-banner"
        data-fishmark-region="external-file-conflict-banner"
        data-status={externalFileState.status}
        role="status"
        aria-live="polite"
      >
        <p className="external-file-conflict-message">{externalFileConflictMessage}</p>
        <div className="external-file-conflict-actions">
          <button
            type="button"
            className="external-file-conflict-button"
            onClick={onReloadExternalFile}
          >
            重载磁盘版本
          </button>
          {externalFileState.status === "pending" ? (
            <button
              type="button"
              className="external-file-conflict-button"
              onClick={onKeepMemoryVersion}
            >
              保留当前编辑
            </button>
          ) : null}
          <button
            type="button"
            className="external-file-conflict-button"
            onClick={onSaveAs}
          >
            另存为新文件
          </button>
          {externalFileState.status === "keeping-memory" ? (
            <button
              type="button"
              className="external-file-conflict-button is-secondary"
              onClick={onDismissExternalFileConflict}
            >
              关闭提示
            </button>
          ) : null}
        </div>
      </section>
    ) : null
  );
}
