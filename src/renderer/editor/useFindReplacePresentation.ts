import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { WorkspaceShellProps } from "./workspace-shell-props";
import type { FindReplaceMatch, FindReplaceSnapshot } from "../code-editor";
const emptySnapshot: FindReplaceSnapshot = { matchCount: 0, currentMatchIndex: null, matches: [] };

/** Local form values mirror CodeMirror's query; no document/workspace state is owned here. */
export function useFindReplacePresentation({
  activeTabId, editorEpoch, editorLoadRevision, editorRef, isDocumentOpen,
  activeViewContainer, isSearchViewActive, isViewContainerEnabled, onCloseViewContainer, onToggleViewContainer
}: Pick<WorkspaceShellProps, "activeViewContainer" | "editorEpoch" | "editorLoadRevision" | "editorRef" | "isDocumentOpen" | "onCloseViewContainer" | "onToggleViewContainer"> & {
  activeTabId: string | null; isSearchViewActive: boolean; isViewContainerEnabled: boolean;
}) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findReplaceSnapshot, setFindReplaceSnapshot] = useState<FindReplaceSnapshot>(emptySnapshot);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const openRequestRef = useRef(0);
  const searchDocumentIdentityRef = useRef<string | null>(
    activeTabId === null ? null : `${activeTabId}:${editorEpoch}:${editorLoadRevision}`
  );
  useEffect(() => () => {
    openRequestRef.current += 1;
  }, [activeTabId, activeViewContainer, editorEpoch, editorLoadRevision, isDocumentOpen]);
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
    setFindReplaceSnapshot(emptySnapshot);

    if (isSearchViewActive) {
      editorRef.current?.clearFindReplaceQuery();
    }
  }, [activeTabId, editorEpoch, editorLoadRevision, editorRef, isSearchViewActive]);

  useEffect(() => {
    if (!isSearchViewActive || !isDocumentOpen) return;
    return editorRef.current?.subscribeFindReplace?.(setFindReplaceSnapshot);
  }, [activeTabId, editorEpoch, editorLoadRevision, editorRef, isSearchViewActive, isDocumentOpen]);

  const closeFindReplacePanel = () => {
    openRequestRef.current += 1;
    setFindText("");
    setReplaceText("");
    setFindReplaceSnapshot(
      editorRef.current?.clearFindReplaceQuery() ?? emptySnapshot
    );
    editorRef.current?.focus();
  };

  const exitSearchViewContainer = () => {
    closeFindReplacePanel();
    onCloseViewContainer();
  };

  const updateQuery = (search: string, replace: string) => {
    setFindReplaceSnapshot(editorRef.current?.updateFindReplaceQuery({ search, replace }) ?? emptySnapshot);
  };

  const handleFindTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFindText = event.currentTarget.value;

    setFindText(nextFindText);
    updateQuery(nextFindText, replaceText);
  };

  const handleReplaceTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextReplaceText = event.currentTarget.value;

    setReplaceText(nextReplaceText);
    updateQuery(findText, nextReplaceText);
  };

  const handleFindReplaceKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      exitSearchViewContainer();
      return;
    }

    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      setFindReplaceSnapshot(
        event.shiftKey
          ? editorRef.current?.findPreviousMatch() ?? findReplaceSnapshot
          : editorRef.current?.findNextMatch() ?? findReplaceSnapshot
      );
    }
  };

  const applySelectedTextQuery = (selectedText: string | undefined) => {
    // search 输入会移除换行；仅带入非空单行，避免显示文本与实际查询不一致。
    if (!selectedText || /[\r\n]/u.test(selectedText)) {
      return;
    }
    setFindText(selectedText);
    updateQuery(selectedText, replaceText);
  };

  const selectFindReplaceMatch = (match: FindReplaceMatch) => {
    setFindReplaceSnapshot(editorRef.current?.selectFindReplaceMatch(match) ?? emptySnapshot);
  };

  const openSearchViewContainer = (selectedText?: string) => {
    const request = ++openRequestRef.current;
    void (editorRef.current?.prepareFindReplace?.() ?? Promise.resolve()).then(() => {
      if (openRequestRef.current !== request) {
        return;
      }
      applySelectedTextQuery(selectedText);
      onToggleViewContainer("search");
    });
  };

  const toggleSearchViewContainer = () => {
    if (isSearchViewActive) {
      onToggleViewContainer("search");
      return;
    }
    openSearchViewContainer();
  };

  const handleWorkspaceKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }
    if (event.key === "Escape") {
      openRequestRef.current += 1;
      // The Search container may be active before its lazy form mounts.
      if (isSearchViewActive && !findInputRef.current) {
        event.preventDefault();
        exitSearchViewContainer();
      }
      return;
    }
    if (
      !isViewContainerEnabled ||
      event.key.toLowerCase() !== "f" ||
      event.altKey || event.shiftKey ||
      event.metaKey === event.ctrlKey
    ) {
      return;
    }

    /*
     * `Ctrl/Cmd+F` is the keyboard entry point into the shared region's Search
     * view container; the rail button drives the same toggle.
     */
    event.preventDefault();
    // 移焦前读取正文的源文档选区；Search 自身的快捷键不带入旧的编辑器选区。
    const selection = event.target instanceof Element && event.target.closest(".cm-editor")
      ? editorRef.current?.getSelection()
      : null;
    const selectedText = selection && selection.anchor !== selection.head
      ? editorRef.current?.getContent().slice(
        Math.min(selection.anchor, selection.head), Math.max(selection.anchor, selection.head)
      )
      : undefined;
    if (isSearchViewActive) {
      applySelectedTextQuery(selectedText);
      findInputRef.current?.focus();
      return;
    }
    openSearchViewContainer(selectedText);
  };

  const matchStatusLabel = findText.length === 0
    ? "No query"
    : findReplaceSnapshot.matchCount === 0
      ? "No matches"
      : `${findReplaceSnapshot.currentMatchIndex ?? 0} / ${findReplaceSnapshot.matchCount}`;

  return {
    findText, replaceText, findReplaceSnapshot, setFindReplaceSnapshot,
    findInputRef, matchStatusLabel, closeFindReplacePanel, handleFindReplaceKeyDown,
    handleFindTextChange, handleReplaceTextChange, toggleSearchViewContainer, handleWorkspaceKeyDownCapture,
    selectFindReplaceMatch
  };
}
