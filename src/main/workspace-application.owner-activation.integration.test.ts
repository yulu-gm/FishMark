import {
  createWorkspaceState,
  fileIdentity,
  type FileIdentity,
  type WorkspaceState
} from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceOwnerTabActivation } from "@fishmark/workspace-application";

import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";

type TestWindow = {
  readonly windowId: string;
  destroyed: boolean;
};

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function openDocument(
  workspace: WorkspaceState,
  windowId: string,
  identity: FileIdentity,
  name: string
): string {
  const result = workspace.openDocument(windowId, {
    fileIdentity: identity,
    path: `C:/${name}`,
    name,
    content: name,
    encoding: "utf-8"
  });
  if (result.kind !== "opened") {
    throw new Error(`Unexpected open result '${result.kind}'.`);
  }
  return result.projection.activeTabId!;
}

function createApplication(input: {
  readonly workspace: WorkspaceState;
  readonly windows: Map<string, TestWindow>;
  readonly activationResult: Promise<boolean>;
  readonly focusWindow?: (window: TestWindow) => void;
}) {
  return createWorkspaceOwnerTabActivation<TestWindow>({
    workspace: input.workspace,
    tabOperations: createKeyedOperationCoordinator(),
    activationRequestBroker: {
      request: vi.fn(() => ({
        requestId: "request-1",
        result: input.activationResult
      }))
    },
    resolveWindow: (windowId) => input.windows.get(windowId) ?? null,
    isWindowUnavailable: (window) => window.destroyed,
    sendRequest: vi.fn(),
    bindAbort: vi.fn(() => () => {}),
    focusWindow: input.focusWindow ?? vi.fn()
  });
}

describe("workspace owner-tab activation use case", () => {
  it("retries a negative confirmation when the physical owner moved during renderer activation", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    workspace.registerWindow("window-3");
    const identity = fileIdentity("location:note", "object:note");
    const tabId = openDocument(workspace, "window-1", identity, "note.md");
    const confirmation = createDeferred<boolean>();
    const application = createApplication({
      workspace,
      windows: new Map([
        ["window-1", { windowId: "window-1", destroyed: false }],
        ["window-3", { windowId: "window-3", destroyed: false }]
      ]),
      activationResult: confirmation.promise
    });

    const result = application.activateOwnerWindowTab("window-1", tabId, identity);
    workspace.moveTabToWindow({ tabId, targetWindowId: "window-3" });
    confirmation.resolve(false);

    await expect(result).resolves.toBe("retry");
  });

  it("retries a negative confirmation when the owner closed during renderer activation", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const identity = fileIdentity("location:note", "object:note");
    const tabId = openDocument(workspace, "window-1", identity, "note.md");
    const confirmation = createDeferred<boolean>();
    const application = createApplication({
      workspace,
      windows: new Map([
        ["window-1", { windowId: "window-1", destroyed: false }]
      ]),
      activationResult: confirmation.promise
    });

    const result = application.activateOwnerWindowTab("window-1", tabId, identity);
    workspace.unregisterWindow("window-1");
    confirmation.resolve(false);

    await expect(result).resolves.toBe("retry");
  });

  it("retries a negative confirmation when location and object ownership became ambiguous", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    workspace.registerWindow("window-2");
    const firstIdentity = fileIdentity("location:first", "object:first");
    const secondIdentity = fileIdentity("location:second", "object:second");
    const firstTabId = openDocument(workspace, "window-1", firstIdentity, "first.md");
    openDocument(workspace, "window-2", secondIdentity, "second.md");
    const application = createApplication({
      workspace,
      windows: new Map([
        ["window-1", { windowId: "window-1", destroyed: false }]
      ]),
      activationResult: Promise.resolve(false)
    });

    await expect(application.activateOwnerWindowTab(
      "window-1",
      firstTabId,
      fileIdentity(firstIdentity.location, secondIdentity.object)
    )).resolves.toBe("retry");
  });

  it("fails a negative confirmation when the exact owner is unchanged", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const identity = fileIdentity("location:note", "object:note");
    const tabId = openDocument(workspace, "window-1", identity, "note.md");
    const application = createApplication({
      workspace,
      windows: new Map([
        ["window-1", { windowId: "window-1", destroyed: false }]
      ]),
      activationResult: Promise.resolve(false)
    });

    await expect(application.activateOwnerWindowTab(
      "window-1",
      tabId,
      identity
    )).resolves.toBe("failed");
  });

  it("does not focus or replay activation when a newer tab intent wins before confirmation", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const targetIdentity = fileIdentity("location:target", "object:target");
    const targetTabId = openDocument(workspace, "window-1", targetIdentity, "target.md");
    const latestTabId = openDocument(
      workspace,
      "window-1",
      fileIdentity("location:latest", "object:latest"),
      "latest.md"
    );
    workspace.activateTab("window-1", targetTabId);
    const confirmation = createDeferred<boolean>();
    const focusWindow = vi.fn();
    const application = createApplication({
      workspace,
      windows: new Map([
        ["window-1", { windowId: "window-1", destroyed: false }]
      ]),
      activationResult: confirmation.promise,
      focusWindow
    });

    const result = application.activateOwnerWindowTab(
      "window-1",
      targetTabId,
      targetIdentity
    );
    workspace.activateTab("window-1", latestTabId);
    confirmation.resolve(true);

    await expect(result).resolves.toBe("failed");
    expect(focusWindow).not.toHaveBeenCalled();
    expect(workspace.getWindowProjection("window-1").activeTabId).toBe(latestTabId);
  });

  it("retries when the same window id resolves to a different window instance after confirmation", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const identity = fileIdentity("location:note", "object:note");
    const tabId = openDocument(workspace, "window-1", identity, "note.md");
    const firstWindow = { windowId: "window-1", destroyed: false };
    const replacementWindow = { windowId: "window-1", destroyed: false };
    const windows = new Map([["window-1", firstWindow]]);
    const confirmation = createDeferred<boolean>();
    const focusWindow = vi.fn();
    const application = createApplication({
      workspace,
      windows,
      activationResult: confirmation.promise,
      focusWindow
    });

    const result = application.activateOwnerWindowTab("window-1", tabId, identity);
    windows.set("window-1", replacementWindow);
    confirmation.resolve(true);

    await expect(result).resolves.toBe("retry");
    expect(focusWindow).not.toHaveBeenCalled();
  });
});
