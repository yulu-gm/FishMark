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
import { WorkspaceDraftOutbox } from "./workspace-draft-outbox";
import { WorkspaceMutationCoordinator } from "./workspace-mutation-coordinator";

type ShowNotification = (notification: AppNotification) => void;
type OpenResult = "opened" | "cancelled" | "failed";
const WORKSPACE_ACTIVATION_DRAFT_DRAIN_LIMIT = 16;
const WORKSPACE_MUTATION_SUPERSEDED = Symbol("workspace-mutation-superseded");

type WorkspaceMutationContext = Readonly<{
  isCurrent: () => boolean;
}>;

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
  const workspaceDraftOutboxRef = useRef(new WorkspaceDraftOutbox());
  const canonicalWorkspaceSnapshotRef = useRef<WorkspaceWindowSnapshot | null>(
    initialSnapshot ?? null
  );
  const editorContentTabIdRef = useRef(initialSnapshot?.activeTabId ?? null);
  const workspaceMutationCoordinatorRef = useRef(new WorkspaceMutationCoordinator());
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

  const runWorkspaceMutation = useCallback(<T>(
    operation: (context: WorkspaceMutationContext) => Promise<T>
  ): Promise<T> => {
    const context: WorkspaceMutationContext = {
      isCurrent: () => mountedRef.current
    };
    return workspaceMutationCoordinatorRef.current.enqueue(() => operation(context));
  }, []);

  const getState = useCallback((): EditorShellState => stateRef.current, []);
  const getCurrentActiveDocument = useCallback(() => getActiveDocument(stateRef.current), []);
  const getCurrentActiveTabId = useCallback(() => getActiveTabId(stateRef.current), []);

  const applyWorkspaceWindowSnapshot = useCallback(
    (
      snapshot: WorkspaceWindowSnapshot,
      options: { preserveActiveDocumentDraft?: boolean } = {}
    ): EditorShellState => {
      canonicalWorkspaceSnapshotRef.current = snapshot;
      const previousActiveTabId = getActiveTabId(stateRef.current);
      if (previousActiveTabId !== snapshot.activeTabId) {
        editorContentTabIdRef.current = null;
      }
      let nextState = stateRef.current;

      applyState((current) => {
        const canonicalState = setOpenState(
          applyWorkspaceSnapshot(current, snapshot, {
            currentEditorContent: getEditorContent(),
            preserveActiveDocumentDraft: options.preserveActiveDocumentDraft ?? false
          }),
          "idle"
        );
        const activeTabId = getActiveTabId(canonicalState);
        const pendingContent = activeTabId === null
          ? undefined
          : workspaceDraftOutboxRef.current.get(activeTabId);
        nextState = activeTabId !== null && pendingContent !== undefined
          ? applyRendererLocalWorkspaceDraft(canonicalState, activeTabId, pendingContent)
          : canonicalState;
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
      options: {
        applySnapshot?: boolean;
        canCommitSnapshot?: () => boolean;
      } = {}
    ): Promise<WorkspaceWindowSnapshot> => {
      try {
        lastDraftSyncRequestRef.current = { tabId, content };
        const snapshot = await fishmark.updateWorkspaceTabDraft({
          tabId,
          content
        });

        workspaceDraftOutboxRef.current.acknowledge(tabId, content);
        workspaceDraftSyncFailureRef.current = null;
        workspaceDraftSyncRetryPendingRef.current = false;
        canonicalWorkspaceSnapshotRef.current = snapshot;
        if (
          (options.applySnapshot ?? true) &&
          (options.canCommitSnapshot?.() ?? true)
        ) {
          applyWorkspaceWindowSnapshot(snapshot);
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
      options: {
        applySnapshot?: boolean;
        canCommitSnapshot?: () => boolean;
      } = {}
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

  const flushActiveWorkspaceDraftNow = useCallback(async (
    options: {
      maxSyncPasses?: number;
      applySnapshots?: boolean;
      context?: WorkspaceMutationContext;
    } = {}
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
      await queueWorkspaceDraftSync(tabId, content, {
        applySnapshot: options.applySnapshots ?? true,
        canCommitSnapshot: options.context?.isCurrent
      });
      if (options.context !== undefined && !options.context.isCurrent()) {
        throw WORKSPACE_MUTATION_SUPERSEDED;
      }
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

      const currentContent = editorContentTabIdRef.current === activeDocument.tabId
        ? getEditorContent()
        : workspaceDraftOutboxRef.current.get(activeDocument.tabId) ?? activeDocument.content;
      const lastDraftSyncRequest = lastDraftSyncRequestRef.current;
      const pendingWorkspaceDraft = workspaceDraftOutboxRef.current.get(
        activeDocument.tabId
      );

      if (pendingWorkspaceDraft !== undefined) {
        if (pendingWorkspaceDraft !== currentContent) {
          workspaceDraftOutboxRef.current.set(activeDocument.tabId, currentContent);
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

        const latestEditorContent = editorContentTabIdRef.current === latestDocument.tabId
          ? getEditorContent()
          : workspaceDraftOutboxRef.current.get(latestDocument.tabId) ?? latestDocument.content;
        if (latestEditorContent === latestDocument.content) {
          if (workspaceDraftSyncFailureRef.current !== null) {
            workspaceDraftSyncRetryPendingRef.current = true;
            throw workspaceDraftSyncFailureRef.current;
          }
          return;
        }

        continue;
      }

      workspaceDraftOutboxRef.current.set(activeDocument.tabId, currentContent);
      applyState((current) =>
        applyRendererLocalWorkspaceDraft(current, activeDocument.tabId, currentContent)
      );
      await queueBoundedDraftSync(activeDocument.tabId, currentContent);
    }
  }, [applyState, getEditorContent, queueWorkspaceDraftSync]);

  const drainPendingWorkspaceDraft = useCallback(async (
    tabId: string,
    context: WorkspaceMutationContext
  ): Promise<void> => {
    for (let pass = 0; pass < WORKSPACE_ACTIVATION_DRAFT_DRAIN_LIMIT; pass += 1) {
      const pendingContent = workspaceDraftOutboxRef.current.get(tabId);
      if (pendingContent === undefined) {
        return;
      }

      await queueWorkspaceDraftSync(tabId, pendingContent, {
        applySnapshot: false,
        canCommitSnapshot: context.isCurrent
      });
      if (!context.isCurrent()) {
        throw WORKSPACE_MUTATION_SUPERSEDED;
      }
    }

    if (workspaceDraftOutboxRef.current.has(tabId)) {
      throw new Error(
        "Workspace tab activation was cancelled because editing did not settle."
      );
    }
  }, [queueWorkspaceDraftSync]);

  const flushActiveWorkspaceDraft = useCallback(
    (): Promise<void> => runWorkspaceMutation(async (context) => {
      if (!context.isCurrent()) {
        return;
      }
      await flushActiveWorkspaceDraftNow({ context });
    }),
    [flushActiveWorkspaceDraftNow, runWorkspaceMutation]
  );

  const updateDraft = useCallback(
    async (inputValue: { tabId: string; content: string }): Promise<void> => {
      if (!stateRef.current.workspaceSnapshot?.tabs.some(
        (tab) => tab.tabId === inputValue.tabId
      )) {
        return;
      }

      workspaceDraftOutboxRef.current.set(inputValue.tabId, inputValue.content);
      if (getActiveTabId(stateRef.current) === inputValue.tabId) {
        editorContentTabIdRef.current = inputValue.tabId;
      }
      applyState((current) => applyRendererLocalWorkspaceDraft(
        current,
        inputValue.tabId,
        inputValue.content
      ));
    },
    [applyState]
  );

  const refreshWorkspaceSnapshot = useCallback(
    (
      options: { preserveActiveDocumentDraft?: boolean } = {}
    ): Promise<WorkspaceWindowSnapshot | null> => runWorkspaceMutation(async (context) => {
      if (!context.isCurrent()) {
        return null;
      }

      const snapshot = await fishmark.getWorkspaceSnapshot();
      canonicalWorkspaceSnapshotRef.current = snapshot;
      if (!context.isCurrent()) {
        return null;
      }

      applyWorkspaceWindowSnapshot(snapshot, {
        preserveActiveDocumentDraft: options.preserveActiveDocumentDraft ?? true
      });
      return snapshot;
    }),
    [applyWorkspaceWindowSnapshot, fishmark, runWorkspaceMutation]
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

  const openMarkdown = useCallback((): Promise<OpenResult> =>
    runWorkspaceMutation(async (context) => {
      try {
        if (!context.isCurrent()) {
          return "cancelled";
        }
        await flushActiveWorkspaceDraftNow({ context });
        if (!context.isCurrent()) {
          return "cancelled";
        }
        setWorkspaceOpenState("opening");
        const result = await fishmark.openWorkspaceFile();

        if (result.kind === "cancelled") {
          if (context.isCurrent()) {
            setWorkspaceOpenState("idle");
          }
          return "cancelled";
        }

        if (result.kind === "error") {
          throw new Error(result.error.message);
        }

        if (result.kind === "focused-existing") {
          if (context.isCurrent()) {
            setWorkspaceOpenState("idle");
          }
          return "opened";
        }

        canonicalWorkspaceSnapshotRef.current = result.snapshot;
        if (!context.isCurrent()) {
          return "cancelled";
        }
        applyWorkspaceWindowSnapshot(result.snapshot);
        return "opened";
      } catch (error) {
        if (context.isCurrent()) {
          setWorkspaceOpenState("idle");
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        return error === WORKSPACE_MUTATION_SUPERSEDED ? "cancelled" : "failed";
      }
    }), [
    applyWorkspaceWindowSnapshot,
    fishmark,
    flushActiveWorkspaceDraftNow,
    runWorkspaceMutation,
    setWorkspaceOpenState,
    showNotification
  ]);

  const openMarkdownFromPath = useCallback(
    (targetPath: string): Promise<boolean> => runWorkspaceMutation(async (context) => {
      try {
        if (!context.isCurrent()) {
          return false;
        }
        await flushActiveWorkspaceDraftNow({ context });
        if (!context.isCurrent()) {
          return false;
        }
        setWorkspaceOpenState("opening");
        const result = await fishmark.openWorkspaceFileFromPath(targetPath);

        if (result.kind === "error") {
          throw new Error(result.error.message);
        }

        if (result.kind === "focused-existing") {
          if (context.isCurrent()) {
            setWorkspaceOpenState("idle");
          }
          return true;
        }

        canonicalWorkspaceSnapshotRef.current = result.snapshot;
        if (!context.isCurrent()) {
          return false;
        }
        applyWorkspaceWindowSnapshot(result.snapshot);
        return true;
      } catch (error) {
        if (context.isCurrent()) {
          setWorkspaceOpenState("idle");
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        return false;
      }
    }),
    [
      applyWorkspaceWindowSnapshot,
      fishmark,
      flushActiveWorkspaceDraftNow,
      runWorkspaceMutation,
      setWorkspaceOpenState,
      showNotification
    ]
  );

  const openMarkdownFromPaths = useCallback(
    (targetPaths: string[]): Promise<boolean> => runWorkspaceMutation(async (context) => {
      if (targetPaths.length === 0) {
        return false;
      }

      try {
        if (!context.isCurrent()) {
          return false;
        }
        await flushActiveWorkspaceDraftNow({ context });
        if (!context.isCurrent()) {
          return false;
        }
        setWorkspaceOpenState("opening");

        for (const targetPath of targetPaths) {
          const result = await fishmark.openWorkspaceFileFromPath(targetPath);

          if (result.kind === "error") {
            throw new Error(result.error.message);
          }

          if (result.kind === "focused-existing") {
            continue;
          }

          canonicalWorkspaceSnapshotRef.current = result.snapshot;
          if (!context.isCurrent()) {
            return false;
          }
          applyWorkspaceWindowSnapshot(result.snapshot);
        }

        return true;
      } catch (error) {
        if (context.isCurrent()) {
          setWorkspaceOpenState("idle");
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        return false;
      }
    }),
    [
      applyWorkspaceWindowSnapshot,
      fishmark,
      flushActiveWorkspaceDraftNow,
      runWorkspaceMutation,
      setWorkspaceOpenState,
      showNotification
    ]
  );

  const createUntitledMarkdown = useCallback((): Promise<boolean> =>
    runWorkspaceMutation(async (context) => {
      try {
        if (!context.isCurrent()) {
          return false;
        }
        await flushActiveWorkspaceDraftNow({ context });
        if (!context.isCurrent()) {
          return false;
        }
        const snapshot = await fishmark.createWorkspaceTab({
          kind: "untitled"
        });
        canonicalWorkspaceSnapshotRef.current = snapshot;
        if (!context.isCurrent()) {
          return false;
        }
        applyWorkspaceWindowSnapshot(snapshot);
        return true;
      } catch (error) {
        if (context.isCurrent()) {
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        return false;
      }
    }), [
    applyWorkspaceWindowSnapshot,
    fishmark,
    flushActiveWorkspaceDraftNow,
    runWorkspaceMutation,
    showNotification
  ]);

  const activateWorkspaceTab = useCallback(
    (tabId: string): Promise<boolean> => {
      const sourceDocument = getActiveDocument(stateRef.current);
      const sourceTabId = sourceDocument?.tabId ?? null;
      if (
        sourceDocument !== null &&
        editorContentTabIdRef.current === sourceDocument.tabId
      ) {
        const sourceContent = getEditorContent();
        if (
          workspaceDraftOutboxRef.current.has(sourceDocument.tabId) ||
          sourceContent !== sourceDocument.content
        ) {
          workspaceDraftOutboxRef.current.set(sourceDocument.tabId, sourceContent);
          applyState((current) =>
            applyRendererLocalWorkspaceDraft(current, sourceDocument.tabId, sourceContent)
          );
        }
      }
      const activationGeneration = ++activationGenerationRef.current;
      const isLatestActivation = (): boolean =>
        activationGenerationRef.current === activationGeneration;

      return runWorkspaceMutation(async (context) => {
      let activationDispatched = false;
      let activationConfirmed = false;

      try {
        if (!context.isCurrent() || !isLatestActivation()) {
          return false;
        }
        if (sourceTabId !== null) {
          await drainPendingWorkspaceDraft(sourceTabId, context);
        }

        const canonicalSnapshot = canonicalWorkspaceSnapshotRef.current;
        if (canonicalSnapshot?.activeTabId !== tabId) {
          activationDispatched = true;
          const snapshot = await fishmark.activateWorkspaceTab({ tabId });
          activationConfirmed = true;
          canonicalWorkspaceSnapshotRef.current = snapshot;
          if (!context.isCurrent()) {
            return false;
          }
          applyWorkspaceWindowSnapshot(snapshot);
        } else {
          applyWorkspaceWindowSnapshot(canonicalSnapshot, {
            preserveActiveDocumentDraft: false
          });
        }

        if (!isLatestActivation()) {
          return false;
        }

        const tabsToDrain = new Set<string>();
        if (sourceTabId !== null) {
          tabsToDrain.add(sourceTabId);
        }
        tabsToDrain.add(tabId);
        for (const pendingTabId of tabsToDrain) {
          await drainPendingWorkspaceDraft(pendingTabId, context);
        }

        const latestCanonicalSnapshot = canonicalWorkspaceSnapshotRef.current;
        if (latestCanonicalSnapshot !== null && context.isCurrent()) {
          applyWorkspaceWindowSnapshot(latestCanonicalSnapshot);
        }
        return context.isCurrent() &&
          isLatestActivation() &&
          getActiveTabId(stateRef.current) === tabId;
      } catch (error) {
        if (error === WORKSPACE_MUTATION_SUPERSEDED || !context.isCurrent()) {
          return false;
        }

        if (activationDispatched && !activationConfirmed) {
          try {
            const snapshot = await fishmark.getWorkspaceSnapshot();
            canonicalWorkspaceSnapshotRef.current = snapshot;
            if (context.isCurrent()) {
              applyWorkspaceWindowSnapshot(snapshot);
            }
          } catch {
            // The per-tab outbox remains the renderer fallback until a later reconciliation.
          }
        }

        if (context.isCurrent()) {
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        return false;
      }
      });
    },
    [
      applyState,
      applyWorkspaceWindowSnapshot,
      drainPendingWorkspaceDraft,
      fishmark,
      getEditorContent,
      runWorkspaceMutation,
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

  const runFlushedWorkspaceSnapshotMutation = useCallback(
    (
      operation: () => Promise<WorkspaceWindowSnapshot>
    ): Promise<void> => runWorkspaceMutation(async (context) => {
      try {
        if (!context.isCurrent()) {
          return;
        }
        await flushActiveWorkspaceDraftNow({ context });
        if (!context.isCurrent()) {
          return;
        }
        const snapshot = await operation();
        canonicalWorkspaceSnapshotRef.current = snapshot;
        if (context.isCurrent()) {
          applyWorkspaceWindowSnapshot(snapshot);
        }
      } catch (error) {
        if (context.isCurrent()) {
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }),
    [
      applyWorkspaceWindowSnapshot,
      flushActiveWorkspaceDraftNow,
      runWorkspaceMutation,
      showNotification
    ]
  );

  const closeWorkspaceTab = useCallback(
    (tabId: string): Promise<void> => runFlushedWorkspaceSnapshotMutation(
      () => fishmark.closeWorkspaceTab({ tabId })
    ),
    [fishmark, runFlushedWorkspaceSnapshotMutation]
  );

  const reorderWorkspaceTab = useCallback(
    (tabId: string, toIndex: number): Promise<void> => runFlushedWorkspaceSnapshotMutation(
      () => fishmark.reorderWorkspaceTab({ tabId, toIndex })
    ),
    [fishmark, runFlushedWorkspaceSnapshotMutation]
  );

  const detachWorkspaceTab = useCallback(
    (tabId: string): Promise<void> => runFlushedWorkspaceSnapshotMutation(
      () => fishmark.detachWorkspaceTabToNewWindow({ tabId })
    ),
    [fishmark, runFlushedWorkspaceSnapshotMutation]
  );

  const reloadWorkspaceTabFromPath = useCallback(
    (inputValue: { tabId: string }): Promise<boolean> => runWorkspaceMutation(async (context) => {
      try {
        if (!context.isCurrent()) {
          return false;
        }
        setWorkspaceOpenState("opening");
        const result = await fishmark.reloadWorkspaceTabFromPath(inputValue);
        if (result.kind === "revision-stale") {
          if (context.isCurrent()) {
            setWorkspaceOpenState("idle");
            showNotification({
              kind: "warning",
              message: "重新加载期间检测到新的编辑，已保留当前内容。请重试。"
            });
          }
          return false;
        }
        if (result.kind === "error") {
          if (context.isCurrent()) {
            setWorkspaceOpenState("idle");
            showNotification({
              kind: "error",
              message: RELOAD_WORKSPACE_TAB_FROM_PATH_ERROR_MESSAGES[result.error.code]
            });
          }
          return false;
        }

        canonicalWorkspaceSnapshotRef.current = result.snapshot;
        if (!context.isCurrent()) {
          return false;
        }
        applyWorkspaceWindowSnapshot(result.snapshot);
        return true;
      } catch (error) {
        if (context.isCurrent()) {
          setWorkspaceOpenState("idle");
          showNotification({
            kind: "error",
            message: error instanceof Error ? error.message : String(error)
          });
        }
        return false;
      }
    }),
    [
      applyWorkspaceWindowSnapshot,
      fishmark,
      runWorkspaceMutation,
      setWorkspaceOpenState,
      showNotification
    ]
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
