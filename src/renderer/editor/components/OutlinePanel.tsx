import type { WorkspaceShellProps } from "../workspace-shell-props";

export function OutlinePanel({
  outlineItems,
  activeHeadingId,
  onNavigateToOutlineItem
}: Pick<WorkspaceShellProps, "outlineItems" | "activeHeadingId" | "onNavigateToOutlineItem">) {

  return (
    <div
      className="outline-panel"
      data-fishmark-region="outline-panel"
    >
      {outlineItems.length > 0 ? (
        <ol className="outline-panel-list">
          {outlineItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`outline-panel-item ${activeHeadingId === item.id ? "is-current" : ""}`}
                style={{
                  paddingInlineStart: `${10 + Math.max(item.depth - 1, 0) * 10}px`
                }}
                onClick={() => onNavigateToOutlineItem(item.startOffset)}
              >
                <span className="outline-panel-item-label">{item.label}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="outline-panel-empty">No headings yet.</p>
      )}
    </div>
  );
}
