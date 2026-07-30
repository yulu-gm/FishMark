import type {
  KeyedOperationCoordinator,
  KeyedOperationLease
} from "@fishmark/workspace-application";

type PendingOperation = {
  readonly completion: Promise<void>;
};

export function createKeyedOperationCoordinator<TKey extends string>(): KeyedOperationCoordinator<TKey> {
  const tails = new Map<TKey, PendingOperation>();
  const capabilities = new WeakMap<
    object,
    { readonly keys: ReadonlySet<TKey>; active: boolean }
  >();

  async function acquireOne(key: TKey): Promise<{ release(): void }> {
    const previous = tails.get(key)?.completion ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const currentGate = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const current: PendingOperation = {
      completion: previous.then(() => currentGate)
    };
    tails.set(key, current);

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
          if (tails.get(key) === current) {
            tails.delete(key);
          }
        });
      }
    };
  }

  async function acquireExclusive(
    keys: readonly TKey[]
  ): Promise<KeyedOperationLease<TKey>> {
    const orderedKeys = [...new Set(keys)].sort();
    const leases: Array<{ release(): void }> = [];

    for (const key of orderedKeys) {
      leases.push(await acquireOne(key));
    }

    let released = false;
    const capability = {
      release(): void {
        if (released) {
          return;
        }
        released = true;
        for (let index = leases.length - 1; index >= 0; index -= 1) {
          leases[index]?.release();
        }
      }
    } as KeyedOperationLease<TKey>;
    capabilities.set(capability, {
      keys: new Set(orderedKeys),
      active: true
    });
    const release = capability.release.bind(capability);
    capability.release = (): void => {
      const state = capabilities.get(capability);
      if (state !== undefined) {
        state.active = false;
      }
      release();
    };
    return capability;
  }

  async function runExclusiveWithLease<T>(
    key: TKey,
    operation: (lease: KeyedOperationLease<TKey>) => Promise<T>
  ): Promise<T> {
    const lease = await acquireExclusive([key]);
    try {
      return await operation(lease);
    } finally {
      lease.release();
    }
  }

  return {
    async runExclusive<T>(
      key: TKey,
      operation: () => Promise<T>
    ): Promise<T> {
      return runExclusiveWithLease(key, async () => operation());
    },
    runExclusiveWithLease,
    acquireExclusive,
    isLeaseHeld(lease, key): boolean {
      const state = capabilities.get(lease);
      return state?.active === true && state.keys.has(key);
    }
  };
}
