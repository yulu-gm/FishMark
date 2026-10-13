import path from "node:path";
import { mkdtemp, realpath, rm, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { createStringTextBuffer, createWorkspaceState, fileIdentity } from "@fishmark/workspace-domain";
import type { ResolvedExistingFileIdentity, FileIdentityPort } from "@fishmark/workspace-application";
import { createPathAuthority, createClipboardTargetAuthority, requireContainedDirectory } from "./path-authority";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createFileIdentityResolver } from "./file-identity-resolver";
import { importClipboardImage } from "./clipboard-image-import";

function resolved(targetPath: string, object = targetPath): ResolvedExistingFileIdentity {
  const identity = fileIdentity(`path:${targetPath}`, `object:${object}`);
  return { canonicalPath: targetPath, identity, pathKey: identity.location, physicalKey: identity.object, exists: true };
}
function fixture() {
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("one"); workspace.registerWindow("two");
  const mappings = new Map<string, ResolvedExistingFileIdentity>();
  const resolve = vi.fn(async (targetPath: string) => mappings.get(targetPath) ?? resolved(path.normalize(targetPath)));
  const fileIdentity: FileIdentityPort = { resolveExisting: resolve, resolveProspective: resolve };
  let clock = 0;
  const paths = createPathAuthority({ workspace, fileIdentity, now: () => clock });
  const sender = {}; const other = {};
  paths.bind(sender, "one", "secret-one"); paths.bind(other, "two", "secret-two");
  return { workspace, mappings, resolve, fileIdentity, paths, sender, other, expire: () => { clock = 60_001; } };
}
const approved = path.resolve("path-authority-fixture", "docs", "approved.md");
const unrelated = path.resolve("path-authority-fixture", "outside", "secret.md");
async function removeOwnedTestDirectory(directory: string, parent: string) {
  const resolvedRoot = await realpath(directory);
  if (path.dirname(resolvedRoot) !== parent || !path.basename(resolvedRoot).startsWith("fishmark-path-authority-")) throw new Error("Unsafe test cleanup path.");
  await rm(resolvedRoot, { recursive: true, force: true });
}

