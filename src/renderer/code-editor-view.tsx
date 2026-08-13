import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef
} from "react";

import {
  createCodeEditorController,
  type CodeEditorController,
  type CodeEditorDocumentChangeFrame,
  type CodeEditorDiscardedDocumentText,
  type FindReplaceQueryInput,
  type FindReplaceSnapshot
} from "./code-editor";
import type { ActiveBlockState, EditorViewMode } from "@fishmark/editor-core";
import type { EditorLoadIdentity } from "./editor/editor-load-identity";

export type CodeEditorHandle = {
  getContent: () => string;
  getSelection: () => { anchor: number; head: number };
  updateFindReplaceQuery: (query: FindReplaceQueryInput) => FindReplaceSnapshot;
  findNextMatch: () => FindReplaceSnapshot;
  findPreviousMatch: () => FindReplaceSnapshot;
  replaceCurrentMatch: () => FindReplaceSnapshot;
  replaceAllMatches: () => FindReplaceSnapshot;
  clearFindReplaceQuery: () => FindReplaceSnapshot;
  setContent: (content: string) => void;
  setDocumentPath: (documentPath: string | null) => void;
  setViewMode: (viewMode: EditorViewMode) => void;
  focus: () => void;
  navigateToOffset: (offset: number) => void;
  insertText: (text: string) => void;
  setSelection: (anchor: number, head?: number) => void;
  selectTableCell: (position: { row: number; column: number }) => void;
  editTableCell: (input: { row: number; column: number; text: string }) => void;
  insertTableRowAbove: () => void;
  insertTableRowBelow: () => void;
  insertTableColumnLeft: () => void;
  insertTableColumnRight: () => void;
  deleteTableRow: () => void;
  deleteTableColumn: () => void;
  deleteTable: () => void;
  pressEnter: () => void;
  pressBackspace: () => void;
  pressTab: (shiftKey?: boolean) => void;
  pressArrowUp: () => void;
  pressArrowDown: () => void;
};

type CodeEditorViewProps = {
  initialContent: string;
  documentPath: string | null;
  loadRevision: number;
  documentTabId: string | null;
  editorEpoch: number;
  readOnly: boolean;
  editorTransitionToken: number | null;
  onChange?: (content: string, identity: EditorLoadIdentity | null) => void;
  onDocumentChangeFrame?: (frame: CodeEditorDocumentChangeFrame) => void;
  onDiscardedDocumentText?: (discarded: CodeEditorDiscardedDocumentText) => void;
  onPendingDocumentChangesChange?: (input: {
    hasPending: boolean;
    identity: EditorLoadIdentity | null;
  }) => void;
  onEditorBarrierChange?: (barrier: (() => Promise<{
    readonly text: string;
    readonly identity: EditorLoadIdentity | null;
  }>) | null) => void;
  onEditorRemotePatchChange?: (patch: ((input: {
    readonly identity: EditorLoadIdentity;
    readonly expectedBefore: string;
    readonly expectedAfter: string;
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }) => ReturnType<CodeEditorController["applyRemoteDocumentPatch"]>) | null) => void;
  onEditorCanonicalRestoreChange?: (restore: ((input: {
    readonly identity: EditorLoadIdentity;
    readonly expectedBefore: string;
    readonly canonicalText: string;
  }) => ReturnType<CodeEditorController["restoreCanonicalDocument"]>) | null) => void;
  onEditorTransitionApplied: (input: { token: number; readOnly: boolean }) => void;
  onLoadRevisionApplied: (identity: EditorLoadIdentity) => void;
  onBlur?: () => void;
  onActiveBlockChange?: (state: ActiveBlockState) => void;
  importClipboardImage?: (input: { documentPath: string | null }) => Promise<string | null>;
  openExternalLink?: (href: string) => void;
  viewMode?: EditorViewMode;
};

