import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  mkdtemp,
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
  preserveRecovery(): Promise<string>;
};

export function createRecoveryService(directory: string): RecoveryService {
  let preservationRequired = false;
  let preservedDirectory: string | null = null;
  let preservation: Promise<string> | null = null;
  async function preserveFiles(): Promise<string> {
    const files = await Promise.all(["recovery-snapshot.json", "recovery-journal.jsonl"].map(async (name) => {
      try { return { name, bytes: await readFile(path.join(directory, name)) }; }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return { name, bytes: null };
        throw error;
      }
    }));
    const root = path.join(directory, "recovery-preserved");
    await mkdir(root, { recursive: true });
    const destination = await mkdtemp(path.join(root, "recovery-"));
    for (const file of files) {
      if (file.bytes !== null) await writeFile(path.join(destination, file.name), file.bytes, { flag: "wx" });
    }
    await writeFile(path.join(destination, "manifest.json"), JSON.stringify({
      files: files.map((file) => ({ name: file.name, missing: file.bytes === null,
        sha256: file.bytes === null ? null : createHash("sha256").update(file.bytes).digest("hex") }))
    }), { flag: "wx" });
    return destination;
  }
  function preserveRecovery(): Promise<string> {
    preservationRequired = true;
    if (preservedDirectory !== null) return Promise.resolve(preservedDirectory);
    if (preservation === null) {
      preservation = preserveFiles().then((destination) => {
        preservedDirectory = destination;
        return destination;
      }).finally(() => { preservation = null; });
    }
    return preservation;
  }
  async function beforeMutation(): Promise<void> {
    if (preservationRequired) await preserveRecovery();
  }
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
    appendEditBatch: async (entry) => { await beforeMutation(); await journal.appendEntry(entry); },
    writeSnapshot: async (snapshot) => { await beforeMutation(); await journal.writeSnapshot(snapshot); },
    truncateJournal: async () => { await beforeMutation(); await journal.truncateJournal(); }
  });

  return {
    ...recovery,
    preserveRecovery,
    loadRecovery: async () => {
      const outcome = await recovery.loadRecovery(parseWorkspaceSnapshot, parseEditBatchEntry);
      if (outcome.kind === "corrupt" || (outcome.kind === "recovery-available" && (outcome.incompleteTail || outcome.journalDamage))) {
        preservationRequired = true;
      }
      return outcome;
    }
  };
}
