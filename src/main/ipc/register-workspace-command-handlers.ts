import {
  HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
  type HandleDroppedMarkdownFileInput,
  type HandleDroppedMarkdownFileResult
} from "../../shared/open-markdown-file";
import {
  SAVE_MARKDOWN_FILE_AS_CHANNEL,
  SAVE_MARKDOWN_FILE_CHANNEL,
  type SaveMarkdownFileAsInput,
  type SaveMarkdownFileInput
} from "../../shared/save-markdown-file";
import { SYNC_WATCHED_MARKDOWN_FILE_CHANNEL } from "../../shared/external-file-change";
import {
  ACTIVATE_WORKSPACE_TAB_CHANNEL,
  CLOSE_WORKSPACE_TAB_CHANNEL,
  COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL,
  CONFIRM_WORKSPACE_OWNER_TAB_ACTIVATION_CHANNEL,
  CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL,
  CREATE_WORKSPACE_TAB_CHANNEL,
  DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
  GET_WORKSPACE_SNAPSHOT_CHANNEL,
  MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
  OPEN_WORKSPACE_FILE_CHANNEL,
  OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL,
  RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
  REORDER_WORKSPACE_TAB_CHANNEL,
  RESOLVE_EXTERNAL_CHANGE_CHANNEL,
  type ActivateWorkspaceTabInput,
  type CloseWorkspaceTabInput,
  type ConfirmWorkspaceOwnerTabActivationInput,
  type CompleteWorkspaceWindowCloseInput,
  type ConfirmWorkspaceWindowCloseInput,
  type ConfirmWorkspaceWindowCloseResult,
  type CreateWorkspaceTabInput,
  type DetachWorkspaceTabToNewWindowInput,
  type MoveWorkspaceTabToWindowInput,
  type OpenWorkspaceFileFromPathResult,
  type OpenWorkspaceFileResult,
  type ReloadWorkspaceTabFromPathInput,
  type ReloadWorkspaceTabFromPathResult,
  type ReorderWorkspaceTabInput,
  type ResolveExternalChangeInput
} from "../../shared/workspace";
import type { createWorkspaceApplication, createResolveExternalChange, WorkspaceWindowCloseConfirmation, CloseWorkspaceTabResult, WorkspaceMoveCommandResult, WorkspaceProjectionCommandResult, WorkspaceProjectionMutationResult } from "@fishmark/workspace-application";
import type { createWorkspaceState, WorkspaceWindowProjection } from "@fishmark/workspace-domain";
import type { WebContents } from "electron";
import type { createWorkspaceWindowCloseRequestBroker } from "../workspace-window-close-request-broker";
import type { createWorkspaceOwnerTabActivationRequestBroker } from "../workspace-owner-tab-activation-request-broker";
import type { createWorkspaceWindowCloseConfirmationHandler } from "../workspace-window-close-confirmation-handler";
import type { createDocumentRepository } from "../infrastructure/document-repository";
import { toWorkspaceMoveTabResult, toWorkspaceWindowSnapshot } from "../workspace-ipc-projection";
import type { IpcRegistration } from "./ipc-lifecycle";
import type { AuthorizeIpcSender } from "./ipc-sender";
import * as request from "./request-validation";
function mapResolveExternalChangeResult(
  result: import("@fishmark/workspace-application").ResolveExternalChangeResult
): import("../../shared/workspace").ResolveExternalChangeResult {
  if (result.kind === "resolved" || result.kind === "reloaded" || result.kind === "saved-as") {
    return { kind: "resolved" };
  }
  if (result.kind === "cancelled") {
    return { kind: "cancelled" };
  }
  return { kind: "error", message: "The tab is no longer available." };
}

