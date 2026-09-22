import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readMainSource = () =>
  readFileSync(path.join(process.cwd(), "src", "main", "main.ts"), "utf8").replace(/\r\n/g, "\n");
const readCloseConfirmationHandlerSource = () =>
  readFileSync(
    path.join(process.cwd(), "src", "main", "workspace-window-close-confirmation-handler.ts"),
    "utf8"
  ).replace(/\r\n/g, "\n");

describe("main process window wiring", () => {
  it("keeps the window-close IPC result explicitly constrained to the shared transport DTO", () => {
    const mainSource = readMainSource();
    const handlerSource = readCloseConfirmationHandlerSource();

    expect(mainSource).toMatch(
      /async \(event, input: ConfirmWorkspaceWindowCloseInput\):\s*Promise<ConfirmWorkspaceWindowCloseResult> =>/
    );
    expect(handlerSource).not.toContain(
      "export type WorkspaceWindowCloseConfirmationHandlerResult"
    );
    expect(handlerSource).toContain(
      "satisfies ConfirmWorkspaceWindowCloseResult"
    );
  });

  it("passes the resolved window icon path into the runtime window manager", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain("windowIconPath: resolveWindowIconPath()");
  });

  it("configures a dev-specific runtime identity before deciding whether to request the single-instance lock", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain('configureMainProcessRuntime(app, process.env)');
    expect(mainSource).toContain('shouldRequestSingleInstanceLock(process.env)');
  });

  it("wires the app updater service, update IPC, and startup auto-check", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain('import { createAppUpdateCheckRunner } from "./app-update-check-runner"');
    expect(mainSource).toContain('import("electron-updater")');
    expect(mainSource).toContain('createAppUpdater({');
    expect(mainSource).toContain('const runAppUpdateCheck = createAppUpdateCheckRunner({');
    expect(mainSource).toContain('ipcMain.handle(CHECK_FOR_APP_UPDATES_CHANNEL');
    expect(mainSource).toContain('broadcastToWindows(APP_UPDATE_STATE_EVENT, state)');
    expect(mainSource).toContain('setTimeout(() => {');
    expect(mainSource).toContain('void runAppUpdateCheck("manual")');
    expect(mainSource).toContain('void runAppUpdateCheck("auto")');
    expect(mainSource).toContain('if (command === "check-for-updates") {');
    expect(mainSource).not.toContain('import { autoUpdater } from "electron-updater"');
  });

  it("registers IPC handlers for fonts, preferences, and themes", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain('import { createFileWatchRegistry } from "./infrastructure/file-watch-registry"');
    expect(mainSource).toContain('import { resolveTemporaryImageDirectory, selectTemporaryImageDirectory } from "./temporary-image-directory"');
    expect(mainSource).toContain('ipcMain.handle(GET_PREFERENCES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(UPDATE_PREFERENCES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(SELECT_TEMPORARY_IMAGE_DIRECTORY_CHANNEL');
    expect(mainSource).toContain('SYNC_WATCHED_MARKDOWN_FILE_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(LIST_FONT_FAMILIES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(LIST_THEME_PACKAGES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(REFRESH_THEME_PACKAGES_CHANNEL');
    expect(mainSource).toContain('ipcMain.handle(OPEN_THEMES_DIRECTORY_CHANNEL');
    expect(mainSource).toContain("const workspaceWatcher = {");
    expect(mainSource).toContain(
      "workspaceWindowRegistrationApplication.ensureWindow("
    );
    expect(mainSource).toContain("workspaceApplication.syncWindow({");
    expect(mainSource).not.toContain("workspaceState.getTabPath(input.tabId)");
    expect(mainSource).toContain('temporaryDirectory: resolveTemporaryImageDirectory(');
  });

  it("registers a safe system-browser opener for external Markdown links", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain("OPEN_EXTERNAL_LINK_CHANNEL");
    expect(mainSource).toContain("isSafeExternalLinkProtocol");
    expect(mainSource).toContain("shell.openExternal");
    expect(mainSource).not.toContain("shell.openPath(input.href)");
  });

  it("wires the workspace domain state, application boundary, and IPC handlers", () => {
    const mainSource = readMainSource();
    expect(mainSource).toContain('from "@fishmark/workspace-domain"');
    expect(mainSource).toContain('from "@fishmark/workspace-application"');
    expect(mainSource).toContain('from "@fishmark/workspace-infrastructure"');
    for (const factory of [
      "createApplyDocumentEdits",
      "createCloseWorkspace",
      "createSaveDocument",
      "createWorkspaceApplication",
      "createWorkspaceDetach",
      "createWorkspaceOpen",
      "createWorkspaceReload",
      "createWorkspaceTabReorder",
      "createWorkspaceTabTransfer",
      "createWorkspaceWindowClose"
    ]) {
      expect(mainSource).toContain(factory);
    }
    for (const obsoletePath of [
      "./workspace-application",
      "./workspace-close-coordinator",
      "./workspace-file-operations",
      "./workspace-open-application",
      "./workspace-reload-application",
      "./workspace-tab-reorder-application",
      "./workspace-tab-transfer-application",
      "./workspace-detach-application",
      "./workspace-owner-tab-activation-application",
      "./workspace-window-close-application",
      "./workspace-file-watch-application"
    ]) {
      expect(mainSource).not.toContain(obsoletePath);
    }
    expect(mainSource).toContain('from "./keyed-operation-coordinator"');
    expect(mainSource).toContain('import { createWorkspaceWindowCloseConfirmationHandler } from "./workspace-window-close-confirmation-handler"');
    expect(mainSource).toContain('import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker"');
    expect(mainSource).toContain('import { createWorkspaceWindowRegistrationApplication } from "./workspace-window-registration-application"');
    expect(mainSource).toContain('import {\n  toWorkspaceMoveTabResult,\n  toWorkspaceWindowSnapshot\n} from "./workspace-ipc-projection"');
    expect(mainSource).toContain("GET_WORKSPACE_SNAPSHOT_CHANNEL");
    expect(mainSource).toContain("CREATE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("OPEN_WORKSPACE_FILE_CHANNEL");
    expect(mainSource).toContain("OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL");
    expect(mainSource).toContain("ACTIVATE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("CLOSE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).not.toContain("UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL");
    expect(mainSource).toContain(
      "const workspaceState = createWorkspaceState({ createTextBuffer: createCodeMirrorTextBuffer })"
    );
    expect(mainSource).toContain("const workspaceTabOperations = createKeyedOperationCoordinator<string>()");
    expect(mainSource).toContain("const workspaceTabReorderApplication = createWorkspaceTabReorder({");
    expect(mainSource).toContain("const workspaceApplication = createWorkspaceApplication({");
    expect(mainSource).toContain("const closeWorkspace = createCloseWorkspace({");
    expect(mainSource).toContain("const workspaceDetachApplication = createWorkspaceDetach({");
    expect(mainSource).toContain("createWorkspaceWindowRegistrationApplication<Electron.WebContents, BrowserWindow>({");
    expect(mainSource).toContain("resolveOwnerWindow: (sender) => BrowserWindow.fromWebContents(sender)");
    expect(mainSource).toContain("isOwnerWindowForSender: (ownerWindow, sender) =>");
    expect(mainSource).toContain("markWindowReady: workspaceApplication.markWindowReady");
    expect(mainSource).toContain("registerWindow: (windowId) => workspaceState.registerWindow(windowId)");
    expect(mainSource).toContain("bindWindow: bindWorkspaceWindow");
    expect(mainSource).toContain("focusWindow: (windowId) => workspaceState.focusWindow(windowId)");
    expect(mainSource).toContain("const workspaceFileOperations = createSaveDocument({");
    expect(mainSource).toContain("const workspaceReloadApplication = createWorkspaceReload({");
    expect(mainSource).toContain("createWorkspaceWindowClose<BrowserWindow>({");
    expect(mainSource).toContain("createWorkspaceWindowCloseRequestBroker<WorkspaceWindowCloseConfirmation>({");
    expect(mainSource).toContain("const heldWorkspaceWindowCloseReleases = new Map<string, () => void>()");
    expect(mainSource).toContain(
      "const WORKSPACE_DETACH_READY_TIMEOUT_MS = 15_000"
    );
    expect(mainSource).toContain(
      "const WORKSPACE_WINDOW_CLOSE_REQUEST_TIMEOUT_MS = 15_000"
    );
    expect(mainSource).toContain(
      "const WORKSPACE_WINDOW_CLOSE_POST_CONFIRM_WATCHDOG_MS = 15_000"
    );
    expect(mainSource).toContain("schedulePostConfirmationWatchdog: (listener) => {");
    expect(mainSource).toContain("report: (error) => {");
    expect(mainSource).toContain(
      '"[fishmark] workspace file operation cleanup failed.",'
    );
    expect(mainSource).toContain(
      "scheduleReadyTimeout: (listener) => {"
    );
    expect(mainSource).toContain(
      "setTimeout(listener, WORKSPACE_DETACH_READY_TIMEOUT_MS)"
    );
    expect(mainSource).toContain("return () => clearTimeout(timeout)");
    expect(mainSource).toContain("workspace: workspaceState");
    expect(mainSource).toContain("ipcMain.handle(GET_WORKSPACE_SNAPSHOT_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(CREATE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(OPEN_WORKSPACE_FILE_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(ACTIVATE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(CLOSE_WORKSPACE_TAB_CHANNEL");
    expect(mainSource).toContain("await workspaceApplication.reorderTab({");
    expect(mainSource).toContain("expectedWindowId: windowId");
    expect(mainSource).not.toContain("workspaceState.reorderTab(input.tabId, input.toIndex)");
    expect(mainSource).not.toContain("UPDATE_WORKSPACE_TAB_DRAFT_CHANNEL");
    expect(mainSource).toContain('ownerWindow.on("close", (event) => {');
    expect(mainSource).toContain("workspaceWindowCloseRequestBroker.hasPending(windowId)");
    expect(mainSource).toContain("workspaceWindowCloseApplication.requestWindowClose({");
    expect(mainSource).toContain("heldWorkspaceWindowCloseReleases.set(");
    expect(mainSource).toContain("heldWorkspaceWindowCloseReleases.delete(windowId)");
    expect(mainSource).toContain("ownerWindow.webContents.send(REQUEST_WORKSPACE_WINDOW_CLOSE_EVENT");
    expect(mainSource).toContain('ownerWindow.webContents.on("render-process-gone", abort)');
    expect(mainSource).toContain('ownerWindow.webContents.on("destroyed", abort)');
    expect(mainSource).toContain("ipcMain.handle(\n    CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL");
    expect(mainSource).toContain("ipcMain.handle(\n    COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL");
    expect(mainSource).toContain("const handle = workspaceWindowCloseRequestBroker.request({");
    expect(mainSource).toContain("return await handle.result");
    expect(mainSource).toContain("await handle.drained");
    expect(mainSource).toContain("createWorkspaceWindowCloseConfirmationHandler({");
    expect(mainSource).toContain("async (event, input: ConfirmWorkspaceWindowCloseInput)");
    expect(mainSource).toContain("requestId: input.requestId");
    expect(mainSource).not.toContain("getPendingIdentity(");
    expect(mainSource).toContain("workspaceWindowCloseRequestBroker.complete(");
    expect(mainSource).toContain("workspaceWindowCloseRequestBroker.abortWindow(windowId)");
    expect(mainSource).not.toContain("pendingWorkspaceWindowCloseResponses");
    const closedHandlerStart = mainSource.indexOf('ownerWindow.once("closed", () => {');
    const closedHandlerSource = mainSource.slice(
      closedHandlerStart,
      mainSource.indexOf("workspaceWindowBindings.add(windowId)", closedHandlerStart)
    );
    expect(closedHandlerSource.indexOf("workspaceState.unregisterWindow(windowId)")).toBeLessThan(
      closedHandlerSource.indexOf("heldRelease?.()")
    );
    expect(mainSource).toContain("await workspaceApplication.closeTab({");
    expect(mainSource).toContain("expectedWindowId: windowId");
    expect(mainSource).toContain(
      "const windowId = await workspaceWindowRegistrationApplication.ensureWindow(event.sender)"
    );
    expect(mainSource).not.toContain("workspaceApplication.updateDocumentDraft({");
    expect(mainSource).toContain("registerWorkspaceHandlers<Electron.WebContents>({");
    expect(mainSource).toContain("createApplyDocumentEdits({");
    expect(mainSource).toContain("createFlushDocumentEdits({");
    expect(mainSource).toContain(
      "workspaceWindowCloseLeases.get(input.expectedWindowId)"
    );
    expect(mainSource).toContain(
      "applyDocumentEditsWithRecovery.applyWithHeldTabLease("
    );
    expect(mainSource).toContain(
      "flushDocumentEdits.flushWithHeldTabLease("
    );
    expect(mainSource).toContain("expectedWindowId: windowId");
    expect(mainSource).not.toContain("workspaceState.updateTabDraft(");
    expect(mainSource).toContain("workspaceApplication.saveDocument({");
    expect(mainSource).toContain("workspaceApplication.saveDocumentAs({");
    expect(mainSource).toContain("writeDocument: documentRepository.writeDocument");
    expect(mainSource).toContain("readDiskVersion: documentRepository.readDiskVersion");
    expect(mainSource).not.toContain("saveMarkdownFileToPath");
    expect(mainSource).not.toContain("saveTab: workspaceApplication.saveTab");
    expect(mainSource).toContain("workspaceApplication.reloadTab({");
    expect(mainSource).toContain("workspaceApplication.moveTab({");
    expect(mainSource).not.toContain(
      "toWorkspaceMoveTabResult(workspaceState.moveTabToWindow(input))"
    );
    expect(mainSource).toContain(
      "const result = await workspaceApplication.detachTab({"
    );
    expect(mainSource).not.toContain("function requireLiveWorkspaceOwnerWindow");
    expect(mainSource).not.toContain("function ensureWorkspaceWindow");
    expect(mainSource).not.toContain("sender.id");
    expect(mainSource).not.toContain("workspaceState.registerWindow(detachedWindowId)");
    expect(mainSource).not.toContain("workspaceState.createUntitledTab(");
    expect(mainSource).not.toContain("workspaceState.activateTab(");
    expect(mainSource).not.toContain("workspaceState.replaceTabDocument(input.tabId");
  });

  it("keeps File > New Window as an explicit main-process window action", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain('if (command === "new-editor-window") {');
    expect(mainSource).toContain("openEmptyEditorWindow?.();");
    expect(mainSource).toContain("targetWindow?.webContents.send(APP_MENU_COMMAND_EVENT, command)");
  });

  it("routes external opens back into the workspace flow and keeps dropped files in place", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain("OPEN_WORKSPACE_PATH_EVENT");
    expect(mainSource).toContain("window.webContents.send(OPEN_WORKSPACE_PATH_EVENT");
    expect(mainSource).toContain('disposition: "open-in-place"');
    expect(mainSource).not.toContain('disposition: "opened-in-new-window"');
  });

  it("composes owner-renderer activation through the executable CAS application", () => {
    const mainSource = readMainSource();

    expect(mainSource).not.toContain("WORKSPACE_WINDOW_SNAPSHOT_EVENT");
    expect(mainSource).toContain("createWorkspaceOwnerTabActivationRequestBroker");
    expect(mainSource).toContain("createWorkspaceOwnerTabActivation");
    expect(mainSource).toContain("activationRequestBroker: workspaceOwnerTabActivationRequestBroker");
    expect(mainSource).toContain("REQUEST_WORKSPACE_OWNER_TAB_ACTIVATION_EVENT");
    expect(mainSource).toContain("ownerActivation: workspaceOwnerTabActivationApplication");
  });

  it("only initializes the scenario runner stack in test-workbench mode", () => {
    const mainSource = readMainSource();

    expect(mainSource).toContain('if (!app.isPackaged && runtimeMode === "test-workbench") {');
    expect(mainSource).toContain('import("./cli-process-runner.js")');
    expect(mainSource).toContain('import("./editor-test-sessions.js")');
    expect(mainSource).toContain('import("./test-run-sessions.js")');
    expect(mainSource).toContain('windowManager.openEditorWindow({ preloadBridgeMode: "editor-test" })');
  });
});