export const CodeEditorView = forwardRef<CodeEditorHandle, CodeEditorViewProps>(
  function CodeEditorView(
    {
      initialContent,
      documentPath,
      loadRevision,
      documentTabId,
      editorEpoch,
      readOnly,
      editorTransitionToken,
      onChange,
      onDocumentChangeFrame,
      onDiscardedDocumentText,
      onPendingDocumentChangesChange,
      onEditorBarrierChange,
      onEditorRemotePatchChange,
      onEditorCanonicalRestoreChange,
      onEditorTransitionApplied,
      onLoadRevisionApplied,
      onBlur,
      onActiveBlockChange,
      importClipboardImage,
      openExternalLink,
      viewMode = "wysiwym"
    },
    ref
  ) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<CodeEditorController | null>(null);
    const initialContentRef = useRef(initialContent);
    const initialViewModeRef = useRef(viewMode);
    const initialReadOnlyRef = useRef(readOnly);
    const latestLoadedContentRef = useRef(initialContent);
    const appliedIdentityRef = useRef<EditorLoadIdentity | null>(null);
    const appliedLoadRevisionRef = useRef<number | null>(null);
    const transitionGenerationRef = useRef(0);
    const handleChange = useEffectEvent((content: string, identity: EditorLoadIdentity | null) => {
      onChange?.(content, identity);
    });
    const handleDocumentChangeFrame = useEffectEvent((frame: CodeEditorDocumentChangeFrame) => {
      onDocumentChangeFrame?.(frame);
    });
    const handleDiscardedDocumentText = useEffectEvent((discarded: CodeEditorDiscardedDocumentText) => {
      onDiscardedDocumentText?.(discarded);
    });
    const handlePendingDocumentChangesChange = useEffectEvent((hasPending: boolean) => {
      onPendingDocumentChangesChange?.({
        hasPending,
        identity: appliedIdentityRef.current
      });
    });
    const handleEditorBarrierChange = useEffectEvent((barrier: (() => Promise<{
      readonly text: string;
      readonly identity: EditorLoadIdentity | null;
    }>) | null) => {
      onEditorBarrierChange?.(barrier);
    });
    const handleEditorTransitionApplied = useEffectEvent(onEditorTransitionApplied);
    const handleEditorRemotePatchChange = useEffectEvent((patch: ((input: {
      readonly identity: EditorLoadIdentity;
      readonly expectedBefore: string;
      readonly expectedAfter: string;
      readonly from: number;
      readonly to: number;
      readonly insert: string;
    }) => ReturnType<CodeEditorController["applyRemoteDocumentPatch"]>) | null) => {
      onEditorRemotePatchChange?.(patch);
    });
    const handleEditorCanonicalRestoreChange = useEffectEvent((restore: ((input: {
      readonly identity: EditorLoadIdentity; readonly expectedBefore: string; readonly canonicalText: string;
    }) => ReturnType<CodeEditorController["restoreCanonicalDocument"]>) | null) => {
      onEditorCanonicalRestoreChange?.(restore);
    });
    const handleLoadRevisionApplied = useEffectEvent((identity: EditorLoadIdentity) => {
      onLoadRevisionApplied(identity);
    });
    const handleBlur = useEffectEvent(() => onBlur?.());
    const handleActiveBlockChange = useEffectEvent((state: ActiveBlockState) =>
      onActiveBlockChange?.(state)
    );
    const handleImportClipboardImage = useEffectEvent((input: { documentPath: string | null }) =>
      importClipboardImage?.(input) ?? Promise.resolve(null)
    );
    const handleOpenExternalLink = useEffectEvent((href: string) => openExternalLink?.(href));

    useEffect(() => {
      if (!hostRef.current) {
        return undefined;
      }

      const controller = createCodeEditorController({
        parent: hostRef.current,
        initialContent: initialContentRef.current,
        documentPath: null,
        onChange: (content) => handleChange(content, appliedIdentityRef.current),
        onDocumentChangeFrame: (frame) => handleDocumentChangeFrame(frame),
        onDiscardedDocumentText: (discarded) => handleDiscardedDocumentText(discarded),
        onPendingDocumentChangesChange: (hasPending) =>
          handlePendingDocumentChangesChange(hasPending),
        onBlur: () => handleBlur(),
        onActiveBlockChange: (state) => handleActiveBlockChange(state),
        importClipboardImage: (input) => handleImportClipboardImage(input),
        openExternalLink: (href) => handleOpenExternalLink(href),
        viewMode: initialViewModeRef.current,
        readOnly: initialReadOnlyRef.current
      });

      controllerRef.current = controller;
      handleEditorBarrierChange(() => controller.sealForBarrier());
      handleEditorRemotePatchChange((input) => controller.applyRemoteDocumentPatch(input));
      handleEditorCanonicalRestoreChange((input) => controller.restoreCanonicalDocument(input));

      return () => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }

        controller.destroy();
        handleEditorBarrierChange(null);
        handleEditorRemotePatchChange(null);
        handleEditorCanonicalRestoreChange(null);
      };
    }, []);

    useEffect(() => {
      latestLoadedContentRef.current = initialContent;
    }, [initialContent]);

    useEffect(() => {
      if (appliedLoadRevisionRef.current !== loadRevision) {
        controllerRef.current?.replaceDocument(latestLoadedContentRef.current);
        appliedLoadRevisionRef.current = loadRevision;
      }
      if (documentTabId === null) {
        appliedIdentityRef.current = null;
        controllerRef.current?.setDocumentIdentity(null);
        return;
      }
      const identity = { tabId: documentTabId, epoch: editorEpoch, loadRevision };
      controllerRef.current?.setDocumentIdentity(identity);
      appliedIdentityRef.current = identity;
      handleLoadRevisionApplied(identity);
    }, [documentTabId, editorEpoch, loadRevision]);

    useEffect(() => {
      controllerRef.current?.setDocumentPath(documentPath);
    }, [documentPath]);

    useEffect(() => {
      controllerRef.current?.setViewMode(viewMode);
    }, [viewMode]);

    useEffect(() => {
      const controller = controllerRef.current;
      if (!controller) return undefined;
      if (editorTransitionToken === null) {
        controller.setReadOnly(readOnly);
        return undefined;
      }
      let cancelled = false;
      const transitionGeneration = ++transitionGenerationRef.current;
      void controller.sealForBarrier().then(() => {
        if (cancelled || transitionGeneration !== transitionGenerationRef.current) return;
        controller.setReadOnly(readOnly);
        handleEditorTransitionApplied({ token: editorTransitionToken, readOnly });
      });
      return () => {
        cancelled = true;
        transitionGenerationRef.current += 1;
      };
    }, [editorTransitionToken, readOnly]);

    useImperativeHandle(
      ref,
      () => ({
        getContent: () => controllerRef.current?.getContent() ?? initialContent,
        getSelection: () =>
          controllerRef.current?.getSelection() ?? {
            anchor: 0,
            head: 0
          },
        updateFindReplaceQuery: (query: FindReplaceQueryInput) =>
          controllerRef.current?.updateFindReplaceQuery(query) ?? {
            matchCount: 0,
            currentMatchIndex: null
          },
        findNextMatch: () =>
          controllerRef.current?.findNextMatch() ?? {
            matchCount: 0,
            currentMatchIndex: null
          },
        findPreviousMatch: () =>
          controllerRef.current?.findPreviousMatch() ?? {
            matchCount: 0,
            currentMatchIndex: null
          },
        replaceCurrentMatch: () =>
          controllerRef.current?.replaceCurrentMatch() ?? {
            matchCount: 0,
            currentMatchIndex: null
          },
        replaceAllMatches: () =>
          controllerRef.current?.replaceAllMatches() ?? {
            matchCount: 0,
            currentMatchIndex: null
          },
        clearFindReplaceQuery: () =>
          controllerRef.current?.clearFindReplaceQuery() ?? {
            matchCount: 0,
            currentMatchIndex: null
          },
        setContent: (content: string) => {
          controllerRef.current?.setContent(content);
        },
        setDocumentPath: (nextDocumentPath: string | null) => {
          controllerRef.current?.setDocumentPath(nextDocumentPath);
        },
        setViewMode: (nextViewMode: EditorViewMode) => {
          controllerRef.current?.setViewMode(nextViewMode);
        },
        focus: () => {
          controllerRef.current?.focus();
        },
        navigateToOffset: (offset: number) => {
          controllerRef.current?.navigateToOffset(offset);
        },
        insertText: (text: string) => {
          controllerRef.current?.insertText(text);
        },
        setSelection: (anchor: number, head?: number) => {
          controllerRef.current?.setSelection(anchor, head);
        },
        selectTableCell: (position: { row: number; column: number }) => {
          controllerRef.current?.selectTableCell(position);
        },
        editTableCell: (input: { row: number; column: number; text: string }) => {
          controllerRef.current?.editTableCell(input);
        },
        insertTableRowAbove: () => {
          controllerRef.current?.insertTableRowAbove();
        },
        insertTableRowBelow: () => {
          controllerRef.current?.insertTableRowBelow();
        },
        insertTableColumnLeft: () => {
          controllerRef.current?.insertTableColumnLeft();
        },
        insertTableColumnRight: () => {
          controllerRef.current?.insertTableColumnRight();
        },
        deleteTableRow: () => {
          controllerRef.current?.deleteTableRow();
        },
        deleteTableColumn: () => {
          controllerRef.current?.deleteTableColumn();
        },
        deleteTable: () => {
          controllerRef.current?.deleteTable();
        },
        pressEnter: () => {
          controllerRef.current?.pressEnter();
        },
        pressBackspace: () => {
          controllerRef.current?.pressBackspace();
        },
        pressTab: (shiftKey?: boolean) => {
          controllerRef.current?.pressTab(shiftKey);
        },
        pressArrowUp: () => {
          controllerRef.current?.pressArrowUp();
        },
        pressArrowDown: () => {
          controllerRef.current?.pressArrowDown();
        }
      }),
      [initialContent]
    );

    return (
      <div
        className="document-editor"
        data-fishmark-editor-view-mode={viewMode}
        ref={hostRef}
      />
    );
  }
);
