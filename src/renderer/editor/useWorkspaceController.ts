import { useCallback, useEffect, useRef, useState } from "react";

import type { AppNotification } from "../../shared/app-update";
import {
  RELOAD_WORKSPACE_TAB_FROM_PATH_ERROR_MESSAGES,
  type WorkspaceWindowSnapshot
} from "../../shared/workspace";
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
const WORKSPACE_ACTIVATION_DRAFT_DRAIN_LIMIT = 16;

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
  const pendingWorkspaceDraftRef = useRef<{ tabId: string; content: string } | null>(null);
  const activationGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  const applyState = useCallback((updater: (current: EditorShellState) => EditorShellState): void => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activationGenerationRef.current += 1;
    };
  }, []);

  const getState = useCallback((): EditorShellState => stateRef.current, []);
  const getCurrentActiveDocument = useCallback(() => getActiveDocument(stateRef.current), []);
  const getCurrentActiveTabId = useCallback(() => getActiveTabId(stateRef.current), []);

  const applyWorkspaceWindowSnapshot = useCallback(
    (
      snapshot: WorkspaceWindowSnapshot,
      options: { preserveActiveDocumentDraft?: boolean } = {}
    ): EditorShellState => {
      let nextState = stateRef.current;

      applyState((current) => {
        nextState = setOpenState(
          applyWorkspaceSnapshot(current, snapshot, {
            currentEditorContent: getEditorContent(),
            preserveActiveDocumentDraft: options.preserveActiveDocumentDraft ?? false
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
    async (
      tabId: string,
      content: string,
      options: { applySnapshot?: boolean } = {}
    ): Promise<WorkspaceWindowSnapshot> => {
      try {
        lastDraftSyncRequestRef.current = { tabId, content };
        const snapshot = await fishmark.updateWorkspaceTabDraft({
          tabId,
          content
        });

        if (
          pendingWorkspaceDraftRef.current?.tabId === tabId &&
          pendingWorkspaceDraftRef.current.content === content
        ) {
          pendingWorkspaceDraftRef.current = null;
        }
        workspaceDraftSyncFailureRef.current = null;
        workspaceDraftSyncRetryPendingRef.current = false;
        if (options.applySnapshot ?? true) {
          applyWorkspaceWindowSnapshot(snapshot, {
            preserveActiveDocumentDraft: true
          });
        }
        return snapshot;
      } catch (error) {
        workspaceDraftSyncFailureRef.current = error;
        throw error;
      }
    },
    [applyWorkspaceWindowSnapshot, fishmark]
  );

  const queueWorkspaceDraftSync = useCallback(
    (
      tabId: string,
      content: string,
      options: { applySnapshot?: boolean } = {}
    ): Promise<WorkspaceWindowSnapshot> => {
      const nextSync = workspaceDraftSyncQueueRef.current.then(() =>
        syncActiveWorkspaceDraft(tabId, content, options)
      );

      workspaceDraftSyncQueueRef.current = nextSync.then(
        () => undefined,
        () => undefined
      );

      return nextSync;
    },
    [syncActiveWorkspaceDraft]
  );

  const flushActiveWorkspaceDraft = useCallback(async (
    options: { maxSyncPasses?: number } = {}
  ): Promise<void> => {
    let syncPasses = 0;
    const queueBoundedDraftSync = async (
      tabId: string,
      content: string
    ): Promise<void> => {
      if (
        options.maxSyncPasses !== undefined &&
        syncPasses >= options.maxSyncPasses
      ) {
        throw new Error(
          "Workspace draft flush was cancelled because editing did not settle."
        );
      }
      syncPasses += 1;
      await queueWorkspaceDraftSync(tabId, content);
    };

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
      const pendingWorkspaceDraft = pendingWorkspaceDraftRef.current;

      if (pendingWorkspaceDraft?.tabId === activeDocument.tabId) {
        if (pendingWorkspaceDraft.content !== currentContent) {
          pendingWorkspaceDraftRef.current = {
            tabId: activeDocument.tabId,
            content: currentContent
          };
          applyState((current) =>
            applyRendererLocalWorkspaceDraft(current, activeDocument.tabId, currentContent)
          );
        }

        await queueBoundedDraftSync(activeDocument.tabId, currentContent);
        continue;
      }

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

      await queueBoundedDraftSync(activeDocument.tabId, currentContent);
    }
  }, [applyState, getEditorContent, queueWorkspaceDraftSync]);

  const updateDraft = useCallback(
    async (content: string): Promise<void> => {
      const activeTabId = getActiveTabId(stateRef.current);

      if (!activeTabId) {
        return;
      }

      pendingWorkspaceDraftRef.current = { tabId: activeTabId, content };
      applyState((current) => applyRendererLocalWorkspaceDraft(current, activeTabId, content));
    },
    [applyState]
  );

  const refreshWorkspaceSnapshot = useCallback(
    async (
      options: { preserveActiveDocumentDraft?: boolean } = {}
    ): Promise<WorkspaceWindowSnapshot | null> => {
      const snapshot = await fishmark.getWorkspaceSnapshot();
      applyWorkspaceWindowSnapshot(snapshot, {
        preserveActiveDocumentDraft: options.preserveActiveDocumentDraft ?? true
      });
      return snapshot;
    },
    [applyWorkspaceWindowSnapshot, fishmark]
  );

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
    try {
      await flushActiveWorkspaceDraft();
      setWorkspaceOpenState("opening");
      const result = await fishmark.openWorkspaceFile();

      if (result.kind === "cancelled") {
        setWorkspaceOpenState("idle");
        return "cancelled";
      }

      if (result.kind === "error") {
        throw new Error(result.error.message);
      }

      if (result.kind === "focused-existing") {
        setWorkspaceOpenState("idle");
        return "opened";
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
  }, [
    applyWorkspaceWindowSnapshot,
    fishmark,
    flushActiveWorkspaceDraft,
    setWorkspaceOpenState,
    showNotification
  ]);

  const openMarkdownFromPath = useCallback(
    async (targetPath: string): Promise<boolean> => {
      try {
        await flushActiveWorkspaceDraft();
        setWorkspaceOpenState("opening");
        const result = await fishmark.openWorkspaceFileFromPath(targetPath);

        if (result.kind === "error") {
          throw new Error(result.error.message);
        }

        if (result.kind === "focused-existing") {
          setWorkspaceOpenState("idle");
          return true;
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
    [
      applyWorkspaceWindowSnapshot,
      fishmark,
      flushActiveWorkspaceDraft,
      setWorkspaceOpenState,
      showNotification
    ]
  );

  const openMarkdownFromPaths = useCallback(
    async (targetPaths: string[]): Promise<boolean> => {
      if (targetPaths.length === 0) {
        return false;
      }

      try {
        await flushActiveWorkspaceDraft();
        setWorkspaceOpenState("opening");

        for (const targetPath of targetPaths) {
          const result = await fishmark.openWorkspaceFileFromPath(targetPath);

          if (result.kind === "error") {
            throw new Error(result.error.message);
          }

          if (result.kind === "focused-existing") {
            continue;
          }

          applyWorkspaceWindowSnapshot(result.snapshot);
        }

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
    [
      applyWorkspaceWindowSnapshot,
      fishmark,
      flushActiveWorkspaceDraft,
      setWorkspaceOpenState,
      showNotification
    ]
  );

  const createUntitledMarkdown = useCallback(async (): Promise<boolean> => {
    try {
      await flushActiveWorkspaceDraft();
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
  }, [applyWorkspaceWindowSnapshot, fishmark, flushActiveWorkspaceDraft, showNotification]);

  const activateWorkspaceTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      const sourceTabId = getActiveTabId(stateRef.current);
      const activationGeneration = ++activationGenerationRef.current;
      const isCurrentActivation = (): boolean =>
        mountedRef.current && activationGenerationRef.current === activationGeneration;

      try {
        await flushActiveWorkspaceDraft({
          maxSyncPasses: WORKSPACE_ACTIVATION_DRAFT_DRAIN_LIMIT
        });
        if (!isCurrentActivation()) {
          return false;
        }
        if (sourceTabId === tabId) {
          return getActiveTabId(stateRef.current) === tabId;
        }

        let snapshot = await fishmark.activateWorkspaceTab({ tabId });
        if (!isCurrentActivation()) {
          return false;
        }

        if (sourceTabId !== null) {
          for (
            let pass = 0;
            pass < WORKSPACE_ACTIVATION_DRAFT_DRAIN_LIMIT;
            pass += 1
          ) {
            const pendingDraft = pendingWorkspaceDraftRef.current;
            if (pendingDraft?.tabId !== sourceTabId) {
              break;
            }
            snapshot = await queueWorkspaceDraftSync(
              sourceTabId,
              pendingDraft.content,
              { applySnapshot: false }
            );
            if (!isCurrentActivation()) {
              return false;
            }
          }

          if (pendingWorkspaceDraftRef.current?.tabId === sourceTabId) {
            const rollbackSnapshot = await fishmark.activateWorkspaceTab({
              tabId: sourceTabId
            });
            if (!isCurrentActivation()) {
              return false;
            }
            applyWorkspaceWindowSnapshot(rollbackSnapshot, {
              preserveActiveDocumentDraft: true
            });
            throw new Error(
              "Workspace tab activation was cancelled because editing did not settle."
            );
          }
        }

        applyWorkspaceWindowSnapshot(snapshot);
        return true;
      } catch (error) {
        if (isCurrentActivation()) {
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        return false;
      }
    },
    [
      applyWorkspaceWindowSnapshot,
      fishmark,
      flushActiveWorkspaceDraft,
      queueWorkspaceDraftSync,
      showNotification
    ]
  );

  useEffect(
    () =>
      fishmark.onWorkspaceOwnerTabActivationRequest(({ tabId }) =>
        activateWorkspaceTab(tabId)
      ),
    [activateWorkspaceTab, fishmark]
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
    async (inputValue: { tabId: string }): Promise<boolean> => {
      setWorkspaceOpenState("opening");

      try {
        const result = await fishmark.reloadWorkspaceTabFromPath(inputValue);
        if (result.kind === "revision-stale") {
          setWorkspaceOpenState("idle");
          showNotification({
            kind: "warning",
            message: "重新加载期间检测到新的编辑，已保留当前内容。请重试。"
          });
          return false;
        }
        if (result.kind === "error") {
          setWorkspaceOpenState("idle");
          showNotification({
            kind: "error",
            message: RELOAD_WORKSPACE_TAB_FROM_PATH_ERROR_MESSAGES[result.error.code]
          });
          return false;
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
    openMarkdownFromPaths,
    createUntitledMarkdown,
    activateWorkspaceTab,
    closeWorkspaceTab,
    reorderWorkspaceTab,
    detachWorkspaceTab,
    reloadWorkspaceTabFromPath
  };
}

function applyRendererLocalWorkspaceDraft(
  current: EditorShellState,
  tabId: string,
  content: string
): EditorShellState {
  const snapshot = current.workspaceSnapshot;
  const activeDocument = snapshot?.activeDocument;

  if (!snapshot || !activeDocument || activeDocument.tabId !== tabId) {
    return current;
  }

  const nextTabs = snapshot.tabs.map((tab) =>
    tab.tabId === tabId
      ? {
          ...tab,
          isDirty: true
        }
      : tab
  );

  return {
    ...current,
    workspaceSnapshot: {
      ...snapshot,
      tabs: nextTabs,
      activeDocument: {
        ...activeDocument,
        content,
        isDirty: true
      }
    }
  };
}
