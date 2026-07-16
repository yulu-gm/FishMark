import { describe, expect, it, vi } from "vitest";

import { createWorkspaceDocumentOperationCoordinator } from "./workspace-document-operation-coordinator";

describe("createWorkspaceDocumentOperationCoordinator", () => {
  it("runs operations for one tab in FIFO order", async () => {
    const coordinator = createWorkspaceDocumentOperationCoordinator();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = coordinator.runExclusive("tab-1", async () => {
      events.push("first:start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push("first:end");
    });
    const second = coordinator.runExclusive("tab-1", async () => {
      events.push("second");
    });

    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("allows operations for different tabs to run independently", async () => {
    const coordinator = createWorkspaceDocumentOperationCoordinator();
    let releaseFirst!: () => void;
    const first = coordinator.runExclusive("tab-1", () =>
      new Promise<void>((resolve) => {
        releaseFirst = resolve;
      })
    );
    const secondOperation = vi.fn(async () => "parallel");

    await expect(
      coordinator.runExclusive("tab-2", secondOperation)
    ).resolves.toBe("parallel");
    expect(secondOperation).toHaveBeenCalledOnce();
    releaseFirst();
    await first;
  });

  it("releases a tab after an operation rejects", async () => {
    const coordinator = createWorkspaceDocumentOperationCoordinator();
    const failure = new Error("operation failed");

    await expect(
      coordinator.runExclusive("tab-1", async () => {
        throw failure;
      })
    ).rejects.toBe(failure);
    await expect(
      coordinator.runExclusive("tab-1", async () => "after failure")
    ).resolves.toBe("after failure");
  });

  it("deduplicates and stably acquires multiple tabs without blocking unrelated tabs", async () => {
    const coordinator = createWorkspaceDocumentOperationCoordinator();
    const lease = await coordinator.acquireExclusive(["tab-b", "tab-a", "tab-b"]);
    const tabAOperation = vi.fn(async () => undefined);
    const tabBOperation = vi.fn(async () => undefined);
    const unrelatedOperation = vi.fn(async () => "free");
    const pendingA = coordinator.runExclusive("tab-a", tabAOperation);
    const pendingB = coordinator.runExclusive("tab-b", tabBOperation);

    await expect(
      coordinator.runExclusive("tab-c", unrelatedOperation)
    ).resolves.toBe("free");
    expect(tabAOperation).not.toHaveBeenCalled();
    expect(tabBOperation).not.toHaveBeenCalled();

    lease.release();
    lease.release();
    await Promise.all([pendingA, pendingB]);

    expect(tabAOperation).toHaveBeenCalledOnce();
    expect(tabBOperation).toHaveBeenCalledOnce();
  });

  it("serializes overlapping multi-tab leases acquired in opposite input order", async () => {
    const coordinator = createWorkspaceDocumentOperationCoordinator();
    const first = await coordinator.acquireExclusive(["tab-b", "tab-a"]);
    let secondAcquired = false;
    const secondPromise = coordinator
      .acquireExclusive(["tab-a", "tab-b"])
      .then((lease) => {
        secondAcquired = true;
        return lease;
      });

    await Promise.resolve();
    expect(secondAcquired).toBe(false);
    first.release();
    const second = await secondPromise;
    expect(secondAcquired).toBe(true);
    second.release();
  });
});
