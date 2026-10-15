import path from "node:path";
import type { FileIdentity, WorkspaceSnapshot } from "@fishmark/workspace-domain";
import { filePathIdentity } from "../file-path";

export type ImportedImageRecord = Readonly<{
  path: string;
  identity: FileIdentity;
  tabId: string | null;
  documentPaths: readonly string[];
}>;
export type ImportedImageProvenance = { version: 1; records: readonly ImportedImageRecord[] };
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const key = (value: string) => filePathIdentity(value, process.platform);
function absolute(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") && path.isAbsolute(value) &&
    path.normalize(value).replace(/\\/g, "/") === value.replace(/\\/g, "/") &&
    !(process.platform === "win32" && (value.startsWith("\\\\?\\") || value.startsWith("\\\\.\\") || value.slice(2).includes(":")));
}
export function parseImportedImageProvenance(value: unknown, snapshot: WorkspaceSnapshot): ImportedImageProvenance | null {
  if (value === undefined) return { version: 1, records: [] };
  if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1 || !("records" in value) || !Array.isArray(value.records)) return null;
  const records: ImportedImageRecord[] = [];
  const seen = new Set<string>();
  for (const record of value.records) {
    if (typeof record !== "object" || record === null || !absolute(record.path) || !imageExtensions.has(path.extname(record.path).toLowerCase()) ||
        typeof record.identity !== "object" || record.identity === null || record.identity.location !== `path:${key(record.path)}` ||
        typeof record.identity.object !== "string" || !/^inode:\d+:[1-9]\d*$/.test(record.identity.object) ||
        (record.tabId !== null && (typeof record.tabId !== "string" || !snapshot.sessions.some((session) => session.tabId === record.tabId))) ||
        !Array.isArray(record.documentPaths) || !record.documentPaths.every(absolute) ||
        (record.tabId === null && record.documentPaths.length === 0) || seen.has(key(record.path))) return null;
    seen.add(key(record.path));
    records.push({ path: record.path, identity: { location: record.identity.location, object: record.identity.object }, tabId: record.tabId, documentPaths: [...record.documentPaths] });
  }
  return { version: 1, records };
}
export function synchronizeImportedImages(records: readonly ImportedImageRecord[], snapshot: WorkspaceSnapshot): ImportedImageRecord[] {
  return records.flatMap((record) => {
    const live = record.tabId === null ? undefined : snapshot.sessions.find((session) => session.tabId === record.tabId);
    const paths = new Map(record.documentPaths.map((value) => [key(value), path.normalize(value)]));
    if (live?.path && absolute(live.path) && live.fileIdentity?.location === `path:${key(live.path)}`) paths.set(key(live.path), path.normalize(live.path));
    if (!live && paths.size === 0) return [];
    return [{ ...record, tabId: live?.tabId ?? null, documentPaths: [...paths.values()] }];
  });
}
