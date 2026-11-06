import type { WorkspaceWindowSnapshot } from "./workspace";

export const WORKSPACE_TAB_FILE_CHANNEL = "fishmark:workspace-tab-file";
export type WorkspaceTabFileInput =
  | { tabId: string; command: "rename"; name: string }
  | { tabId: string; command: "copy-path" | "reveal" };
export type WorkspaceTabFileResult =
  | { kind: "success"; snapshot: WorkspaceWindowSnapshot }
  | { kind: "error"; message: string };
