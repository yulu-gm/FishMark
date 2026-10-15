import type { WorkspaceState } from "@fishmark/workspace-domain";

// Class methods need explicit receivers; spread cannot copy prototype methods.
export function createResourceWorkspacePorts(workspace: WorkspaceState, advance: (tabId: string) => void, saved: (tabId: string) => void) {
  return {
    save: {
      getFileOwner: (identity: Parameters<WorkspaceState["getFileOwner"]>[0]) => workspace.getFileOwner(identity),
      getTabSession: (tabId: string) => workspace.getTabSession(tabId),
      markExternalChange: (input: Parameters<WorkspaceState["markExternalChange"]>[0]) => workspace.markExternalChange(input),
      saveTabDocument(input: Parameters<WorkspaceState["saveTabDocument"]>[0]) {
        const result = workspace.saveTabDocument(input);
        if (result.kind === "applied") { advance(input.tabId); saved(input.tabId); }
        return result;
      }
    },
    transfer: {
      getTabSession: (tabId: string) => workspace.getTabSession(tabId),
      moveTabToWindow(input: Parameters<WorkspaceState["moveTabToWindow"]>[0]) {
        const before = workspace.getTabSession(input.tabId).windowId;
        const result = workspace.moveTabToWindow(input);
        if (workspace.getTabSession(input.tabId).windowId !== before) advance(input.tabId);
        return result;
      },
      detachTabToWindow(input: Parameters<WorkspaceState["detachTabToWindow"]>[0]) {
        const before = workspace.getTabSession(input.tabId).windowId;
        const result = workspace.detachTabToWindow(input);
        if (workspace.getTabSession(input.tabId).windowId !== before) advance(input.tabId);
        return result;
      }
    }
  };
}
