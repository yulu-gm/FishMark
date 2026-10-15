import type { WorkspaceDocumentSnapshot } from "./workspace";

export type WorkspaceTabDropResult =
  | { kind: "detach" }
  | { kind: "cancelled" }
  | { kind: "target"; targetWindowId: string; dropId: string };
export type WorkspaceTabReceiptRequest = Readonly<{
  requestId: string;
  tabId: string;
  targetWindowId: string;
  document: WorkspaceDocumentSnapshot;
  point?: Readonly<{ x: number; y: number }>;
  expiresAt: number;
}>;
export type WorkspaceTabReceiptComplete = Readonly<{ requestId: string; committed: boolean }>;
export const RESOLVE_WORKSPACE_TAB_DROP_CHANNEL = "fishmark:resolve-workspace-tab-drop";
export const REQUEST_WORKSPACE_TAB_RECEIPT_EVENT = "fishmark:request-workspace-tab-receipt";
export const CONFIRM_WORKSPACE_TAB_RECEIPT_CHANNEL = "fishmark:confirm-workspace-tab-receipt";
export const COMPLETE_WORKSPACE_TAB_RECEIPT_EVENT = "fishmark:complete-workspace-tab-receipt";
