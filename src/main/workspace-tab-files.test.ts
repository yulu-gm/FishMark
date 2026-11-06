import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStringTextBuffer, createWorkspaceState } from "@fishmark/workspace-domain";
import { createSaveDocument } from "@fishmark/workspace-application";
import { createKeyedOperationCoordinator } from "./keyed-operation-coordinator";
import { createFileIdentityResolver } from "./file-identity-resolver";
import { createDocumentRepository } from "./infrastructure/document-repository";
import { createWorkspaceTabFiles } from "./workspace-tab-files";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "fishmark-tab-files-")); directories.push(directory);
  const source = path.join(directory, "old.md"), target = path.join(directory, "new.md");
  await writeFile(source, "磁盘原文\r\n", "utf8");
  const identity = createFileIdentityResolver(), disk = createDocumentRepository();
  const workspace = createWorkspaceState({ createTextBuffer: createStringTextBuffer });
  workspace.registerWindow("owner"); workspace.registerWindow("other");
  const sourceIdentity = await identity.resolveExisting(source);
  workspace.openDocument("owner", { path: sourceIdentity.canonicalPath, name: "old.md", content: "磁盘原文\r\n", encoding: "utf-8", fileIdentity: sourceIdentity.identity }, await disk.readDiskVersion(source));
  const tabId = workspace.getWindowProjection("owner").activeTabId!;
  const watcher = { beginInternalWrite: vi.fn(async () => {}), completeInternalWrite: vi.fn(async () => {}), syncWindowPaths: vi.fn(async () => {}) };
  const ports = { workspace, identity, watcher, tabOperations: createKeyedOperationCoordinator<string>(),
    locations: createKeyedOperationCoordinator<import("@fishmark/workspace-domain").FileLocationIdentity>(),
    objects: createKeyedOperationCoordinator<import("@fishmark/workspace-domain").FileObjectIdentity>(),
    copyPath: vi.fn(), reveal: vi.fn(), renamed: vi.fn(async () => {}) };
  return { ...ports, source, target, tabId, disk, execute: createWorkspaceTabFiles(ports) };
}

