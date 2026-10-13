// Own native close intent across the entire asynchronous close attempt, including
// lease acquisition and renderer COMPLETE. A later explicit close is coalesced,
// then retried only after a cancelled attempt has fully released its resources.
export function createWindowCloseIntent(dependencies: {
  attempt: () => Promise<"closed" | "cancelled">;
  reportError: (error: unknown) => Promise<void>;
}) {
  let running = false;
  let queued = false;
  let disposed = false;
  let current: Promise<void> = Promise.resolve();

  async function drain(): Promise<void> {
    try {
      while (queued && !disposed) {
        queued = false;
        if (await dependencies.attempt() === "closed") break;
      }
    } catch (error) {
      queued = false;
      await dependencies.reportError(error);
    } finally {
      queued = false;
      running = false;
    }
  }

  return {
    request(): Promise<void> {
      if (disposed) return current;
      queued = true;
      if (!running) {
        running = true;
        current = drain();
      }
      return current;
    },
    cancelQueued(): void {
      // Cancel dismisses earlier repeated clicks. A new close after the response
      // is still queued while the renderer completes the old handshake.
      queued = false;
    },
    dispose(): void {
      disposed = true;
      queued = false;
    }
  };
}
