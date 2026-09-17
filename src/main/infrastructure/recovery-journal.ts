// A durable, append-only record of acknowledged but not-yet-saved work, backed by a
// checksummed, atomically-replaced snapshot. The journal itself is a plain JSONL file;
// the snapshot carries a SHA-256 checksum so torn or tampered writes are quarantined
// instead of being silently replayed.
export type RecoveryJournalDependencies = {
  readonly journalPath: string;
  readonly snapshotPath: string;
  readFile: (targetPath: string) => Promise<string>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  appendFile: (targetPath: string, content: string) => Promise<void>;
  rename: (fromPath: string, toPath: string) => Promise<void>;
  unlink: (targetPath: string) => Promise<void>;
  hashContent: (content: string) => string;
  tempPathFor: (targetPath: string) => string;
  isMissingFileError?: (error: unknown) => boolean;
};

export type RecoveryJournalLoadResult =
  | { readonly kind: "empty" }
  | {
      readonly kind: "loaded";
      readonly snapshot: unknown | null;
      readonly entries: readonly unknown[];
      readonly incompleteTail?: boolean;
    }
  | { readonly kind: "corrupt"; readonly path: string };

export type RecoveryJournal = {
  appendEntry(entry: unknown): Promise<void>;
  writeSnapshot(snapshot: unknown): Promise<void>;
  truncateJournal(): Promise<void>;
  load(): Promise<RecoveryJournalLoadResult>;
};

export function createRecoveryJournal(
  dependencies: RecoveryJournalDependencies
): RecoveryJournal {
  function isMissingFileError(error: unknown): boolean {
    if (dependencies.isMissingFileError !== undefined) {
      return dependencies.isMissingFileError(error);
    }
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }

  async function appendEntry(entry: unknown): Promise<void> {
    await dependencies.appendFile(
      dependencies.journalPath,
      `${JSON.stringify(entry)}\n`
    );
  }

  async function writeSnapshot(snapshot: unknown): Promise<void> {
    const serialized = JSON.stringify(snapshot);
    const checksum = dependencies.hashContent(serialized);
    const payload = JSON.stringify({ checksum, snapshot: serialized });
    const tempPath = dependencies.tempPathFor(dependencies.snapshotPath);
    try {
      await dependencies.writeFile(tempPath, payload);
      await dependencies.rename(tempPath, dependencies.snapshotPath);
    } catch (error) {
      try {
        await dependencies.unlink(tempPath);
      } catch {
        // Cleanup must not mask the primary write failure.
      }
      throw error;
    }
  }

  async function truncateJournal(): Promise<void> {
    try {
      await dependencies.writeFile(dependencies.journalPath, "");
    } catch (error) {
      if (isMissingFileError(error)) return;
      throw error;
    }
  }

  async function load(): Promise<RecoveryJournalLoadResult> {
    let snapshot: unknown | null = null;
    try {
      const raw = await dependencies.readFile(dependencies.snapshotPath);
      const parsed = JSON.parse(raw) as { checksum?: unknown; snapshot?: unknown };
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof parsed.checksum !== "string" ||
        typeof parsed.snapshot !== "string"
      ) {
        return { kind: "corrupt", path: dependencies.snapshotPath };
      }
      if (dependencies.hashContent(parsed.snapshot) !== parsed.checksum) {
        return { kind: "corrupt", path: dependencies.snapshotPath };
      }
      snapshot = JSON.parse(parsed.snapshot);
    } catch (error) {
      if (isMissingFileError(error)) {
        snapshot = null;
      } else {
        return { kind: "corrupt", path: dependencies.snapshotPath };
      }
    }

    let journalRaw: string;
    try {
      journalRaw = await dependencies.readFile(dependencies.journalPath);
    } catch (error) {
      if (isMissingFileError(error)) {
        if (snapshot === null) return { kind: "empty" };
        return { kind: "loaded", snapshot, entries: [] };
      }
      return { kind: "corrupt", path: dependencies.journalPath };
    }

    const entries: unknown[] = [];
    const lines = journalRaw.split("\n");
    let incompleteTail = false;
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        if (index === lines.length - 1 && !journalRaw.endsWith("\n")) {
          incompleteTail = true;
          break;
        }
        return { kind: "corrupt", path: dependencies.journalPath };
      }
    }

    if (snapshot === null && entries.length === 0) {
      return { kind: "empty" };
    }
    return { kind: "loaded", snapshot, entries, ...(incompleteTail ? { incompleteTail: true } : {}) };
  }

  return { appendEntry, writeSnapshot, truncateJournal, load };
}
