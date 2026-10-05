import type { WorkspaceShellProps } from "../workspace-shell-props";

export function WorkspaceTabStrip({
  isReadingMode,
  isDocumentOpen,
  onTabActivate,
  onCloseWorkspaceTab,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
  onTabDragEnd,
  workspaceTabs,
  activeTabId
}: Pick<WorkspaceShellProps, "isReadingMode" | "isDocumentOpen" | "onTabActivate" | "onCloseWorkspaceTab" | "onTabDragStart" | "onTabDragOver" | "onTabDrop" | "onTabDragEnd"> & {
  workspaceTabs: NonNullable<WorkspaceShellProps["workspaceSnapshot"]>["tabs"];
  activeTabId: string | null;
}) {

  return (
    workspaceTabs.length > 0 ? (
      <nav
        className="workspace-tab-strip"
        data-fishmark-region="workspace-tab-strip"
        data-visibility={isReadingMode && isDocumentOpen ? "collapsed" : "visible"}
        aria-label="Open documents"
      >
        <div className="workspace-tab-strip-scroll">
          {workspaceTabs.map((tab, index) => {
            const isActive = tab.tabId === activeTabId;
            const tooltip = tab.path ?? tab.name;

            return (
              <div
                key={tab.tabId}
                className={`workspace-tab-shell ${isActive ? "is-active" : ""}`}
                data-fishmark-region="workspace-tab-shell"
                data-active={isActive ? "true" : "false"}
                data-dirty={tab.isDirty ? "true" : "false"}
              >
                <button
                  type="button"
                  className={`workspace-tab ${isActive ? "is-active" : ""}`}
                  data-fishmark-region="workspace-tab"
                  data-active={isActive ? "true" : "false"}
                  data-dirty={tab.isDirty ? "true" : "false"}
                  title={tooltip}
                  draggable
                  onClick={() => onTabActivate(tab.tabId)}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      event.stopPropagation();
                      onCloseWorkspaceTab(tab.tabId);
                    }
                  }}
                  onDragStart={(event) => onTabDragStart(tab.tabId, event)}
                  onDragOver={onTabDragOver}
                  onDrop={(event) => onTabDrop(tab.tabId, index, event)}
                  onDragEnd={() => onTabDragEnd(tab.tabId)}
                >
                  <span className="workspace-tab-label">{tab.name}</span>
                  <span
                    className="workspace-tab-dirty-indicator"
                    data-visibility={tab.isDirty ? "visible" : "hidden"}
                    aria-hidden="true"
                  >
                    •
                  </span>
                </button>
                <button
                  type="button"
                  className="workspace-tab-close"
                  data-fishmark-region="workspace-tab-close"
                  aria-label={`Close ${tab.name}`}
                  title={`Close ${tab.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseWorkspaceTab(tab.tabId);
                  }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M3 3 L9 9 M9 3 L3 9"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </nav>
    ) : null
  );
}
