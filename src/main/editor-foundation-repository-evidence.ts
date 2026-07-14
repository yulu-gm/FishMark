import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type RepositoryPathInspection =
  | { kind: "directory" | "file" | "missing" | "other" }
  | { errorCode: string; kind: "error" };

export type RepositoryTextEvidence =
  | { kind: "available"; source: string }
  | { errorCode: string; kind: "unavailable" };

export function inspectRepositoryPath(rootDir: string, path: string): RepositoryPathInspection {
  try {
    const stats = statSync(resolve(rootDir, path));
    if (stats.isDirectory()) {
      return { kind: "directory" };
    }
    if (stats.isFile()) {
      return { kind: "file" };
    }
    return { kind: "other" };
  } catch (error) {
    const errorCode = normalizeFilesystemError(error);
    return errorCode === "ENOENT" || errorCode === "ENOTDIR"
      ? { kind: "missing" }
      : { errorCode, kind: "error" };
  }
}

export function readRepositoryText(rootDir: string, path: string): RepositoryTextEvidence {
  try {
    return { kind: "available", source: readFileSync(resolve(rootDir, path), "utf8") };
  } catch (error) {
    return { errorCode: normalizeFilesystemError(error), kind: "unavailable" };
  }
}

export function normalizeFilesystemError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.length > 0
  ) {
    return error.code;
  }
  if (error instanceof Error && error.name.length > 0) {
    return error.name;
  }
  return "UNKNOWN";
}
