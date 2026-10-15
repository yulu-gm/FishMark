import { mkdtemp, mkdir, writeFile, realpath, rm, symlink, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BrowserWindow, Session } from "electron";
import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import type { ResolvedExistingFileIdentity } from "@fishmark/workspace-application";
import { afterEach, expect, it, vi } from "vitest";
import { createWindowResourceProtocol, parsePreviewAssetPath } from "./window-resource-protocol";
import { createFileIdentityResolver } from "./file-identity-resolver";
import { createPreviewAssetUrl } from "../shared/preview-asset-url";
import type { ThemePackageDescriptor } from "../shared/theme-package";

const roots: string[] = [];
afterEach(async () => {
  const parent = await realpath(tmpdir());
  for (const root of roots.splice(0)) {
    const resolved = await realpath(root);
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith("fishmark-resource-unit-")) throw new Error("Unsafe test cleanup.");
    await rm(resolved, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "fishmark-resource-unit-")); roots.push(root);
  const dist = path.join(root, "app.asar.unpacked", "dist");
  const documents = path.join(root, "docs");
  const themes = path.join(dist, "theme-packages");
  const selected = path.join(themes, "selected");
  const unselected = path.join(themes, "other");
  for (const directory of [path.join(dist, "assets"), documents, selected, unselected]) await mkdir(directory, { recursive: true });
  const files = { index: path.join(dist, "index.html"), script: path.join(dist, "assets", "entry.js"),
    document: path.join(documents, "note.md"), image: path.join(documents, "image.png"),
    css: path.join(selected, "style.css"), font: path.join(selected, "font.woff2"), shader: path.join(selected, "scene.frag"),
    texture: path.join(selected, "texture.png"), other: path.join(unselected, "style.css"), outside: path.join(root, "private.png") };
  for (const [name, target] of Object.entries(files)) await writeFile(target, name);
  const resolver = createFileIdentityResolver();
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("1"); workspace.registerWindow("2");
  const tabId = workspace.createUntitledTab("1").activeTabId!;
  const documentIdentity = await resolver.resolveExisting(files.document);
  workspace.saveTabDocument({ tabId, expectedWindowId: "1", capturedRevision: 0,
    document: { path: files.document, fileIdentity: documentIdentity.identity, content: "", name: "note.md", encoding: "utf-8" }, diskVersion: null });
  const handlers = new Map<string, (request: Request) => Promise<Response>>();
  const session = { protocol: { handle: (scheme: string, handler: (request: Request) => Promise<Response>) => handlers.set(scheme, handler) },
    isPersistent: () => false, storagePath: null } as unknown as Session;
  const window = { id: 1, isDestroyed: () => false, webContents: { session, isDestroyed: () => false } } as unknown as BrowserWindow;
  let version = 0; let epoch = 0; let effects = true;
  let descriptor: ThemePackageDescriptor | null = { id: "selected", kind: "manifest-package", source: "builtin", packageRoot: selected,
    manifest: { id: "selected", contractVersion: 2, name: "Selected", version: "1", author: null, supports: { light: true, dark: true },
      tokens: {}, styles: {}, layout: { titlebar: null }, scene: null, parameters: [],
      surfaces: { welcomeHero: { kind: "fragment", scene: "scene", shader: files.shader } } } };
  const real = vi.fn((target: string) => realpath(target));
  const identity = vi.fn(resolver.resolveExisting);
  const handles = vi.fn((target: string) => open(target, "r"));
  const options = { session, distDirectory: dist, workspace, fileIdentity: { ...resolver, resolveExisting: identity },
    theme: async () => ({ version, descriptor, mode: "light" as const, effects, collectionRoot: themes }), themeVersion: () => version,
    importedImages: (tabId: string, documentPath: string | null): readonly ResolvedExistingFileIdentity[] => { void tabId; void documentPath; return []; }, tabEpoch: () => epoch, realpath: real, open: handles };
  const policy = createWindowResourceProtocol(options); policy.bind(window);
  const request = (target: string, file = false) => handlers.get(file ? "file" : "fishmark-asset")!(new Request(file ? pathToFileURL(target) : createPreviewAssetUrl(target)));
  return { root, dist, files, selected, workspace, tabId, options, request, policy, real, identity, handles,
    revokeTheme: () => { version++; descriptor = null; }, effectsOff: () => { effects = false; version++; }, advance: () => { epoch++; } };
}

