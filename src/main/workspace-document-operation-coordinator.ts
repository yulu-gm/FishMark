export interface WorkspaceDocumentOperationLease {
  release(): void;
}

export interface WorkspaceDocumentOperationCoordinator {
  runExclusive<T>(tabId: string, operation: () => Promise<T>): Promise<T>;
  acquireExclusive(
    tabIds: readonly string[]
  ): Promise<WorkspaceDocumentOperationLease>;
}

type PendingOperation = {
  readonly completion: Promise<void>;
};

export function createWorkspaceDocumentOperationCoordinator(): WorkspaceDocumentOperationCoordinator {
  const tails = new Map<string, PendingOperation>();

  async function acquireOne(tabId: string): Promise<WorkspaceDocumentOperationLease> {
    const previous = tails.get(tabId)?.completion ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const currentGate = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const current: PendingOperation = {
      completion: previous.then(() => currentGate)
    };
    tails.set(tabId, current);

    await previous;

    let released = false;
    return {
      release(): void {
        if (released) {
          return;
        }
        released = true;
        releaseCurrent();
        void current.completion.then(() => {
          if (tails.get(tabId) === current) {
            tails.delete(tabId);
          }
        });
      }
    };
  }

  async function acquireExclusive(
    tabIds: readonly string[]
  ): Promise<WorkspaceDocumentOperationLease> {
    const orderedTabIds = [...new Set(tabIds)].sort();
    const leases: WorkspaceDocumentOperationLease[] = [];

    for (const tabId of orderedTabIds) {
      leases.push(await acquireOne(tabId));
    }

    let released = false;
    return {
      release(): void {
        if (released) {
          return;
        }
        released = true;
        for (let index = leases.length - 1; index >= 0; index -= 1) {
          leases[index]?.release();
        }
      }
    };
  }

  return {
    async runExclusive<T>(
      tabId: string,
      operation: () => Promise<T>
    ): Promise<T> {
      const lease = await acquireExclusive([tabId]);
      try {
        return await operation();
      } finally {
        lease.release();
      }
    },
    acquireExclusive
  };
}
