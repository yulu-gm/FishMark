import path from "node:path";
import { readFile, rename, writeFile } from "node:fs/promises";

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_FILE_NAME,
  type Preferences,
  normalizePreferences,
  serializePreferences
} from "../shared/preferences";

/**
 * Result of {@link loadPreferencesFromDisk}. The `corruptBackupPath` is set
 * when the on-disk JSON was unparseable and was moved aside so the caller can
 * rewrite it with defaults. A missing file is reported as `missing` and is
 * NOT treated as corruption.
 */
export type LoadPreferencesResult = {
  preferences: Preferences;
  source: "missing" | "parsed" | "recovered-from-corrupt";
  corruptBackupPath?: string;
};

export type PreferencesStoreDependencies = {
  readFile: (targetPath: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (targetPath: string, content: string, encoding: BufferEncoding) => Promise<void>;
  rename: (sourcePath: string, targetPath: string) => Promise<void>;
  now: () => number;
};

const defaultDependencies: PreferencesStoreDependencies = {
  readFile,
  writeFile,
  rename,
  now: () => Date.now()
};

export function resolvePreferencesFilePath(userDataDir: string): string {
  return path.join(userDataDir, PREFERENCES_FILE_NAME);
}

function resolveCorruptBackupPath(filePath: string, timestamp: number): string {
  return `${filePath}.corrupt-${timestamp}`;
}

function isNodeErrorWithCode(error: unknown, expectedCode: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === expectedCode
  );
}

/**
 * Read and normalize the preferences file from disk.
 *
 * Contract:
 * - Missing file → `{ source: "missing", preferences: DEFAULT_PREFERENCES }`.
 *   The caller decides whether to write defaults back; we never write from
 *   inside the read path.
 * - Unparseable JSON → the bad file is renamed to a `.corrupt-<timestamp>`
 *   sibling and defaults are returned (`source: "recovered-from-corrupt"`).
 *   If the rename itself fails we still return defaults without throwing so
 *   app startup cannot be blocked by a misbehaving file.
 * - Parse succeeds but schema is partial or invalid →
 *   {@link normalizePreferences} clamps / fills missing fields and returns
 *   `source: "parsed"`.
 * - Any other read failure (permissions, locked file, etc.) falls back to
 *   defaults with `source: "missing"` so startup still succeeds.
 */
export async function loadPreferencesFromDisk(
  filePath: string,
  dependencies: PreferencesStoreDependencies = defaultDependencies
): Promise<LoadPreferencesResult> {
  let rawContent: string;

  try {
    rawContent = await dependencies.readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return { source: "missing", preferences: { ...DEFAULT_PREFERENCES } };
    }

    return { source: "missing", preferences: { ...DEFAULT_PREFERENCES } };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const backupPath = resolveCorruptBackupPath(filePath, dependencies.now());

    try {
      await dependencies.rename(filePath, backupPath);

      return {
        source: "recovered-from-corrupt",
        preferences: { ...DEFAULT_PREFERENCES },
        corruptBackupPath: backupPath
      };
    } catch {
      return {
        source: "recovered-from-corrupt",
        preferences: { ...DEFAULT_PREFERENCES }
      };
    }
  }

  return {
    source: "parsed",
    preferences: normalizePreferences(parsed)
  };
}

export type WritePreferencesErrorCode = "write-failed" | "commit-failed";

export type WritePreferencesResult =
  | { status: "success" }
  | {
      status: "error";
      error: {
        code: WritePreferencesErrorCode;
        message: string;
      };
    };

const WRITE_ERROR_MESSAGES: Record<WritePreferencesErrorCode, string> = {
  "write-failed": "Preferences could not be written to disk.",
  "commit-failed": "Preferences were written but could not be committed atomically."
};

/**
 * Atomically write a normalized preferences payload to disk.
 *
 * Writes to `<filePath>.tmp` first and renames over the target so a crash
 * during `writeFile` cannot leave a half-written JSON file where the loader
 * would see it. Callers are expected to pass a fully-normalized value; we
 * serialize with a trailing newline for ergonomics when inspecting manually.
 */
export async function writePreferencesToDisk(
  filePath: string,
  preferences: Preferences,
  dependencies: PreferencesStoreDependencies = defaultDependencies
): Promise<WritePreferencesResult> {
  const tempPath = `${filePath}.tmp`;
  const payload = serializePreferences(preferences);

  try {
    await dependencies.writeFile(tempPath, payload, "utf8");
  } catch {
    return createWriteError("write-failed");
  }

  try {
    await dependencies.rename(tempPath, filePath);
  } catch {
    return createWriteError("commit-failed");
  }

  return { status: "success" };
}

function createWriteError(code: WritePreferencesErrorCode): WritePreferencesResult {
  return {
    status: "error",
    error: {
      code,
      message: WRITE_ERROR_MESSAGES[code]
    }
  };
}
