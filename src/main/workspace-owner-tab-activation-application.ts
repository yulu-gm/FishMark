import type {
  FileIdentity,
  WorkspaceState
} from "@fishmark/workspace-domain";

import type { KeyedOperationCoordinator } from "./keyed-operation-coordinator";
import type { WorkspaceOwnerTabActivationRequestHandle } from "./workspace-owner-tab-activation-request-broker";

type ActivationOutcome = "activated" | "retry" | "failed";

type ActivationRequestBroker = {
  request(input: {
    readonly windowId: string;
    readonly tabId: string;
    readonly sendRequest: (request: {
      readonly requestId: string;
      readonly tabId: string;
    }) => void;
    readonly bindAbort: (listener: () => void) => () => void;
  }): WorkspaceOwnerTabActivationRequestHandle;
};

type Dependencies<TOwnerWindow> = {
  readonly workspace: Pick<
    WorkspaceState,
    "getFileOwner" | "getWindowProjection"
  >;
  readonly tabOperations: Pick<
    KeyedOperationCoordinator<string>,
    "runExclusive"
  >;
  readonly activationRequestBroker: ActivationRequestBroker;
  readonly resolveWindow: (windowId: string) => TOwnerWindow | null;
  readonly isWindowUnavailable: (window: TOwnerWindow) => boolean;
  readonly sendRequest: (
    window: TOwnerWindow,
    request: { readonly requestId: string; readonly tabId: string }
  ) => void;
  readonly bindAbort: (
    window: TOwnerWindow,
    listener: () => void
  ) => () => void;
  readonly focusWindow: (window: TOwnerWindow) => void;
};

export function createWorkspaceOwnerTabActivationApplication<TOwnerWindow>(
  dependencies: Dependencies<TOwnerWindow>
) {
  function hasExactOwner(
    windowId: string,
    tabId: string,
    identity: FileIdentity
  ): boolean {
    const owner = dependencies.workspace.getFileOwner(identity);
    return owner.kind === "owned" &&
      owner.owner.windowId === windowId &&
      owner.owner.tabId === tabId;
  }

  return {
    async activateOwnerWindowTab(
      windowId: string,
      tabId: string,
      identity: FileIdentity
    ): Promise<ActivationOutcome> {
      const ownerWindow = dependencies.resolveWindow(windowId);
      if (
        ownerWindow === null ||
        dependencies.isWindowUnavailable(ownerWindow)
      ) {
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
        if (!confirmed) {
          return hasExactOwner(windowId, tabId, identity) ? "failed" : "retry";
        }
        if (!hasExactOwner(windowId, tabId, identity)) {
          return "retry";
        }

        const currentWindow = dependencies.resolveWindow(windowId);
        if (
          currentWindow === null ||
          dependencies.isWindowUnavailable(currentWindow)
        ) {
          return "retry";
        }

        let activeTabId: string | null;
        try {
          activeTabId = dependencies.workspace.getWindowProjection(windowId).activeTabId;
        } catch {
          return "retry";
        }
        if (activeTabId !== tabId) {
          return "failed";
        }

        dependencies.focusWindow(currentWindow);
        return "activated";
      });
    }
  };
}
