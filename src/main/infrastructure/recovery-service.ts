import { createHash } from "node:crypto";
import {
  appendFile,
  readFile,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  createRecovery,
  type RecoveryOutcome,
  type RecoveryUseCase
} from "@fishmark/workspace-application";

import { createRecoveryJournal } from "./recovery-journal";
import { parseEditBatchEntry, parseWorkspaceSnapshot } from "./workspace-persistence";

// Composes the recovery journal, the validated persistence boundary, and the recovery use
// case into one main-owned service rooted at a user-data directory. The main process uses
// this to journal accepted edits, restore on startup, and mark clean on shutdown.
export type RecoveryService = RecoveryUseCase & {
  loadRecovery(): Promise<RecoveryOutcome>;
};

export function createRecoveryService(directory: string): RecoveryService {
  const journal = createRecoveryJournal({
    journalPath: path.join(directory, "recovery-journal.jsonl"),
    snapshotPath: path.join(directory, "recovery-snapshot.json"),
    readFile: (targetPath) => readFile(targetPath, "utf8"),
    writeFile,
    appendFile,
    rename,
    unlink,
    hashContent: (content) => createHash("sha256").update(content).digest("hex"),
    tempPathFor: (targetPath) =>
      `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`
  });

  const recovery = createRecovery({
    load: journal.load,
    appendEditBatch: journal.appendEntry,
    writeSnapshot: journal.writeSnapshot,
    truncateJournal: journal.truncateJournal
  });

  return {
    ...recovery,
    loadRecovery: () =>
      recovery.loadRecovery(parseWorkspaceSnapshot, parseEditBatchEntry)
  };
}
