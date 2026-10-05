import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { WorkspaceShellProps } from "./workspace-shell-props";
type FindReplaceSnapshot = { matchCount: number; currentMatchIndex: number | null };

/** Local form values mirror CodeMirror's query; no document/workspace state is owned here. */
export function useFindReplacePresentation({
  activeTabId, editorEpoch, editorLoadRevision, editorRef, isDocumentOpen,
  isSearchViewActive, isViewContainerEnabled, onCloseViewContainer, onToggleViewContainer
}: Pick<WorkspaceShellProps, "editorEpoch" | "editorLoadRevision" | "editorRef" | "isDocumentOpen" | "onCloseViewContainer" | "onToggleViewContainer"> & {
  activeTabId: string | null; isSearchViewActive: boolean; isViewContainerEnabled: boolean;
}) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findReplaceSnapshot, setFindReplaceSnapshot] = useState<FindReplaceSnapshot>({
    matchCount: 0,
    currentMatchIndex: null
  });
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const searchDocumentIdentityRef = useRef<string | null>(
    activeTabId === null ? null : `${activeTabId}:${editorEpoch}:${editorLoadRevision}`
  );
  useEffect(() => {
    if (!isDocumentOpen) {
      return;
    }

    // Search is not part of the editor's initial bundle. Warm its CodeMirror
    // runtime after the document has mounted so the first explicit Search
    // activation normally has no visible loading delay.
    void editorRef.current?.prepareFindReplace?.();
  }, [editorLoadRevision, editorRef, isDocumentOpen]);

  useEffect(() => {
    if (!isSearchViewActive) {
      return;
    }

    findInputRef.current?.focus();
  }, [isSearchViewActive]);

  useEffect(() => {
    const nextDocumentIdentity = activeTabId === null
      ? null
      : `${activeTabId}:${editorEpoch}:${editorLoadRevision}`;

    if (searchDocumentIdentityRef.current === nextDocumentIdentity) {
      return;
    }

    searchDocumentIdentityRef.current = nextDocumentIdentity;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- A document identity boundary intentionally resets the Search view's local presentation state.
    setFindText("");
    setReplaceText("");
    setFindReplaceSnapshot({
      matchCount: 0,
      currentMatchIndex: null
    });

    if (isSearchViewActive) {
      editorRef.current?.clearFindReplaceQuery();
    }
  }, [activeTabId, editorEpoch, editorLoadRevision, editorRef, isSearchViewActive]);

  const closeFindReplacePanel = () => {
    setFindText("");
    setReplaceText("");
    setFindReplaceSnapshot(
      editorRef.current?.clearFindReplaceQuery() ?? {
        matchCount: 0,
        currentMatchIndex: null
      }
    );
    editorRef.current?.focus();
  };

  const exitSearchViewContainer = () => {
    closeFindReplacePanel();
    onCloseViewContainer();
  };

  const handleFindTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFindText = event.currentTarget.value;

    setFindText(nextFindText);
    setFindReplaceSnapshot(
      editorRef.current?.updateFindReplaceQuery({
        search: nextFindText,
        replace: replaceText
      }) ?? {
        matchCount: 0,
        currentMatchIndex: null
      }
    );
  };

  const handleReplaceTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextReplaceText = event.currentTarget.value;

    setReplaceText(nextReplaceText);
    setFindReplaceSnapshot(
      editorRef.current?.updateFindReplaceQuery({
        search: findText,
        replace: nextReplaceText
      }) ?? {
        matchCount: 0,
        currentMatchIndex: null
      }
    );
  };

  const handleFindReplaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      exitSearchViewContainer();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      setFindReplaceSnapshot(
        event.shiftKey
          ? editorRef.current?.findPreviousMatch() ?? findReplaceSnapshot
          : editorRef.current?.findNextMatch() ?? findReplaceSnapshot
      );
    }
  };

  const toggleSearchViewContainer = () => {
    if (isSearchViewActive) {
      onToggleViewContainer("search");
      return;
    }

    void (editorRef.current?.prepareFindReplace?.() ?? Promise.resolve()).then(() => {
      onToggleViewContainer("search");
    });
  };

  const handleWorkspaceKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (
      !isViewContainerEnabled ||
      event.key.toLowerCase() !== "f" ||
      (!event.metaKey && !event.ctrlKey)
    ) {
      return;
    }

    /*
     * `Ctrl/Cmd+F` is the keyboard entry point into the shared region's Search
     * view container; the rail button drives the same toggle.
     */
    event.preventDefault();
    if (isSearchViewActive) {
      findInputRef.current?.focus();
      return;
    }
    toggleSearchViewContainer();
  };

  const matchStatusLabel = findText.length === 0
    ? "No query"
    : findReplaceSnapshot.matchCount === 0
      ? "No matches"
      : `${findReplaceSnapshot.currentMatchIndex ?? 0} / ${findReplaceSnapshot.matchCount}`;

  return {
    findText, replaceText, findReplaceSnapshot, setFindReplaceSnapshot,
    findInputRef, matchStatusLabel, closeFindReplacePanel, handleFindReplaceKeyDown,
    handleFindTextChange, handleReplaceTextChange, toggleSearchViewContainer, handleWorkspaceKeyDownCapture
  };
}
