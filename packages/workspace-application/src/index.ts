export { createApplyDocumentEdits, type ApplyDocumentDraftInput } from "./apply-document-edits";
export {
  createWorkspaceApplication,
  type WorkspaceMoveCommandResult,
  type WorkspaceProjectionCommandResult,
  type WorkspaceProjectionMutationResult,
  type WorkspaceSaveCommandResult
} from "./workspace-application";
export {
  createWorkspaceDetach
} from "./detach-workspace";
export {
  createWorkspaceOpen,
  type WorkspaceOpenPathResult,
  type WorkspaceOpenResult
} from "./open-workspace";
export {
  createWorkspaceOwnerTabActivation
} from "./owner-activation";
export {
  createWorkspaceReload,
  type WorkspaceReloadErrorCode,
  type WorkspaceReloadResult
} from "./reload-document";
export {
  createWorkspaceTabReorder,
  type WorkspaceTabReorderInput
} from "./tab-reorder";
export {
  createWorkspaceTabTransfer,
  type WorkspaceTabTransfer,
  type WorkspaceTabTransferInput
} from "./tab-transfer";
export {
  createSaveDocument,
  type SaveDocumentDependencies,
  type SaveDocumentInput
} from "./save-document";
export {
  createCloseWorkspace,
  createWorkspaceWindowClose,
  type CloseWorkspaceDependencies,
  type CloseWorkspaceError,
  type CloseWorkspaceTabRequest,
  type CloseWorkspaceTabResult,
  type ConfirmWorkspaceWindowCloseRequest,
  type ConfirmWorkspaceWindowCloseResult,
  type HeldWorkspaceWindowCloseLease,
  type WorkspaceWindowCloseConfirmation
} from "./close-workspace";
export type {
  CleanupReporterPort,
  DocumentFilePort,
  DocumentReadErrorCode,
  DocumentReadResult,
  FileIdentityPort,
  KeyedOperationCoordinator,
  KeyedOperationLease,
  OwnerActivationPort,
  PathDialogResult,
  PersistedMarkdownDocument,
  RecentFilesPort,
  ResolvedExistingFileIdentity,
  ResolvedFileIdentity,
  ResolvedProspectiveFileIdentity,
  SaveDocumentErrorCode,
  SaveDocumentResult,
  WorkspaceDialogPort,
  WorkspaceWatcherPort,
  WorkspaceWindowLifecyclePort
} from "./ports";
