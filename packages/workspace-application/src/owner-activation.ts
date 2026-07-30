import type {
  FileIdentity,
  WorkspaceState
} from "@fishmark/workspace-domain";

import type { KeyedOperationCoordinator } from "./ports";

type ActivationRequestBroker = {
  request(input: {
    readonly windowId: string;
    readonly tabId: string;
    readonly sendRequest: (request: {
      readonly requestId: string;
      readonly tabId: string;
    }) => void;
    readonly bindAbort: (listener: () => void) => () => void;
  }): { readonly result: Promise<boolean> };
};

export function createWorkspaceOwnerTabActivation<TOwnerWindow>(dependencies: {
  workspace: Pick<WorkspaceState, "getFileOwner" | "getWindowProjection">;
  tabOperations: Pick<KeyedOperationCoordinator<string>, "runExclusive">;
  activationRequestBroker: ActivationRequestBroker;
  resolveWindow: (windowId: string) => TOwnerWindow | null;
  isWindowUnavailable: (window: TOwnerWindow) => boolean;
  sendRequest: (
    window: TOwnerWindow,
    request: { readonly requestId: string; readonly tabId: string }
  ) => void;
  bindAbort: (window: TOwnerWindow, listener: () => void) => () => void;
  focusWindow: (window: TOwnerWindow) => void;
}) {
  function hasExactOwner(windowId: string, tabId: string, identity: FileIdentity): boolean {
    const owner = dependencies.workspace.getFileOwner(identity);
    return owner.kind === "owned" &&
      owner.owner.windowId === windowId && owner.owner.tabId === tabId;
  }
  return {
    async activateOwnerWindowTab(
      windowId: string,
      tabId: string,
      identity: FileIdentity
    ): Promise<"activated" | "retry" | "failed"> {
      const ownerWindow = dependencies.resolveWindow(windowId);
      if (ownerWindow === null || dependencies.isWindowUnavailable(ownerWindow)) {
        return "retry";
      }
      const activation = dependencies.activationRequestBroker.request({
        windowId,
        tabId,
        sendRequest: (request) => dependencies.sendRequest(ownerWindow, request),
        bindAbort: (listener) => dependencies.bindAbort(ownerWindow, listener)
      });
      const confirmed = await activation.result;
      return dependencies.tabOperations.runExclusive(tabId, async () => {
        if (!confirmed) return hasExactOwner(windowId, tabId, identity) ? "failed" : "retry";
        if (!hasExactOwner(windowId, tabId, identity)) return "retry";
        const currentWindow = dependencies.resolveWindow(windowId);
        if (
          currentWindow === null || currentWindow !== ownerWindow ||
          dependencies.isWindowUnavailable(currentWindow)
        ) return "retry";
        let activeTabId: string | null;
        try {
          activeTabId = dependencies.workspace.getWindowProjection(windowId).activeTabId;
        } catch {
          return "retry";
        }
        if (activeTabId !== tabId) return "failed";
        dependencies.focusWindow(currentWindow);
        return "activated";
      });
    }
  };
}
