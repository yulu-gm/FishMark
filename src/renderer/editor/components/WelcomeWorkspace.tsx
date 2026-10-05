import fishmarkMarkSvg from "../../../../assets/branding/fishmark_mark.svg?raw";
import type { WorkspaceShellProps } from "../workspace-shell-props";
export function WelcomeWorkspace({
  recentFiles,
  onOpenRecentFile,
  onClearRecentFile,
  welcomeShortcutTip
}: Pick<WorkspaceShellProps, "recentFiles" | "onOpenRecentFile" | "onClearRecentFile"> & {
  welcomeShortcutTip: string;
}) {

  return (
    <section
      className="empty-workspace"
      data-fishmark-region="empty-state"
    >
      <div className="empty-inner">
        <span
          className="empty-mark"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: fishmarkMarkSvg }}
        />
        <p className="empty-kicker">FishMark</p>
        <p className="empty-copy">{welcomeShortcutTip}</p>
        <p className="empty-meta">⌘ O · Ctrl O</p>
        {recentFiles.entries.length > 0 ? (
          <section
            className="recent-files"
            aria-label="Recent files"
          >
            <h2>Recent files</h2>
            <ul className="recent-file-list">
              {recentFiles.entries.map((entry) => (
                <li
                  key={entry.path}
                  className="recent-file-item"
                >
                  <button
                    type="button"
                    className="recent-file-open"
                    data-fishmark-recent-action="open"
                    onClick={() => onOpenRecentFile(entry.path)}
                  >
                    <span className="recent-file-name">{entry.name}</span>
                    <span className="recent-file-path">{entry.path}</span>
                  </button>
                  <button
                    type="button"
                    className="recent-file-clear"
                    data-fishmark-recent-action="clear"
                    aria-label={`Remove ${entry.name} from recent files`}
                    onClick={() => onClearRecentFile(entry.path)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M18 6L6 18M6 6l12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}
