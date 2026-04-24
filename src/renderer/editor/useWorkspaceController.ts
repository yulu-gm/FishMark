import { useCallback, useEffect, useRef, useState } from "react";

import type { AppNotification } from "../../shared/app-update";
import type { WorkspaceWindowSnapshot } from "../../shared/workspace";
import {
  applyWorkspaceSnapshot,
  createInitialEditorShellState,
  getActiveDocument,
  getActiveTabId,
  getWorkspaceTabs,
  setOpenState,
  type EditorShellState
} from "./editor-shell-state";

type ShowNotification = (notification: AppNotification) => void;
type OpenResult = "opened" | "cancelled" | "failed";

export function useWorkspaceController(input: {
  fishmark: Window["fishmark"];
  initialSnapshot?: WorkspaceWindowSnapshot | null;
  getEditorContent: () => string;
  showNotification: ShowNotification;
}) {
  const { fishmark, getEditorContent, showNotification, initialSnapshot } = input;
  const [state, setState] = useState<EditorShellState>(() => {
    if (!initialSnapshot) {
      return createInitialEditorShellState();
    }

    return applyWorkspaceSnapshot(createInitialEditorShellState(), initialSnapshot, {
      currentEditorContent: initialSnapshot.activeDocument?.content ?? ""
    });
  });
  const stateRef = useRef(state);
  const workspaceDraftSyncQueueRef = useRef(Promise.resolve());
  const workspaceDraftSyncFailureRef = useRef<unknown>(null);
  const workspaceDraftSyncRetryPendingRef = useRef(false);
  const lastDraftSyncRequestRef = useRef<{ tabId: string; content: string } | null>(null);

  const applyState = useCallback((updater: (current: EditorShellState) => EditorShellState): void => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const getState = useCallback((): EditorShellState => stateRef.current, []);
  const getCurrentActiveDocument = useCallback(() => getActiveDocument(stateRef.current), []);
  const getCurrentActiveTabId = useCallback(() => getActiveTabId(stateRef.current), []);

  const applyWorkspaceWindowSnapshot = useCallback(
    (snapshot: WorkspaceWindowSnapshot): EditorShellState => {
      let nextState = stateRef.current;

      applyState((current) => {
        nextState = setOpenState(
          applyWorkspaceSnapshot(current, snapshot, {
            currentEditorContent: getEditorContent()
          }),
          "idle"
        );
        return nextState;
      });

      return nextState;
    },
    [applyState, getEditorContent]
  );

  const syncActiveWorkspaceDraft = useCallback(
    async (tabId: string, content: string): Promise<void> => {
      try {
        lastDraftSyncRequestRef.current = { tabId, content };
        const snapshot = await fishmark.updateWorkspaceTabDraft({
          tabId,
          content
        });

        workspaceDraftSyncFailureRef.current = null;
        workspaceDraftSyncRetryPendingRef.current = false;
        applyWorkspaceWindowSnapshot(snapshot);
      } catch (error) {
        workspaceDraftSyncFailureRef.current = error;
        throw error;
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark]
  );

  const queueWorkspaceDraftSync = useCallback(
    (tabId: string, content: string): Promise<void> => {
      const nextSync = workspaceDraftSyncQueueRef.current.then(() =>
        syncActiveWorkspaceDraft(tabId, content)
      );

      workspaceDraftSyncQueueRef.current = nextSync.then(
        () => undefined,
        () => undefined
      );

      return nextSync;
    },
    [syncActiveWorkspaceDraft]
  );

  const flushActiveWorkspaceDraft = useCallback(async (): Promise<void> => {
    while (true) {
      const activeDocument = getActiveDocument(stateRef.current);
      const shouldForceCanonicalResync = workspaceDraftSyncRetryPendingRef.current;

      if (!activeDocument) {
        await workspaceDraftSyncQueueRef.current;
        if (workspaceDraftSyncFailureRef.current !== null && !shouldForceCanonicalResync) {
          workspaceDraftSyncRetryPendingRef.current = true;
          throw workspaceDraftSyncFailureRef.current;
        }
        return;
      }

      const currentContent = getEditorContent();
      const lastDraftSyncRequest = lastDraftSyncRequestRef.current;

      if (
        workspaceDraftSyncFailureRef.current !== null &&
        !shouldForceCanonicalResync &&
        lastDraftSyncRequest?.tabId === activeDocument.tabId &&
        lastDraftSyncRequest.content === currentContent
      ) {
        workspaceDraftSyncRetryPendingRef.current = true;
        throw workspaceDraftSyncFailureRef.current;
      }

      if (currentContent === activeDocument.content && !shouldForceCanonicalResync) {
        await workspaceDraftSyncQueueRef.current;

        const latestDocument = getActiveDocument(stateRef.current);

        if (!latestDocument) {
          return;
        }

        if (getEditorContent() === latestDocument.content) {
          if (workspaceDraftSyncFailureRef.current !== null) {
            workspaceDraftSyncRetryPendingRef.current = true;
            throw workspaceDraftSyncFailureRef.current;
          }
          return;
        }

        continue;
      }

      await queueWorkspaceDraftSync(activeDocument.tabId, currentContent);
    }
  }, [getEditorContent, queueWorkspaceDraftSync]);

  const updateDraft = useCallback(
    async (content: string): Promise<void> => {
      const activeTabId = getActiveTabId(stateRef.current);

      if (!activeTabId) {
        return;
      }

      await queueWorkspaceDraftSync(activeTabId, content);
    },
    [queueWorkspaceDraftSync]
  );

  const refreshWorkspaceSnapshot = useCallback(async (): Promise<WorkspaceWindowSnapshot | null> => {
    const snapshot = await fishmark.getWorkspaceSnapshot();
    applyWorkspaceWindowSnapshot(snapshot);
    return snapshot;
  }, [applyWorkspaceWindowSnapshot, fishmark]);

  const loadInitialWorkspaceSnapshot = useCallback(async (): Promise<void> => {
    try {
      await refreshWorkspaceSnapshot();
    } catch {
      // Keep the local empty state if the workspace snapshot is temporarily unavailable.
    }
  }, [refreshWorkspaceSnapshot]);

  const setWorkspaceOpenState = useCallback(
    (openState: "idle" | "opening"): void => {
      applyState((current) => setOpenState(current, openState));
    },
    [applyState]
  );

  const openMarkdown = useCallback(async (): Promise<OpenResult> => {
    setWorkspaceOpenState("opening");

    try {
      const result = await fishmark.openWorkspaceFile();

      if (result.kind === "cancelled") {
        setWorkspaceOpenState("idle");
        return "cancelled";
      }

      if (result.kind === "error") {
        throw new Error(result.error.message);
      }

      applyWorkspaceWindowSnapshot(result.snapshot);
      return "opened";
    } catch (error) {
      setWorkspaceOpenState("idle");
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      return "failed";
    }
  }, [applyWorkspaceWindowSnapshot, fishmark, setWorkspaceOpenState, showNotification]);

  const openMarkdownFromPath = useCallback(
    async (targetPath: string): Promise<boolean> => {
      setWorkspaceOpenState("opening");

      try {
        const result = await fishmark.openWorkspaceFileFromPath(targetPath);

        if (result.kind === "error") {
          throw new Error(result.error.message);
        }

        applyWorkspaceWindowSnapshot(result.snapshot);
        return true;
      } catch (error) {
        setWorkspaceOpenState("idle");
        showNotification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark, setWorkspaceOpenState, showNotification]
  );

  const createUntitledMarkdown = useCallback(async (): Promise<boolean> => {
    try {
      const snapshot = await fishmark.createWorkspaceTab({
        kind: "untitled"
      });
      applyWorkspaceWindowSnapshot(snapshot);
      return true;
    } catch (error) {
      showNotification({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }, [applyWorkspaceWindowSnapshot, fishmark, showNotification]);

  const activateWorkspaceTab = useCallback(
    async (tabId: string): Promise<void> => {
      if (getActiveTabId(stateRef.current) === tabId) {
        return;
      }

      try {
        await flushActiveWorkspaceDraft();
        const snapshot = await fishmark.activateWorkspaceTab({ tabId });
        applyWorkspaceWindowSnapshot(snapshot);
      } catch (error) {
        showNotification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark, flushActiveWorkspaceDraft, showNotification]
  );

  const closeWorkspaceTab = useCallback(
    async (tabId: string): Promise<void> => {
      try {
        await flushActiveWorkspaceDraft();
        const snapshot = await fishmark.closeWorkspaceTab({ tabId });
        applyWorkspaceWindowSnapshot(snapshot);
      } catch (error) {
        showNotification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark, flushActiveWorkspaceDraft, showNotification]
  );

  const reorderWorkspaceTab = useCallback(
    async (tabId: string, toIndex: number): Promise<void> => {
      try {
        await flushActiveWorkspaceDraft();
        const snapshot = await fishmark.reorderWorkspaceTab({ tabId, toIndex });
        applyWorkspaceWindowSnapshot(snapshot);
      } catch (error) {
        showNotification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark, flushActiveWorkspaceDraft, showNotification]
  );

  const detachWorkspaceTab = useCallback(
    async (tabId: string): Promise<void> => {
      try {
        await flushActiveWorkspaceDraft();
        const snapshot = await fishmark.detachWorkspaceTabToNewWindow({ tabId });
        applyWorkspaceWindowSnapshot(snapshot);
      } catch (error) {
        showNotification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark, flushActiveWorkspaceDraft, showNotification]
  );

  const reloadWorkspaceTabFromPath = useCallback(
    async (inputValue: { tabId: string; targetPath: string }): Promise<boolean> => {
      setWorkspaceOpenState("opening");

      try {
        const snapshot = await fishmark.reloadWorkspaceTabFromPath(inputValue);
        applyWorkspaceWindowSnapshot(snapshot);
        return true;
      } catch (error) {
        setWorkspaceOpenState("idle");
        showNotification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark, setWorkspaceOpenState, showNotification]
  );

  return {
    state,
    applyState,
    getState,
    getActiveDocument: getCurrentActiveDocument,
    getActiveTabId: getCurrentActiveTabId,
    workspaceSnapshot: state.workspaceSnapshot,
    activeDocument: getActiveDocument(state),
    workspaceTabs: getWorkspaceTabs(state),
    activeTabId: getActiveTabId(state),
    editorLoadRevision: state.editorLoadRevision,
    openState: state.openState,
    applyWorkspaceWindowSnapshot,
    flushActiveWorkspaceDraft,
    updateDraft,
    refreshWorkspaceSnapshot,
    loadInitialWorkspaceSnapshot,
    setWorkspaceOpenState,
    openMarkdown,
    openMarkdownFromPath,
    createUntitledMarkdown,
    activateWorkspaceTab,
    closeWorkspaceTab,
    reorderWorkspaceTab,
    detachWorkspaceTab,
    reloadWorkspaceTabFromPath
  };
}
