export interface KeyedOperationLease {
  release(): void;
}

export interface KeyedOperationCoordinator<TKey extends string> {
  runExclusive<T>(key: TKey, operation: () => Promise<T>): Promise<T>;
  acquireExclusive(keys: readonly TKey[]): Promise<KeyedOperationLease>;
}

type PendingOperation = {
  readonly completion: Promise<void>;
};

export function createKeyedOperationCoordinator<TKey extends string>(): KeyedOperationCoordinator<TKey> {
  const tails = new Map<TKey, PendingOperation>();

  async function acquireOne(key: TKey): Promise<KeyedOperationLease> {
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
  ): Promise<KeyedOperationLease> {
    const orderedKeys = [...new Set(keys)].sort();
    const leases: KeyedOperationLease[] = [];

    for (const key of orderedKeys) {
      leases.push(await acquireOne(key));
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
      key: TKey,
      operation: () => Promise<T>
    ): Promise<T> {
      const lease = await acquireExclusive([key]);
      try {
        return await operation();
      } finally {
        lease.release();
      }
    },
    acquireExclusive
  };
}
