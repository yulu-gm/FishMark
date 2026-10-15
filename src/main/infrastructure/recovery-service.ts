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

import { createRecoveryJournal, type RecoveryJournalDependencies } from "./recovery-journal";
import { parseEditBatchEntry, parseWorkspaceSnapshot } from "./workspace-persistence";
import { sameFileIdentity, type WorkspaceSnapshot } from "@fishmark/workspace-domain";
import { parseImportedImageProvenance, synchronizeImportedImages, type ImportedImageRecord } from "./imported-image-provenance";
import { filePathIdentity } from "../file-path";

// Composes the recovery journal, the validated persistence boundary, and the recovery use
// case into one main-owned service rooted at a user-data directory. The main process uses
// this to journal accepted edits, restore on startup, and mark clean on shutdown.
export type RecoveryService = RecoveryUseCase & {
  loadRecovery(): Promise<RecoveryOutcome>;
  preserveRecovery(): Promise<string>;
  activateImportedImages(snapshot: WorkspaceSnapshot | null): void;
  getImportedImages(tabId: string, documentPath: string | null): readonly ImportedImageRecord[];
  getLiveImportedImageTabIds(): readonly string[];
  synchronizeLiveImportedImages(snapshot: WorkspaceSnapshot): void;
  compactWithImportedImage(snapshot: WorkspaceSnapshot, record: ImportedImageRecord, isAuthorized: () => boolean, refreshSnapshot: () => WorkspaceSnapshot): Promise<boolean>;
};

export function createRecoveryService(directory: string, io: Partial<Pick<RecoveryJournalDependencies, "writeFile" | "rename">> = {}): RecoveryService {
  let preservationRequired = false;
  let preservedDirectory: string | null = null;
  let preservation: Promise<string> | null = null;
  let importedImages: readonly ImportedImageRecord[] = [];
  let recoveredImages: readonly ImportedImageRecord[] = [];
  function retainMainSaveBindings(records: readonly ImportedImageRecord[]): ImportedImageRecord[] {
    const key = (value: string) => filePathIdentity(value, process.platform);
    return records.map((record) => {
      const current = importedImages.find((candidate) => key(candidate.path) === key(record.path) && sameFileIdentity(candidate.identity, record.identity));
      const paths = new Map([...record.documentPaths, ...(current?.documentPaths ?? [])].map((value) => [key(value), value]));
      return { ...record, documentPaths: [...paths.values()] };
    });
  }
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
    writeFile: io.writeFile ?? writeFile,
    appendFile,
    rename: io.rename ?? rename,
    unlink,
    hashContent: (content) => createHash("sha256").update(content).digest("hex"),
    tempPathFor: (targetPath) =>
      `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`
  });

  async function compact(snapshot: WorkspaceSnapshot, additional?: ImportedImageRecord, isAuthorized: () => boolean = () => true, refreshSnapshot: () => WorkspaceSnapshot = () => snapshot): Promise<boolean> {
    await beforeMutation();
    if (!isAuthorized()) return false;
    const previous = importedImages;
    const key = (value: string) => filePathIdentity(value, process.platform);
    const next = synchronizeImportedImages(additional ? [...previous.filter((record) => key(record.path) !== key(additional.path)), additional] : previous, snapshot);
    try {
    await journal.writeSnapshot({ ...snapshot, importedImages: { version: 1, records: next } });
    await journal.truncateJournal();
    if (!isAuthorized()) {
      // The caller holds the shared recovery queue. Remove this provisional capability
      // durably, preserving earlier records and fresh workspace mutations before failing.
      const fresh = refreshSnapshot();
      const retained = synchronizeImportedImages(retainMainSaveBindings(previous), fresh);
      await journal.writeSnapshot({ ...fresh, importedImages: { version: 1, records: retained } });
      await journal.truncateJournal();
      importedImages = retainMainSaveBindings(retained);
      return false;
    }
    // A trusted Save on another tab can commit while disk IO is pending. Its RAM
    // bindings must survive until the queued save checkpoint durably records them.
    importedImages = retainMainSaveBindings(next);
    return true;
    } catch (error) {
      preservationRequired = true;
      throw error;
    }
  }
  const recovery = createRecovery({
    load: journal.load,
    appendEditBatch: async (entry) => { await beforeMutation(); await journal.appendEntry(entry); },
    writeSnapshot: async (snapshot) => { await beforeMutation(); await journal.writeSnapshot(snapshot); },
    truncateJournal: async () => { await beforeMutation(); await journal.truncateJournal(); }
  });

  return {
    ...recovery,
    compact: async (snapshot) => { await compact(snapshot); },
    compactWithImportedImage: compact,
    activateImportedImages(snapshot) {
      // A parsed profile is not a live capability until domain restoration actually succeeds.
      importedImages = snapshot === null ? [] : synchronizeImportedImages(recoveredImages, snapshot);
      recoveredImages = [];
    },
    getImportedImages(tabId, documentPath) {
      return importedImages.filter((record) => record.tabId === tabId ||
        (documentPath !== null && record.documentPaths.some((value) => filePathIdentity(value, process.platform) === filePathIdentity(documentPath, process.platform))));
    },
    getLiveImportedImageTabIds: () => [...new Set(importedImages.flatMap((record) => record.tabId === null ? [] : [record.tabId]))],
    synchronizeLiveImportedImages(snapshot) { importedImages = synchronizeImportedImages(importedImages, snapshot); },
    preserveRecovery,
    loadRecovery: async () => {
      let parsedImages: readonly ImportedImageRecord[] = [];
      const outcome = await recovery.loadRecovery((value) => {
        const snapshot = parseWorkspaceSnapshot(value);
        if (snapshot === null) return null;
        const metadata = parseImportedImageProvenance((value as { importedImages?: unknown }).importedImages, snapshot);
        if (metadata === null) return null;
        parsedImages = metadata.records;
        return snapshot;
      }, parseEditBatchEntry);
      recoveredImages = outcome.kind === "recovery-available" ? parsedImages : [];
      if (outcome.kind === "corrupt" || (outcome.kind === "recovery-available" && (outcome.incompleteTail || outcome.journalDamage))) {
        preservationRequired = true;
      }
      return outcome;
    }
  };
}
