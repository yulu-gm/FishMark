import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { AppNotification } from "../../shared/app-update";
import {
  RELOAD_WORKSPACE_TAB_FROM_PATH_ERROR_MESSAGES,
  type WorkspaceWindowSnapshot
} from "../../shared/workspace";
import {
  getActiveDocument,
  getActiveTabId
} from "./editor-shell-state";
import type { EditorLoadIdentity } from "./editor-load-identity";
import type {
  CodeEditorDiscardedDocumentText,
  CodeEditorDocumentChangeFrame,
  CodeEditorRemotePatchResult
} from "../code-editor";
import {
  WorkspaceRendererApplication,
  type WorkspaceApplicationOutcome,
  type WorkspaceReloadOutcome,
  type WorkspaceSaveOutcome
} from "./workspace-renderer-application";

type ShowNotification = (notification: AppNotification) => void;
type OpenResult = "opened" | "cancelled" | "failed";

function getFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

export function useWorkspaceController(input: {
  fishmark: Window["fishmark"];
  initialSnapshot?: WorkspaceWindowSnapshot | null;
  getEditorContent: () => string;
  showNotification: ShowNotification;
}) {
  const { fishmark, getEditorContent, initialSnapshot, showNotification } = input;
  const [application] = useState(() => new WorkspaceRendererApplication({
    bridge: fishmark,
    initialSnapshot,
    readEditorContent: getEditorContent
  }));
  const [editorTestAdapter] = useState(() => application.getEditorTestAdapter());
  const state = useSyncExternalStore(
    application.subscribe,
    application.getState,
    application.getState
  );

  useEffect(() => {
    application.start();
    return () => application.scheduleDispose();
  }, [application]);

  const notifyFailure = useCallback((outcome: WorkspaceApplicationOutcome<unknown>): void => {
    if (
      outcome.kind !== "failed" &&
      outcome.kind !== "failed-reconciled" &&
      outcome.kind !== "canonical-unavailable"
    ) {
      return;
    }
    showNotification({
      kind: "error",
      message: getFailureMessage(outcome.error)
    });
  }, [showNotification]);

  const getCurrentActiveDocument = useCallback(
    () => getActiveDocument(application.getState()),
    [application]
  );
  const getCurrentActiveTabId = useCallback(
    () => getActiveTabId(application.getState()),
    [application]
  );

  const flushActiveWorkspaceDraft = useCallback(async (): Promise<void> => {
    const outcome = await application.flushActiveWorkspaceDraft();
    if (outcome.kind !== "committed") {
      notifyFailure(outcome);
      throw outcome.kind === "failed" ||
        outcome.kind === "failed-reconciled" ||
        outcome.kind === "canonical-unavailable"
        ? outcome.error
        : new Error(`Workspace draft flush ended with ${outcome.kind}.`);
    }
  }, [application, notifyFailure]);

  const updateDraft = useCallback((inputValue: {
    identity: EditorLoadIdentity;
    content: string;
  }): boolean => application.recordEditorChange(inputValue), [application]);
  const recordDocumentChangeFrame = useCallback(
    (frame: CodeEditorDocumentChangeFrame): boolean =>
      application.recordEditorDocumentChangeFrame(frame),
    [application]
  );
  const recordDiscardedDocumentText = useCallback(
    (discarded: CodeEditorDiscardedDocumentText): boolean =>
      application.recordDiscardedEditorDocumentText(discarded),
    [application]
  );
  const recordPendingDocumentChanges = useCallback(
    (pending: { hasPending: boolean; identity: EditorLoadIdentity | null }): void =>
      application.recordEditorFramePending(pending),
    [application]
  );
  const registerEditorBarrier = useCallback(
    (barrier: (() => Promise<{
      readonly text: string;
      readonly identity: EditorLoadIdentity | null;
    }>) | null): void => application.registerEditorBarrier(barrier),
    [application]
  );
  const registerEditorRemotePatch = useCallback(
    (patch: ((input: {
      readonly identity: EditorLoadIdentity;
      readonly expectedBefore: string;
      readonly expectedAfter: string;
      readonly from: number;
      readonly to: number;
      readonly insert: string;
    }) => Promise<CodeEditorRemotePatchResult>) | null): void =>
      application.registerEditorRemotePatch(patch),
    [application]
  );
  const registerEditorCanonicalRestore = useCallback(
    (restore: ((input: {
      readonly identity: EditorLoadIdentity;
      readonly expectedBefore: string;
      readonly canonicalText: string;
    }) => Promise<{ readonly kind: "restored" | "stale-identity" | "text-mismatch" | "disposed" }>) | null) =>
      application.registerEditorCanonicalRestore(restore),
    [application]
  );

  const acknowledgeEditorLoad = useCallback(
    (identity: EditorLoadIdentity): boolean => application.acknowledgeEditorLoad(identity),
    [application]
  );
  const acknowledgeEditorTransition = useCallback(
    (transition: { token: number; readOnly: boolean }): boolean =>
      application.acknowledgeEditorTransition(transition),
    [application]
  );

  const loadInitialWorkspaceSnapshot = useCallback(async (): Promise<void> => {
    await application.refreshWorkspaceSnapshot();
  }, [application]);

  const openMarkdown = useCallback(async (): Promise<OpenResult> => {
    const outcome = await application.openMarkdown();
    if (outcome.kind === "committed") {
      return "opened";
    }
    if (outcome.kind === "cancelled" || outcome.kind === "superseded") {
      return "cancelled";
    }
    notifyFailure(outcome);
    return "failed";
  }, [application, notifyFailure]);

  const openMarkdownFromPath = useCallback(async (targetPath: string): Promise<boolean> => {
    const outcome = await application.openMarkdownFromPath(targetPath);
    if (outcome.kind !== "committed") {
      notifyFailure(outcome);
    }
    return outcome.kind === "committed";
  }, [application, notifyFailure]);

  const openMarkdownFromPaths = useCallback(async (targetPaths: string[]): Promise<boolean> => {
    const outcome = await application.openMarkdownFromPaths(targetPaths);
    if (outcome.kind !== "committed" && outcome.kind !== "cancelled") {
      notifyFailure(outcome);
    }
    return outcome.kind === "committed";
  }, [application, notifyFailure]);

  const createUntitledMarkdown = useCallback(async (): Promise<boolean> => {
    const outcome = await application.createUntitledMarkdown();
    if (outcome.kind !== "committed") {
      notifyFailure(outcome);
    }
    return outcome.kind === "committed";
  }, [application, notifyFailure]);

  const activateWorkspaceTab = useCallback(async (tabId: string): Promise<boolean> => {
    const outcome = await application.activateWorkspaceTab(tabId);
    if (outcome.kind !== "committed" && outcome.kind !== "superseded") {
      notifyFailure(outcome);
    }
    return outcome.kind === "committed";
  }, [application, notifyFailure]);

  useEffect(
    () => fishmark.onWorkspaceOwnerTabActivationRequest(({ tabId }) =>
      activateWorkspaceTab(tabId)
    ),
    [activateWorkspaceTab, fishmark]
  );

  const runVoidMutation = useCallback(async (
    operation: Promise<WorkspaceApplicationOutcome<void>>
  ): Promise<void> => {
    const outcome = await operation;
    if (outcome.kind !== "committed") {
      notifyFailure(outcome);
    }
  }, [notifyFailure]);

  const closeWorkspaceTab = useCallback(
    (tabId: string): Promise<void> => runVoidMutation(application.closeWorkspaceTab(tabId)),
    [application, runVoidMutation]
  );
  const reorderWorkspaceTab = useCallback(
    (tabId: string, toIndex: number): Promise<void> =>
      runVoidMutation(application.reorderWorkspaceTab(tabId, toIndex)),
    [application, runVoidMutation]
  );
  const detachWorkspaceTab = useCallback(
    (tabId: string): Promise<void> => runVoidMutation(application.detachWorkspaceTab(tabId)),
    [application, runVoidMutation]
  );

  const reloadWorkspaceTabFromPath = useCallback(async (
    inputValue: { tabId: string }
  ): Promise<boolean> => {
    const outcome: WorkspaceReloadOutcome = await application.reloadWorkspaceTabFromPath(
      inputValue.tabId
    );
    if (outcome.kind === "committed") {
      return true;
    }
    if (outcome.kind === "revision-stale") {
      showNotification({
        kind: "warning",
        message: "重新加载期间检测到新的编辑，已保留当前内容。请重试。"
      });
    } else if (outcome.kind === "reload-error") {
      showNotification({
        kind: "error",
        message: RELOAD_WORKSPACE_TAB_FROM_PATH_ERROR_MESSAGES[outcome.error.code]
      });
    } else {
      notifyFailure(outcome);
    }
    return false;
  }, [application, notifyFailure, showNotification]);

  const confirmWorkspaceWindowClose = useCallback(async (requestId: string): Promise<boolean> => {
    const outcome = await application.confirmWorkspaceWindowClose(requestId);
    if (outcome.kind !== "committed") {
      notifyFailure(outcome);
      return false;
    }
    return outcome.value;
  }, [application, notifyFailure]);

  const runSaveTransaction = useCallback(
    (saveInput: { forceSaveAs: boolean; hasExternalConflict: boolean }): Promise<WorkspaceSaveOutcome> =>
      application.runSaveTransaction(saveInput),
    [application]
  );
  const runWithActiveEditBarrier = useCallback(
    <T,>(operation: (
      document: NonNullable<WorkspaceWindowSnapshot["activeDocument"]>,
      sealedText: string
    ) => Promise<T>): Promise<WorkspaceApplicationOutcome<T>> =>
      application.runWithActiveEditBarrier(operation),
    [application]
  );

  return {
    state,
    editorTestAdapter,
    getActiveDocument: getCurrentActiveDocument,
    getActiveTabId: getCurrentActiveTabId,
    activeDocument: getActiveDocument(state),
    editorViewSnapshot: application.getEditorViewSnapshot(),
    editorLoadRevision: state.editorLoadRevision,
    editorEpoch: state.editorEpoch,
    editorTransition: state.editorTransition,
    flushActiveWorkspaceDraft,
    updateDraft,
    recordDocumentChangeFrame,
    recordDiscardedDocumentText,
    recordPendingDocumentChanges,
    registerEditorBarrier,
    registerEditorRemotePatch,
    registerEditorCanonicalRestore,
    acknowledgeEditorLoad,
    acknowledgeEditorTransition,
    loadInitialWorkspaceSnapshot,
    openMarkdown,
    openMarkdownFromPath,
    openMarkdownFromPaths,
    createUntitledMarkdown,
    activateWorkspaceTab,
    closeWorkspaceTab,
    reorderWorkspaceTab,
    detachWorkspaceTab,
    reloadWorkspaceTabFromPath,
    confirmWorkspaceWindowClose,
    runSaveTransaction,
    runWithActiveEditBarrier
  };
}
