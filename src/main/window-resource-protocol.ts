import path from "node:path";
import { fileURLToPath } from "node:url";
import { realpath } from "node:fs/promises";
import { sameFileIdentity, type WorkspaceState } from "@fishmark/workspace-domain";
import type { FileIdentityPort, ResolvedExistingFileIdentity } from "@fishmark/workspace-application";
import type { BrowserWindow, Session } from "electron";
import type { ThemePackageDescriptor } from "../shared/theme-package";
import { PREVIEW_ASSET_HOST, PREVIEW_ASSET_PROTOCOL } from "../shared/preview-asset-url";
import { filePathIdentity } from "./file-path";
import { readPinnedFile, type PinnedFileHandle } from "./pinned-file-read";

const imageTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".bmp": "image/bmp", ".ico": "image/x-icon", ".avif": "image/avif" };
const fontTypes: Record<string, string> = { ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".eot": "application/vnd.ms-fontobject" };
const bundleTypes = { ...imageTypes, ...fontTypes, ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const key = (target: string) => filePathIdentity(target, process.platform);
function inside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function denied(): never { throw new Error("Resource authority denied."); }
function validateAbsolute(target: string): string {
  if (!path.isAbsolute(target) || target.includes("\0") ||
      (process.platform === "win32" && (target.startsWith("\\\\?\\") || target.startsWith("\\\\.\\") || target.slice(2).includes(":")))) denied();
  return path.normalize(target);
}
export function parsePreviewAssetPath(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== `${PREVIEW_ASSET_PROTOCOL}:` || url.hostname !== PREVIEW_ASSET_HOST || url.port || url.username || url.password) denied();
  if (url.search) {
    const entries = [...url.searchParams.entries()];
    if ((url.pathname !== "" && url.pathname !== "/") || entries.length !== 1 || entries[0]?.[0] !== "path") denied();
    return validateAbsolute(entries[0][1]); // Old absolute query URLs remain consumers of the same policy.
  }
  let decoded = decodeURIComponent(url.pathname);
  if (decoded.startsWith("/~unc//")) decoded = decoded.slice("/~unc".length);
  else if (process.platform === "win32" && /^\/[a-zA-Z]:\//.test(decoded)) decoded = decoded.slice(1);
  return validateAbsolute(decoded);
}

type ThemePolicy = { version: number; descriptor: ThemePackageDescriptor | null; mode: "light" | "dark"; effects: boolean; collectionRoot: string };
type Source = { root?: string; exact?: ResolvedExistingFileIdentity; exactPath?: string; type: string; check(): void };

/** One session belongs to one main-created window. Request fields cannot supply another owner. */
export function createWindowResourceProtocol(input: {
  session: Pick<Session, "protocol" | "isPersistent" | "storagePath">;
  distDirectory: string;
  workspace: Pick<WorkspaceState, "getWindowProjectionOrNull" | "getTabSession">;
  fileIdentity: FileIdentityPort;
  theme(): Promise<ThemePolicy>;
  themeVersion(): number;
  importedImages(tabId: string, documentPath: string | null): readonly ResolvedExistingFileIdentity[];
  tabEpoch(tabId: string): number;
  open?: (target: string) => Promise<PinnedFileHandle>;
  realpath?: (target: string) => Promise<string>;
}) {
  if (input.session.isPersistent() || input.session.storagePath !== null) throw new Error("Resource session must be non-persistent.");
  let owner: BrowserWindow | null = null;
  let generation = 0;
  let destroyed = false;
  const resolveReal = input.realpath ?? realpath;
  const bundleRoot = path.resolve(input.distDirectory);
  const entry = path.join(bundleRoot, "index.html");
  function live(expectedGeneration: number) {
    if (destroyed || generation !== expectedGeneration || owner === null || owner.isDestroyed() || owner.webContents.isDestroyed()) denied();
  }
  function tabSource(tabId: string, windowId: string, target: string, type: string): Source | null {
    const tab = input.workspace.getTabSession(tabId);
    const epoch = input.tabEpoch(tabId);
    const documentPath = tab.path !== null && path.isAbsolute(tab.path) && tab.fileIdentity?.location === `path:${key(tab.path)}` ? tab.path : null;
    const root = documentPath === null ? null : path.dirname(documentPath);
    const exact = input.importedImages(tabId, documentPath).find((image) => key(image.canonicalPath) === key(target));
    if (!exact && (root === null || !inside(target, root))) return null;
    return { ...(exact ? { exact } : { root: root! }), type, check() {
      const current = input.workspace.getTabSession(tabId);
      if (input.tabEpoch(tabId) !== epoch || current.windowId !== windowId || current.path !== tab.path || !sameFileIdentity(current.fileIdentity, tab.fileIdentity)) denied();
    } };
  }
  async function sourceFor(target: string, check: () => void): Promise<Source> {
    const type = imageTypes[path.extname(target).toLowerCase()];
    const windowId = String(owner!.id);
    if (type) {
      const snapshot = input.workspace.getWindowProjectionOrNull(windowId);
      for (const tab of snapshot?.tabs ?? []) {
        const source = tabSource(tab.tabId, windowId, target, type);
        if (source) return source;
      }
    }
    const theme = await input.theme(); check();
    const descriptor = theme.descriptor;
    if (descriptor === null || !inside(target, descriptor.packageRoot)) denied();
    const themeCheck = () => { if (input.themeVersion() !== theme.version) denied(); };
    const packageRoot = await resolveReal(descriptor.packageRoot); check(); themeCheck();
    const collectionRoot = await resolveReal(theme.collectionRoot); check(); themeCheck();
    if (!inside(packageRoot, collectionRoot) || key(packageRoot) !== key(descriptor.packageRoot)) denied();
    const extension = path.extname(target).toLowerCase();
    const staticType = imageTypes[extension] ?? fontTypes[extension] ?? (extension === ".css" ? "text/css; charset=utf-8" : undefined);
    const shaders = theme.effects ? Object.values(descriptor.manifest.surfaces).map((surface) => surface?.shader) : [];
    const shader = shaders.some((candidate) => candidate !== undefined && key(candidate) === key(target));
    if (!staticType && !shader) denied();
    return { root: packageRoot, type: staticType ?? "text/plain; charset=utf-8", check: themeCheck };
  }
  async function respond(request: Request, file: boolean): Promise<Response> {
    const expectedGeneration = generation;
    const check = () => live(expectedGeneration);
    try {
      check();
      if (request.method !== "GET" && request.method !== "HEAD") denied();
      const target = file ? validateAbsolute(fileURLToPath(request.url)) : parsePreviewAssetPath(request.url);
      let source: Source;
      if (file) {
        const exactEntry = key(target) === key(entry);
        const type = bundleTypes[path.extname(target).toLowerCase() as keyof typeof bundleTypes];
        if (!exactEntry && (!inside(target, path.join(bundleRoot, "assets")) || !type)) denied();
        source = { ...(exactEntry ? { exactPath: entry } : { root: path.join(bundleRoot, "assets") }),
          type: exactEntry ? "text/html; charset=utf-8" : type!, check: () => {} };
      } else source = await sourceFor(target, check);
      const verify = async () => {
        check(); source.check();
        const canonical = await resolveReal(target); check(); source.check();
        if (source.exactPath && key(canonical) !== key(source.exactPath)) denied();
        if (source.exact && key(canonical) !== key(source.exact.canonicalPath)) denied();
        if (source.root && (!inside(canonical, source.root) || key(await resolveReal(source.root)) !== key(source.root))) denied();
        check(); source.check();
        // Never stat a canonical escape: realpath is the sole unavoidable lookup there.
        const resolved = await input.fileIdentity.resolveExisting(canonical); check(); source.check();
        if (key(resolved.canonicalPath) !== key(canonical)) denied();
        if (source.exact) {
          if (key(resolved.canonicalPath) !== key(source.exact.canonicalPath) || !sameFileIdentity(resolved.identity, source.exact.identity)) denied();
        }
        return resolved;
      };
      const pinned = await verify();
      const stable = await verify();
      if (!sameFileIdentity(pinned.identity, stable.identity)) denied();
      const bytes = await readPinnedFile({ path: stable.canonicalPath, physicalIdentity: pinned.identity.object,
        check: () => { check(); source.check(); }, open: input.open, head: request.method === "HEAD",
        beforeBody: async () => { if (!sameFileIdentity(pinned.identity, (await verify()).identity)) denied(); }
      });
      check(); source.check();
      const final = await verify();
      if (!sameFileIdentity(pinned.identity, final.identity)) denied();
      return new Response(bytes === null ? null : new Uint8Array(bytes), { status: 200,
        headers: { "content-type": source.type, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } catch {
      return new Response("Resource unavailable.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }
  }
  input.session.protocol.handle(PREVIEW_ASSET_PROTOCOL, (request) => respond(request, false));
  input.session.protocol.handle("file", (request) => respond(request, true));
  return {
    bind(window: BrowserWindow) {
      if (owner !== null || window.webContents.session !== input.session) throw new Error("Resource session ownership mismatch.");
      owner = window;
    },
    invalidate() { generation += 1; },
    destroy() { destroyed = true; generation += 1; }
  };
}