describe("main path sources", () => {
  it("rejects arbitrary strings and another window's pending grant before filesystem lookup", async () => {
    const f = fixture();
    expect(() => f.paths.requirePath(f.sender, unrelated)).toThrow("Path authority denied");
    expect(f.resolve).not.toHaveBeenCalled();
    await f.paths.grant(f.sender, approved, "launch:1"); f.resolve.mockClear();
    expect(() => f.paths.consume(f.other, approved)).toThrow("Path authority denied");
    expect(f.resolve).not.toHaveBeenCalled();
  });
  it("rejects forged native tokens before I/O", async () => {
    const f = fixture();
    await expect(f.paths.grantNative(f.sender, "wrong-token", approved)).rejects.toThrow("Path authority denied");
    expect(f.resolve).not.toHaveBeenCalled();
  });
  it("consumes each native file once, retaining the rest of a multi-file batch across active tab changes", async () => {
    const f = fixture();
    await f.paths.grantNative(f.sender, "secret-one", approved);
    await f.paths.grantNative(f.sender, "secret-one", unrelated);
    const first = f.paths.consume(f.sender, approved);
    await first.beforeRead(approved); first.finish();
    const tab = f.workspace.createUntitledTab("one").activeTabId!;
    f.workspace.activateTab("one", tab);
    expect(() => f.paths.consume(f.sender, approved)).toThrow("Path authority denied");
    await expect(f.paths.consume(f.sender, unrelated).beforeRead(unrelated)).resolves.toBeUndefined();
  });
  it.each(["reload", "destroy", "request", "expired"])("revokes %s grants and in-flight checks", async (reason) => {
    const f = fixture();
    await f.paths.grantNative(f.sender, "secret-one", approved);
    const permit = f.paths.consume(f.sender, approved);
    if (reason === "reload") f.paths.invalidate(f.sender);
    if (reason === "destroy") f.paths.invalidate(f.sender, true);
    if (reason === "request") f.paths.revokeRequest(f.sender, "native-drop");
    if (reason === "expired") f.expire();
    f.resolve.mockClear();
    await expect(permit.beforeRead(approved)).rejects.toThrow("Path authority denied");
    expect(f.resolve).not.toHaveBeenCalled();
  });
  it("rejects retargeted canonical aliases and file replacements before reading", async () => {
    const f = fixture();
    f.mappings.set(approved, resolved("C:\\docs\\original.md", "inode-original"));
    await f.paths.grant(f.sender, approved, "chooser");
    const permit = f.paths.consume(f.sender, approved);
    f.mappings.set(approved, resolved(unrelated, "inode-secret"));
    await expect(permit.beforeRead(approved)).rejects.toThrow("Path authority denied");
  });
  it("invalidates a native grant whose resolver was still pending when the page changed", async () => {
    const f = fixture(); let release!: (value: ResolvedExistingFileIdentity) => void;
    f.resolve.mockImplementationOnce(() => new Promise((done) => { release = done; }));
    const pending = f.paths.grantNative(f.sender, "secret-one", approved);
    f.paths.invalidate(f.sender); release(resolved(approved));
    await expect(pending).rejects.toThrow("Path authority denied");
    expect(() => f.paths.requirePath(f.sender, approved)).toThrow("Path authority denied");
    await f.paths.grantNative(f.sender, "secret-one", approved);
    expect(() => f.paths.requirePath(f.sender, approved)).not.toThrow();
  });
  it("treats current main recent entries as an independent cross-window source and revokes removed entries", async () => {
    const f = fixture(); await f.paths.syncRecent([approved]); f.resolve.mockClear();
    expect(() => f.paths.requirePath(f.other, approved)).not.toThrow();
    expect(f.resolve).not.toHaveBeenCalled();
    await f.paths.syncRecent([]);
    expect(() => f.paths.requirePath(f.other, approved)).toThrow("Path authority denied");
  });
  it("allows an external atomic replacement at the same recent location, then pins this read's object", async () => {
    const f = fixture(); await f.paths.syncRecent([approved]);
    f.mappings.set(approved, resolved(approved, "replacement"));
    const permit = f.paths.consume(f.other, approved);
    await expect(permit.beforeRead(approved)).resolves.toBeUndefined();
    f.mappings.set(approved, resolved(approved, "changed-during-read"));
    await expect(permit.beforeRead(approved)).rejects.toThrow("Path authority denied");
  });
  it("does not reauthorize a recent symlink retarget through preference/list refresh", async () => {
    const f = fixture(); await f.paths.syncRecent([approved]);
    f.mappings.set(approved, resolved(unrelated));
    await f.paths.syncRecent([approved]);
    await expect(f.paths.consume(f.sender, approved).beforeRead(approved)).rejects.toThrow("Path authority denied");
  });
  it("updates the recent object only through a trusted main save/record at the same canonical location", async () => {
    const f = fixture(); await f.paths.syncRecent([approved]);
    f.mappings.set(approved, resolved(approved, "main-saved"));
    await f.paths.syncRecent([approved], approved);
    await expect(f.paths.consume(f.other, approved).beforeRead(approved)).resolves.toBeUndefined();
  });
  it("trusts a main-owned restored/saved tab identity, not a renderer-supplied alias", async () => {
    const f = fixture();
    f.workspace.openDocument("one", { path: approved, name: "approved.md", content: "body", encoding: "utf-8", fileIdentity: resolved(approved).identity }, null);
    await expect(f.paths.consume(f.sender, approved).beforeRead(approved)).resolves.toBeUndefined();
    expect(() => f.paths.requirePath(f.sender, unrelated)).toThrow("Path authority denied");
    expect(() => f.paths.requirePath(f.other, approved)).toThrow("Path authority denied");
  });
});

