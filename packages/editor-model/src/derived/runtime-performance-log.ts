export type EditorCorePerformanceLogMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

type PerformanceGlobal = typeof globalThis & {
  __FISHMARK_PERFORMANCE_LOG__?: boolean;
  console?: {
    info?: (...args: unknown[]) => void;
  };
  localStorage?: {
    getItem: (key: string) => string | null;
  };
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const PERF_LOG_STORAGE_KEY = "fishmark:perf-log";
const PERF_LOG_ENV_KEY = "FISHMARK_PERF_LOG";
const PERF_LOG_VITE_ENV_KEY = "VITE_FISHMARK_PERF_LOG";

export function measureEditorCorePerformance<T>(
  label: string,
  run: () => T,
  metadata: EditorCorePerformanceLogMetadata = {}
): T {
  if (!isEditorCorePerformanceLogEnabled()) {
    return run();
  }

  const startedAt = now();

  try {
    return run();
  } finally {
    writePerformanceLog(label, {
      ...metadata,
      durationMs: formatDuration(now() - startedAt)
    });
  }
}

function isEditorCorePerformanceLogEnabled(): boolean {
  const globalScope = getPerformanceGlobal();

  if (globalScope.__FISHMARK_PERFORMANCE_LOG__ === true) {
    return true;
  }

  return (
    isTruthyFlag(readProcessEnvFlag(globalScope, PERF_LOG_ENV_KEY)) ||
    isTruthyFlag(readProcessEnvFlag(globalScope, PERF_LOG_VITE_ENV_KEY)) ||
    isTruthyFlag(readLocalStorageFlag(globalScope))
  );
}

function getPerformanceGlobal(): PerformanceGlobal {
  return globalThis as PerformanceGlobal;
}

function readProcessEnvFlag(globalScope: PerformanceGlobal, key: string): string | undefined {
  return globalScope.process?.env?.[key];
}

function readLocalStorageFlag(globalScope: PerformanceGlobal): string | null {
  try {
    return globalScope.localStorage?.getItem(PERF_LOG_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function isTruthyFlag(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function writePerformanceLog(
  label: string,
  metadata: EditorCorePerformanceLogMetadata
): void {
  const writer = getPerformanceGlobal().console?.info;

  if (!writer) {
    return;
  }

  writer(`[fishmark:perf] ${label}${formatMetadata(metadata)}`);
}

function formatMetadata(metadata: EditorCorePerformanceLogMetadata): string {
  const parts = Object.entries(metadata)
    .filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${formatMetadataValue(value)}`);

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function formatMetadataValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? formatDuration(value) : String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return JSON.stringify(value);
}

function now(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function formatDuration(value: number): string {
  return value.toFixed(2);
}