function requireWorkspaceCommandProjection(
  result: WorkspaceProjectionMutationResult
): WorkspaceWindowProjection;
function requireWorkspaceCommandProjection(
  result: WorkspaceMoveCommandResult
): import("@fishmark/workspace-domain").WorkspaceMoveProjection;
function requireWorkspaceCommandProjection(
  result: CloseWorkspaceTabResult |
    Extract<WorkspaceProjectionCommandResult, { readonly kind: "watch-error" }>
): WorkspaceWindowProjection;
function requireWorkspaceCommandProjection(
  result:
    | WorkspaceProjectionMutationResult
    | WorkspaceMoveCommandResult
    | CloseWorkspaceTabResult
): WorkspaceWindowProjection | import("@fishmark/workspace-domain").WorkspaceMoveProjection {
  if ("status" in result) {
    if (result.status === "error") throw new Error(result.error.message);
    return result.snapshot;
  }
  if (result.kind === "success" || result.kind === "applied") {
    return result.projection;
  }
  if (result.kind === "watch-error") {
    throw new Error(result.error.message);
  }
  const messages = {
    "tab-missing": "The tab no longer exists.",
    "window-missing": "The owner window no longer exists.",
    "window-changed": "The tab moved to another window.",
    "revision-changed": "The document changed before the command could be committed."
  } as const;
  throw new Error(messages[result.reason]);
}

