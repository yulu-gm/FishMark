import { createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import { describe, expect, it, vi } from "vitest";

import { createTestWorkspaceCloseCoordinator as createWorkspaceCloseCoordinator } from "./workspace-close-coordinator.test-helper";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createWorkspaceWindowCloseConfirmationHandler } from "./workspace-window-close-confirmation-handler";
import { createWorkspaceWindowCloseRequestBroker } from "./workspace-window-close-request-broker";
import { openTestDocument } from "./workspace.test-helper";

const document = (content: string) => ({
  fileIdentity: fileIdentity("file:c:/notes/request-generation.md"),
  path: "C:/notes/request-generation.md",
  name: "request-generation.md",
  content,
  encoding: "utf-8" as const
});

describe("createWorkspaceWindowCloseConfirmationHandler", () => {
  it("rejects a late generation and permits only one confirmation for its successor", async () => {
    const workspace = createWorkspaceState();
    workspace.registerWindow("window-1");
    const tabId = openTestDocument(workspace,
      "window-1",
      document("saved")
    ).activeTabId!;
    workspace.updateTabDraft({ tabId: tabId, expectedWindowId: "window-1", content: "dirty" });
    let resolvePrompt!: (choice: "discard") => void;
    const prompt = vi.fn(
      () =>
        new Promise<"discard">((resolve) => {
          resolvePrompt = resolve;
        })
    );
    const coordinator = createWorkspaceCloseCoordinator({
      workspace,
      documentOperations: createKeyedOperationCoordinator(),
      promptToSaveWorkspaceTab: prompt,
      saveMarkdownFileToPath: vi.fn(),
    });
    const timeouts: Array<() => void> = [];
    const broker = createWorkspaceWindowCloseRequestBroker<
      NonNullable<Awaited<ReturnType<typeof coordinator.confirmWindowClose>>>
    >({
      scheduleTimeout: (listener) => {
        timeouts.push(listener);
        return vi.fn();
      },
      schedulePostConfirmationWatchdog: () => vi.fn()
    });
    const first = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: () => vi.fn()
    });
    timeouts[0]!();
    await first.result;
    await first.drained;
    const second = broker.request({
      windowId: "window-1",
      sendRequest: vi.fn(),
      bindAbort: () => vi.fn()
    });
    const handleConfirmation = createWorkspaceWindowCloseConfirmationHandler({
      broker,
      closeCoordinator: coordinator
    });

    await expect(
      handleConfirmation({
        windowId: "window-1",
        requestId: first.requestId
      })
    ).resolves.toBe(false);
    expect(prompt).not.toHaveBeenCalled();

    const currentConfirmation = handleConfirmation({
      windowId: "window-1",
      requestId: second.requestId
    });
    await vi.waitFor(() => expect(resolvePrompt).toBeTypeOf("function"));
    await expect(
      handleConfirmation({
        windowId: "window-1",
        requestId: second.requestId
      })
    ).resolves.toBe(false);
    expect(prompt).toHaveBeenCalledOnce();

    resolvePrompt("discard");
    await expect(currentConfirmation).resolves.toBe(true);
    expect(broker.complete(second.requestId, "window-1", true)).toBe(true);
    await expect(second.result).resolves.toMatchObject({
      windowId: "window-1",
      checkpoints: [
        {
          tabId,
          expectedWindowId: "window-1",
          expectedRevision: 1
        }
      ]
    });
    expect(prompt).toHaveBeenCalledOnce();
  });
});
