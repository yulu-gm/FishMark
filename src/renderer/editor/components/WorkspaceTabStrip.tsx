import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceShellProps } from "../workspace-shell-props";
import { useWorkspaceTabDrag } from "../useWorkspaceTabDrag";
import { WorkspaceTabMenu, type WorkspaceTabMenuTarget } from "./WorkspaceTabMenu";

export function WorkspaceTabStrip({
  onTabActivate,
  onCloseWorkspaceTab,
  onTabReorder,
  onTabDetach,
  onSaveWorkspaceTab,
  onWorkspaceTabFile,
  fishmarkPlatform,
  workspaceTabs,
  activeTabId
}: Pick<WorkspaceShellProps, "onTabActivate" | "onCloseWorkspaceTab" | "onTabReorder" | "onTabDetach" | "onSaveWorkspaceTab" | "onWorkspaceTabFile" | "fishmarkPlatform"> & {
  workspaceTabs: NonNullable<WorkspaceShellProps["workspaceSnapshot"]>["tabs"];
  activeTabId: string | null;
}) {
  const drag = useWorkspaceTabDrag({ reorderWorkspaceTab: onTabReorder, detachWorkspaceTab: onTabDetach });
  const stripRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<WorkspaceTabMenuTarget | null>(null);
  const dismissMenu = useCallback(() => setMenu(null), []);
  const menuTab = workspaceTabs.find(tab => tab.tabId === menu?.tabId);
  useEffect(() => {
    // 页签过多时可横向滚动；切换后只移动页签栏，不滚动编辑区。
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>('.workspace-tab-shell.is-active');
    if (!strip || !active) return;
    const bounds = active.getBoundingClientRect(), viewport = strip.getBoundingClientRect();
    if (bounds.left < viewport.left) strip.scrollLeft -= viewport.left - bounds.left;
    else if (bounds.right > viewport.right) strip.scrollLeft += bounds.right - viewport.right;
  }, [activeTabId, workspaceTabs.length]);

  return (
    (
      <nav
        className="workspace-tab-strip"
        data-fishmark-region="workspace-tab-strip"
        data-visibility="visible"
        aria-label="Open documents"
      >
        <div ref={stripRef} className="workspace-tab-strip-scroll" onWheel={event => {
          if (event.deltaX === 0) event.currentTarget.scrollLeft += event.deltaY;
        }}>
          {workspaceTabs.map((tab) => {
            const isActive = tab.tabId === activeTabId;
            const tooltip = tab.path ?? tab.name;

            return (
              <div
                key={tab.tabId}
                className={`workspace-tab-shell ${isActive ? "is-active" : ""}`}
                data-fishmark-region="workspace-tab-shell"
                data-active={isActive ? "true" : "false"}
                data-dirty={tab.isDirty ? "true" : "false"}
                onContextMenu={event => {
                  event.preventDefault(); event.stopPropagation();
                  const trigger = event.currentTarget.querySelector<HTMLButtonElement>('.workspace-tab')!;
                  const rect = trigger.getBoundingClientRect();
                  setMenu({ tabId: tab.tabId, x: event.clientX || rect.left, y: event.clientY || rect.bottom, trigger });
                }}
              >
                <button
                  type="button"
                  className={`workspace-tab ${isActive ? "is-active" : ""}`}
                  data-fishmark-region="workspace-tab"
                  data-tab-id={tab.tabId}
                  data-active={isActive ? "true" : "false"}
                  data-dirty={tab.isDirty ? "true" : "false"}
                  title={tooltip}
                  draggable={false}
                  aria-haspopup="menu"
                  onKeyDown={event => {
                    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenu({ tabId: tab.tabId, x: rect.left, y: rect.bottom, trigger: event.currentTarget });
                  }}
                  onClick={(event) => { if (!drag.consumeClick(event)) onTabActivate(tab.tabId); }}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      event.stopPropagation();
                      onCloseWorkspaceTab(tab.tabId);
                    }
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerDown={(event) => drag.onPointerDown(tab.tabId, event)}
                  onPointerMove={drag.onPointerMove}
                  onPointerUp={drag.onPointerUp}
                  onPointerCancel={drag.onPointerCancel}
                  onLostPointerCapture={drag.onPointerCancel}
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
        {menu && menuTab && <WorkspaceTabMenu key={`${menu.tabId}:${menu.x}:${menu.y}`} target={menu} tab={menuTab}
          platform={fishmarkPlatform} onDismiss={dismissMenu} onClose={onCloseWorkspaceTab}
          onSave={onSaveWorkspaceTab} onFile={onWorkspaceTabFile} />}
      </nav>
    )
  );
}
