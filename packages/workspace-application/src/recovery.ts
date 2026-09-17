import type { WorkspaceSnapshot } from "@fishmark/workspace-domain";

// Recovery owns the durable record of acknowledged-but-unsaved work. The main process
// writes here on every accepted edit and on compaction/clean shutdown, and reads it at
// startup; no renderer memory participates, so the flow survives any window crash.
export type RecoveryEditBatch = {
  readonly kind: "edit-batch";
  readonly tabId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseRevision: number;
  readonly changes: readonly {
    readonly from: number;
    readonly to: number;
    readonly insert: string;
  }[];
};

export type RecoveryStoreLoadResult =
  | { readonly kind: "empty" }
  | {
      readonly kind: "loaded";
      readonly snapshot: unknown | null;
      readonly entries: readonly unknown[];
      readonly incompleteTail?: boolean;
    }
  | { readonly kind: "corrupt"; readonly path: string };

export type RecoveryStorePort = {
  load(): Promise<RecoveryStoreLoadResult>;
  appendEditBatch(entry: RecoveryEditBatch): Promise<void>;
  writeSnapshot(snapshot: WorkspaceSnapshot): Promise<void>;
  truncateJournal(): Promise<void>;
};

export type RecoveryOutcome =
  | { readonly kind: "no-recovery-needed" }
  | {
      readonly kind: "recovery-available";
      readonly snapshot: WorkspaceSnapshot | null;
      readonly editBatches: readonly RecoveryEditBatch[];
      readonly incompleteTail?: boolean;
    }
  | { readonly kind: "corrupt"; readonly path: string };

export type RecoveryUseCase = {
  recordEditBatch(entry: RecoveryEditBatch): Promise<void>;
  compact(snapshot: WorkspaceSnapshot): Promise<void>;
  markCleanShutdown(): Promise<void>;
  loadRecovery(
    parseSnapshot: (value: unknown) => WorkspaceSnapshot | null,
    parseEditBatch: (value: unknown) => RecoveryEditBatch | null
  ): Promise<RecoveryOutcome>;
};

export function createRecovery(store: RecoveryStorePort): RecoveryUseCase {
  return {
    recordEditBatch(entry: RecoveryEditBatch): Promise<void> {
      return store.appendEditBatch(entry);
    },
    async compact(snapshot: WorkspaceSnapshot): Promise<void> {
      await store.writeSnapshot(snapshot);
      await store.truncateJournal();
    },
    markCleanShutdown(): Promise<void> {
      return store.truncateJournal();
    },
    async loadRecovery(
      parseSnapshot: (value: unknown) => WorkspaceSnapshot | null,
      parseEditBatch: (value: unknown) => RecoveryEditBatch | null
    ): Promise<RecoveryOutcome> {
      const loaded = await store.load();
      if (loaded.kind === "empty") return { kind: "no-recovery-needed" };
      if (loaded.kind === "corrupt") return { kind: "corrupt", path: loaded.path };

      const snapshot = loaded.snapshot === null
        ? null
        : parseSnapshot(loaded.snapshot);
      if (loaded.snapshot !== null && snapshot === null) {
        return { kind: "corrupt", path: "<snapshot>" };
      }

      const editBatches: RecoveryEditBatch[] = [];
      for (const entry of loaded.entries) {
        const parsed = parseEditBatch(entry);
        if (parsed === null) {
          return { kind: "corrupt", path: "<journal>" };
        }
        editBatches.push(parsed);
      }

      if (snapshot === null && editBatches.length === 0) {
        return { kind: "no-recovery-needed" };
      }
      return { kind: "recovery-available", snapshot, editBatches,
        ...(loaded.incompleteTail ? { incompleteTail: true } : {}) };
    }
  };
}
