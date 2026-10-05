import { useMemo } from "react";
import type { AppNotification } from "../../shared/app-update";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { useWorkspaceController } from "./useWorkspaceController";

export function useEditorApplicationController(input: {
  autosaveDelayMs: number;
  fishmark: Window["fishmark"];
  initialSnapshot?: WorkspaceWindowSnapshot | null;
  setEditorContentSnapshot: (content: string) => void;
  showNotification: (notification: AppNotification) => void;
}) {
  const workspace = useWorkspaceController(input);
  const application = workspace.application;
  const editorWorkflow = useMemo(() => ({
    handleEditorDocumentChangeFrame: application.handleEditorDocumentChangeFrame,
    handleEditorBlur: application.handleEditorBlur,
    activateWorkspaceTab: application.commands.activateWorkspaceTab,
    closeWorkspaceTab: application.commands.closeWorkspaceTab,
    detachWorkspaceTab: application.commands.detachWorkspaceTab
  }), [application]);
  return {
    commands: application.commands,
    gateway: application.gateway,
    editorWorkflow,
    externalConflict: {
      externalFileState: application.getExternalFileState(),
      keepMemoryVersion: application.keepMemoryVersion,
      reloadFromDisk: application.reloadFromDisk,
      dismissConflict: application.dismissConflict,
      hasExternalFileConflict: application.hasExternalFileConflict
    },
    save: application.save,
    workspace
  };
}
