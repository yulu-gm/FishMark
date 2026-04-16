import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type PreferencesUpdate,
  mergePreferences
} from "../shared/preferences";
import {
  type LoadPreferencesResult,
  type PreferencesStoreDependencies,
  type WritePreferencesResult,
  loadPreferencesFromDisk,
  resolvePreferencesFilePath,
  writePreferencesToDisk
} from "./preferences-store";

export type PreferencesChangeListener = (preferences: Preferences) => void;

export type PreferencesService = {
  /**
   * Initialize the in-memory cache by reading from disk. Safe to call
   * multiple times; subsequent calls return the cached snapshot without
   * re-reading the file.
   */
  initialize: () => Promise<LoadPreferencesResult>;
  getPreferences: () => Preferences;
  updatePreferences: (
    patch: PreferencesUpdate | undefined
  ) => Promise<UpdatePreferencesResult>;
  onChange: (listener: PreferencesChangeListener) => () => void;
};

export type UpdatePreferencesSuccess = {
  status: "success";
  preferences: Preferences;
};

export type UpdatePreferencesResult =
  | UpdatePreferencesSuccess
  | (Extract<WritePreferencesResult, { status: "error" }> & { preferences: Preferences });

export type CreatePreferencesServiceInput = {
  userDataDir: string;
  dependencies?: PreferencesStoreDependencies;
  /**
   * Optional hook invoked whenever {@link loadPreferencesFromDisk} reports a
   * recovery from a corrupt JSON file. The main process wires this up to
   * logging so operators can tell that the file was moved aside.
   */
  onCorruptRecovery?: (backupPath: string | undefined) => void;
};

export function createPreferencesService(input: CreatePreferencesServiceInput): PreferencesService {
  const filePath = resolvePreferencesFilePath(input.userDataDir);
  const listeners = new Set<PreferencesChangeListener>();

  let cachedPreferences: Preferences = { ...DEFAULT_PREFERENCES };
  let initializePromise: Promise<LoadPreferencesResult> | null = null;

  function notify(): void {
    // Snapshot the listener set so a listener that detaches itself during
    // notification does not skip sibling listeners.
    for (const listener of [...listeners]) {
      try {
        listener(cachedPreferences);
      } catch {
        // Listeners are responsible for their own error handling; a noisy
        // listener must not break preference propagation.
      }
    }
  }

  async function initialize(): Promise<LoadPreferencesResult> {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      const loadResult = await loadPreferencesFromDisk(filePath, input.dependencies);

      cachedPreferences = loadResult.preferences;

      if (loadResult.source === "recovered-from-corrupt") {
        input.onCorruptRecovery?.(loadResult.corruptBackupPath);
        // Best-effort rewrite so the app starts from a clean baseline next
        // launch. A failure here should not break the current session, so we
        // ignore the write result by design.
        void writePreferencesToDisk(filePath, cachedPreferences, input.dependencies);
      }

      return loadResult;
    })();

    return initializePromise;
  }

  function getPreferences(): Preferences {
    return cachedPreferences;
  }

  async function updatePreferences(
    patch: PreferencesUpdate | undefined
  ): Promise<UpdatePreferencesResult> {
    const nextPreferences = mergePreferences(cachedPreferences, patch);
    const writeResult = await writePreferencesToDisk(
      filePath,
      nextPreferences,
      input.dependencies
    );

    if (writeResult.status === "error") {
      // Cache stays on the previously-persisted value so renderers keep
      // reading what is actually on disk.
      return { ...writeResult, preferences: cachedPreferences };
    }

    cachedPreferences = nextPreferences;
    notify();

    return { status: "success", preferences: cachedPreferences };
  }

  function onChange(listener: PreferencesChangeListener): () => void {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  return {
    initialize,
    getPreferences,
    updatePreferences,
    onChange
  };
}
