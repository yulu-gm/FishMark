import path from "node:path";

/** Lexical normalization for already-resolved filesystem paths; no I/O or alias lookup. */
export function normalizeFilePath(targetPath: string, platform: NodeJS.Platform): string {
  return (platform === "win32" ? path.win32 : path.posix).normalize(targetPath);
}

/** Keep the file identity resolver's existing Windows-only case policy. */
export function filePathIdentity(targetPath: string, platform: NodeJS.Platform): string {
  const normalized = normalizeFilePath(targetPath, platform);
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}
