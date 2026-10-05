import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AppNotification } from "../../shared/app-update";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import { WorkspaceRendererApplication } from "../application/workspace-renderer-application";

// React owns subscription and attachment lifetime only; commands and scheduling live in application.
export function useWorkspaceController(input: {
  fishmark: Window["fishmark"];
  initialSnapshot?: WorkspaceWindowSnapshot | null;
  showNotification: (notification: AppNotification) => void;
  setEditorContentSnapshot?: (content: string) => void;
  autosaveDelayMs?: number;
}) {
  const [application] = useState(() => new WorkspaceRendererApplication({ bridge: input.fishmark, gateway: input.fishmark, initialSnapshot: input.initialSnapshot }));
  const state = useSyncExternalStore(application.subscribe, application.getState, application.getState);
  const { showNotification, setEditorContentSnapshot, autosaveDelayMs } = input;
  useEffect(() => {
    application.updatePresentation({ showNotification, setEditorContentSnapshot, autosaveDelayMs });
  }, [application, showNotification, setEditorContentSnapshot, autosaveDelayMs]);
  useEffect(() => {
    application.start();
    return () => application.scheduleDispose();
  }, [application]);
  const bindings = useMemo(() => ({
    editorTestAdapter: application.getEditorTestAdapter(),
    getActiveDocument: application.getActiveDocument,
    getActiveTabId: application.getActiveTabId,
    recordDocumentChangeFrame: application.recordEditorDocumentChangeFrame.bind(application),
    recordDiscardedDocumentText: application.recordDiscardedEditorDocumentText.bind(application),
    recordPendingDocumentChanges: application.recordEditorFramePending.bind(application),
    registerEditorBarrier: application.registerEditorBarrier.bind(application),
    registerEditorRemotePatch: application.registerEditorRemotePatch.bind(application),
    registerEditorCanonicalRestore: application.registerEditorCanonicalRestore.bind(application),
    acknowledgeEditorLoad: application.acknowledgeEditorLoad.bind(application),
    acknowledgeEditorTransition: application.acknowledgeEditorTransition.bind(application),
    runSaveTransaction: application.runSaveTransaction.bind(application),
    runWithActiveEditBarrier: application.runWithActiveEditBarrier.bind(application)
  }), [application]);
  return {
    ...application.commands,
    ...bindings,
    application,
    state,
    activeDocument: state.workspaceSnapshot?.activeDocument ?? null,
    editorViewSnapshot: application.getEditorViewSnapshot(),
    editorLoadRevision: state.editorLoadRevision,
    editorEpoch: state.editorEpoch,
    editorTransition: state.editorTransition
  };
}
