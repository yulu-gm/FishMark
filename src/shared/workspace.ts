import type { OpenMarkdownDocument } from "./open-markdown-file";

export type WorkspaceTabSaveState = "idle" | "manual-saving" | "autosaving";

export type WorkspaceTabStripItem = {
  tabId: string;
  path: string | null;
  name: string;
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
};

export type WorkspaceDocumentSnapshot = OpenMarkdownDocument & {
  tabId: string;
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
};

export type WorkspaceWindowSnapshot = {
  windowId: string;
  activeTabId: string | null;
  tabs: WorkspaceTabStripItem[];
  activeDocument: WorkspaceDocumentSnapshot | null;
};

export type CreateWorkspaceTabInput = {
  kind: "untitled";
};

export type ActivateWorkspaceTabInput = {
  tabId: string;
};

export type CloseWorkspaceTabInput = {
  tabId: string;
};

export type ReorderWorkspaceTabInput = {
  tabId: string;
  toIndex: number;
};

export type MoveWorkspaceTabToWindowInput = {
  tabId: string;
  targetWindowId: string;
  targetIndex?: number;
};

export type DetachWorkspaceTabToNewWindowInput = {
  tabId: string;
};

export type UpdateWorkspaceTabDraftInput = {
  tabId: string;
  content: string;
};

export type WorkspaceMoveTabResult = {
  sourceWindowSnapshot: WorkspaceWindowSnapshot;
  targetWindowSnapshot: WorkspaceWindowSnapshot;
};

export type OpenWorkspacePathRequest = {
  targetPath: string;
};

export const GET_WORKSPACE_SNAPSHOT_CHANNEL = "fishmark:get-workspace-snapshot";
export const CREATE_WORKSPACE_TAB_CHANNEL = "fishmark:create-workspace-tab";
export const OPEN_WORKSPACE_FILE_CHANNEL = "fishmark:open-workspace-file";
export const OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL = "fishmark:open-workspace-file-from-path";
export const ACTIVATE_WORKSPACE_TAB_CHANNEL = "fishmark:activate-workspace-tab";
export const CLOSE_WORKSPACE_TAB_CHANNEL = "fishmark:close-workspace-tab";
export const REORDER_WORKSPACE_TAB_CHANNEL = "fishmark:reorder-workspace-tab";
export const MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL = "fishmark:move-workspace-tab-to-window";
export const DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL = "fishmark:detach-workspace-tab-to-new-window";
export const UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL = "fishmark:update-workspace-tab-draft";
export const OPEN_WORKSPACE_PATH_EVENT = "fishmark:open-workspace-path";
