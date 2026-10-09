import {
  Suspense,
  lazy,
  useRef,
  useState,
  type CSSProperties,
  type SVGProps
} from "react";
import { ConflictBanner } from "./components/ConflictBanner";
import { FindReplacePanel } from "./components/FindReplacePanel";
import { NotificationHost } from "./components/NotificationHost";
import { OutlinePanel } from "./components/OutlinePanel";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { StatusBar } from "./components/StatusBar";
import { TableToolbar } from "./components/TableToolbar";
import { WelcomeWorkspace } from "./components/WelcomeWorkspace";
import { WorkspaceTabStrip } from "./components/WorkspaceTabStrip";
import { useFindReplacePresentation } from "./useFindReplacePresentation";
import { useSidePanelResize } from "./useSidePanelResize";
import type { WorkspaceShellProps, WorkspaceViewContainerId } from "./workspace-shell-props";

import {
  SIDE_PANEL_WIDTH_MAX,
  SIDE_PANEL_WIDTH_MIN
} from "../../shared/preferences";

const CodeEditorView = lazy(async () => {
  const module = await import("../code-editor-view");
  return { default: module.CodeEditorView };
});

const ThemeSurfaceHost = lazy(async () => {
  const module = await import("./ThemeSurfaceHost");
  return { default: module.ThemeSurfaceHost };
});

const TitlebarHost = lazy(async () => {
  const module = await import("./TitlebarHost");
  return { default: module.TitlebarHost };
});

const ShortcutHintOverlay = lazy(async () => {
  const module = await import("./shortcut-hint-overlay");
  return { default: module.ShortcutHintOverlay };
});

const VIEW_CONTAINER_LABELS: Record<WorkspaceViewContainerId, string> = {
  search: "Search",
  outline: "Outline"
};


function createWelcomeShortcutTip(platform: string) {
  const modifier = platform === "darwin" ? "Cmd" : "Ctrl";
  return `Tip: Hold ${modifier} for shortcuts`;
}
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M10.7 5.2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z" />
      <path d="M15 15l4 4" />
    </svg>
  );
}

function OutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" {...props}>
      <path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h6" />
    </svg>
  );
}