describe("页签文件操作", () => {
  it("支持只修改文件名大小写", async () => {
    const f = await fixture();
    expect(await f.execute({ tabId: f.tabId, command: "rename", name: "OLD.md" }, "owner", {}, () => {})).toMatchObject({ kind: "success" });
    expect(f.workspace.getTabSession(f.tabId)).toMatchObject({ name: "OLD.md", isDirty: false });
    expect(await readFile(path.join(path.dirname(f.source), "OLD.md"), "utf8")).toBe("磁盘原文\r\n");
  });
  it("重命名保留草稿和磁盘内容，后续保存写入新路径", async () => {
    const f = await fixture();
    f.workspace.updateTabDraft({ tabId: f.tabId, expectedWindowId: "owner", content: "尚未保存的编辑" });
    const before = f.workspace.getTabSession(f.tabId);
    const result = await f.execute({ tabId: f.tabId, command: "rename", name: "new.md" }, "owner", {}, () => {});
    expect(result.kind).toBe("success");
    const after = f.workspace.getTabSession(f.tabId);
    expect(after).toMatchObject({ name: "new.md", content: before.content, revision: before.revision, savedRevision: before.savedRevision, isDirty: true });
    expect(await readFile(f.target, "utf8")).toBe("磁盘原文\r\n");
    await expect(stat(f.source)).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.workspace.getFileOwner(after.fileIdentity!)).toMatchObject({ kind: "owned", owner: { tabId: f.tabId } });
    const save = createSaveDocument({ workspace: f.workspace, tabOperations: f.tabOperations,
      fileLocationOperations: f.locations, fileObjectOperations: f.objects, fileIdentity: f.identity, disk: f.disk,
      dialog: { chooseSavePath: vi.fn() }, watcher: f.watcher, recentFiles: { record: vi.fn() }, cleanupReporter: { report: vi.fn() } });
    expect(await save.save({ tabId: f.tabId, expectedWindowId: "owner", context: {} })).toMatchObject({ status: "success" });
    expect(await readFile(f.target, "utf8")).toBe(before.content);
    expect(f.workspace.getTabSession(f.tabId).isDirty).toBe(false);
  });

  it("同名文件不覆盖，失败后可用其他名称重试", async () => {
    const f = await fixture(); await writeFile(f.target, "其他文件");
    expect(await f.execute({ tabId: f.tabId, command: "rename", name: "new.md" }, "owner", {}, () => {})).toMatchObject({ kind: "error", message: expect.stringContaining("同名") });
    expect(await readFile(f.source, "utf8")).toBe("磁盘原文\r\n");
    expect(await readFile(f.target, "utf8")).toBe("其他文件");
    expect(f.workspace.getTabSession(f.tabId).name).toBe("old.md");
    expect(await f.execute({ tabId: f.tabId, command: "rename", name: "另一个.md" }, "owner", {}, () => {})).toMatchObject({ kind: "success" });
  });

  it.each(["../outside.md", "bad/name.md", "bad\\name.md", "CON.md", "note.md.", "image.png", " ", "bad:name.md"])("拒绝无效文件名 %s", async name => {
    const f = await fixture();
    expect(await f.execute({ tabId: f.tabId, command: "rename", name }, "owner", {}, () => {})).toMatchObject({ kind: "error" });
    expect(await readFile(f.source, "utf8")).toBe("磁盘原文\r\n");
  });

  it("复制和定位使用指定页签的路径，不激活页签，也不接受其他窗口的操作", async () => {
    const f = await fixture(); const active = f.workspace.createUntitledTab("owner").activeTabId;
    for (const command of ["copy-path", "reveal"] as const) {
      expect(await f.execute({ tabId: f.tabId, command }, "other", {}, () => {})).toMatchObject({ kind: "error" });
      expect(await f.execute({ tabId: f.tabId, command }, "owner", {}, () => {})).toMatchObject({ kind: "success" });
    }
    expect(f.copyPath).toHaveBeenCalledExactlyOnceWith(f.source);
    expect(f.reveal).toHaveBeenCalledExactlyOnceWith(f.source);
    expect(f.workspace.getWindowProjection("owner").activeTabId).toBe(active);
    expect(await f.execute({ tabId: active!, command: "rename", name: "new.md" }, "owner", {}, () => {})).toMatchObject({ kind: "error", message: "请先保存文件。" });
  });

  it("等待期间窗口权限失效不会执行文件操作", async () => {
    const f = await fixture(); const lease = await f.tabOperations.acquireExclusive([f.tabId]);
    let permitted = true;
    const pending = f.execute({ tabId: f.tabId, command: "rename", name: "new.md" }, "owner", {}, () => { if (!permitted) throw new Error("窗口失效"); });
    permitted = false; lease.release();
    expect(await pending).toMatchObject({ kind: "error" });
    expect(await readFile(f.source, "utf8")).toBe("磁盘原文\r\n");
  });

  it("重命名后的附加操作失败仍保留新文件和草稿", async () => {
    const f = await fixture(); f.renamed.mockRejectedValueOnce(new Error("最近文件更新失败"));
    f.workspace.updateTabDraft({ tabId: f.tabId, expectedWindowId: "owner", content: "草稿" });
    f.workspace.markExternalChange({ tabId: f.tabId, expectedWindowId: "owner", change: { kind: "modified" } });
    expect(await f.execute({ tabId: f.tabId, command: "rename", name: "new.md" }, "owner", {}, () => {})).toMatchObject({ kind: "error" });
    expect(await readFile(f.target, "utf8")).toBe("磁盘原文\r\n");
    expect(f.workspace.getTabSession(f.tabId)).toMatchObject({ name: "new.md", content: "草稿", isDirty: true, externalChange: { kind: "modified" } });
    expect(f.watcher.completeInternalWrite).toHaveBeenCalledTimes(2);
  });
});
