import {
  OPEN_MARKDOWN_FILE_ERROR_MESSAGES,
  type OpenMarkdownFileErrorCode
} from "./open-markdown-file";

export type WorkspaceTabSaveState = "idle" | "manual-saving" | "autosaving";

export type WorkspaceTabStripItem = {
  tabId: string;
  path: string | null;
  name: string;
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
};

export type WorkspaceExternalChange = {
  kind: "modified" | "deleted";
};

export type WorkspaceDocumentSnapshot = {
  tabId: string;
  path: string | null;
  name: string;
  content: string;
  encoding: "utf-8";
  revision: number;
  savedRevision: number;
  isDirty: boolean;
  saveState: WorkspaceTabSaveState;
  externalChange?: WorkspaceExternalChange | null;
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

export type ReloadWorkspaceTabFromPathInput = {
  tabId: string;
};

export type ReloadWorkspaceTabFromPathErrorCode =
  | OpenMarkdownFileErrorCode
  | "file-identity-changed"
  | "file-identity-conflict";

export type ReloadWorkspaceTabFromPathError = {
  code: ReloadWorkspaceTabFromPathErrorCode;
  message: string;
};

export type ReloadWorkspaceTabFromPathResult =
  | WorkspaceCommandSuccess<WorkspaceWindowSnapshot>
  | {
      kind: "revision-stale";
    }
  | {
      kind: "error";
      error: ReloadWorkspaceTabFromPathError;
    };

export const RELOAD_WORKSPACE_TAB_FROM_PATH_ERROR_MESSAGES: Record<
  ReloadWorkspaceTabFromPathErrorCode,
  string
> = {
  ...OPEN_MARKDOWN_FILE_ERROR_MESSAGES,
  "file-identity-changed":
    "The Markdown file changed while reloading. Please try again.",
  "file-identity-conflict": "That file is already open in another tab."
};

export type WorkspaceMoveTabResult = {
  sourceWindowSnapshot: WorkspaceWindowSnapshot;
  targetWindowSnapshot: WorkspaceWindowSnapshot;
};

export type WorkspaceResultError = {
  code: OpenMarkdownFileErrorCode | "unknown-window" | "unknown-tab";
  message: string;
};

export type WorkspaceCommandSuccess<TSnapshot> = {
  kind: "success";
  snapshot: TSnapshot;
};

export type WorkspaceCommandCancelled = {
  kind: "cancelled";
};

export type WorkspaceCommandFocusedExisting = {
  kind: "focused-existing";
};

export type WorkspaceCommandError = {
  kind: "error";
  error: WorkspaceResultError;
};

export type OpenWorkspaceFileResult =
  | WorkspaceCommandSuccess<WorkspaceWindowSnapshot>
  | WorkspaceCommandCancelled
  | WorkspaceCommandFocusedExisting
  | WorkspaceCommandError;

export type OpenWorkspaceFileFromPathResult =
  | WorkspaceCommandSuccess<WorkspaceWindowSnapshot>
  | WorkspaceCommandFocusedExisting
  | WorkspaceCommandError;

export type OpenWorkspacePathRequest = {
  targetPath: string;
};

export type WorkspaceWindowCloseRequest = {
  requestId: string;
};

export type WorkspaceOwnerTabActivationRequest = {
  requestId: string;
  tabId: string;
};

export type ConfirmWorkspaceOwnerTabActivationInput = {
  requestId: string;
  tabId: string;
  success: boolean;
};

export type ConfirmWorkspaceWindowCloseInput = {
  requestId: string;
};

export type WorkspaceWindowCloseErrorCode =
  | "dialog-failed"
  | "write-failed"
  | "disk-version-conflict"
  | "file-identity-conflict"
  | "file-identity-changed"
  | "tab-missing"
  | "window-missing"
  | "window-changed"
  | "revision-changed"
  | "file-identity-missing"
  | "runtime-context-unavailable";

export type ConfirmWorkspaceWindowCloseResult =
  | { status: "confirmed" }
  | { status: "cancelled" }
  | {
      status: "error";
      error: {
        code: WorkspaceWindowCloseErrorCode;
        message: string;
      };
    };

export type CompleteWorkspaceWindowCloseInput = {
  requestId: string;
  shouldClose: boolean;
};

export type ResolveExternalChangeCommandKind =
  | "keep-memory"
  | "reload"
  | "save-as"
  | "cancel";

export type ResolveExternalChangeInput = {
  tabId: string;
  command: ResolveExternalChangeCommandKind;
};

export type ResolveExternalChangeResult =
  | { kind: "resolved" }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export const RESOLVE_EXTERNAL_CHANGE_CHANNEL = "fishmark:resolve-external-change";

export const GET_WORKSPACE_SNAPSHOT_CHANNEL = "fishmark:get-workspace-snapshot";
export const CREATE_WORKSPACE_TAB_CHANNEL = "fishmark:create-workspace-tab";
export const OPEN_WORKSPACE_FILE_CHANNEL = "fishmark:open-workspace-file";
export const OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL = "fishmark:open-workspace-file-from-path";
export const ACTIVATE_WORKSPACE_TAB_CHANNEL = "fishmark:activate-workspace-tab";
export const CLOSE_WORKSPACE_TAB_CHANNEL = "fishmark:close-workspace-tab";
export const REORDER_WORKSPACE_TAB_CHANNEL = "fishmark:reorder-workspace-tab";
export const MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL = "fishmark:move-workspace-tab-to-window";
export const DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL = "fishmark:detach-workspace-tab-to-new-window";
export const RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL = "fishmark:reload-workspace-tab-from-path";
export const OPEN_WORKSPACE_PATH_EVENT = "fishmark:open-workspace-path";
export const REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT =
  "fishmark:request-workspace-owner-tab-activation";
export const CONFIRM_WORKSPACE_OWNER_TAB_ACTIVATION_CHANNEL =
  "fishmark:confirm-workspace-owner-tab-activation";
export const REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT = "fishmark:request-workspace-window-close";
export const CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL = "fishmark:confirm-workspace-window-close";
export const COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL = "fishmark:complete-workspace-window-close";