it("serves only owned document images, selected theme static resources/shaders, and physical unpacked bundle", async () => {
  const f = await fixture();
  for (const target of [f.files.image, f.files.css, f.files.font, f.files.shader, f.files.texture]) expect((await f.request(target)).status).toBe(200);
  for (const target of [f.files.index, f.files.script]) expect((await f.request(target, true)).status).toBe(200);
  expect((await f.request(f.files.other)).status).toBe(403);
  expect((await f.request(f.files.css, true)).status).toBe(403);
  f.effectsOff();
  expect((await f.request(f.files.shader)).status).toBe(403);
  expect((await f.request(f.files.texture)).status).toBe(200);
  f.revokeTheme(); expect((await f.request(f.files.css)).status).toBe(403);
});
it("rejects unknown paths before candidate lookup or file open and rejects forged URL selectors", async () => {
  const f = await fixture();
  expect((await f.request(f.files.outside)).status).toBe(403);
  expect(f.real).not.toHaveBeenCalled(); expect(f.identity).not.toHaveBeenCalled(); expect(f.handles).not.toHaveBeenCalled();
  for (const url of ["fishmark-asset://evil/C:/x.png", "fishmark-asset://preview/?owner=1&path=x", "fishmark-asset://preview/?path=x&path=y"]) expect(() => parsePreviewAssetPath(url)).toThrow();
  expect(parsePreviewAssetPath(createPreviewAssetUrl(f.files.image))).toBe(f.files.image);
});
it("denies restored raw document aliases without canonical main identity", async () => {
  const f = await fixture(); const snapshot = f.workspace.exportSnapshot();
  const invalid = { ...snapshot, sessions: snapshot.sessions.map((session) => ({ ...session, fileIdentity: null })) };
  f.workspace.restoreSnapshot(invalid);
  expect((await f.request(f.files.image)).status).toBe(403);
  expect(f.identity).not.toHaveBeenCalled();
});
it("passes no saved-document binding for an inconsistent restored path", async () => {
  const f = await fixture(); const snapshot = f.workspace.exportSnapshot();
  const lookup = vi.fn((_tabId: string, documentPath: string | null): readonly ResolvedExistingFileIdentity[] => {
    if (documentPath !== null) throw new Error("Unvalidated document binding."); return [];
  });
  f.options.importedImages = lookup;
  f.workspace.restoreSnapshot({ ...snapshot, sessions: snapshot.sessions.map((session) => ({ ...session, path: path.join(f.root, "mismatched.md") })) });
  // The handler captures the options object, so it sees the replacement lookup.
  expect((await f.request(f.files.outside)).status).toBe(403); expect(lookup).toHaveBeenCalledWith(f.tabId, null);
  expect(f.identity).not.toHaveBeenCalled(); expect(f.handles).not.toHaveBeenCalled();
});
it("rejects real junction escapes from document and assets roots before outside stat/body", async () => {
  const f = await fixture();
  const link = path.join(f.dist, "assets", "theme-link");
  await symlink(f.selected, link, process.platform === "win32" ? "junction" : "dir");
  expect((await f.request(path.join(link, "style.css"), true)).status).toBe(403);
  expect(f.identity).not.toHaveBeenCalled(); expect(f.handles).not.toHaveBeenCalled();
  const docLink = path.join(path.dirname(f.files.document), "escape");
  await symlink(f.root, docLink, process.platform === "win32" ? "junction" : "dir");
  expect((await f.request(path.join(docLink, "private.png"))).status).toBe(403);
  expect(f.identity).not.toHaveBeenCalled(); expect(f.handles).not.toHaveBeenCalled();
});
it("pins the opened object and rejects retarget before reading its body", async () => {
  const f = await fixture(); const read = vi.fn(async () => Buffer.from("outside")); const close = vi.fn(async () => {});
  // Mutating the injected opener of the original policy exercises the actual request path.
  f.handles.mockImplementation(async () => ({ stat: async () => ({ dev: 999n, ino: 999n }), readFile: read, close }) as unknown as Awaited<ReturnType<typeof open>>);
  expect((await f.request(f.files.image)).status).toBe(403); expect(read).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
});
it("revokes an in-flight image across move-return ABA while permitting a new owned request", async () => {
  const f = await fixture();
  let release!: () => void; const waiting = new Promise<void>((resolve) => { release = resolve; });
  const original = f.handles.getMockImplementation()!; let started!: () => void; const opened = new Promise<void>((resolve) => { started = resolve; });
  f.handles.mockImplementation(async (target) => { const handle = await original(target); started(); await waiting; return handle; });
  const pending = f.request(f.files.image); await opened;
  f.workspace.moveTabToWindow({ tabId: f.tabId, targetWindowId: "2" }); f.advance();
  f.workspace.moveTabToWindow({ tabId: f.tabId, targetWindowId: "1" }); f.advance(); release();
  expect((await pending).status).toBe(403);
  f.handles.mockImplementation(original); expect((await f.request(f.files.image)).status).toBe(200);
  f.policy.invalidate(); f.policy.destroy(); expect((await f.request(f.files.index, true)).status).toBe(403);
});

it.each(["close", "save-as", "reload", "theme"])("revokes pending file reads after %s", async (reason) => {
  const f = await fixture(); const original = f.handles.getMockImplementation()!;
  let started!: () => void; let release!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
  f.handles.mockImplementation(async (target) => {
    const handle = await original(target);
    return Object.assign(handle, { readFile: async () => { started(); await gate; return Buffer.from("private"); } });
  });
  const pending = f.request(reason === "theme" ? f.files.css : f.files.image); await entered;
  if (reason === "close") f.workspace.closeTab({ tabId: f.tabId, expectedWindowId: "1", expectedRevision: 0 });
  if (reason === "save-as") {
    f.workspace.saveTabDocument({ tabId: f.tabId, expectedWindowId: "1", capturedRevision: 0,
      document: { path: f.files.outside, fileIdentity: (await createFileIdentityResolver().resolveExisting(f.files.outside)).identity, name: "other.md", content: "", encoding: "utf-8" }, diskVersion: null }); f.advance();
  }
  if (reason === "reload") f.policy.invalidate();
  if (reason === "theme") f.revokeTheme();
  release(); expect((await pending).status).toBe(403);
});

it("keeps inactive owned tabs authorized while excluding the same tab in another window", async () => {
  const f = await fixture(); f.workspace.createUntitledTab("1");
  expect((await f.request(f.files.image)).status).toBe(200);
  f.workspace.moveTabToWindow({ tabId: f.tabId, targetWindowId: "2" }); f.advance();
  expect((await f.request(f.files.image)).status).toBe(403);
});
