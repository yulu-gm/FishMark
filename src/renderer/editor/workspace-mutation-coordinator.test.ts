import { describe, expect, it } from "vitest";

import { WorkspaceMutationCoordinator } from "./workspace-mutation-coordinator";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("WorkspaceMutationCoordinator", () => {
  it("executes every queued mutation in strict FIFO order", async () => {
    const coordinator = new WorkspaceMutationCoordinator();
    const firstResult = createDeferred<string>();
    const calls: string[] = [];

    const first = coordinator.enqueue(async () => {
      calls.push("create:start");
      const result = await firstResult.promise;
      calls.push("create:end");
      return result;
    });
    const second = coordinator.enqueue(async () => {
      calls.push("close");
      return "closed";
    });

    await Promise.resolve();
    expect(calls).toEqual(["create:start"]);
    firstResult.resolve("created");

    await expect(first).resolves.toBe("created");
    await expect(second).resolves.toBe("closed");
    expect(calls).toEqual(["create:start", "create:end", "close"]);
  });

  it("continues the queue after a rejected mutation", async () => {
    const coordinator = new WorkspaceMutationCoordinator();
    const first = coordinator.enqueue(async () => {
      throw new Error("failed");
    });
    const second = coordinator.enqueue(async () => "recovered");

    await expect(first).rejects.toThrow("failed");
    await expect(second).resolves.toBe("recovered");
  });
});