export function WorkspaceShell({
  activeHeadingId,
  activeShortcutGroupId,
  activeTableToolId,
  activeTitlebarSurface,
  activeViewContainer,
  activeWorkbenchSurface,
  appUpdateStatusLabel,
  appVersionLabel,
  closingViewContainer,
  controlledTitlebarEnabled,
  currentDocumentMetrics,
  editorContainerRef,
  editorLoadRevision,
  editorEpoch,
  editorTransition,
  editorRef,
  editorViewMode,
  externalFileConflictMessage,
  externalFileState,
  fishmarkPlatform,
  fontFamilies,
  headerTitle,
  isDocumentOpen,
  isReadingMode,
  onToggleReadingMode,
  isRefreshingThemePackages,
  isSettingsDrawerVisible,
  isSettingsOpen,
  isShortcutHintVisible,
  notification,
  notificationState,
  outlineItems,
  recentFiles,
  preferences,
  preferencesThemeEffectsMode,
  resolvedThemeMode,
  saveStatusLabel,
  settingsEntryRef,
  shellMode,
  sidePanelStoredWidth,
  themePackages,
  themeRuntimeEnv,
  titlebarHeight,
  titlebarLayout,
  workspaceSnapshot,
  onActiveBlockChange,
  onAppWorkspaceMouseDownCapture,
  onCaptureSettingsOpenOrigin,
  onCloseViewContainer,
  onCloseSettingsDrawer,
  onCloseWorkspaceTab,
  onDeleteTable,
  onDeleteTableColumn,
  onDeleteTableRow,
  onDismissExternalFileConflict,
  onDocumentChangeFrame,
  onUserDocumentEdit,
  onDiscardedDocumentText,
  onPendingDocumentChangesChange,
  onEditorBarrierChange,
  onEditorRemotePatchChange,
  onEditorCanonicalRestoreChange,
  onEditorTransitionApplied,
  onEditorLoadRevisionApplied,
  onEditorBlur,
  onEditorViewModeChange,
  onImportClipboardImage,
  onInsertTableColumnLeft,
  onInsertTableColumnRight,
  onInsertTableRowAbove,
  onInsertTableRowBelow,
  onKeepMemoryVersion,
  onNavigateToOutlineItem,
  onToggleViewContainer,
  onOpenExternalLink,
  onOpenRecentFile,
  onClearRecentFile,
  onReloadExternalFile,
  onRefreshThemePackages,
  onOpenThemesDirectory,
  onSelectTemporaryImageDirectory,
  onSaveAs,
  onSettingsOpen,
  onSidePanelWidthCommit,
  onTableToolHoverChange,
  onTabActivate,
  onTabDragEnd,
  onTabDragOver,
  onTabDragStart,
  onTabDrop,
  onTitlebarSurfaceRuntimeModeChange,
  onUpdatePreferences,
  onWorkbenchSurfaceRuntimeModeChange
}: WorkspaceShellProps) {
  const activeDocument = workspaceSnapshot?.activeDocument ?? null;
  const workspaceTabs = workspaceSnapshot?.tabs ?? [];
  const activeTabId = workspaceSnapshot?.activeTabId ?? null;
  const [welcomeShortcutTip] = useState(() => createWelcomeShortcutTip(fishmarkPlatform));
  const workspaceShellRef = useRef<HTMLElement | null>(null);
  /*
   * The rail switches the shared side panel between view containers and
   * `Ctrl/Cmd+F` opens the Search container; the inline find bar no longer
   * exists, so CodeMirror's own search query stays the only source of truth for
   * what is searched while these fields only mirror it for editing.
   */
  const visibleViewContainer = activeViewContainer ?? closingViewContainer;
  const isSidePanelOpen = activeViewContainer !== null;
  const isSidePanelVisible = visibleViewContainer !== null;
  const isSearchViewActive = activeViewContainer === "search";
  const isViewContainerEnabled = isDocumentOpen && activeDocument !== null;
  const { findText, replaceText, findReplaceSnapshot, setFindReplaceSnapshot,
    findInputRef, matchStatusLabel, closeFindReplacePanel, handleFindReplaceKeyDown,
    handleFindTextChange, handleReplaceTextChange, toggleSearchViewContainer, handleWorkspaceKeyDownCapture
  } = useFindReplacePresentation({
    activeTabId, editorEpoch, editorLoadRevision, editorRef,
    isDocumentOpen, activeViewContainer, isSearchViewActive, isViewContainerEnabled, onCloseViewContainer, onToggleViewContainer
  });
  const { displayedSidePanelWidth, isResizingSidePanel, handleSidePanelResizePointerDown,
    handleSidePanelResizePointerMove, finishSidePanelResize, handleSidePanelResizeKeyDown
  } = useSidePanelResize({ workspaceShellRef, sidePanelStoredWidth, onSidePanelWidthCommit });
  /*
   * The shared side panel renders `activeViewContainer` while it is expanded
   * and keeps `closingViewContainer` mounted until the exit animation ends.
   */
  const visibleViewContainerLabel = visibleViewContainer
    ? VIEW_CONTAINER_LABELS[visibleViewContainer]
    : null;

  /*
   * While the region is expanded the canvas publishes the stored width as a CSS
   * variable; the stylesheet clamps it for the available viewport (display
   * only), and the drag path overrides the same variable for live resizing.
   * While it is closing the override is dropped so the column animates to 0px.
   */
  const sidePanelWidthVariables =
    isSidePanelVisible
      ? ({
        "--fishmark-side-panel-stored-width": `${displayedSidePanelWidth}px`
      } as CSSProperties)
      : undefined;

  /*
   * The panel's collapse affordance clears this view container's query as well
   * as collapsing the region; CodeMirror search state stays the single source
   * of truth, so nothing else has to mirror it.
   */
  const collapseVisibleViewContainer = () => {
    if (visibleViewContainer === "search") {
      closeFindReplacePanel();
    }

    onCloseViewContainer();
  };

  return (
    <main
      className="app-shell"
      data-fishmark-shell-mode={shellMode}
      style={
        {
          "--fishmark-titlebar-height": controlledTitlebarEnabled
            ? `${titlebarHeight}px`
            : "0px"
        } as CSSProperties
      }
    >
      {controlledTitlebarEnabled ? (
        <Suspense fallback={null}>
          <TitlebarHost
            platform={fishmarkPlatform}
            layout={titlebarLayout}
            title={headerTitle}
            isDirty={activeDocument?.isDirty ?? false}
            themeMode={resolvedThemeMode}
            runtimeEnv={themeRuntimeEnv}
            effectsMode={preferencesThemeEffectsMode}
            titlebarSurface={activeTitlebarSurface}
            onTitlebarSurfaceRuntimeModeChange={onTitlebarSurfaceRuntimeModeChange}
          />
        </Suspense>
      ) : null}
      <div
        className="app-layout"
        data-fishmark-shell-mode={shellMode}
        data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
      >
        {activeWorkbenchSurface ? (
          <Suspense fallback={null}>
            <ThemeSurfaceHost
              surface="workbenchBackground"
              descriptor={activeWorkbenchSurface}
              themeMode={resolvedThemeMode}
              runtimeEnv={themeRuntimeEnv}
              effectsMode={preferencesThemeEffectsMode}
              onRuntimeModeChange={onWorkbenchSurfaceRuntimeModeChange}
            />
          </Suspense>
        ) : null}
        <aside
          className="app-rail"
          data-fishmark-layout="rail"
          data-fishmark-rail-mode={activeShortcutGroupId}
        >
          <div className="app-rail-brand">
            <p className="app-name">FishMark</p>
            <p className="app-subtitle">Desktop editor</p>
          </div>
          <button
            type="button"
            className="rail-tool-button"
            data-fishmark-command="toggle-reading-mode"
            aria-label={isReadingMode ? "退出阅读模式 (F11)" : "进入阅读模式 (F11)"}
            title={isReadingMode ? "退出阅读模式 (F11)" : "进入阅读模式 (F11)"}
            aria-keyshortcuts="F11"
            aria-pressed={isReadingMode}
            disabled={!isDocumentOpen || isSettingsDrawerVisible}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleReadingMode}
          >
            <svg className="rail-tool-button-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M12 5v15M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z" />
            </svg>
          </button>
          <div className="app-rail-content">
            <div
              className="app-rail-mode-group app-rail-mode-group-default"
              data-state={activeShortcutGroupId === "default-text" ? "open" : "closing"}
              aria-hidden={activeShortcutGroupId !== "default-text"}
            >
              <button
                type="button"
                className="rail-tool-button"
                data-fishmark-command="find-replace"
                aria-label="Find and replace"
                aria-pressed={activeViewContainer === "search"}
                title="Find and replace"
                disabled={!isViewContainerEnabled}
                onClick={toggleSearchViewContainer}
              >
                <SearchIcon className="rail-tool-button-icon" />
              </button>
              <button
                type="button"
                className="rail-tool-button"
                data-fishmark-command="outline"
                aria-label="Outline"
                aria-pressed={activeViewContainer === "outline"}
                title="Outline"
                disabled={!isViewContainerEnabled}
                onClick={() => onToggleViewContainer("outline")}
              >
                <OutlineIcon className="rail-tool-button-icon" />
              </button>
              <div
                className="app-rail-spacer"
                aria-hidden="true"
              />
            </div>
            <div
              className="app-rail-mode-group app-rail-mode-group-table"
              data-state={activeShortcutGroupId === "table-editing" ? "open" : "closing"}
              aria-hidden={activeShortcutGroupId !== "table-editing"}
            >
              <TableToolbar
                activeTableToolId={activeTableToolId}
                onTableToolHoverChange={onTableToolHoverChange}
                onDeleteTable={onDeleteTable}
                onDeleteTableColumn={onDeleteTableColumn}
                onDeleteTableRow={onDeleteTableRow}
                onInsertTableColumnLeft={onInsertTableColumnLeft}
                onInsertTableColumnRight={onInsertTableColumnRight}
                onInsertTableRowAbove={onInsertTableRowAbove}
                onInsertTableRowBelow={onInsertTableRowBelow}
              />
            </div>
          </div>
          <button
            type="button"
            className="settings-entry"
            ref={settingsEntryRef}
            onMouseDown={onCaptureSettingsOpenOrigin}
            onClick={onSettingsOpen}
            aria-label="打开偏好设置"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M19.14 12.94a7.94 7.94 0 0 0 .05-.94 7.94 7.94 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.9 7.9 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.94 7.94 0 0 0 0 1.88L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7.9 7.9 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="2.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            <span>设置</span>
          </button>
        </aside>

        <div
          className="app-workspace"
          data-fishmark-layout="workspace"
          data-fishmark-shell-mode={shellMode}
          data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
          onMouseDownCapture={onAppWorkspaceMouseDownCapture}
          onKeyDownCapture={handleWorkspaceKeyDownCapture}
        >
          <NotificationHost
            notification={notification}
            notificationState={notificationState}
          />
          <ConflictBanner
            externalFileState={externalFileState}
            externalFileConflictMessage={externalFileConflictMessage}
            onReloadExternalFile={onReloadExternalFile}
            onKeepMemoryVersion={onKeepMemoryVersion}
            onSaveAs={onSaveAs}
            onDismissExternalFileConflict={onDismissExternalFileConflict}
          />
          <WorkspaceTabStrip
            isReadingMode={isReadingMode}
            isDocumentOpen={isDocumentOpen}
            onTabActivate={onTabActivate}
            onCloseWorkspaceTab={onCloseWorkspaceTab}
            onTabDragStart={onTabDragStart}
            onTabDragOver={onTabDragOver}
            onTabDrop={onTabDrop}
            onTabDragEnd={onTabDragEnd}
            workspaceTabs={workspaceTabs}
            activeTabId={activeTabId}
          />
          <section
            className={`workspace-canvas ${activeDocument ? "is-editor-open" : ""}`}
            data-fishmark-region="workspace-canvas"
            data-fishmark-shell-mode={shellMode}
            data-fishmark-has-document={isDocumentOpen ? "true" : "false"}
            style={sidePanelWidthVariables}
          >
            {activeDocument ? (
              <>
                <div
                  data-fishmark-region="shortcut-hint-overlay-shell"
                  className="shortcut-hint-overlay-shell"
                  data-shortcut-hint-state={isShortcutHintVisible ? "visible" : "hidden"}
                >
                  <Suspense fallback={null}>
                    <ShortcutHintOverlay
                      visible={isShortcutHintVisible}
                      platform={fishmarkPlatform}
                      groupId={activeShortcutGroupId}
                    />
                  </Suspense>
                </div>
                <section
                  className={`workspace-shell ${isSidePanelOpen ? "is-side-panel-open" : ""} ${isResizingSidePanel ? "is-side-panel-resizing" : ""
                    }`}
                  ref={workspaceShellRef}
                  style={sidePanelWidthVariables}
                >
                  <div
                    className="document-canvas"
                    ref={editorContainerRef}
                  >
                    <Suspense fallback={null}>
                      <CodeEditorView
                        ref={editorRef}
                        initialContent={activeDocument.content}
                        documentPath={activeDocument.path}
                        documentTabId={activeDocument.tabId}
                        editorEpoch={editorEpoch}
                        loadRevision={editorLoadRevision}
                        readOnly={editorTransition?.readOnly ?? false}
                        editorTransitionToken={editorTransition?.token ?? null}
                        importClipboardImage={onImportClipboardImage}
                        openExternalLink={onOpenExternalLink}
                        viewMode={editorViewMode}
                        onActiveBlockChange={onActiveBlockChange}
                        onDocumentChangeFrame={onDocumentChangeFrame}
                        onUserDocumentEdit={onUserDocumentEdit}
                        onDiscardedDocumentText={onDiscardedDocumentText}
                        onPendingDocumentChangesChange={onPendingDocumentChangesChange}
                        onEditorBarrierChange={onEditorBarrierChange}
                        onEditorRemotePatchChange={onEditorRemotePatchChange}
                        onEditorCanonicalRestoreChange={onEditorCanonicalRestoreChange}
                        onEditorTransitionApplied={onEditorTransitionApplied}
                        onLoadRevisionApplied={onEditorLoadRevisionApplied}
                        onBlur={onEditorBlur}
                      />
                    </Suspense>
                  </div>
                  {visibleViewContainer && visibleViewContainerLabel ? (
                    <aside
                      className="side-panel"
                      data-fishmark-region="side-panel"
                      data-view-container={visibleViewContainer}
                      data-state={isSidePanelOpen ? "open" : "closing"}
                      aria-label={visibleViewContainerLabel}
                    >
                      <div
                        className="side-panel-header"
                        data-fishmark-region="side-panel-header"
                      >
                        <p className="side-panel-title">{visibleViewContainerLabel}</p>
                        <button
                          type="button"
                          className="side-panel-close"
                          aria-label={`Collapse ${visibleViewContainerLabel.toLowerCase()}`}
                          onClick={collapseVisibleViewContainer}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path
                              d="M15 6l-6 6 6 6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                      <div
                        className="side-panel-body"
                        data-fishmark-region="side-panel-body"
                      >
                        {visibleViewContainer === "search" ? (
                          <FindReplacePanel
                            findText={findText}
                            replaceText={replaceText}
                            matchStatusLabel={matchStatusLabel}
                            findInputRef={findInputRef}
                            handleFindReplaceKeyDown={handleFindReplaceKeyDown}
                            handleFindTextChange={handleFindTextChange}
                            handleReplaceTextChange={handleReplaceTextChange}
                            hasMatches={findReplaceSnapshot.matchCount > 0}
                            onPrevious={() => setFindReplaceSnapshot(editorRef.current?.findPreviousMatch() ?? findReplaceSnapshot)}
                            onNext={() => setFindReplaceSnapshot(editorRef.current?.findNextMatch() ?? findReplaceSnapshot)}
                            onReplaceCurrent={() => setFindReplaceSnapshot(editorRef.current?.replaceCurrentMatch() ?? findReplaceSnapshot)}
                            onReplaceAll={() => setFindReplaceSnapshot(editorRef.current?.replaceAllMatches() ?? findReplaceSnapshot)}
                          />
                        ) : null}
                        {visibleViewContainer === "outline" ? (
                          <OutlinePanel
                            outlineItems={outlineItems}
                            activeHeadingId={activeHeadingId}
                            onNavigateToOutlineItem={onNavigateToOutlineItem}
                          />
                        ) : null}
                      </div>
                    </aside>
                  ) : null}
                  {isSidePanelOpen ? (
                    <div
                      className="side-panel-resizer"
                      data-fishmark-region="side-panel-resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize side panel"
                      aria-valuemin={SIDE_PANEL_WIDTH_MIN}
                      aria-valuemax={SIDE_PANEL_WIDTH_MAX}
                      aria-valuenow={displayedSidePanelWidth}
                      tabIndex={0}
                      onPointerDown={handleSidePanelResizePointerDown}
                      onPointerMove={handleSidePanelResizePointerMove}
                      onPointerUp={() => finishSidePanelResize(true)}
                      onPointerCancel={() => finishSidePanelResize(false)}
                      onKeyDown={handleSidePanelResizeKeyDown}
                      onLostPointerCapture={() => finishSidePanelResize(false)}
                    />
                  ) : null}
                </section>
              </>
            ) : (
              <WelcomeWorkspace
                recentFiles={recentFiles}
                onOpenRecentFile={onOpenRecentFile}
                onClearRecentFile={onClearRecentFile}
                welcomeShortcutTip={welcomeShortcutTip}
              />)}
          </section>

          <StatusBar
            isReadingMode={isReadingMode}
            isDocumentOpen={isDocumentOpen}
            appUpdateStatusLabel={appUpdateStatusLabel}
            saveStatusLabel={saveStatusLabel}
            currentDocumentMetrics={currentDocumentMetrics}
            editorViewMode={editorViewMode}
            onEditorViewModeChange={onEditorViewModeChange}
            appVersionLabel={appVersionLabel}
            isDirty={activeDocument?.isDirty ?? false}
          />
        </div>
      </div>

      <SettingsDrawer
        isSettingsDrawerVisible={isSettingsDrawerVisible}
        isSettingsOpen={isSettingsOpen}
        onCloseSettingsDrawer={onCloseSettingsDrawer}
        preferences={preferences}
        fontFamilies={fontFamilies}
        themePackages={themePackages}
        isRefreshingThemePackages={isRefreshingThemePackages}
        onRefreshThemePackages={onRefreshThemePackages}
        onOpenThemesDirectory={onOpenThemesDirectory}
        onSelectTemporaryImageDirectory={onSelectTemporaryImageDirectory}
        onUpdatePreferences={onUpdatePreferences}
        onOpenExternalLink={onOpenExternalLink}
      />
    </main>
  );
}