export function registerWorkspaceCommandHandlers(dependencies: {
  ipc: IpcRegistration;
  authorize: AuthorizeIpcSender;
  ensureWindow(sender: WebContents): Promise<string>;
  workspaceApplication: ReturnType<typeof createWorkspaceApplication<WebContents>>;
  workspaceState: ReturnType<typeof createWorkspaceState>;
  documentRepository: Pick<ReturnType<typeof createDocumentRepository>, "readDiskVersion">;
  resolveExternalChange: ReturnType<typeof createResolveExternalChange<WebContents>>;
  workspaceOwnerTabActivationRequestBroker: ReturnType<typeof createWorkspaceOwnerTabActivationRequestBroker>;
  workspaceWindowCloseRequestBroker: ReturnType<typeof createWorkspaceWindowCloseRequestBroker<WorkspaceWindowCloseConfirmation>>;
  handleWorkspaceWindowCloseConfirmation: ReturnType<typeof createWorkspaceWindowCloseConfirmationHandler>;
}): void {
  const { ipc, authorize, ensureWindow, workspaceApplication, workspaceState,
    documentRepository, resolveExternalChange, workspaceOwnerTabActivationRequestBroker,
    workspaceWindowCloseRequestBroker, handleWorkspaceWindowCloseConfirmation } = dependencies;
  const register: IpcRegistration["handle"] = (channel, handler) => {
    ipc.handle(channel, async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const result = await handler(event, ...args);
      // Completing native close may legitimately destroy the sender. No data is returned.
      if (channel !== COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL) check();
      return result;
    });
  };
  register(GET_WORKSPACE_SNAPSHOT_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    request.noArguments(args);
    const windowId = await ensureWindow(event.sender);
    check();
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(
      await workspaceApplication.getSnapshot({ context: event.sender, windowId })
    ));
  });
  register(
    RESOLVE_EXTERNAL_CHANGE_CHANNEL,
    async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      if (!["keep-memory", "reload", "save-as", "cancel"].includes(value.command as string)) request.invalidRequest();
      const input = value as ResolveExternalChangeInput;
      const windowId = await ensureWindow(event.sender);
      check();
      let tab;
      try {
        tab = workspaceState.getTabSession(input.tabId);
      } catch {
        return { kind: "error", message: "The tab no longer exists." };
      }
      if (tab.windowId !== windowId) {
        return { kind: "error", message: "The tab moved to another window." };
      }

      const context = { context: event.sender, tabId: input.tabId, expectedWindowId: windowId };
      if (input.command === "keep-memory") {
        const diskVersion = tab.path === null
          ? null
          : await documentRepository.readDiskVersion(tab.path);
        check();
        const result = await resolveExternalChange.resolve(context, {
          kind: "keep-memory",
          diskVersion
        });
        return mapResolveExternalChangeResult(result);
      }
      const result = await resolveExternalChange.resolve(
        context,
        input.command === "reload"
          ? { kind: "reload" }
          : input.command === "save-as"
            ? { kind: "save-as" }
            : { kind: "cancel" }
      );
      return mapResolveExternalChangeResult(result);
    }
  );
  register(
    CONFIRM_WORKSPACE_OWNER_TAB_ACTIVATION_CHANNEL,
    async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.requestId);
      request.string(value.tabId);
      request.boolean(value.success);
      const input = value as ConfirmWorkspaceOwnerTabActivationInput;
      const windowId = await ensureWindow(
        event.sender
      );
      check();
      return workspaceOwnerTabActivationRequestBroker.complete({
        ...input,
        windowId
      });
    }
  );
  register(
    CONFIRM_WORKSPACE_WINDOW_CLOSE_CHANNEL,
    async (event, ...args):
      Promise<ConfirmWorkspaceWindowCloseResult> => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.requestId);
      const input = value as ConfirmWorkspaceWindowCloseInput;
      const windowId = await ensureWindow(event.sender);
      check();
      return handleWorkspaceWindowCloseConfirmation({
        windowId,
        requestId: input.requestId
      });
    }
  );
  register(
    COMPLETE_WORKSPACE_WINDOW_CLOSE_CHANNEL,
    async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.requestId);
      request.boolean(value.shouldClose);
      const input = value as CompleteWorkspaceWindowCloseInput;
      const windowId = await ensureWindow(event.sender);
      check();

      workspaceWindowCloseRequestBroker.complete(
        input.requestId,
        windowId,
        input.shouldClose
      );
    }
  );
  register(CREATE_WORKSPACE_TAB_CHANNEL, async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      if (value.kind !== "untitled") request.invalidRequest();
      const input = value as CreateWorkspaceTabInput;
    const windowId = await ensureWindow(event.sender);
    check();
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(
      await workspaceApplication.createTab({
        context: event.sender,
        windowId,
        kind: input.kind
      })
    ));
  });
  register(OPEN_WORKSPACE_FILE_CHANNEL, async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    request.noArguments(args);
    const windowId = await ensureWindow(event.sender);
    check();
    const result = await workspaceApplication.open({ context: event.sender, windowId });
    if (result.kind !== "success") {
      if (result.kind === "watch-error") throw new Error(result.error.message);
      return result satisfies OpenWorkspaceFileResult;
    }
    return {
      kind: "success",
      snapshot: toWorkspaceWindowSnapshot(result.projection)
    } satisfies OpenWorkspaceFileResult;
  });
  register(OPEN_WORKSPACE_FILE_FROM_PATH_CHANNEL, async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.targetPath);
      const input = value as { targetPath: string };
    const windowId = await ensureWindow(event.sender);
    check();
    const result = await workspaceApplication.openPath({
      context: event.sender,
      windowId,
      targetPath: input.targetPath
    });
    if (result.kind !== "success") {
      if (result.kind === "watch-error") throw new Error(result.error.message);
      return result satisfies OpenWorkspaceFileFromPathResult;
    }
    return {
      kind: "success",
      snapshot: toWorkspaceWindowSnapshot(result.projection)
    } satisfies OpenWorkspaceFileFromPathResult;
  });
  register(
    RELOAD_WORKSPACE_TAB_FROM_PATH_CHANNEL,
    async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      const input = value as ReloadWorkspaceTabFromPathInput;
      const windowId = await ensureWindow(event.sender);
      check();
      const result = await workspaceApplication.reloadTab({
        context: event.sender,
        tabId: input.tabId,
        expectedWindowId: windowId
      });
      if (result.kind !== "success") {
        if (result.kind === "watch-error" || result.kind === "stale") {
          requireWorkspaceCommandProjection(result);
          throw new Error("Workspace command failure mapping returned unexpectedly.");
        }
        if (result.kind === "error") {
          const code = result.error.code;
          if (code === "file-identity-missing") {
            throw new Error(result.error.message);
          }
          return {
            kind: "error",
            error: { code, message: result.error.message }
          } satisfies ReloadWorkspaceTabFromPathResult;
        }
        return result satisfies ReloadWorkspaceTabFromPathResult;
      }

      return {
        kind: "success",
        snapshot: toWorkspaceWindowSnapshot(result.projection)
      } satisfies ReloadWorkspaceTabFromPathResult;
    }
  );
  register(ACTIVATE_WORKSPACE_TAB_CHANNEL, async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      const input = value as ActivateWorkspaceTabInput;
    const windowId = await ensureWindow(event.sender);
    check();
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(
      await workspaceApplication.activateTab({
        context: event.sender,
        windowId,
        tabId: input.tabId
      })
    ));
  });
  register(CLOSE_WORKSPACE_TAB_CHANNEL, async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      const input = value as CloseWorkspaceTabInput;
    const windowId = await ensureWindow(event.sender);
    check();
    const result = await workspaceApplication.closeTab({
      context: event.sender,
      tabId: input.tabId,
      expectedWindowId: windowId
    });
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(result));
  });
  register(REORDER_WORKSPACE_TAB_CHANNEL, async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      request.index(value.toIndex);
      const input = value as ReorderWorkspaceTabInput;
    const windowId = await ensureWindow(event.sender);
    check();
    return toWorkspaceWindowSnapshot(requireWorkspaceCommandProjection(
      await workspaceApplication.reorderTab({
        context: event.sender,
        tabId: input.tabId,
        expectedWindowId: windowId,
        targetIndex: input.toIndex
      })
    ));
  });
  register(
    MOVE_WORKSPACE_TAB_TO_WINDOW_CHANNEL,
    async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      request.string(value.targetWindowId);
      if (value.targetIndex !== undefined) request.index(value.targetIndex);
      const input = value as MoveWorkspaceTabToWindowInput;
      const windowId = await ensureWindow(event.sender);
      check();
      return toWorkspaceMoveTabResult(
        requireWorkspaceCommandProjection(await workspaceApplication.moveTab({
          context: event.sender,
          tabId: input.tabId,
          expectedWindowId: windowId,
          targetWindowId: input.targetWindowId,
          targetIndex: input.targetIndex
        }))
      );
    }
  );
  register(
    DETACH_WORKSPACE_TAB_TO_NEW_WINDOW_CHANNEL,
    async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      const input = value as DetachWorkspaceTabToNewWindowInput;
      const windowId = await ensureWindow(event.sender);
      check();
      const result = await workspaceApplication.detachTab({
        context: event.sender,
        tabId: input.tabId,
        expectedWindowId: windowId
      });
      return toWorkspaceWindowSnapshot(
        requireWorkspaceCommandProjection(result).sourceWindowSnapshot
      );
    }
  );
  register(
    HANDLE_DROPPED_MARKDOWN_FILE_CHANNEL,
    async (event, ...args): Promise<HandleDroppedMarkdownFileResult> => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      if (!Array.isArray(value.targetPaths) || value.targetPaths.length === 0) request.invalidRequest();
      value.targetPaths.forEach(request.string);
      const input = value as HandleDroppedMarkdownFileInput;
      check();
      if (input.targetPaths.length === 0) {
        throw new Error("Dropped Markdown payload did not include any file paths.");
      }

      return {
        disposition: "open-in-place"
      };
    }
  );
  register(SAVE_MARKDOWN_FILE_CHANNEL, async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      const input = value as SaveMarkdownFileInput;
    const windowId = await ensureWindow(event.sender);
    check();
    const result = await workspaceApplication.saveDocument({
      context: event.sender,
      expectedWindowId: windowId,
      tabId: input.tabId
    });
    if ("kind" in result) throw new Error(result.error.message);
    return result;
  });
  register(SAVE_MARKDOWN_FILE_AS_CHANNEL, async (event, ...args) => {
      const check = authorize(event, ["product", "editor-test"]);
      const value = request.oneArgument(args);
      request.record(value);
      request.string(value.tabId);
      const input = value as SaveMarkdownFileAsInput;
    const windowId = await ensureWindow(event.sender);
    check();
    const result = await workspaceApplication.saveDocumentAs({
      context: event.sender,
      expectedWindowId: windowId,
      tabId: input.tabId
    });
    if ("kind" in result) throw new Error(result.error.message);
    return result;
  });
  register(
    SYNC_WATCHED_MARKDOWN_FILE_CHANNEL,
    async (event, ...args) => {
    const check = authorize(event, ["product", "editor-test"]);
    request.noArguments(args);
      const windowId = await ensureWindow(
        event.sender
      );
      check();
      return workspaceApplication.syncWindow({
        context: event.sender,
        windowId
      });
    }
  );
}