function clipboardFixture(saved = true) {
  const f = fixture();
  if (saved) f.workspace.openDocument("one", {
    path: approved, name: "approved.md", content: "", encoding: "utf-8", fileIdentity: resolved(approved).identity
  }, null);
  else f.workspace.createUntitledTab("one");
  const tabId = f.workspace.getWindowProjection("one").activeTabId!;
  const tabOperations = createKeyedOperationCoordinator<string>();
  const temporaryPath = path.resolve("path-authority-fixture", "owned", "clipboard");
  const temporary = { path: temporaryPath, canonicalPath: temporaryPath };
  const withTarget = createClipboardTargetAuthority({ workspace: f.workspace, tabOperations, paths: f.paths,
    fileIdentity: f.fileIdentity, getTemporaryDirectory: () => temporary });
  const mkdirMock = vi.fn(async () => undefined);
  const writeMock = vi.fn(async () => undefined);
  const clipboard = { availableFormats: vi.fn(() => ["image/png"]), readBuffer: vi.fn(() => Buffer.from([0x89, 0x50, 0x4e, 0x47])) };
  const run = (sender = f.sender, targetTab = tabId) => withTarget(sender, targetTab, () => {}, (target) =>
    importClipboardImage({ documentPath: target.documentPath }, { ...target, clipboard, mkdir: mkdirMock, writeFile: writeMock }));
  return { ...f, tabId, tabOperations, withTarget, mkdirMock, writeMock, clipboard, run };
}
describe("clipboard tab and directory authority", () => {
  it.each(["missing", "foreign", "inactive"])("rejects %s targets before reading the clipboard or touching disk", async (reason) => {
    const f = clipboardFixture();
    if (reason === "inactive") f.workspace.createUntitledTab("one");
    await expect(f.run(reason === "foreign" ? f.other : f.sender, reason === "missing" ? "missing" : f.tabId)).rejects.toThrow("Path authority denied");
    expect(f.clipboard.availableFormats).not.toHaveBeenCalled(); expect(f.resolve).not.toHaveBeenCalled();
    expect(f.mkdirMock).not.toHaveBeenCalled(); expect(f.writeMock).not.toHaveBeenCalled();
  });
  it("does not write after a tab changes while the import waits for its shared lease", async () => {
    const f = clipboardFixture(); const lease = await f.tabOperations.acquireExclusive([f.tabId]);
    const pending = f.run();
    f.workspace.createUntitledTab("one"); lease.release();
    await expect(pending).rejects.toThrow("Path authority denied");
    expect(f.clipboard.availableFormats).not.toHaveBeenCalled(); expect(f.mkdirMock).not.toHaveBeenCalled();
  });
  it("keeps legitimate queued typing compatible with image paste on the same tab", async () => {
    const f = clipboardFixture(); const lease = await f.tabOperations.acquireExclusive([f.tabId]);
    const pending = f.run();
    f.workspace.updateTabDraft({ tabId: f.tabId, expectedWindowId: "one", content: "new typing" });
    lease.release(); await expect(pending).resolves.toMatchObject({ status: "success" });
  });
  it.each(["close", "move", "save-as"])("rejects a queued import after %s changes its main target", async (kind) => {
    const f = clipboardFixture(); const lease = await f.tabOperations.acquireExclusive([f.tabId]);
    const pending = f.run();
    if (kind === "close") f.workspace.closeTab({ tabId: f.tabId, expectedWindowId: "one", expectedRevision: f.workspace.getTabSession(f.tabId).revision });
    if (kind === "move") f.workspace.moveTabToWindow({ tabId: f.tabId, targetWindowId: "two" });
    if (kind === "save-as") f.workspace.saveTabDocument({ tabId: f.tabId, expectedWindowId: "one",
      capturedRevision: f.workspace.getTabSession(f.tabId).revision,
      document: { path: unrelated, name: "secret.md", content: "", encoding: "utf-8", fileIdentity: resolved(unrelated).identity }, diskVersion: null });
    lease.release(); await expect(pending).rejects.toThrow("Path authority denied");
    expect(f.clipboard.availableFormats).not.toHaveBeenCalled(); expect(f.mkdirMock).not.toHaveBeenCalled(); expect(f.writeMock).not.toHaveBeenCalled();
  });
  it.each([true, false])("limits an unavailable custom temporary directory to untitled paste (saved: %s)", async (saved) => {
    const f = clipboardFixture(saved);
    const withTarget = createClipboardTargetAuthority({ workspace: f.workspace, tabOperations: f.tabOperations, paths: f.paths,
      fileIdentity: f.fileIdentity, getTemporaryDirectory: () => { throw new Error("Unavailable custom directory"); } });
    const operation = vi.fn(async () => "saved image");
    const result = withTarget(f.sender, f.tabId, () => {}, operation);
    if (saved) await expect(result).resolves.toBe("saved image");
    else { await expect(result).rejects.toThrow("Unavailable custom directory"); expect(operation).not.toHaveBeenCalled(); }
  });
  it("rejects an assets junction escape before mkdir or write", async () => {
    const f = clipboardFixture();
    f.mappings.set(path.join(path.dirname(approved), "assets").replace(/\\/g, "/"), resolved(path.join(path.dirname(unrelated), "assets")));
    await expect(f.run()).rejects.toThrow("Path authority denied");
    expect(f.mkdirMock).not.toHaveBeenCalled(); expect(f.writeMock).not.toHaveBeenCalled();
  });
  it("rechecks active identity after mkdir and rejects before writing", async () => {
    const f = clipboardFixture();
    f.mkdirMock.mockImplementationOnce(async () => { f.workspace.createUntitledTab("one"); return undefined; });
    await expect(f.run()).rejects.toThrow("Path authority denied"); expect(f.writeMock).not.toHaveBeenCalled();
  });
  it.each([true, false])("writes a valid %s saved/untitled image under a shared lease", async (saved) => {
    const f = clipboardFixture(saved);
    const result = await f.run(); expect(result.status).toBe("success");
    expect(f.mkdirMock).toHaveBeenCalledTimes(1); expect(f.writeMock).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), { flag: "wx" });
  });
  it("resolves a real junction to an external directory before allowing a missing assets child", async () => {
    const temporaryRoot = await realpath(tmpdir());
    const root = await mkdtemp(path.join(temporaryRoot, "fishmark-path-authority-"));
    try {
      const docs = path.join(root, "docs"); const outside = path.join(root, "outside");
      await mkdir(docs); await mkdir(outside);
      await symlink(outside, path.join(docs, "assets"), process.platform === "win32" ? "junction" : "dir");
      await expect(requireContainedDirectory(createFileIdentityResolver(), path.join(docs, "assets", "missing"), docs)).rejects.toThrow("Path authority denied");
    } finally {
      await removeOwnedTestDirectory(root, temporaryRoot);
    }
  });
});
