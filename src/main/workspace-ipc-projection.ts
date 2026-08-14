import type {
  WorkspaceMoveProjection,
  WorkspaceWindowProjection
} from "@fishmark/workspace-domain";

import type {
  WorkspaceMoveTabResult,
  WorkspaceWindowSnapshot
} from "../shared/workspace";

export function toWorkspaceWindowSnapshot(
  projection: WorkspaceWindowProjection
): WorkspaceWindowSnapshot {
  return {
    windowId: projection.windowId,
    activeTabId: projection.activeTabId,
    tabs: projection.tabs.map((tab) => ({
      tabId: tab.tabId,
      path: tab.path,
      name: tab.name,
      isDirty: tab.isDirty,
      saveState: tab.saveState
    })),
    activeDocument:
      projection.activeDocument === null
        ? null
        : {
            tabId: projection.activeDocument.tabId,
            path: projection.activeDocument.path,
            name: projection.activeDocument.name,
            content: projection.activeDocument.content,
            encoding: projection.activeDocument.encoding,
            revision: projection.activeDocument.revision,
            savedRevision: projection.activeDocument.savedRevision,
            isDirty: projection.activeDocument.isDirty,
            saveState: projection.activeDocument.saveState,
            externalChange: projection.activeDocument.externalChange
          }
  };
}

export function toWorkspaceMoveTabResult(
  projection: WorkspaceMoveProjection
): WorkspaceMoveTabResult {
  return {
    sourceWindowSnapshot: toWorkspaceWindowSnapshot(
      projection.sourceWindowSnapshot
    ),
    targetWindowSnapshot: toWorkspaceWindowSnapshot(
      projection.targetWindowSnapshot
    )
  };
}
