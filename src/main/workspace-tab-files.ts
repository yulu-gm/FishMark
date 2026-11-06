import { link, lstat, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { sameFileIdentity, type WorkspaceState, type FileLocationIdentity, type FileObjectIdentity } from "@fishmark/workspace-domain";
import type { FileIdentityPort, KeyedOperationCoordinator, WorkspaceWatcherPort } from "@fishmark/workspace-application";
import type { WorkspaceTabFileInput, WorkspaceTabFileResult } from "../shared/workspace-tab-file";
import { toWorkspaceWindowSnapshot } from "./workspace-ipc-projection";

export function createWorkspaceTabFiles<TContext>(ports: {
  workspace: WorkspaceState;
  tabOperations: KeyedOperationCoordinator<string>;
  locations: KeyedOperationCoordinator<FileLocationIdentity>;
  objects: KeyedOperationCoordinator<FileObjectIdentity>;
  identity: FileIdentityPort;
  watcher: WorkspaceWatcherPort<TContext>;
  copyPath(path: string): void;
  reveal(path: string): void;
  renamed(tabId: string, oldPath: string, newPath: string): Promise<void>;
}) {
  return async (input: WorkspaceTabFileInput, windowId: string, context: TContext, check: () => void): Promise<WorkspaceTabFileResult> => {
    try {
      return await ports.tabOperations.runExclusive(input.tabId, async () => {
        const owned = () => {
          check();
          const session = ports.workspace.getTabSession(input.tabId);
          if (session.windowId !== windowId) throw new Error("页签已移动到其他窗口。");
          if (session.path === null || session.fileIdentity === null) throw new Error("请先保存文件。");
          return session;
        };
        const session = owned();
        const sourcePath = session.path!;
        if (input.command === "copy-path") ports.copyPath(sourcePath);
        else if (input.command === "reveal") ports.reveal(sourcePath);
        else if (input.command === "rename") {
          validateFileName(input.name);
          const targetPath = path.join(path.dirname(sourcePath), input.name);
          if (targetPath !== sourcePath) {
            const source = await ports.identity.resolveExisting(sourcePath);
            const target = await ports.identity.resolveProspective(targetPath);
            const locations = await ports.locations.acquireExclusive([source.pathKey, target.pathKey]);
            try {
              await ports.objects.runExclusive(source.physicalKey, async () => {
                owned();
                const current = await ports.identity.resolveExisting(sourcePath);
                if (!sameFileIdentity(current.identity, session.fileIdentity)) throw new Error("磁盘上的文件已被替换，请重新加载后重试。");
                if (!(await lstat(sourcePath)).isFile()) throw new Error("暂不支持重命名符号链接。");
                owned();
                await ports.watcher.beginInternalWrite(context, sourcePath);
                try {
                  await ports.watcher.beginInternalWrite(context, targetPath);
                  try {
                    owned();
                    // 同目录硬链接以排他方式占用新名称：目标存在时失败，不覆盖磁盘文件。
                    // 草稿仍留在会话中，磁盘上只移动原文件的内容。
                    const caseOnly = target.exists && target.pathKey === source.pathKey && target.physicalKey === source.physicalKey &&
                      sourcePath.toLowerCase() === targetPath.toLowerCase();
                    // 不区分大小写的文件系统上，这两个名称指向同一路径，可直接修改大小写。
                    if (caseOnly) await rename(sourcePath, targetPath);
                    else await link(sourcePath, targetPath);
                    try {
                      const renamed = await ports.identity.resolveExisting(targetPath);
                      if (renamed.physicalKey !== source.physicalKey) throw new Error("重命名期间文件发生变化，请重试。");
                      owned();
                      const owner = ports.workspace.getFileOwner(renamed.identity);
                      if (owner.kind === "ambiguous" || (owner.kind === "owned" && owner.owner.tabId !== input.tabId)) throw new Error("该文件已在其他页签打开。");
                      if (!caseOnly) {
                        const original = await ports.identity.resolveExisting(sourcePath);
                        if (!sameFileIdentity(original.identity, source.identity)) throw new Error("重命名期间原文件发生变化，请重试。");
                        owned();
                        await unlink(sourcePath);
                      }
                      // 标签所有权由 tabOperations 保持；提交只更新位置，保留编辑和保存序号。
                      const result = ports.workspace.renameTabDocument({ tabId: input.tabId, expectedWindowId: windowId,
                        expectedIdentity: session.fileIdentity!, file: { path: renamed.canonicalPath, name: input.name, fileIdentity: renamed.identity } });
                      if (result.kind !== "applied") throw new Error("页签状态已改变，无法更新文件名。");
                    } catch (error) {
                      // 若旧名称已移除，先恢复它；恢复失败时保留新名称，确保文件仍可找回。
                      if (caseOnly) await rename(targetPath, sourcePath);
                      else {
                        try { await link(targetPath, sourcePath); }
                        catch (restoreError) { if ((restoreError as NodeJS.ErrnoException).code !== "EEXIST") throw restoreError; }
                        await unlink(targetPath);
                      }
                      throw error;
                    }
                    // 文件已改名：监视器和恢复记录均要尝试更新，不能因一方失败跳过另一方。
                    const followUps = await Promise.allSettled([
                      ports.watcher.syncWindowPaths(context, ports.workspace.getWindowProjection(windowId).tabs.map(tab => tab.path)),
                      ports.renamed(input.tabId, sourcePath, targetPath)
                    ]);
                    for (const result of followUps) if (result.status === "rejected") throw result.reason;
                  } finally { await ports.watcher.completeInternalWrite(context, targetPath); }
                } finally { await ports.watcher.completeInternalWrite(context, sourcePath); }
              });
            } finally { locations.release(); }
          }
        }
        return { kind: "success", snapshot: toWorkspaceWindowSnapshot(ports.workspace.getWindowProjection(windowId)) };
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const message = code === "EEXIST" ? "同目录已有同名文件，请使用其他名称。"
        : code === "ENOENT" ? "文件已不存在，请重新保存或打开。"
        : error instanceof Error ? error.message : "文件操作失败，请重试。";
      return { kind: "error", message };
    }
  };
}

function validateFileName(name: string): void {
  if (!name.trim() || name !== name.trim() || name.length > 255 || /[<>:"/\\|?*]/.test(name) || Array.from(name).some(char => char.charCodeAt(0) < 32) ||
      /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error("请输入有效文件名，不要包含路径、特殊字符或末尾的空格和句点。");
  }
  if (!/\.(md|markdown)$/i.test(name)) throw new Error("文件名需要以 .md 或 .markdown 结尾。");
}
